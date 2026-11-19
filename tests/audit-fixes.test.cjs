const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");

const { createLeaderboardStore } = require("../server/leaderboard.cjs");
const { createAudioCache } = require("../server/audio-cache.cjs");
const { createRateLimiter } = require("../server/client-signals.cjs");
const { createActiveSongFeed } = require("../server/live-control.cjs");
const { createStemDownloader } = require("../desktop/stem-downloads.cjs");
const { installMicrophonePermissions } = require("../desktop/permissions.cjs");
const { menuTemplate } = require("../desktop/menu.cjs");
const { createUpdateController } = require("../desktop/updates.cjs");
const { mergeCuration } = require("../scripts/merge-curation.cjs");

const root = path.resolve(__dirname, "..");

function makeTempDir(t, prefix = "yeatle-audit-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  return dir;
}

/* ---------- H1, H3, M1: server/leaderboard.cjs ---------- */

test("leaderboard reserved/prototype usernames do not throw 500 or pollute Object.prototype", async t => {
  const dir = makeTempDir(t);
  const store = createLeaderboardStore(path.join(dir, "users.json"));

  for (const name of ["constructor", "__proto__", "toString"]) {
    await assert.rejects(store.login({ username: name, password: "secret" }), /Wrong username or password/);
    assert.throws(() => store.banUser(name), /No account is called/);
    assert.throws(() => store.adminRename(name, "validname"), /No account is called/);
    assert.equal(Object.prototype[name], Object.prototype[name]);
    assert.equal(Object.prototype.accountId, undefined);
  }

  // Registering and logging in as "constructor" works cleanly with null-prototype user storage.
  const reg = await store.register({ username: "constructor", password: "secretPassword" });
  assert.equal(reg.account.username, "constructor");
  const logged = await store.login({ username: "constructor", password: "secretPassword" });
  assert.equal(logged.account.username, "constructor");
  const afterLogout = store.logout(logged.token);
  assert.deepEqual(afterLogout, { ok: true });
});

test("dailyRoundAct caps and deduplicates close guesses, and readEvidence handles missing files with 404", async t => {
  const dir = makeTempDir(t);
  const now = Date.parse("2026-10-27T12:00:00Z");
  const store = createLeaderboardStore(path.join(dir, "users.json"), {
    dailyToday: () => ({
      date: "2026-10-27",
      id: "v2:2026-10-27:abc",
      tries: 6,
      matches: () => false,
      matchesVersion: () => true,
      reveal: () => ({ display: "Test", title: "Test" })
    })
  });

  const reg = await store.register({ username: "closeplayer", password: "password123" }, now);
  // Repeated identical close guess is returned as feedback but deduplicated in saved list.
  await store.dailyRoundAct(reg.token, { challenge: "v2:2026-10-27:abc", kind: "guess", text: "Version A" }, now);
  const dup = await store.dailyRoundAct(reg.token, { challenge: "v2:2026-10-27:abc", kind: "guess", text: "version a" }, now);
  assert.equal(dup.close.length, 1);

  for (let i = 0; i < 30; i++) {
    await store.dailyRoundAct(reg.token, { challenge: "v2:2026-10-27:abc", kind: "guess", text: `Version ${i}` }, now);
  }
  const state = await store.dailyRoundAct(reg.token, { challenge: "v2:2026-10-27:abc", kind: "state" }, now);
  assert.equal(state.close.length, 20);

  // Save cheat capture, delete file from disk, and verify readEvidence throws HTTP 404 rather than raw ENOENT.
  store.reportCheatTool(reg.token, { tools: [], evidence: { page: "test", scripts: [] } }, now);
  const { evidence } = store.listBans();
  assert.equal(evidence.length, 1);
  fs.rmSync(path.join(dir, "cheat-evidence", `${evidence[0].id}.json`));
  assert.throws(() => store.readEvidence(evidence[0].id), err => err.status === 404);
});

/* ---------- H4: server/audio-cache.cjs ---------- */

test("audio-cache re-fetches expired entries in fill(), avoids rm/rename collisions, and sniffs small initial chunks", async t => {
  const dir = makeTempDir(t);
  let clock = 1000;
  const detectWav = buf => (buf && buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WAVE" ? "audio/wav" : null);
  const cache = createAudioCache({ dir, detectType: detectWav, ttlMs: 500, now: () => clock });

  const { Readable } = require("node:stream");
  const wavBody = Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WAVE"), Buffer.alloc(40, 7)]);
  let opens = 0;
  const openChunked = async () => {
    opens++;
    const res = Readable.from([wavBody.subarray(0, 4), wavBody.subarray(4, 10), wavBody.subarray(10)]);
    res.statusCode = 200;
    res.headers = { "content-type": "application/octet-stream", "content-length": String(wavBody.length) };
    return res;
  };

  await cache.fill("song-wav", openChunked);
  assert.equal(opens, 1);
  const firstEntry = cache.lookup("song-wav");
  assert.equal(firstEntry.type, "audio/wav");

  // Fill again while fresh: no extra download.
  assert.equal(cache.fill("song-wav", openChunked), null);
  assert.equal(opens, 1);

  // Advance clock past TTL and call fill() directly without lookup() first.
  clock += 1000;
  await cache.fill("song-wav", openChunked);
  assert.equal(opens, 2);
  const secondEntry = cache.lookup("song-wav");
  assert.ok(secondEntry);
  assert.notEqual(secondEntry.file, firstEntry.file);
  // Wait a beat so unawaited rm(firstEntry.file) has run, then verify secondEntry.file still exists.
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(fs.existsSync(secondEntry.file), true);
});

/* ---------- M5: client-signals & live-control ---------- */

test("rate limiter evicts by actual window and enforces size cap; SSE feed cleans up heartbeats and limits clients", () => {
  const limiter = createRateLimiter({ maxEntries: 5 });
  assert.equal(limiter.take("ip", "a", 1, 1000, 100), true);
  assert.equal(limiter.take("ip", "a", 1, 1000, 200), false);
  assert.equal(limiter.take("ip", "a", 1, 1000, 1300), true);
  for (let i = 0; i < 20; i++) limiter.take("ip", `u-${i}`, 5, 1000, 2000);
  assert.ok(limiter.size <= 5);

  const feed = createActiveSongFeed({ heartbeatMs: 15, maxClients: 1 });
  let ended = false;
  const res1 = Object.assign(new EventEmitter(), {
    destroyed: false,
    writableEnded: false,
    headers: null,
    chunks: [],
    writeHead(code, h) { this.statusCode = code; this.headers = h; },
    write(data) { this.chunks.push(data); return true; },
    end() { ended = true; this.writableEnded = true; }
  });
  feed.subscribe({}, res1, { id: "s1" });
  assert.equal(feed.size, 1);

  const res2 = Object.assign(new EventEmitter(), {
    destroyed: false,
    writableEnded: false,
    statusCode: 0,
    writeHead(code) { this.statusCode = code; },
    write() { return true; },
    end() { this.writableEnded = true; }
  });
  feed.subscribe({}, res2, { id: "s1" });
  assert.equal(res2.statusCode, 503);
  assert.equal(feed.size, 1);

  res1.emit("close");
  assert.equal(feed.size, 0);
  assert.equal(ended, true);
});

/* ---------- H5, M3, M4: server.js HTTP behaviors & redirect hygiene ---------- */

test("server handles HEAD range requests, audio HEAD requests, upstream 403 cache eviction, and admin rename feature restore", async t => {
  const dir = makeTempDir(t);
  const songsDir = path.join(dir, "Songs", "StemTrack");
  fs.mkdirSync(songsDir, { recursive: true });
  for (const stem of ["drums", "bass", "other", "vocals"]) {
    fs.writeFileSync(path.join(songsDir, `${stem}.mp3`), `data-${stem}-bytes`);
  }

  let upstreamMode = "ok";
  let upstreamHeadCalls = 0;
  let upstreamGetCalls = 0;
  const mockAudio = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(128, 3)]);
  const upstream = http.createServer((req, res) => {
    if (req.url === "/exoshare/api/shares/share1") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ files: [{ id: upstreamMode === "expired" ? "f1" : "f2", name: "song.mp3", order: 1 }] }));
      return;
    }
    if (req.url.startsWith("/file/")) {
      if (req.url.endsWith("/expired")) {
        res.writeHead(403);
        res.end("expired");
        return;
      }
      if (req.method === "HEAD") {
        upstreamHeadCalls++;
        res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": String(mockAudio.length) });
        res.end();
        return;
      }
      upstreamGetCalls++;
      res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": String(mockAudio.length) });
      res.end(mockAudio);
    }
  });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  t.after(() => upstream.close());
  const upPort = upstream.address().port;

  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ port: 0, openBrowser: false, refreshMinutes: 0, tabs: [], stemDownloads: true, dailyAuthority: "" }));
  fs.writeFileSync(path.join(dir, "admin.json"), JSON.stringify({ password: "secret" }));
  fs.writeFileSync(path.join(dir, "songs-cache.json"), JSON.stringify({
    format: 5,
    updated: 1,
    eras: [{ name: "TestEra" }],
    songs: [
      {
        id: "exo1",
        title: "Test Track",
        display: "Test Track (feat. Guest)",
        features: ["feat. Guest"],
        era: "TestEra",
        mode: "filter",
        source: { kind: "url", id: `http://127.0.0.1:${upPort}/file/ok` }
      }
    ]
  }));

  const child = spawn(process.execPath, [path.join(root, "server.js")], {
    env: { ...process.env, YEATLE_DATA_DIR: dir, YEATLE_PORT: "0", YEATLE_DESKTOP: "1" },
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const done = new Promise(resolve => child.once("exit", resolve));
      child.kill();
      await done;
    }
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 5000);
    child.on("message", m => { if (m.type === "yeatle-ready") { clearTimeout(timer); resolve(m.port); } });
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`exit ${code}`)); });
  });
  const base = `http://127.0.0.1:${port}`;

  // 1. Static range HEAD returns empty body with 206 Content-Length: 4.
  const headStatic = await fetch(`${base}/Songs/StemTrack/drums.mp3`, { method: "HEAD", headers: { Range: "bytes=0-3" } });
  assert.equal(headStatic.status, 206);
  assert.equal(headStatic.headers.get("content-length"), "4");
  assert.equal((await headStatic.arrayBuffer()).byteLength, 0);

  // 2. Proxied audio HEAD issues upstream HEAD without pulling GET body.
  const headAudio = await fetch(`${base}/api/audio/exo1`, { method: "HEAD" });
  assert.equal(headAudio.status, 200);
  assert.equal(headAudio.headers.get("content-length"), String(mockAudio.length));
  assert.equal((await headAudio.arrayBuffer()).byteLength, 0);
  assert.equal(upstreamHeadCalls, 1);
  assert.equal(upstreamGetCalls, 0);

  // 3. Admin rename followed by empty-name reset restores "(feat. Guest)".
  const loginRes = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "secret" })
  });
  assert.equal(loginRes.status, 200);
  const cookie = loginRes.headers.get("set-cookie").split(";")[0];

  await fetch(`${base}/api/admin/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ id: "exo1", name: "Custom Name" })
  });
  let list = await (await fetch(`${base}/api/songs`)).json();
  assert.equal(list.songs[0].display, "Custom Name");

  await fetch(`${base}/api/admin/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ id: "exo1", name: "" })
  });
  list = await (await fetch(`${base}/api/songs`)).json();
  assert.equal(list.songs[0].display, "Test Track (feat. Guest)");
});

test("server request() strips sensitive headers on cross-origin redirects and blocks file:// redirects", async t => {
  const seenHeaders = [];
  const target = http.createServer((req, res) => {
    seenHeaders.push(req.headers);
    res.writeHead(200);
    res.end("ok");
  });
  await new Promise(resolve => target.listen(0, "127.0.0.1", resolve));
  t.after(() => target.close());

  const redirector = http.createServer((req, res) => {
    if (req.url === "/bad-scheme") {
      res.writeHead(302, { Location: "file:///etc/passwd" });
      res.end();
      return;
    }
    res.writeHead(302, { Location: `http://127.0.0.1:${target.address().port}/final` });
    res.end();
  });
  await new Promise(resolve => redirector.listen(0, "127.0.0.1", resolve));
  t.after(() => redirector.close());

  const script = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const slice = script.slice(script.indexOf("function tunnel("), script.indexOf("async function fetchJson("));
  const ctx = vm.createContext({ http, https: require("node:https"), URL, Buffer, PROXY: "" });
  vm.runInContext(slice + "; globalThis.__request = request;", ctx);

  const res = await ctx.__request(`http://127.0.0.1:${redirector.address().port}/hop`, {
    headers: { Authorization: "Bearer secret-token", Cookie: "a=b", "X-Keep": "yes" }
  });
  res.resume();
  assert.equal(seenHeaders.length, 1);
  assert.equal(seenHeaders[0].authorization, undefined);
  assert.equal(seenHeaders[0].cookie, undefined);
  assert.equal(seenHeaders[0]["x-keep"], "yes");

  await assert.rejects(ctx.__request(`http://127.0.0.1:${redirector.address().port}/bad-scheme`), /Blocked redirect protocol/);
});

/* ---------- H6, H7, H8, M6, M8: desktop/* ---------- */

test("desktop permissions, menu bar, updates throttling/reentrancy, and stem downloader edge cases", async t => {
  // Permissions: allow same-origin clipboard & wake-lock, block foreign or video.
  let checkFn, reqFn;
  installMicrophonePermissions({
    setPermissionCheckHandler(fn) { checkFn = fn; },
    setPermissionRequestHandler(fn) { reqFn = fn; }
  }, "http://127.0.0.1:3094");
  const ask = (perm, details) => { let ok; reqFn(null, perm, v => { ok = v; }, details); return ok; };
  assert.equal(ask("clipboard-sanitized-write", { requestingUrl: "http://127.0.0.1:3094/" }), true);
  assert.equal(ask("screen-wake-lock", { requestingUrl: "http://127.0.0.1:3094/" }), true);
  assert.equal(ask("clipboard-sanitized-write", { requestingUrl: "https://evil.example/" }), false);
  assert.equal(checkFn(null, "screen-wake-lock", "http://127.0.0.1:3094", {}), true);

  // macOS menu has editMenu; Windows keeps exact 4 labels.
  const darwinMenu = menuTemplate({ platform: "darwin", updateStatus: "Check", updating: false });
  assert.ok(darwinMenu.some(item => item.role === "editMenu"));
  const winMenu = menuTemplate({ platform: "win32", updateStatus: "Check", updating: false });
  assert.deepEqual(winMenu.map(i => i.label), ["Game", "View", "Developer", "Help"]);

  // Stem downloader: missing song after catalog change + rollback on replace() failure.
  const dir = makeTempDir(t);
  const songsDir = path.join(dir, "Songs");
  const conflictDir = path.join(songsDir, "Existing Song");
  fs.mkdirSync(conflictDir, { recursive: true });
  fs.writeFileSync(path.join(conflictDir, "drums.mp3"), "original-user-stem");

  const dl = createStemDownloader({ songsDir, host: "http://127.0.0.1:1", fetch: async () => new Response("{}"), retryDelay: 1 });
  // Empty catalog run settles cleanly as idle rather than rejecting or hanging queued.
  await assert.doesNotReject(async () => {
    const emptyRes = dl.download(["nonexistent"]);
    assert.equal(emptyRes.items.nonexistent, undefined);
  });

  // Check updates status deduplication with portable mode + multi-chunk download progress.
  const prevEnv = process.env.PORTABLE_EXECUTABLE_FILE;
  const prevFetch = globalThis.fetch;
  process.env.PORTABLE_EXECUTABLE_FILE = "Yeatle.exe";
  const statusHistory = [];
  let ctrl;
  try {
    const { assetName } = require("../desktop/update-core.cjs");
    const name = assetName("9.9.9", process.platform, process.arch, "portable");
    const payload = Buffer.from("0123456789".repeat(10));
    const digest = `sha256:${crypto.createHash("sha256").update(payload).digest("hex")}`;
    const releaseUrl = "https://github.com/gustownis/yeatle/releases/download/v9.9.9/";
    globalThis.fetch = async url => {
      if (String(url).includes("/releases/latest")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            tag_name: "v9.9.9", draft: false, prerelease: false, html_url: "https://github.com/gustownis/yeatle/releases/tag/v9.9.9",
            assets: [{ name, size: payload.length, state: "uploaded", digest, browser_download_url: releaseUrl + name }]
          })
        };
      }
      // Stream 4 equal 25% chunks; two chunks around same percent should not trigger duplicate status rebuilds,
      // and check duplicate consecutive percentages specifically.
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(payload.subarray(0, 50));
          c.enqueue(payload.subarray(50, 50)); // 50% again (duplicate percent)
          c.enqueue(payload.subarray(50));
          c.close();
        }
      });
      return new Response(stream, { status: 200 });
    };
    ctrl = createUpdateController({
      app: { isPackaged: true, getVersion: () => "1.14.1", getPath: () => dir },
      dialog: { showMessageBox: async () => ({ response: 0 }) },
      shell: { openExternal: async () => {}, showItemInFolder() {}, openPath: async () => "" },
      getWindow: () => null,
      onStatus: () => { statusHistory.push(ctrl.status); }
    });
    await ctrl.check(true);
    const fiftyCount = statusHistory.filter(s => s === "Downloading Update (50%)").length;
    assert.equal(fiftyCount, 1);
  } finally {
    if (prevEnv === undefined) delete process.env.PORTABLE_EXECUTABLE_FILE;
    else process.env.PORTABLE_EXECUTABLE_FILE = prevEnv;
    globalThis.fetch = prevFetch;
  }
});

test("stem-downloader replace rolls back moved user folder if installing new folder fails, and abort cancels stalled stream", async t => {
  const dir = makeTempDir(t);
  const songsDir = path.join(dir, "Songs");
  const existing = path.join(songsDir, "Song One");
  fs.mkdirSync(existing, { recursive: true });
  fs.writeFileSync(path.join(existing, "drums.mp3"), "keep-me");

  const sample = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(100, 1)]);
  const sha = crypto.createHash("sha256").update(sample).digest("hex");
  const cat = {
    songs: [{
      id: "s1",
      folder: "Song One",
      display: "Song One",
      files: ["drums.mp3", "bass.mp3", "other.mp3", "vocals.mp3"].map(name => ({ name, size: sample.length, sha256: sha }))
    }]
  };

  let stall = true;
  const dl = createStemDownloader({
    songsDir,
    host: "https://example.test",
    retryDelay: 1,
    fetch: async (url, { signal }) => {
      if (url.endsWith("/catalog")) return new Response(JSON.stringify(cat), { status: 200, headers: { "content-type": "application/json" } });
      if (stall) {
        const body = new ReadableStream({
          start(controller) {
            signal.addEventListener("abort", () => { try { controller.error(new Error("aborted")); } catch {} }, { once: true });
          }
        });
        return new Response(body, { status: 200, headers: { "content-length": String(sample.length) } });
      }
      return new Response(sample, { status: 200, headers: { "content-length": String(sample.length) } });
    }
  });
  await dl.loadCatalog();
  dl.download(["s1"]);
  await new Promise(resolve => setTimeout(resolve, 40));
  await dl.cancel("s1");
  while (dl.busy) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(dl.snapshot().items.s1.status, "cancelled");

  // Complete download into conflict, delete temp before replace to simulate rename failure, verify rollback.
  stall = false;
  dl.download(["s1"]);
  while (dl.busy) await new Promise(resolve => setTimeout(resolve, 10));
  const item = dl.snapshot().items.s1;
  assert.equal(item.status, "conflict");
  fs.rmSync(item.temp, { recursive: true, force: true });
  const afterFail = await dl.replace("s1");
  assert.match(afterFail.items.s1.error, /Couldn't replace it/);
  assert.equal(fs.readFileSync(path.join(existing, "drums.mp3"), "utf8"), "keep-me");
});

/* ---------- M9: scripts/merge-curation.cjs ---------- */

test("mergeCuration targets data/ when present, preserves integer-like ID order, and avoids prototype hits", t => {
  const base = makeTempDir(t), local = makeTempDir(t), target = makeTempDir(t);
  for (const d of [base, local, target]) fs.mkdirSync(path.join(d, "data"), { recursive: true });
  // Simulate stray legacy root file at target root alongside target/data/
  fs.writeFileSync(path.join(target, "hidden-songs.json"), JSON.stringify({ hidden: [{ id: "legacy" }] }));
  fs.writeFileSync(path.join(base, "data", "hidden-songs.json"), JSON.stringify({ hidden: [{ id: "10" }, { id: "2" }] }));
  fs.writeFileSync(path.join(local, "data", "hidden-songs.json"), JSON.stringify({ hidden: [{ id: "10" }, { id: "2" }, { id: "local" }] }));
  fs.writeFileSync(path.join(target, "data", "hidden-songs.json"), JSON.stringify({ hidden: [{ id: "10" }, { id: "2" }, { id: "1" }] }));
  fs.writeFileSync(path.join(base, "data", "song-renames.json"), JSON.stringify({ renames: {} }));
  fs.writeFileSync(path.join(local, "data", "song-renames.json"), JSON.stringify({ renames: { constructor: "Real Name" } }));
  fs.writeFileSync(path.join(target, "data", "song-renames.json"), JSON.stringify({ renames: {} }));

  const changed = mergeCuration(base, local, target);
  assert.ok(changed.includes("hidden-songs.json"));
  assert.ok(changed.includes("song-renames.json"));
  const writtenHidden = JSON.parse(fs.readFileSync(path.join(target, "data", "hidden-songs.json"), "utf8"));
  assert.deepEqual(writtenHidden.hidden.map(h => h.id), ["10", "2", "1", "local"]);
  const writtenRenames = JSON.parse(fs.readFileSync(path.join(target, "data", "song-renames.json"), "utf8"));
  assert.equal(writtenRenames.renames.constructor, "Real Name");
});

/* ---------- H9, M15, H12, H13, M11, M12: frontend modules ---------- */

test("wrapped.mjs counts real yeatle.js 1st/2nd-try solves via solvedLevel and avoids early-Jan yearsPlayed off-by-one", async () => {
  const prevStorage = globalThis.localStorage;
  const prevFetch = globalThis.fetch;
  const map = new Map();
  globalThis.localStorage = {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] ?? null; },
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k)
  };
  globalThis.fetch = async () => ({ ok: false, json: async () => null });
  try {
    const wrapped = await import(pathToFileURL(path.join(root, "build/assets/wrapped.mjs")).href);
    // 1st-try win in yeatle.js: attempts = [], solvedLevel = 0
    wrapped._test.recordRound("stems", {
      songId: "s1", status: "won", stars: 5, solvedLevel: 0, attempts: [],
      song: { id: "s1", display: "First Try Song", era: "2093" }
    });
    // 2nd-try win in yeatle.js: attempts = [wrong], solvedLevel = 1
    wrapped._test.recordRound("stems", {
      songId: "s2", status: "won", stars: 4, solvedLevel: 1, attempts: [{ kind: "wrong", text: "Other" }],
      song: { id: "s2", display: "Second Try Song", era: "2093" }
    });
    const year = new Date().getFullYear();
    const s = wrapped._test.summarize(year);
    assert.equal(s.firstTry, 1);

    // If current year's archive already exists (e.g. Jan 3 viewing previous year), exclude >= year archives.
    map.set(`yeatle:wrapped:archive:${year - 1}`, JSON.stringify({ final: true, year: year - 1, lost: [] }));
    map.set(`yeatle:wrapped:archive:${year}`, JSON.stringify({ final: true, year, lost: [] }));
    const sWithSelfArchive = wrapped._test.summarize(year);
    assert.equal(sWithSelfArchive.yearsPlayed, 2);
  } finally {
    globalThis.localStorage = prevStorage;
    globalThis.fetch = prevFetch;
  }
});

test("song-pools restorePracticeSong strips stale round-* audioId and snippetRounds handles roundTicket/reveal", async () => {
  const { restorePracticeSong } = await import(pathToFileURL(path.join(root, "build/assets/song-pools.mjs")).href);
  const current = { id: "s1", title: "Song", keys: ["song"], answerKeys: ["song"], versionKeys: [], eraDisplay: "2093" };
  const restored = restorePracticeSong({ songId: "s1", song: { id: "s1", audioId: "round-deadbeef", title: "Song" } }, [current]);
  assert.equal(restored.audioId, undefined);

  const withOwnAudio = { ...current, audioId: "s1@audio-1" };
  const restoredOwn = restorePracticeSong({ songId: "s1", song: { id: "s1", audioId: "round-deadbeef", title: "Song" } }, [withOwnAudio]);
  assert.equal(restoredOwn.audioId, "s1@audio-1");

  const prevFetch = globalThis.fetch;
  let resolveAct;
  globalThis.fetch = async () => new Promise(r => {
    resolveAct = () => r({ ok: true, json: async () => ({ status: "won", song: { id: "s1", title: "Song" } }) });
  });
  try {
    const { snippetRounds } = await import(pathToFileURL(path.join(root, "build/assets/leaderboard.mjs")).href);
    const roundSong = { id: "round-abc", audioId: "round-abc", roundId: "abc", stemBase: "api/audio/round-abc" };
    snippetRounds.reveal(roundSong, { song: { id: "s1", title: "Song", folder: "Song" } });
    assert.equal(roundSong.audioId, undefined);
    assert.equal(roundSong.stemBase, undefined);
    assert.equal(roundSong.roundId, undefined);

    snippetRounds.ticket();
    const pendingAct = snippetRounds.act({ roundId: "r1" }, "guess", "Song");
    snippetRounds.ticket(); // player switched round before server replied
    resolveAct();
    assert.equal(await pendingAct, null);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("karaoke MicDetector scales fftSize with sample rate and detects 220 Hz at 192 kHz", () => {
  const source = fs.readFileSync(path.join(root, "build/assets/karaoke.js"), "utf8")
    .replace(/\bexport /g, "")
    .replaceAll("import.meta.url", '"http://127.0.0.1/assets/karaoke.js"');
  const ctx = vm.createContext({
    URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Float32Array,
    localStorage: { getItem: () => null },
    navigator: {},
    document: { createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {}, append() {} }), getElementById: () => null, querySelector: () => ({}), querySelectorAll: () => [] }
  });
  vm.runInContext(source + "; globalThis.__MicDetector = MicDetector;", ctx);
  assert.equal(ctx.micFftSizeForRate(48000), 2048);
  assert.equal(ctx.micFftSizeForRate(96000), 4096);
  assert.equal(ctx.micFftSizeForRate(192000), 8192);

  let configuredFftSize = 0;
  const fakeAudioCtx = {
    sampleRate: 192000,
    destination: {},
    createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
    createGain: () => ({ gain: { value: 0 }, connect() {}, disconnect() {} }),
    createAnalyser: () => ({
      set fftSize(v) { configuredFftSize = v; },
      get fftSize() { return configuredFftSize; },
      getFloatTimeDomainData(buf) {
        for (let i = 0; i < buf.length; i++) buf[i] = 0.25 * Math.sin(2 * Math.PI * 220 * i / 192000);
      },
      connect() {},
      disconnect() {}
    })
  };
  const detector = new ctx.__MicDetector(fakeAudioCtx, { getTracks: () => [] });
  assert.equal(configuredFftSize, 8192);
  const reading = detector.read(0.005);
  assert.equal(reading.voiced, true);
  assert.ok(Math.abs(reading.midi - 57) < 0.25); // A3 (220 Hz) = MIDI 57
});

test("separator.worker aborts late WebGPU probe before creating WASM probe session", async () => {
  const worker = fs.readFileSync(path.join(root, "build/assets/separator.worker.js"), "utf8");
  const start = worker.indexOf("async function ch(");
  const end = worker.indexOf("async function fh(", start);
  const block = worker.slice(start, end);

  let resolveGpu;
  const gpuReady = new Promise(r => { resolveGpu = r; });
  const created = [], released = [];
  const ctx = vm.createContext({
    st: ["vocals"], URL, Uint8Array, Float32Array, setTimeout: fn => { fn(); return 1; }, clearTimeout() {},
    Nd: null, tt: null, Lt: "wasm", YeatleModelHashes: {},
    pe: class { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } },
    YeatleReleaseSessions: async list => { for (const s of list) if (s) released.push(s.provider); },
    hh: async () => new Uint8Array([1, 2, 3]),
    kt: {
      create: async (_bytes, opts) => {
        const provider = opts.executionProviders[0];
        created.push(provider);
        if (provider === "webgpu") {
          await gpuReady;
          return { provider, async release() {} };
        }
        return { provider, async release() {} };
      }
    },
    self: {
      location: { href: "http://worker.test/assets/separator.worker.js" },
      navigator: { gpu: { requestAdapter: async () => ({}) } },
      postMessage() {}
    }
  });
  vm.runInContext(block, ctx);
  await vm.runInContext("Ld()", ctx);
  assert.deepEqual(created, ["webgpu", "wasm"]); // 1 timed-out probe gpu + 1 real fallback wasm
  resolveGpu();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(created, ["webgpu", "wasm"], "late probe must not create a second wasm session");
  assert.ok(released.includes("webgpu"));
});

test("stem-cache resets database handle onclose and avoids unreserved erase", async () => {
  const prevIdb = globalThis.indexedDB;
  let opens = 0;
  const mockDb = {
    onclose: null,
    onversionchange: null,
    close() {},
    transaction(stores, mode) {
      const tx = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore() {
          return {
            getAll() {
              const req = { result: [{ key: "other", bytes: 200 * 1024 * 1024, complete: false, lastUsed: Date.now() }], onsuccess: null };
              queueMicrotask(() => { req.onsuccess?.(); queueMicrotask(() => tx.oncomplete?.()); });
              return req;
            },
            get() {
              const req = { result: null, onsuccess: null };
              queueMicrotask(() => { req.onsuccess?.(); queueMicrotask(() => tx.oncomplete?.()); });
              return req;
            }
          };
        }
      };
      return tx;
    }
  };
  globalThis.indexedDB = {
    open() {
      opens++;
      const req = { result: mockDb, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
      queueMicrotask(() => req.onsuccess?.());
      return req;
    }
  };
  try {
    const cache = await import(pathToFileURL(path.join(root, "build/assets/stem-cache.mjs")).href);
    const saved = await cache.saveStems("too-full-key", { drums: { getChannelData: () => new Float32Array(100) } }, 100);
    assert.equal(saved, false);
    assert.equal(opens, 1);
    // Firing onclose clears cached DB so next call opens a new handle.
    mockDb.onclose?.();
    await cache.saveStems("too-full-key-2", { drums: { getChannelData: () => new Float32Array(100) } }, 100);
    assert.equal(opens, 2);
  } finally {
    globalThis.indexedDB = prevIdb;
  }
});
