// Downloads chosen HQ stem sets from a Yeatle server into the player's Songs folder.
//
// Each song downloads into a hidden temporary folder inside the Songs folder
// (".yeatle-downloads", which the game never lists), every file is checked
// against the catalog's size and SHA-256, and only a complete, verified set is
// moved into place with one rename. Cancelled or failed downloads are removed,
// so a half-downloaded song never shows up as installed. Existing folders are
// never overwritten: a clash is reported, and "Replace mine" moves the old
// folder aside into ".yeatle-replaced" instead of deleting it.
const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const crypto = require("node:crypto");

const STEM_NAMES = ["drums.mp3", "bass.mp3", "other.mp3", "vocals.mp3"];
const ALLOWED = new Set([...STEM_NAMES, "lyrics.lrc", "info.txt"]);
const MAX_FILE = 200 * 1024 * 1024;
const TEMP = ".yeatle-downloads";
const REPLACED = ".yeatle-replaced";
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

// A folder name that is one safe path segment on Windows, macOS and Linux.
function safeFolderName(name) {
  if (typeof name !== "string") return null;
  const n = name.normalize("NFC");
  if (!n || n.length > 120 || n !== n.trim() || /[. ]$/.test(n) || n.startsWith(".")) return null;
  if (/[\u0000-\u001f<>:"/\\|?*\u007f]/.test(n) || RESERVED.test(n)) return null;
  return n;
}

// The server address players download from. https only, except a local test server.
function stemsHostUrl(raw) {
  try {
    const url = new URL(String(raw || ""));
    const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch { return null; }
}

// Keeps only well-formed entries; anything odd in a catalog is left out, not trusted.
function validateCatalog(json) {
  if (!json || typeof json !== "object" || !Array.isArray(json.songs)) throw new Error("The server sent a list Yeatle doesn't understand.");
  const songs = [], seen = new Set(), folders = new Set();
  let skipped = 0;
  for (const raw of json.songs.slice(0, 5000)) {
    if (["producer-only", "non-vocal"].includes(raw?.artistRole) || raw?.guessingEligible === false) { skipped++; continue; }
    const id = typeof raw?.id === "string" && /^[\p{L}\p{N}@._-]{1,160}$/u.test(raw.id) ? raw.id : null;
    const folder = safeFolderName(raw?.folder);
    const files = Array.isArray(raw?.files) ? raw.files : [];
    const clean = files.filter(f => f && ALLOWED.has(f.name) && Number.isSafeInteger(f.size) && f.size > 0 && f.size <= MAX_FILE && /^[0-9a-f]{64}$/.test(f.sha256))
      .map(f => ({ name: f.name, size: f.size, sha256: f.sha256 }));
    const names = new Set(clean.map(f => f.name));
    if (!id || !folder || seen.has(id) || folders.has(folder.toLowerCase()) || clean.length !== files.length || names.size !== clean.length || !STEM_NAMES.every(n => names.has(n))) { skipped++; continue; }
    seen.add(id);
    folders.add(folder.toLowerCase());
    const text = v => (typeof v === "string" ? v.slice(0, 200) : "");
    songs.push({
      id, folder, files: clean, size: clean.reduce((sum, f) => sum + f.size, 0),
      display: text(raw.display) || folder, title: text(raw.title), era: text(raw.era),
      artist: text(raw.artist), artistRole: ["vocalist", "co-lead", "featured", "unknown"].includes(raw.artistRole) ? raw.artistRole : "unknown",
      tab: ["Released", "Unreleased"].includes(raw.tab) ? raw.tab : "Unknown",
      year: Number.isInteger(raw.year) ? raw.year : null,
      features: Array.isArray(raw.features) ? raw.features.filter(f => typeof f === "string").slice(0, 8).map(text) : [],
      cover: typeof raw.cover === "string" && /^api\/cover\?[\w=&%.-]*$/.test(raw.cover) ? raw.cover : ""
    });
  }
  return { songs, skipped, pending: Number.isInteger(json.pending) ? json.pending : 0 };
}

function isMp3Head(buf) {
  return buf.length >= 3 && (buf.toString("latin1", 0, 3) === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
}

function indexLocalFolders(songsDir) {
  const byKey = new Map();
  try {
    for (const n of fs.readdirSync(songsDir)) {
      const key = n.normalize("NFC").toLowerCase();
      if (!byKey.has(key)) byKey.set(key, n);
    }
  } catch { /* missing or unreadable */ }
  return byKey;
}

// Whether a folder already holds a playable set; returns the actual folder name.
function findLocalFolder(songsDir, folder, folderIndex = null) {
  const want = folder.normalize("NFC").toLowerCase();
  let name = null;
  if (folderIndex instanceof Map) {
    name = folderIndex.get(want) || null;
  } else {
    let names = [];
    try { names = fs.readdirSync(songsDir); } catch { return null; }
    name = names.find(n => n.normalize("NFC").toLowerCase() === want) || null;
  }
  if (!name) return null;
  const dir = path.join(songsDir, name);
  let complete = false;
  try {
    const st = fs.lstatSync(dir);
    if (st.isDirectory() && !st.isSymbolicLink()) {
      const files = new Set(fs.readdirSync(dir).map(n => n.toLowerCase()));
      complete = STEM_NAMES.every(n => files.has(n));
    }
  } catch { /* unreadable */ }
  return { name, dir, complete };
}

async function sameFiles(dir, files) {
  try {
    const actual = new Map(fs.readdirSync(dir).map(n => [n.toLowerCase(), n]));
    for (const f of files.filter(x => STEM_NAMES.includes(x.name))) {
      const name = actual.get(f.name);
      if (!name) return false;
      const file = path.join(dir, name);
      if (fs.statSync(file).size !== f.size) return false;
      const hash = crypto.createHash("sha256");
      for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
      if (hash.digest("hex") !== f.sha256) return false;
    }
    return true;
  } catch { return false; }
}

const wait = (ms, signal) => {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
};
const abortError = () => Object.assign(new Error("cancelled"), { name: "AbortError" });

function closeStream(out, destroy = false) {
  return new Promise((resolve, reject) => {
    if (out.closed || out.destroyed) { resolve(); return; }
    let settled = false;
    const finish = err => {
      if (settled) return;
      settled = true;
      out.off("close", onClose);
      out.off("error", onError);
      if (err && !destroy) reject(err);
      else resolve();
    };
    const onClose = () => finish();
    const onError = err => finish(err);
    out.once("close", onClose);
    out.once("error", onError);
    if (destroy) out.destroy();
    else out.end();
  });
}

function createStemDownloader({ songsDir, host, fetch, onChange = () => {}, localSongs = async () => new Map(), rescan = async () => {}, concurrency = 2, retries = 4, retryDelay = 1500, timeout = 30000 }) {
  const items = new Map();
  let catalog = { songs: [], skipped: 0, pending: 0, error: "", loading: false, loaded: false };
  let active = 0, changeTimer = null, cleanupPromise = null, catalogEpoch = 0;
  const queue = [];
  const controllers = new Map();
  const running = new Set();
  const pendingInstalled = new Set();
  const idLocks = new Map();
  let rescanTimer = null;
  let rescanInFlight = null;
  const tempRoot = path.join(songsDir, TEMP);

  const withIdLock = (id, fn) => {
    const prev = idLocks.get(id) || Promise.resolve();
    const next = prev.then(fn, fn).finally(() => { if (idLocks.get(id) === next) idLocks.delete(id); });
    idLocks.set(id, next);
    return next;
  };

  const changed = () => {
    if (changeTimer) return;
    changeTimer = setTimeout(() => { changeTimer = null; onChange(snapshot()); }, 120);
    changeTimer.unref?.();
  };
  const set = (id, patch) => { items.set(id, { ...(items.get(id) || {}), ...patch }); changed(); };

  function snapshot() {
    return { host, songsDir, catalog: { ...catalog }, items: Object.fromEntries(items) };
  }

  // Anything left in the temporary folder is from an earlier run that never finished.
  async function cleanupStale() {
    if (active || controllers.size) return;
    if (!cleanupPromise) {
      cleanupPromise = fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {}).finally(() => { cleanupPromise = null; });
    }
    await cleanupPromise;
  }

  async function request(url, signal) {
    if (signal?.aborted) throw abortError();
    const ctrl = new AbortController();
    const stop = () => ctrl.abort();
    let timer;
    const touch = () => { clearTimeout(timer); timer = setTimeout(stop, timeout); };
    signal?.addEventListener("abort", stop, { once: true });
    touch();
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "*/*" } });
      if (String(url).startsWith("https://") && typeof res.url === "string" && res.url && !res.url.startsWith("https://")) {
        await res.body?.cancel?.().catch(() => {});
        clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
        throw new Error("the server redirected to an insecure address");
      }
      return {
        res,
        ctrl,
        touch,
        done: () => { clearTimeout(timer); signal?.removeEventListener("abort", stop); }
      };
    } catch (err) {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      if (signal?.aborted) throw abortError();
      if (err.message === "the server redirected to an insecure address") throw err;
      throw new Error(ctrl.signal.aborted ? "the server took too long to answer" : `couldn't reach the server (${err.cause?.code || err.message})`);
    }
  }

  async function refreshInstalled() {
    let local = new Map();
    try { local = await localSongs(); } catch { /* local list unavailable */ }
    const folderIndex = catalog.songs.length ? indexLocalFolders(songsDir) : new Map();
    for (const song of catalog.songs) {
      const item = items.get(song.id);
      if (item && ["queued", "downloading", "installing", "conflict"].includes(item.status)) continue;
      const folder = findLocalFolder(songsDir, song.folder, folderIndex);
      const mine = local.get(song.id);
      if (folder && folder.complete) set(song.id, { status: "installed", note: folder.name !== song.folder ? `In your Songs folder as "${folder.name}"` : "", error: "" });
      else if (mine && mine.mode === "stems") set(song.id, { status: "installed", note: mine.folder ? `Already in your Songs folder as "${mine.folder}"` : "Already installed", error: "" });
      else if (item && item.status === "installed") set(song.id, { status: "idle", note: "", error: "" });
    }
  }

  async function loadCatalog() {
    const epoch = ++catalogEpoch;
    catalog = { ...catalog, loading: true, error: "" };
    changed();
    let req;
    try {
      req = await request(`${host}/api/stems/catalog`);
      const { res } = req;
      if (res.status === 404) throw new Error("This server doesn't offer HQ stem downloads.");
      if (!res.ok) throw new Error(`the server answered ${res.status}`);
      const data = validateCatalog(await res.json());
      req.done();
      req = null;
      if (epoch !== catalogEpoch) return snapshot();
      catalog = { ...data, error: "", loading: false, loaded: true };
      await refreshInstalled();
    } catch (err) {
      if (epoch !== catalogEpoch) return snapshot();
      catalog = { ...catalog, loading: false, error: err.message.startsWith("This server") ? err.message : `Couldn't load the song list: ${err.message}.` };
    } finally { req?.done(); }
    changed();
    return snapshot();
  }

  function download(ids) {
    for (const id of new Set(ids)) {
      const song = catalog.songs.find(s => s.id === id);
      const item = items.get(id);
      if (!song || (item && ["queued", "downloading", "installing", "installed", "conflict"].includes(item.status))) continue;
      set(id, { status: "queued", received: 0, total: song.size, error: "", note: "" });
      queue.push(id);
    }
    pump();
    return snapshot();
  }

  function pump() {
    while (active < concurrency && queue.length) {
      const id = queue.shift();
      if (items.get(id)?.status !== "queued") continue;
      active++;
      let job;
      job = run(id).finally(() => {
        running.delete(job);
        active--;
        pump();
        if (active === 0 && queue.length === 0 && pendingInstalled.size > 0) scheduleRescan(true);
      });
      running.add(job);
    }
  }

  async function fetchFile(song, file, dir, signal, progress) {
    const url = `${host}/api/stems/file?id=${encodeURIComponent(song.id)}&name=${encodeURIComponent(file.name)}`;
    for (let attempt = 0; ; attempt++) {
      let req;
      try { req = await request(url, signal); }
      catch (err) { if (err.name === "AbortError" || attempt >= retries) throw err; await wait(retryDelay * (attempt + 1), signal); continue; }
      const { res, ctrl, touch, done } = req;
      if (res.status === 503 && attempt < retries) {
        const after = Number(res.headers.get("retry-after"));
        await res.body?.cancel?.().catch(() => {});
        done();
        await wait(Number.isFinite(after) && after > 0 ? Math.min(after, 30) * 1000 : retryDelay * (attempt + 1), signal);
        continue;
      }
      const discardBody = () => res.body?.cancel?.().catch(() => {});
      if (!res.ok) {
        await discardBody();
        done();
        throw new Error(res.status === 409 ? "a file changed on the server; reload the list and retry" : `the server answered ${res.status} for ${file.name}`);
      }
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > 0 && declared !== file.size) {
        await discardBody();
        done();
        throw new Error(`${file.name} has the wrong size on the server`);
      }
      if (!res.body) {
        done();
        throw new Error(`the server sent an empty response for ${file.name}`);
      }
      const part = path.join(dir, `${file.name}.part`);
      const out = fs.createWriteStream(part, { flags: "w" });
      let writeError = null;
      out.on("error", err => { writeError = err; });
      const hash = crypto.createHash("sha256");
      let bytes = 0, reported = 0, head = Buffer.alloc(0);
      try {
        for await (const chunk of res.body) {
          touch();
          if (signal.aborted) throw abortError();
          if (writeError) throw writeError;
          const buf = ArrayBuffer.isView(chunk) ? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength) : Buffer.from(chunk);
          bytes += buf.length;
          if (bytes > file.size) throw new Error(`${file.name} is bigger than the server said`);
          if (head.length < 3) head = Buffer.concat([head, buf.subarray(0, 3)]).subarray(0, 3);
          hash.update(buf);
          if (!out.write(buf)) await new Promise((resolve, reject) => {
            const onDrain = () => { out.off("error", onErr); resolve(); };
            const onErr = err => { out.off("drain", onDrain); reject(err); };
            out.once("drain", onDrain);
            out.once("error", onErr);
          });
          reported += buf.length;
          progress(buf.length);
        }
        await closeStream(out);
        if (writeError) throw writeError;
      } catch (err) {
        await closeStream(out, true);
        if (reported) { progress(-reported); reported = 0; }
        if (signal.aborted) throw abortError();
        const cause = err.name === "AbortError" && ctrl.signal.aborted ? new Error("the server took too long to answer") : err;
        if (/bigger than/.test(cause.message) || attempt >= retries) throw cause;
        await wait(retryDelay * (attempt + 1), signal);
        continue;
      } finally {
        done();
      }
      const ok = bytes === file.size && hash.digest("hex") === file.sha256 && (!file.name.endsWith(".mp3") || isMp3Head(head));
      if (!ok) {
        if (reported) { progress(-reported); reported = 0; }
        if (attempt >= retries) throw new Error(`${file.name} didn't download correctly (it didn't match the server's checksum)`);
        await wait(retryDelay * (attempt + 1), signal);
        continue;
      }
      await fsp.rename(part, path.join(dir, file.name));
      return;
    }
  }

  async function run(id) {
    const ctrl = new AbortController();
    controllers.set(id, ctrl);
    const dir = path.join(tempRoot, `${crypto.randomBytes(6).toString("hex")}`);
    let received = 0;
    try {
      const song = catalog.songs.find(s => s.id === id);
      if (!song) {
        set(id, { status: "idle", received: 0, error: "", note: "", temp: null });
        return;
      }
      set(id, { status: "downloading", received: 0, total: song.size, error: "", note: "", temp: null });
      if (cleanupPromise) await cleanupPromise;
      if (ctrl.signal.aborted) throw abortError();
      await fsp.mkdir(dir, { recursive: true });
      // stems first, the small extras last
      const ordered = song.files.slice().sort((a, b) => Number(!a.name.endsWith(".mp3")) - Number(!b.name.endsWith(".mp3")));
      for (const file of ordered) {
        await fetchFile(song, file, dir, ctrl.signal, n => { received = Math.max(0, received + n); set(id, { received }); });
      }
      set(id, { status: "installing" });
      await promote(song, dir);
    } catch (err) {
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
      if (err.name === "AbortError") set(id, { status: "cancelled", received: 0, error: "", temp: null });
      else set(id, { status: "failed", received: 0, error: err.message, temp: null });
    } finally { controllers.delete(id); }
  }

  async function promote(song, dir) {
    const dest = path.join(songsDir, song.folder);
    if (path.dirname(path.resolve(dest)) !== path.resolve(songsDir)) throw new Error("that folder name isn't allowed");
    const existing = findLocalFolder(songsDir, song.folder);
    if (existing) {
      if (existing.complete && await sameFiles(existing.dir, song.files)) {
        await fsp.rm(dir, { recursive: true, force: true });
        set(song.id, { status: "installed", note: "Already installed (same files)", temp: null });
        return;
      }
      // keep the verified download until the player decides
      set(song.id, { status: "conflict", temp: dir, note: `Your Songs folder already has a different "${existing.name}" folder. Yours was left as it is.` });
      return;
    }
    try { await fsp.rename(dir, dest); }
    catch (err) {
      if (["EEXIST", "ENOTEMPTY", "EPERM", "EACCES"].includes(err.code) && fs.existsSync(dest)) {
        set(song.id, { status: "conflict", temp: dir, note: `A "${song.folder}" folder appeared in your Songs folder meanwhile. Yours was left as it is.` });
        return;
      }
      throw new Error(`couldn't move the song into your Songs folder (${err.code || err.message})`);
    }
    set(song.id, { status: "installed", note: "Installed. Updating song list…", temp: null });
    pendingInstalled.add(song.id);
    scheduleRescan(false);
  }

  function scheduleRescan(immediate = false) {
    if (immediate) {
      if (rescanTimer) { clearTimeout(rescanTimer); rescanTimer = null; }
      return flushInstalled();
    }
    if (!rescanTimer && pendingInstalled.size > 0) {
      rescanTimer = setTimeout(() => {
        rescanTimer = null;
        flushInstalled();
      }, 1500);
      rescanTimer.unref?.();
    }
    return rescanInFlight || Promise.resolve();
  }

  function flushInstalled() {
    if (rescanInFlight) return rescanInFlight;
    if (!pendingInstalled.size) return Promise.resolve();
    rescanInFlight = (async () => {
      try {
        while (pendingInstalled.size > 0) {
          const batchIds = [...pendingInstalled];
          pendingInstalled.clear();
          try { await rescan(); } catch { /* the game also picks it up on the next start */ }
          let local = new Map();
          try { local = await localSongs(); } catch { /* unknown */ }
          for (const id of batchIds) {
            if (items.get(id)?.status !== "installed") continue;
            const mine = local.get(id);
            if (local.size && !(mine && mine.mode === "stems")) {
              set(id, { note: "Installed. If it isn't in your song list yet, restart Yeatle." });
            } else {
              set(id, { note: "Installed. It's in your song list now." });
            }
          }
        }
      } finally {
        rescanInFlight = null;
      }
    })();
    return rescanInFlight;
  }

  async function replace(id) {
    return withIdLock(id, async () => {
      const item = items.get(id), song = catalog.songs.find(s => s.id === id);
      if (!song || item?.status !== "conflict" || !item.temp) return snapshot();
      const existing = findLocalFolder(songsDir, song.folder);
      let movedOld = null;
      try {
        if (existing) {
          const aside = path.join(songsDir, REPLACED, `${existing.name} (${new Date().toISOString().replace(/[:.]/g, "-")})`);
          await fsp.mkdir(path.dirname(aside), { recursive: true });
          await fsp.rename(existing.dir, aside);
          movedOld = aside;
        }
        await fsp.rename(item.temp, path.join(songsDir, song.folder));
        set(id, { status: "installed", temp: null, note: existing ? `Your old folder was moved to ${REPLACED} in your Songs folder.` : "" });
        pendingInstalled.add(id);
        await scheduleRescan(true);
      } catch (err) {
        if (movedOld && existing) await fsp.rename(movedOld, existing.dir).catch(() => {});
        set(id, { error: `Couldn't replace it (${err.code || err.message}).` });
      }
      return snapshot();
    });
  }

  async function cancel(id) {
    return withIdLock(id, async () => {
      const item = items.get(id);
      if (!item) return snapshot();
      if (item.status === "queued") { const i = queue.indexOf(id); if (i >= 0) queue.splice(i, 1); set(id, { status: "cancelled", received: 0 }); }
      else if (controllers.has(id)) controllers.get(id).abort();
      else if (item.status === "conflict") {
        if (item.temp) await fsp.rm(item.temp, { recursive: true, force: true }).catch(() => {});
        set(id, { status: "idle", temp: null, note: "Kept your folder." });
      }
      return snapshot();
    });
  }

  async function cancelAll() {
    if (rescanTimer) { clearTimeout(rescanTimer); rescanTimer = null; }
    pendingInstalled.clear();
    for (const id of [...queue]) await cancel(id);
    for (const ctrl of controllers.values()) ctrl.abort();
    await Promise.allSettled([...running]);
    for (const [id, item] of items) if (item.status === "conflict") await cancel(id);
  }

  return {
    loadCatalog, download, cancel, cancelAll, replace, refreshInstalled, cleanupStale, snapshot,
    get busy() { return active > 0 || queue.length > 0 || pendingInstalled.size > 0 || Boolean(rescanInFlight); }
  };
}

module.exports = { createStemDownloader, validateCatalog, safeFolderName, stemsHostUrl, findLocalFolder, TEMP, REPLACED };
