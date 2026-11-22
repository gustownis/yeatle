const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { pipeline } = require("node:stream/promises");

const MB = 1024 * 1024;

// Whole audio files on disk for the songs in active Daily and Snippets rounds, so replays
// and seeks don't go back to the song host. Nothing survives a restart.
function createAudioCache({
  dir,
  detectType = () => null,
  maxBytes = 512 * MB,
  maxFileBytes = 64 * MB,
  ttlMs = 6 * 3600 * 1000,
  retryMs = 10 * 60 * 1000,
  downloadMs = 5 * 60 * 1000,
  maxDownloads = 4,
  now = Date.now
} = {}) {
  const entries = new Map(); // key -> { file, size, type, expires, readers, pendingDelete }; oldest use first
  const downloads = new Map(); // key -> promise
  const retryAfter = new Map(); // key -> time, for files that couldn't be kept
  let retained = 0;
  let prepared = false;
  let preparePromise = null;
  let fileSeq = 0;

  const fileFor = key => path.join(dir, crypto.createHash("sha256").update(key).digest("hex"));

  function unlinkEntry(entry) {
    if (entry.readers > 0) {
      entry.pendingDelete = true;
      return;
    }
    fs.promises.rm(entry.file, { force: true }).catch(() => {});
  }

  function remove(key) {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    retained -= entry.size;
    unlinkEntry(entry);
  }

  function lookup(key) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.expires <= now()) { remove(key); return null; }
    entries.delete(key);
    entries.set(key, entry);
    return entry;
  }

  async function prepare() {
    if (prepared) return;
    if (!preparePromise) {
      preparePromise = (async () => {
        await fs.promises.rm(dir, { recursive: true, force: true });
        await fs.promises.mkdir(dir, { recursive: true });
        prepared = true;
      })().catch(err => {
        preparePromise = null;
        throw err;
      });
    }
    return preparePromise;
  }

  function commit(key, file, size, head, contentType) {
    const type = detectType(head) || (/^(audio|video)\//i.test(contentType) ? contentType : "audio/mpeg");
    remove(key);
    entries.set(key, { file, size, type, expires: now() + ttlMs, readers: 0, pendingDelete: false });
    retained += size;
    while (retained > maxBytes && entries.size > 1) remove(entries.keys().next().value);
  }

  function noteFailure(key, message) {
    if (retryAfter.size >= 5000) retryAfter.clear();
    retryAfter.set(key, now() + retryMs);
    if (message) console.warn(`[audio-cache] ${message}`);
  }

  function canStartDownload(key) {
    const existing = entries.get(key);
    if (existing) {
      if (existing.expires > now()) return false;
      remove(key);
    }
    if (downloads.has(key) || downloads.size >= maxDownloads) return false;
    if (retryAfter.get(key) > now()) return false;
    retryAfter.delete(key);
    return true;
  }

  async function beginWrite(key, { contentType = "", declaredLength = 0 } = {}) {
    const content = String(contentType || "");
    const declared = Number(declaredLength) || 0;
    if (/^text\/html/i.test(content) || declared > maxFileBytes) return null;
    if (!canStartDownload(key)) return null;
    let resolveJob;
    const job = new Promise(resolve => { resolveJob = resolve; });
    downloads.set(key, job);
    try {
      await prepare();
    } catch (error) {
      downloads.delete(key);
      resolveJob();
      noteFailure(key, error.message);
      return null;
    }
    const file = `${fileFor(key)}.${++fileSeq}`;
    const temp = `${file}.part`;
    let out;
    let writeError = null;
    try {
      out = fs.createWriteStream(temp);
      out.on("error", err => { writeError = err; });
    } catch (error) {
      downloads.delete(key);
      resolveJob();
      noteFailure(key, error.message);
      return null;
    }
    let size = 0;
    const headChunks = [];
    let headLen = 0;
    let closed = false;
    let failed = false;
    let committed = false;

    const cleanup = async (recordRetry, reason) => {
      if (!out.closed) {
        await new Promise(resolve => {
          const timer = setTimeout(resolve, 500);
          timer.unref?.();
          out.once("close", () => { clearTimeout(timer); resolve(); });
          if (!out.destroyed) out.destroy();
        });
      }
      await fs.promises.rm(temp, { force: true }).catch(() => {});
      if (recordRetry) noteFailure(key, reason);
      downloads.delete(key);
      resolveJob();
    };

    async function finish() {
      if (closed) return committed;
      closed = true;
      if (failed || writeError || !size || size > maxFileBytes || (declared && size !== declared)) {
        const reason = writeError?.message || (size > maxFileBytes ? "file is too large to cache" : declared && size !== declared ? `incomplete download (${size} of ${declared} bytes)` : "");
        await cleanup(Boolean(reason), reason);
        return false;
      }
      try {
        await new Promise((resolve, reject) => {
          const onClose = () => { out.off("error", onErr); resolve(); };
          const onErr = err => { out.off("close", onClose); reject(err); };
          if (out.closed) { onClose(); return; }
          out.once("close", onClose);
          out.once("error", onErr);
          out.end();
        });
        if (writeError) throw writeError;
        await fs.promises.rename(temp, file);
        const head = headChunks.length ? Buffer.concat(headChunks, headLen) : null;
        commit(key, file, size, head, content);
        committed = true;
        downloads.delete(key);
        resolveJob();
        return true;
      } catch (err) {
        await cleanup(true, err.message);
        return false;
      }
    }

    return {
      async write(chunk) {
        if (closed || failed || !chunk || !chunk.length) return;
        if (writeError) { failed = true; return; }
        if (headLen < 32) {
          const slice = chunk.subarray(0, 32 - headLen);
          headChunks.push(slice);
          headLen += slice.length;
        }
        size += chunk.length;
        if (size > maxFileBytes) {
          failed = true;
          return;
        }
        try {
          if (!out.write(chunk)) {
            await new Promise((resolve, reject) => {
              const onDrain = () => { out.off("error", onErr); out.off("close", onClose); resolve(); };
              const onErr = err => { out.off("drain", onDrain); out.off("close", onClose); reject(err); };
              const onClose = () => { out.off("drain", onDrain); out.off("error", onErr); resolve(); };
              out.once("drain", onDrain);
              out.once("error", onErr);
              out.once("close", onClose);
            });
          }
          if (!failed && !writeError && declared && size === declared) await finish();
        } catch (err) {
          writeError = err;
          failed = true;
        }
      },
      finish,
      async abort() {
        if (closed) return;
        closed = true;
        failed = true;
        await cleanup(false, "");
      }
    };
  }

  async function download(key, open) {
    const upstream = await open();
    const contentType = String(upstream.headers["content-type"] || "");
    const declared = Number(upstream.headers["content-length"]) || 0;
    if (upstream.statusCode !== 200 || /^text\/html/i.test(contentType) || declared > maxFileBytes) {
      upstream.destroy();
      throw new Error(`not cacheable (HTTP ${upstream.statusCode}, ${declared} bytes)`);
    }
    await prepare();
    const file = `${fileFor(key)}.${++fileSeq}`;
    const temp = `${file}.part`;
    const deadline = setTimeout(() => upstream.destroy(new Error("download timed out")), downloadMs);
    deadline.unref();
    let size = 0;
    const headChunks = [];
    let headLen = 0;
    try {
      await pipeline(upstream, async function* (source) {
        for await (const chunk of source) {
          if (headLen < 32) {
            const slice = chunk.subarray(0, 32 - headLen);
            headChunks.push(slice);
            headLen += slice.length;
          }
          size += chunk.length;
          if (size > maxFileBytes) throw new Error("file is too large to cache");
          yield chunk;
        }
      }, fs.createWriteStream(temp));
      if (!size || (declared && size !== declared)) throw new Error(`incomplete download (${size} of ${declared} bytes)`);
      await fs.promises.rename(temp, file);
    } catch (error) {
      await fs.promises.rm(temp, { force: true }).catch(() => {});
      throw error;
    } finally {
      clearTimeout(deadline);
    }
    const head = headChunks.length ? Buffer.concat(headChunks, headLen) : null;
    commit(key, file, size, head, contentType);
  }

  // Starts keeping a copy in the background. open() resolves to the host's full response.
  function fill(key, open) {
    const existing = entries.get(key);
    if (existing) {
      if (existing.expires > now()) return null;
      remove(key);
    }
    if (downloads.has(key) || downloads.size >= maxDownloads) return downloads.get(key) || null;
    if (retryAfter.get(key) > now()) return null;
    retryAfter.delete(key);
    const job = download(key, open).catch(error => {
      noteFailure(key, error.message);
    }).finally(() => downloads.delete(key));
    downloads.set(key, job);
    return job;
  }

  function parseRange(header, size) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
    if (!match || (!match[1] && !match[2])) return null;
    if (!match[1]) {
      const suffix = Number(match[2]);
      return suffix > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : { invalid: true };
    }
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    return start >= size || start > end ? { invalid: true } : { start, end };
  }

  // False if the copy is gone, so the caller can stream from the host instead.
  async function serve(req, res, entry) {
    entry.readers = (entry.readers || 0) + 1;
    let handle = null;
    let streamOpened = false;
    try {
      try {
        handle = await fs.promises.open(entry.file, "r");
      } catch {
        for (const [key, value] of entries) if (value === entry) { entries.delete(key); retained -= entry.size; }
        return false;
      }
      const range = req.headers["if-range"] ? null : parseRange(req.headers.range, entry.size);
      const common = { "Content-Type": entry.type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
      if (range?.invalid) {
        res.writeHead(416, { "Content-Range": `bytes */${entry.size}` });
        res.end();
        return true;
      }
      const start = range ? range.start : 0;
      const end = range ? range.end : entry.size - 1;
      res.writeHead(range ? 206 : 200, {
        ...common,
        "Content-Length": end - start + 1,
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${entry.size}` } : {})
      });
      if (req.method === "HEAD") {
        res.end();
        return true;
      }
      const rs = handle.createReadStream({ start, end });
      streamOpened = true;
      await pipeline(rs, res).catch(() => res.destroy());
      return true;
    } finally {
      if (!streamOpened && handle) await handle.close().catch(() => {});
      entry.readers = Math.max(0, (entry.readers || 1) - 1);
      if (entry.pendingDelete && entry.readers === 0) {
        fs.promises.rm(entry.file, { force: true }).catch(() => {});
      }
    }
  }

  return { lookup, fill, beginWrite, serve, get retainedBytes() { return retained; }, get size() { return entries.size; } };
}

module.exports = { createAudioCache };
