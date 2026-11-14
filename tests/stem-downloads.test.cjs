// HQ stem downloads: the server's read-only catalog and file endpoint (real server.js),
// and the desktop downloader installing chosen songs into an empty Songs folder.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { createStemDownloader, validateCatalog, safeFolderName, stemsHostUrl, findLocalFolder } = require("../desktop/stem-downloads.cjs");
const { createStemCatalog, scanFolder } = require("../stem-catalog.cjs");

const root = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-stems-"));
const hostStems = path.join(tmp, "host-songs");
const hostData = path.join(tmp, "host-data");
const PORT = 3000 + Math.floor(Math.random() * 2000) + 4000;
const host = `http://127.0.0.1:${PORT}`;
let server;

const mp3 = seed => Buffer.concat([Buffer.from("ID3"), crypto.createHash("sha512").update(seed).digest(), crypto.randomBytes(40 * 1024)]);
function folder(name, files) {
  const dir = path.join(hostStems, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), body);
  return dir;
}
const four = (seed, extra = {}) => ({ "drums.mp3": mp3(seed + "d"), "bass.mp3": mp3(seed + "b"), "other.mp3": mp3(seed + "o"), "vocals.mp3": mp3(seed + "v"), ...extra });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, ms = 15000) {
  const start = Date.now();
  for (;;) { const v = await check(); if (v) return v; if (Date.now() - start > ms) throw new Error("timed out"); await wait(50); }
}
const json = async url => (await fetch(url)).json();
const tree = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);

before(async () => {
  folder("Spacey Song", four("a", { "lyrics.lrc": "[00:01.00]hello\n" }));
  folder("Ünïcödé sóng ë", four("b", { "Info.txt": 'Album: "Test era"\n' }));
  folder("Third One", four("c"));
  folder("Incomplete", { "drums.mp3": mp3("x"), "bass.mp3": mp3("y"), "vocals.mp3": mp3("z") });
  folder("Not Audio", { ...four("n"), "vocals.mp3": Buffer.from("<html>not audio</html>".repeat(1000)) });
  const linked = folder("Linked Stem", four("l"));
  fs.rmSync(path.join(linked, "drums.mp3"));
  // Windows without symlink rights: test the rest; the symlinked set just stays incomplete
  try { fs.symlinkSync(path.join(hostStems, "Third One", "drums.mp3"), path.join(linked, "drums.mp3")); } catch { /* no symlink rights */ }
  try { fs.symlinkSync(path.join(hostStems, "Third One"), path.join(hostStems, "Symlinked Folder"), "junction"); } catch { /* no symlink rights */ }
  fs.mkdirSync(hostData, { recursive: true });
  fs.writeFileSync(path.join(hostData, "config.json"), JSON.stringify({ stemDownloads: true, refreshMinutes: 0, dailyAuthority: "" }));
  server = spawn(process.execPath, ["server.js"], {
    cwd: root, stdio: "ignore",
    env: { ...process.env, YEATLE_PORT: String(PORT), YEATLE_DATA_DIR: hostData, YEATLE_STEMS_DIR: hostStems, YEATLE_TRACKER_FIXTURES: path.join(root, "tests/fixtures/tracker"), YEATLE_DESKTOP: "1" }
  });
  await until(async () => { try { return (await fetch(`${host}/api/songs`)).ok; } catch { return false; } });
  await until(async () => { const c = await json(`${host}/api/stems/catalog`); return c.pending === 0 && c.songs.length ? c : null; });
});
after(() => { server?.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });

test("the catalog lists only complete, real stem sets, with sizes and SHA-256 hashes", async () => {
  const catalog = await json(`${host}/api/stems/catalog`);
  const names = catalog.songs.map(s => s.folder).sort();
  assert.deepEqual(names, ["Spacey Song", "Third One", "Ünïcödé sóng ë"].sort());
  const spacey = catalog.songs.find(s => s.folder === "Spacey Song");
  assert.deepEqual(spacey.files.map(f => f.name).sort(), ["bass.mp3", "drums.mp3", "lyrics.lrc", "other.mp3", "vocals.mp3"]);
  const drums = spacey.files.find(f => f.name === "drums.mp3");
  const disk = fs.readFileSync(path.join(hostStems, "Spacey Song", "drums.mp3"));
  assert.equal(drums.size, disk.length);
  assert.equal(drums.sha256, crypto.createHash("sha256").update(disk).digest("hex"));
  assert.equal(spacey.size, spacey.files.reduce((sum, f) => sum + f.size, 0));
  const unicode = catalog.songs.find(s => s.folder === "Ünïcödé sóng ë");
  assert.ok(unicode.files.some(f => f.name === "info.txt"), "extras are found whatever their capitalization");
});

test("file requests stay inside the published catalog", async () => {
  const catalog = await json(`${host}/api/stems/catalog`);
  const id = catalog.songs[0].id;
  for (const [qid, name] of [[id, "../../config.json"], [id, "..%2F..%2Fconfig.json"], [id, "info.txt.bak"], ["nope", "drums.mp3"], [id, "/etc/passwd"], ["", ""]]) {
    const res = await fetch(`${host}/api/stems/file?id=${encodeURIComponent(qid)}&name=${encodeURIComponent(name)}`);
    assert.equal(res.status, 404, `${qid} ${name}`);
  }
  const res = await fetch(`${host}/api/stems/file?id=${encodeURIComponent(id)}&name=drums.mp3`, { method: "POST" });
  assert.equal(res.status, 405);
  const ok = await fetch(`${host}/api/stems/file?id=${encodeURIComponent(id)}&name=DRUMS.mp3`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  await ok.arrayBuffer();
});

test("the server limits how many stem files it sends at once", () => {
  const cat = createStemCatalog({ stemsDir: hostStems, cacheFile: path.join(tmp, "unused.json"), getSongs: () => [], maxActive: 2 });
  const a = cat.slot(), b = cat.slot();
  assert.ok(a && b);
  assert.equal(cat.slot(), null);
  a(); a();
  assert.equal(cat.active, 1, "releasing twice frees only one slot");
  assert.ok(cat.slot());
});

function downloader(songsDir, extra = {}) {
  return createStemDownloader({ songsDir, host, fetch, retryDelay: 10, ...extra });
}
const settle = async d => until(() => !d.busy);

test("downloading two chosen songs into an empty Songs folder installs exactly those two", async () => {
  const songsDir = path.join(tmp, "profile-a", "Songs");
  fs.mkdirSync(songsDir, { recursive: true });
  let rescans = 0;
  const d = downloader(songsDir, { rescan: async () => { rescans++; } });
  const snap = await d.loadCatalog();
  assert.equal(snap.catalog.error, "");
  assert.equal(Object.values(snap.items).filter(i => i.status === "installed").length, 0, "nothing is installed or selected to begin with");
  const pick = snap.catalog.songs.filter(s => s.folder !== "Third One").map(s => s.id);
  d.download(pick);
  await settle(d);
  assert.deepEqual(tree(songsDir), ["Spacey Song", "Ünïcödé sóng ë"].sort().concat(tree(songsDir).includes(".yeatle-downloads") ? [".yeatle-downloads"] : []).sort());
  assert.deepEqual(tree(path.join(songsDir, ".yeatle-downloads")), [], "no temporary files are left");
  for (const name of ["Spacey Song", "Ünïcödé sóng ë"]) {
    for (const file of ["drums.mp3", "bass.mp3", "other.mp3", "vocals.mp3"]) {
      assert.deepEqual(fs.readFileSync(path.join(songsDir, name, file)), fs.readFileSync(path.join(hostStems, name, file)));
    }
  }
  assert.ok(fs.existsSync(path.join(songsDir, "Spacey Song", "lyrics.lrc")));
  assert.ok(fs.existsSync(path.join(songsDir, "Ünïcödé sóng ë", "info.txt")));
  assert.equal(rescans, 2, "the game is told to look at the Songs folder after each install");
  const items = d.snapshot().items;
  assert.ok(pick.every(id => items[id].status === "installed"));
  // a second request for the same songs does nothing
  d.download(pick);
  assert.equal(d.busy, false);
});

test("a song already in the Songs folder shows as installed; a different folder with the same name is never overwritten", async () => {
  const songsDir = path.join(tmp, "profile-b", "Songs");
  const mine = path.join(songsDir, "Third One");
  fs.mkdirSync(mine, { recursive: true });
  fs.writeFileSync(path.join(mine, "drums.mp3"), "my own files");
  fs.mkdirSync(path.join(songsDir, "Spacey Song"));
  for (const f of ["drums.mp3", "bass.mp3", "other.mp3", "vocals.mp3"]) fs.copyFileSync(path.join(hostStems, "Spacey Song", f), path.join(songsDir, "Spacey Song", f));
  const d = downloader(songsDir);
  const snap = await d.loadCatalog();
  const id = folderName => snap.catalog.songs.find(s => s.folder === folderName).id;
  assert.equal(snap.items[id("Spacey Song")].status, "installed");
  d.download([id("Third One")]);
  await settle(d);
  let item = d.snapshot().items[id("Third One")];
  assert.equal(item.status, "conflict");
  assert.equal(fs.readFileSync(path.join(mine, "drums.mp3"), "utf8"), "my own files", "the player's folder is untouched");
  await d.replace(id("Third One"));
  item = d.snapshot().items[id("Third One")];
  assert.equal(item.status, "installed");
  assert.deepEqual(fs.readFileSync(path.join(mine, "drums.mp3")), fs.readFileSync(path.join(hostStems, "Third One", "drums.mp3")));
  const aside = fs.readdirSync(path.join(songsDir, ".yeatle-replaced"));
  assert.equal(aside.length, 1);
  assert.equal(fs.readFileSync(path.join(songsDir, ".yeatle-replaced", aside[0], "drums.mp3"), "utf8"), "my own files", "the old folder was moved aside, not deleted");
});

// Wraps fetch so file bodies arrive slowly, break, or get corrupted.
function slowFetch({ delay = 0, breakOnce = false, corrupt = false } = {}) {
  let broken = false, failNext = false;
  return async (url, options) => {
    const res = await fetch(url, options);
    if (!url.includes("/api/stems/file")) return res;
    const reader = res.body.getReader();
    let sent = 0;
    const body = new ReadableStream({
      async pull(ctrl) {
        if (delay) await new Promise((resolve, reject) => { const t = setTimeout(resolve, delay); options.signal?.addEventListener("abort", () => { clearTimeout(t); reject(Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true }); });
        if (failNext) { failNext = false; ctrl.error(new Error("socket hang up")); return; }
        const { value, done } = await reader.read();
        if (done) { ctrl.close(); return; }
        // send half of the first chunk, then drop the connection (once per wrapper)
        if (breakOnce && !broken) { broken = true; ctrl.enqueue(value.subarray(0, value.length >> 1)); failNext = true; return; }
        const chunk = corrupt && sent === 0 ? Uint8Array.from(value, (b, i) => (i === 10 ? b ^ 0xff : b)) : value;
        sent += value.length;
        ctrl.enqueue(chunk);
      },
      cancel() { reader.cancel(); }
    });
    return new Response(body, { status: res.status, headers: res.headers });
  };
}

test("cancelling removes the partial download, and retry installs it", async () => {
  const songsDir = path.join(tmp, "profile-c", "Songs");
  fs.mkdirSync(songsDir, { recursive: true });
  const d = downloader(songsDir, { fetch: slowFetch({ delay: 40 }) });
  const { catalog } = await d.loadCatalog();
  const id = catalog.songs.find(s => s.folder === "Spacey Song").id;
  d.download([id]);
  await until(() => (d.snapshot().items[id].received || 0) > 0);
  await d.cancel(id);
  await settle(d);
  assert.equal(d.snapshot().items[id].status, "cancelled");
  assert.deepEqual(tree(songsDir).filter(n => !n.startsWith(".")), [], "nothing appears in the Songs folder");
  assert.deepEqual(tree(path.join(songsDir, ".yeatle-downloads")), []);
  const again = downloader(songsDir);
  await again.loadCatalog();
  again.download([id]);
  await settle(again);
  assert.equal(again.snapshot().items[id].status, "installed");
});

test("an interrupted download is retried; a corrupt one never installs", async () => {
  const songsDir = path.join(tmp, "profile-d", "Songs");
  fs.mkdirSync(songsDir, { recursive: true });
  const flaky = downloader(songsDir, { fetch: slowFetch({ breakOnce: true }) });
  const { catalog } = await flaky.loadCatalog();
  const id = catalog.songs.find(s => s.folder === "Ünïcödé sóng ë").id;
  flaky.download([id]);
  await settle(flaky);
  assert.equal(flaky.snapshot().items[id].status, "installed", "a dropped connection is retried automatically");

  const songsDir2 = path.join(tmp, "profile-e", "Songs");
  fs.mkdirSync(songsDir2, { recursive: true });
  const bad = downloader(songsDir2, { fetch: slowFetch({ corrupt: true }), retries: 1 });
  await bad.loadCatalog();
  bad.download([id]);
  await settle(bad);
  const item = bad.snapshot().items[id];
  assert.equal(item.status, "failed");
  assert.match(item.error, /checksum/);
  assert.deepEqual(tree(songsDir2).filter(n => !n.startsWith(".")), []);
  assert.deepEqual(tree(path.join(songsDir2, ".yeatle-downloads")), []);
  // interrupted mid-file with no retries left: failed, nothing installed
  const songsDir3 = path.join(tmp, "profile-f", "Songs");
  fs.mkdirSync(songsDir3, { recursive: true });
  const cut = downloader(songsDir3, { fetch: slowFetch({ breakOnce: true }), retries: 0 });
  await cut.loadCatalog();
  cut.download([id]);
  await settle(cut);
  assert.equal(cut.snapshot().items[id].status, "failed");
  assert.deepEqual(tree(songsDir3).filter(n => !n.startsWith(".")), []);
});

test("a busy server is waited for, and an unavailable or disabled one is reported", async () => {
  const songsDir = path.join(tmp, "profile-g", "Songs");
  fs.mkdirSync(songsDir, { recursive: true });
  let busy = 2;
  const d = downloader(songsDir, {
    fetch: async (url, options) => (url.includes("/api/stems/file") && busy-- > 0 ? new Response("{}", { status: 503, headers: { "retry-after": "0" } }) : fetch(url, options))
  });
  const { catalog } = await d.loadCatalog();
  d.download([catalog.songs[0].id]);
  await settle(d);
  assert.equal(d.snapshot().items[catalog.songs[0].id].status, "installed");

  const gone = createStemDownloader({ songsDir, host: "http://127.0.0.1:9", fetch, retryDelay: 1 });
  const snap = await gone.loadCatalog();
  assert.match(snap.catalog.error, /Couldn't load the song list: couldn't reach the server/);

  const off = createStemDownloader({ songsDir, host, fetch: async () => new Response(JSON.stringify({ enabled: false }), { status: 404 }) });
  assert.equal((await off.loadCatalog()).catalog.error, "This server doesn't offer HQ stem downloads.");
});

test("catalog entries with unsafe names or incomplete files are left out", () => {
  const sha = "a".repeat(64);
  const files = ["drums.mp3", "bass.mp3", "other.mp3", "vocals.mp3"].map(name => ({ name, size: 100, sha256: sha }));
  const song = (folder, extra = {}) => ({ id: `id${Math.random().toString(36).slice(2)}`, folder, display: folder, files, ...extra });
  const out = validateCatalog({ songs: [
    song("Fine Song ë"), song("../escape"), song("a/b"), song("CON"), song("trailing."), song(".hidden"), song("C:\\x"),
    song("Missing", { files: files.slice(1) }), song("Evil", { files: [...files, { name: "../../evil.mp3", size: 1, sha256: sha }] }),
    song("Bad hash", { files: files.map(f => ({ ...f, sha256: "zz" })) }), song("Too big", { files: files.map(f => ({ ...f, size: 1e12 })) }),
    song("fine song ë", { id: "dupe-folder" })
  ] });
  assert.deepEqual(out.songs.map(s => s.folder), ["Fine Song ë"]);
  assert.equal(out.skipped, 11);
  assert.equal(safeFolderName("Bad Bënd _ Dëmon"), "Bad Bënd _ Dëmon");
  assert.equal(safeFolderName("nul.txt"), null);
  assert.equal(stemsHostUrl("https://playyeatle.duckdns.org/"), "https://playyeatle.duckdns.org");
  assert.equal(stemsHostUrl("http://example.com"), null, "only https, apart from a local test server");
  assert.equal(stemsHostUrl("http://127.0.0.1:3093"), "http://127.0.0.1:3093");
  assert.equal(stemsHostUrl("https://user:pw@example.com"), null);
});

test("Help > Optional HQ Stems offers MEGA and the server", () => {
  const { menuTemplate } = require("../desktop/menu.cjs");
  const calls = [];
  const menu = menuTemplate({ platform: "win32", openStemsMega: () => calls.push("mega"), openStemsServer: () => calls.push("server"), updateStatus: "Check for Updates", updating: false });
  const hq = menu.find(m => m.label === "Help").submenu.find(m => m.label === "Optional HQ Stems");
  assert.deepEqual(hq.submenu.map(m => m.label), ["Download from MEGA", "Download from server…"]);
  hq.submenu.forEach(m => m.click());
  assert.deepEqual(calls, ["mega", "server"]);
});

test("refreshInstalled reads songsDir once per pass while matching NFC/NFD folders and preserving conflict handling", async t => {
  const songsDir = path.join(tmp, "profile-refresh", "Songs");
  const nfdFolder = "Ünïcödé sóng ë".normalize("NFD").toUpperCase();
  const unicodeDir = path.join(songsDir, nfdFolder);
  fs.mkdirSync(unicodeDir, { recursive: true });
  for (const f of ["drums.mp3", "bass.mp3", "other.mp3", "vocals.mp3"]) {
    fs.copyFileSync(path.join(hostStems, "Ünïcödé sóng ë", f), path.join(unicodeDir, f));
  }
  const conflictDir = path.join(songsDir, "Third One");
  fs.mkdirSync(conflictDir, { recursive: true });
  fs.writeFileSync(path.join(conflictDir, "drums.mp3"), "my custom drums");

  const direct = findLocalFolder(songsDir, "Ünïcödé sóng ë");
  assert.ok(direct);
  assert.equal(direct.complete, true);
  assert.equal(direct.name, nfdFolder);
  assert.notEqual(direct.name, direct.name.normalize("NFC"));
  assert.equal(direct.name.normalize("NFC").toLowerCase(), "ünïcödé sóng ë");

  const origReaddirSync = fs.readdirSync;
  let songsDirReads = 0;
  t.mock.method(fs, "readdirSync", (target, ...rest) => {
    if (path.resolve(String(target)) === path.resolve(songsDir)) songsDirReads++;
    return origReaddirSync.call(fs, target, ...rest);
  });

  const d = downloader(songsDir);
  const snap = await d.loadCatalog();
  assert.equal(snap.catalog.error, "");
  assert.equal(snap.catalog.songs.length, 3);
  assert.equal(songsDirReads, 1, "loadCatalog refreshInstalled reads songsDir once instead of once per catalog song");

  const byFolder = name => snap.catalog.songs.find(s => s.folder === name).id;
  const unicodeId = byFolder("Ünïcödé sóng ë");
  const thirdOneId = byFolder("Third One");
  assert.equal(snap.items[unicodeId].status, "installed");
  assert.equal(snap.items[unicodeId].note, `In your Songs folder as "${direct.name}"`);
  assert.equal(snap.items[thirdOneId], undefined);

  await d.refreshInstalled();
  assert.equal(songsDirReads, 2, "subsequent refreshInstalled also reads songsDir once");

  d.download([thirdOneId]);
  await settle(d);
  assert.equal(d.snapshot().items[thirdOneId].status, "conflict");
  assert.equal(fs.readFileSync(path.join(conflictDir, "drums.mp3"), "utf8"), "my custom drums");

  await d.refreshInstalled();
  assert.equal(d.snapshot().items[thirdOneId].status, "conflict");
});

test("createStemCatalog resolves stemsDir realpath once per build, deduplicates queue entries, rejects symlinks, and serializes async cache writes", async t => {
  const localRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-catalog-unit-"));
  t.after(() => fs.rmSync(localRoot, { recursive: true, force: true }));
  const stemsDir = path.join(localRoot, "Songs");
  const outsideDir = path.join(localRoot, "Outside");
  const cacheFile = path.join(localRoot, "stems-hashes.json");

  const makePack = (parent, name, seed) => {
    const dir = path.join(parent, name);
    fs.mkdirSync(dir, { recursive: true });
    for (const [file, body] of Object.entries(four(seed))) fs.writeFileSync(path.join(dir, file), body);
    return dir;
  };
  makePack(stemsDir, "Alpha", "alpha");
  makePack(stemsDir, "Beta", "beta");
  makePack(stemsDir, "Gamma", "gamma");
  makePack(outsideDir, "Escaped", "outside");

  // Junction/symlink folders pointing outside or inside must never be accepted.
  let hasJunction = false;
  try {
    fs.symlinkSync(path.join(outsideDir, "Escaped"), path.join(stemsDir, "Junction Escape"), "junction");
    hasJunction = true;
  } catch { /* platform cannot create junction */ }
  assert.equal(scanFolder(stemsDir, "../Outside/Escaped"), null);
  assert.equal(scanFolder(stemsDir, ".hidden"), null);
  if (hasJunction) assert.equal(scanFolder(stemsDir, "Junction Escape"), null);
  assert.ok(scanFolder(stemsDir, "Alpha"));

  const songs = [
    { id: "id-a", title: "Alpha", display: "Alpha", mode: "stems", folder: "Alpha" },
    { id: "id-b", title: "Beta", display: "Beta", mode: "stems", folder: "Beta" },
    { id: "id-c", title: "Gamma", display: "Gamma", mode: "stems", folder: "Gamma" },
    ...(hasJunction ? [{ id: "id-j", title: "Junction Escape", display: "Junction Escape", mode: "stems", folder: "Junction Escape" }] : []),
    { id: "id-traversal", title: "Escape", display: "Escape", mode: "stems", folder: "../Outside/Escaped" }
  ];

  // Count realpathSync calls on stemsDir during a single build(), stream reads per file, and async cache writes.
  let stemsRealpathCalls = 0;
  const origRealpathSync = fs.realpathSync;
  t.mock.method(fs, "realpathSync", (target, ...rest) => {
    if (path.resolve(String(target)) === path.resolve(stemsDir)) stemsRealpathCalls++;
    return origRealpathSync.call(fs, target, ...rest);
  });

  const { Transform } = require("node:stream");
  const streamReads = new Map();
  const origCreateReadStream = fs.createReadStream;
  const betaDrums = path.resolve(stemsDir, "Beta", "drums.mp3");
  t.mock.method(fs, "createReadStream", (target, ...rest) => {
    const resolved = path.resolve(String(target));
    const stream = origCreateReadStream.call(fs, target, ...rest);
    if (resolved.startsWith(path.resolve(stemsDir))) {
      streamReads.set(resolved, (streamReads.get(resolved) || 0) + 1);
      // Delay Beta/drums via Transform so Alpha finishes and starts a cache write before Beta+Gamma complete.
      if (resolved === betaDrums) {
        const delayStream = new Transform({
          transform(chunk, _enc, cb) { setTimeout(() => cb(null, chunk), 35); }
        });
        stream.on("error", err => delayStream.destroy(err));
        return stream.pipe(delayStream);
      }
    }
    return stream;
  });

  const origWriteFileSync = fs.writeFileSync;
  let syncCacheWrites = 0;
  t.mock.method(fs, "writeFileSync", (target, ...rest) => {
    if (path.resolve(String(target)) === path.resolve(cacheFile)) syncCacheWrites++;
    return origWriteFileSync.call(fs, target, ...rest);
  });

  const origAsyncWriteFile = fs.promises.writeFile;
  let activeWrites = 0, maxConcurrentWrites = 0, asyncWriteCount = 0;
  t.mock.method(fs.promises, "writeFile", async (target, body, ...rest) => {
    if (path.resolve(String(target)) !== path.resolve(cacheFile)) {
      return origAsyncWriteFile.call(fs.promises, target, body, ...rest);
    }
    asyncWriteCount++;
    activeWrites++;
    maxConcurrentWrites = Math.max(maxConcurrentWrites, activeWrites);
    // Keep the first write in-flight across subsequent hash completions so coalescing + serialization are exercised.
    if (asyncWriteCount === 1) await wait(80);
    try {
      return await origAsyncWriteFile.call(fs.promises, target, body, ...rest);
    } finally {
      activeWrites--;
    }
  });

  const cat = createStemCatalog({ stemsDir, cacheFile, getSongs: () => songs, saveDelay: 10 });
  const first = cat.catalog();
  assert.equal(first.pending, 3);
  assert.equal(first.songs.length, 0);
  assert.equal(stemsRealpathCalls, 1, "realpathSync(stemsDir) is called once per build() across all folders");

  // Repeated invalidate() + catalog() calls while draining must deduplicate queue entries and reuse cached rootReal once per build.
  cat.invalidate();
  cat.catalog();
  cat.invalidate();
  cat.catalog();
  assert.equal(stemsRealpathCalls, 3);

  const built = await until(() => {
    const c = cat.catalog();
    return c.pending === 0 && c.songs.length === 3 ? c : null;
  });
  assert.deepEqual(built.songs.map(s => s.folder), ["Alpha", "Beta", "Gamma"]);

  // Each stem file was read/hashed once thanks to Set queue deduplication.
  assert.equal(streamReads.size, 12);
  for (const [filePath, count] of streamReads) {
    assert.equal(count, 1, `expected ${path.basename(filePath)} to be hashed once`);
  }

  // Wait for serialized async writes to finish persisting all 12 hashes without sync writes or overlapping async writes.
  const persisted = await until(() => {
    if (activeWrites !== 0 || !fs.existsSync(cacheFile)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      return Object.keys(parsed).length === 12 ? parsed : null;
    } catch { return null; }
  });
  assert.equal(syncCacheWrites, 0, "save() must not block with fs.writeFileSync");
  assert.equal(maxConcurrentWrites, 1, "overlapping saves must serialize cleanly");
  assert.ok(asyncWriteCount >= 2, `expected coalesced sequential writes across slow hash completion, got ${asyncWriteCount}`);
  assert.equal(Object.keys(persisted).length, 12);
  const betaDrumsSong = built.songs.find(s => s.folder === "Beta").files.find(f => f.name === "drums.mp3");
  assert.equal(betaDrumsSong.sha256, crypto.createHash("sha256").update(fs.readFileSync(betaDrums)).digest("hex"));

  // Reloading from persisted cacheFile produces the full catalog immediately with zero stream reads.
  streamReads.clear();
  const reloaded = createStemCatalog({ stemsDir, cacheFile, getSongs: () => songs });
  const loadedCatalog = reloaded.catalog();
  assert.equal(loadedCatalog.pending, 0);
  assert.deepEqual(loadedCatalog.songs.map(s => s.folder), ["Alpha", "Beta", "Gamma"]);
  assert.equal(streamReads.size, 0);

  // Failing async write (e.g. unwritable cacheFile directory) must not throw or leak unhandled rejections.
  const badCacheCat = createStemCatalog({
    stemsDir,
    cacheFile: path.join(localRoot, "missing-dir", "nested", "cache.json"),
    getSongs: () => [songs[0]],
    saveDelay: 5
  });
  await until(() => {
    const c = badCacheCat.catalog();
    return c.pending === 0 && c.songs.length === 1 ? c : null;
  });
  await wait(30);
});
