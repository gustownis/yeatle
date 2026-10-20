// The HQ stem sets a server deliberately offers for download ("stemDownloads": true).
// Only complete sets of the four playable stems are listed. Every folder and file is
// checked to be a real, regular file inside the Songs folder (symlinks are skipped),
// and each file is listed with its size and SHA-256 so clients can verify downloads.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const STEMS = ["drums", "bass", "other", "vocals"];
const EXTRAS = ["lyrics.lrc", "info.txt"];
const MIN_STEM = 16 * 1024;
const MAX_STEM = 200 * 1024 * 1024;
const MAX_EXTRA = 256 * 1024;
const CATALOG_TTL = 60 * 1000;

function inside(root, file) {
  const rel = path.relative(root, file);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function looksLikeMp3(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const head = Buffer.alloc(3);
    fs.readSync(fd, head, 0, 3, 0);
    return head.toString("latin1") === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
  } catch { return false; } finally { if (fd !== undefined) fs.closeSync(fd); }
}

// The files of one stem folder, or null when it isn't a complete, safe set.
function scanFolder(root, folder) {
  if (!folder || folder.startsWith(".") || folder.includes("/") || folder.includes("\\")) return null;
  const dir = path.join(root, folder);
  try {
    const st = fs.lstatSync(dir);
    if (!st.isDirectory() || st.isSymbolicLink()) return null;
    const real = fs.realpathSync(dir);
    if (!inside(fs.realpathSync(root), real)) return null;
    const entries = new Map(fs.readdirSync(dir).map(name => [name.toLowerCase(), name]));
    const files = [];
    for (const name of [...STEMS.map(s => `${s}.mp3`), ...EXTRAS]) {
      const actual = entries.get(name);
      const required = name.endsWith(".mp3");
      if (!actual) { if (required) return null; continue; }
      const file = path.join(dir, actual);
      const fst = fs.lstatSync(file);
      const ok = fst.isFile() && !fst.isSymbolicLink() && (required ? fst.size >= MIN_STEM && fst.size <= MAX_STEM && looksLikeMp3(file) : fst.size <= MAX_EXTRA);
      if (!ok) { if (required) return null; continue; }
      files.push({ name, file, size: fst.size, mtimeMs: fst.mtimeMs });
    }
    return { folder, files };
  } catch { return null; }
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(file).on("error", reject).on("data", chunk => hash.update(chunk)).on("end", () => resolve(hash.digest("hex")));
  });
}

function createStemCatalog({ stemsDir, cacheFile, getSongs, maxActive = 4, log = console }) {
  let hashes = new Map();
  try { hashes = new Map(Object.entries(JSON.parse(fs.readFileSync(cacheFile, "utf8")))); } catch { /* first run */ }
  const key = f => `${path.relative(stemsDir, f.file)}|${f.size}|${Math.round(f.mtimeMs)}`;
  const queue = [];
  let hashing = false, saveTimer = null, cached = null, active = 0;

  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { fs.writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(hashes))); } catch { /* read-only is fine */ }
    }, 2000);
    saveTimer.unref?.();
  };

  // Hash new or changed files one at a time in the background, so the host stays responsive.
  async function drain() {
    if (hashing) return;
    hashing = true;
    try {
      while (queue.length) {
        const f = queue.shift();
        const k = key(f);
        if (hashes.has(k)) continue;
        try { hashes.set(k, await hashFile(f.file)); save(); } catch (err) { log.warn?.(`Couldn't hash ${f.file}: ${err.message}`); }
        await new Promise(resolve => setImmediate(resolve));
      }
    } finally { hashing = false; cached = null; }
  }

  function build() {
    const songs = [];
    let pending = 0;
    const seen = new Set();
    for (const song of getSongs()) {
      if (song.mode !== "stems" || !song.folder || seen.has(song.folder)) continue;
      seen.add(song.folder);
      const set = scanFolder(stemsDir, song.folder);
      if (!set) continue;
      const missing = set.files.filter(f => !hashes.has(key(f)));
      if (missing.length) {
        pending++;
        for (const f of missing) if (!queue.some(q => q.file === f.file)) queue.push(f);
        continue;
      }
      const files = set.files.map(f => ({ name: f.name, size: f.size, sha256: hashes.get(key(f)) }));
      songs.push({
        id: song.id, title: song.title, display: song.display, era: song.era || "",
        year: song.eraYear || song.year || null, features: song.features || [], cover: song.cover || "",
        artist: song.artist || "", artistRole: song.artistRole || "", tab: song.tab || "Unknown",
        folder: set.folder, size: files.reduce((sum, f) => sum + f.size, 0), files
      });
    }
    if (queue.length) drain();
    songs.sort((a, b) => a.display.localeCompare(b.display));
    return { format: 1, generated: Date.now(), pending, songs };
  }

  function catalog() {
    if (!cached || Date.now() - cached.generated > CATALOG_TTL || (cached.pending && !hashing)) cached = build();
    return cached;
  }

  // Looks a requested file up in the catalog and checks it again on disk.
  function resolve(id, name) {
    const entry = catalog().songs.find(song => song.id === id);
    const listed = entry && entry.files.find(f => f.name === String(name || "").toLowerCase());
    if (!listed) return { status: 404, error: "That file isn't in the catalog." };
    const set = scanFolder(stemsDir, entry.folder);
    const f = set && set.files.find(x => x.name === listed.name);
    if (!f || f.size !== listed.size || hashes.get(key(f)) !== listed.sha256) { cached = null; return { status: 409, error: "That file changed on the server. Reload the list and try again." }; }
    return { status: 200, file: f.file, size: f.size, sha256: listed.sha256, name: f.name };
  }

  // Bounded downloads: returns a release function, or null when the server is busy.
  function slot() {
    if (active >= maxActive) return null;
    active++;
    let done = false;
    return () => { if (!done) { done = true; active--; } };
  }

  return { catalog, resolve, slot, invalidate: () => { cached = null; }, get active() { return active; } };
}

module.exports = { createStemCatalog, scanFolder, STEMS, EXTRAS, MAX_STEM, MAX_EXTRA };
