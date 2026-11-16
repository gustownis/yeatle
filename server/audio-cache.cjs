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
  const entries = new Map(); // key -> { file, size, type, expires }; oldest use first
  const downloads = new Map(); // key -> promise
  const retryAfter = new Map(); // key -> time, for files that couldn't be kept
  let retained = 0;
  let prepared = false;

  const fileFor = key => path.join(dir, crypto.createHash("sha256").update(key).digest("hex"));

  function remove(key) {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    retained -= entry.size;
    fs.promises.rm(entry.file, { force: true }).catch(() => {});
  }

  function lookup(key) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.expires <= now()) { remove(key); return null; }
    entries.delete(key);
    entries.set(key, entry);
    return entry;
  }

  function prepare() {
    if (prepared) return;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    prepared = true;
  }

  async function download(key, open) {
    const upstream = await open();
    const contentType = String(upstream.headers["content-type"] || "");
    const declared = Number(upstream.headers["content-length"]) || 0;
    if (upstream.statusCode !== 200 || /^text\/html/i.test(contentType) || declared > maxFileBytes) {
      upstream.destroy();
      throw new Error(`not cacheable (HTTP ${upstream.statusCode}, ${declared} bytes)`);
    }
    prepare();
    const file = fileFor(key);
    const temp = `${file}.part`;
    const deadline = setTimeout(() => upstream.destroy(new Error("download timed out")), downloadMs);
    deadline.unref();
    let size = 0, head = null;
    try {
      await pipeline(upstream, async function* (source) {
        for await (const chunk of source) {
          head ||= chunk;
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
    const type = detectType(head) || (/^(audio|video)\//i.test(contentType) ? contentType : "audio/mpeg");
    remove(key);
    entries.set(key, { file, size, type, expires: now() + ttlMs });
    retained += size;
    while (retained > maxBytes && entries.size > 1) remove(entries.keys().next().value);
  }

  // Starts keeping a copy in the background. open() resolves to the host's full response.
  function fill(key, open) {
    if (entries.has(key) || downloads.has(key) || downloads.size >= maxDownloads) return downloads.get(key) || null;
    if (retryAfter.get(key) > now()) return null;
    retryAfter.delete(key);
    const job = download(key, open).catch(error => {
      if (retryAfter.size >= 5000) retryAfter.clear();
      retryAfter.set(key, now() + retryMs);
      console.warn(`[audio-cache] ${error.message}`);
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
    let handle;
    try {
      handle = await fs.promises.open(entry.file, "r");
    } catch {
      for (const [key, value] of entries) if (value === entry) { entries.delete(key); retained -= entry.size; }
      return false;
    }
    const range = req.headers["if-range"] ? null : parseRange(req.headers.range, entry.size);
    const common = { "Content-Type": entry.type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
    if (range?.invalid) {
      await handle.close();
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
      await handle.close();
      res.end();
      return true;
    }
    await pipeline(handle.createReadStream({ start, end }), res).catch(() => res.destroy());
    return true;
  }

  return { lookup, fill, serve, get retainedBytes() { return retained; }, get size() { return entries.size; } };
}

module.exports = { createAudioCache };
