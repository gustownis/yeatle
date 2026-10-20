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
    if (raw?.artistRole === "producer-only" || raw?.guessingEligible === false) { skipped++; continue; }
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

// Whether a folder already holds a playable set; returns the actual folder name.
function findLocalFolder(songsDir, folder) {
  let names = [];
  try { names = fs.readdirSync(songsDir); } catch { return null; }
  const want = folder.normalize("NFC").toLowerCase();
  const name = names.find(n => n.normalize("NFC").toLowerCase() === want);
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

const wait = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); reject(abortError()); }, { once: true });
});
const abortError = () => Object.assign(new Error("cancelled"), { name: "AbortError" });

function createStemDownloader({ songsDir, host, fetch, onChange = () => {}, localSongs = async () => new Map(), rescan = async () => {}, concurrency = 2, retries = 4, retryDelay = 1500, timeout = 30000 }) {
  const items = new Map();
  let catalog = { songs: [], skipped: 0, pending: 0, error: "", loading: false, loaded: false };
  let active = 0, changeTimer = null;
  const queue = [];
  const controllers = new Map();
  const tempRoot = path.join(songsDir, TEMP);

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
    if (active) return;
    await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }

  async function request(url, signal) {
    const ctrl = new AbortController();
    const stop = () => ctrl.abort();
    signal?.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(stop, timeout);
    try { return await fetch(url, { signal: ctrl.signal, headers: { accept: "*/*" } }); }
    catch (err) { if (signal?.aborted) throw abortError(); throw new Error(ctrl.signal.aborted ? "the server took too long to answer" : `couldn't reach the server (${err.cause?.code || err.message})`); }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", stop); }
  }

  async function refreshInstalled() {
    let local = new Map();
    try { local = await localSongs(); } catch { /* local list unavailable */ }
    for (const song of catalog.songs) {
      const item = items.get(song.id);
      if (item && ["queued", "downloading", "verifying", "installing", "conflict"].includes(item.status)) continue;
      const folder = findLocalFolder(songsDir, song.folder);
      const mine = local.get(song.id);
      if (folder && folder.complete) set(song.id, { status: "installed", note: folder.name !== song.folder ? `In your Songs folder as "${folder.name}"` : "", error: "" });
      else if (mine && mine.mode === "stems") set(song.id, { status: "installed", note: mine.folder ? `Already in your Songs folder as "${mine.folder}"` : "Already installed", error: "" });
      else if (item && item.status === "installed") set(song.id, { status: "idle", note: "", error: "" });
    }
  }

  async function loadCatalog() {
    catalog = { ...catalog, loading: true, error: "" };
    changed();
    try {
      const res = await request(`${host}/api/stems/catalog`);
      if (res.status === 404) throw new Error("This server doesn't offer HQ stem downloads.");
      if (!res.ok) throw new Error(`the server answered ${res.status}`);
      const data = validateCatalog(await res.json());
      catalog = { ...data, error: "", loading: false, loaded: true };
      await refreshInstalled();
    } catch (err) {
      catalog = { ...catalog, loading: false, error: err.message.startsWith("This server") ? err.message : `Couldn't load the song list: ${err.message}.` };
    }
    changed();
    return snapshot();
  }

  function download(ids) {
    for (const id of new Set(ids)) {
      const song = catalog.songs.find(s => s.id === id);
      const item = items.get(id);
      if (!song || (item && ["queued", "downloading", "verifying", "installing", "installed", "conflict"].includes(item.status))) continue;
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
      run(id).finally(() => { active--; pump(); });
    }
  }

  async function fetchFile(song, file, dir, signal, progress) {
    const url = `${host}/api/stems/file?id=${encodeURIComponent(song.id)}&name=${encodeURIComponent(file.name)}`;
    for (let attempt = 0; ; attempt++) {
      let res;
      try { res = await request(url, signal); }
      catch (err) { if (err.name === "AbortError" || attempt >= retries) throw err; await wait(retryDelay * (attempt + 1), signal); continue; }
      if (res.status === 503 && attempt < retries) {
        const after = Number(res.headers.get("retry-after"));
        await res.body?.cancel?.().catch(() => {});
        await wait(Number.isFinite(after) && after > 0 ? Math.min(after, 30) * 1000 : retryDelay * (attempt + 1), signal);
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel?.().catch(() => {});
        throw new Error(res.status === 409 ? "a file changed on the server; reload the list and retry" : `the server answered ${res.status} for ${file.name}`);
      }
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > 0 && declared !== file.size) throw new Error(`${file.name} has the wrong size on the server`);
      const part = path.join(dir, `${file.name}.part`);
      const out = fs.createWriteStream(part, { flags: "w" });
      const hash = crypto.createHash("sha256");
      let bytes = 0, head = Buffer.alloc(0);
      try {
        for await (const chunk of res.body) {
          if (signal.aborted) throw abortError();
          const buf = Buffer.from(chunk);
          bytes += buf.length;
          if (bytes > file.size) throw new Error(`${file.name} is bigger than the server said`);
          if (head.length < 3) head = Buffer.concat([head, buf.subarray(0, 3)]).subarray(0, 3);
          hash.update(buf);
          if (!out.write(buf)) await new Promise(resolve => out.once("drain", resolve));
          progress(buf.length);
        }
        await new Promise((resolve, reject) => out.end(err => (err ? reject(err) : resolve())));
      } catch (err) {
        out.destroy();
        progress(-bytes);
        if (err.name === "AbortError" || signal.aborted) throw abortError();
        if (/bigger than/.test(err.message) || attempt >= retries) throw err;
        await wait(retryDelay * (attempt + 1), signal);
        continue;
      }
      const ok = bytes === file.size && hash.digest("hex") === file.sha256 && (!file.name.endsWith(".mp3") || isMp3Head(head));
      if (!ok) {
        progress(-bytes);
        if (attempt >= retries) throw new Error(`${file.name} didn't download correctly (it didn't match the server's checksum)`);
        await wait(retryDelay * (attempt + 1), signal);
        continue;
      }
      await fsp.rename(part, path.join(dir, file.name));
      return;
    }
  }

  async function run(id) {
    const song = catalog.songs.find(s => s.id === id);
    const ctrl = new AbortController();
    controllers.set(id, ctrl);
    const dir = path.join(tempRoot, `${crypto.randomBytes(6).toString("hex")}`);
    let received = 0;
    set(id, { status: "downloading", received: 0, total: song.size, error: "", note: "", temp: null });
    try {
      await fsp.mkdir(dir, { recursive: true });
      // stems first, the small extras last
      const ordered = song.files.slice().sort((a, b) => Number(!a.name.endsWith(".mp3")) - Number(!b.name.endsWith(".mp3")));
      for (const file of ordered) {
        await fetchFile(song, file, dir, ctrl.signal, n => { received += n; set(id, { received }); });
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
    set(song.id, { status: "installed", note: "", temp: null });
    await finishInstall(song.id);
  }

  async function finishInstall(id) {
    try { await rescan(); } catch { /* the game also picks it up on the next start */ }
    let local = new Map();
    try { local = await localSongs(); } catch { /* unknown */ }
    const mine = local.get(id);
    if (local.size && !(mine && mine.mode === "stems")) set(id, { note: "Installed. If it isn't in your song list yet, restart Yeatle." });
    else set(id, { note: "Installed. It's in your song list now." });
  }

  async function replace(id) {
    const item = items.get(id), song = catalog.songs.find(s => s.id === id);
    if (!song || item?.status !== "conflict" || !item.temp) return snapshot();
    const existing = findLocalFolder(songsDir, song.folder);
    try {
      if (existing) {
        const aside = path.join(songsDir, REPLACED, `${existing.name} (${new Date().toISOString().replace(/[:.]/g, "-")})`);
        await fsp.mkdir(path.dirname(aside), { recursive: true });
        await fsp.rename(existing.dir, aside);
      }
      await fsp.rename(item.temp, path.join(songsDir, song.folder));
      set(id, { status: "installed", temp: null, note: existing ? `Your old folder was moved to ${REPLACED} in your Songs folder.` : "" });
      await finishInstall(id);
    } catch (err) {
      set(id, { error: `Couldn't replace it (${err.code || err.message}).` });
    }
    return snapshot();
  }

  async function cancel(id) {
    const item = items.get(id);
    if (!item) return snapshot();
    if (item.status === "queued") { const i = queue.indexOf(id); if (i >= 0) queue.splice(i, 1); set(id, { status: "cancelled", received: 0 }); }
    else if (controllers.has(id)) controllers.get(id).abort();
    else if (item.status === "conflict") {
      if (item.temp) await fsp.rm(item.temp, { recursive: true, force: true }).catch(() => {});
      set(id, { status: "idle", temp: null, note: "Kept your folder." });
    }
    return snapshot();
  }

  async function cancelAll() {
    for (const id of [...queue]) await cancel(id);
    for (const ctrl of controllers.values()) ctrl.abort();
    for (const [id, item] of items) if (item.status === "conflict") await cancel(id);
  }

  return { loadCatalog, download, cancel, cancelAll, replace, refreshInstalled, cleanupStale, snapshot, get busy() { return active > 0 || queue.length > 0; } };
}

module.exports = { createStemDownloader, validateCatalog, safeFolderName, stemsHostUrl, findLocalFolder, TEMP, REPLACED };
