const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { installMicrophonePermissions } = require("../desktop/permissions.cjs");

const source = fs.readFileSync(path.join(__dirname, "../build/assets/karaoke.js"), "utf8")
  .replace(/\bexport /g, "")
  .replaceAll("import.meta.url", '"http://127.0.0.1/assets/karaoke.js"');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(extra = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { id: id.slice(1), hidden: false, style: { setProperty() {} }, classList: { toggle() {}, remove() {} } });
    return nodes.get(id);
  };
  const context = vm.createContext({
    URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Float32Array,
    localStorage: { getItem() { return null; } },
    navigator: {}, document: { getElementById: () => null, querySelector: node, querySelectorAll: () => [node("#setup"), node("#loading")] },
    ...extra
  });
  vm.runInContext(source, context);
  return { run: code => vm.runInContext(code, context), node, context };
}

test("desktop permission checks and requests allow only same-origin microphone access", () => {
  let check, request;
  installMicrophonePermissions({ setPermissionCheckHandler(fn) { check = fn; }, setPermissionRequestHandler(fn) { request = fn; } }, "http://127.0.0.1:3094");
  const origin = "http://127.0.0.1:3094";
  assert.equal(check(null, "media", origin, { mediaType: "audio" }), true);
  for (const mediaType of ["video", "unknown", undefined]) assert.equal(check(null, "media", origin, { mediaType }), false);
  for (const url of ["https://example.org", "http://127.0.0.1:3093", "invalid"]) assert.equal(check(null, "media", url, { mediaType: "audio" }), false);
  const ask = (permission, details) => { let allowed; request(null, permission, value => { allowed = value; }, details); return allowed; };
  assert.equal(ask("media", { mediaTypes: ["audio"], requestingUrl: origin + "/karaoke.html" }), true);
  for (const types of [[], ["video"], ["audio", "video"], undefined]) assert.equal(ask("media", { mediaTypes: types, requestingUrl: origin }), false);
  assert.equal(ask("media", { mediaTypes: ["audio"], requestingUrl: "https://example.org" }), false);
  assert.equal(ask("media"), false);
  assert.equal(ask("notifications", { mediaTypes: ["audio"], requestingUrl: origin }), false);
});

test("a mic request that completes after a device change stops its stream", async () => {
  const pending = deferred();
  let stops = 0;
  const h = harness({ navigator: { mediaDevices: { getUserMedia: () => pending.promise } } });
  h.run("mics.allowed = true");
  const opening = h.run("openMic(0)");
  h.run('settings.players[0].deviceId = "none"');
  await h.run("openMic(0)");
  pending.resolve({ getTracks: () => [{ stop() { stops++; } }] });
  await opening;
  assert.equal(stops, 1);
  assert.equal(h.run("mics.detectors[0]"), undefined);
});

test("out-of-order mic requests keep the newest detector and stop the older stream", async () => {
  const older = deferred(), newer = deferred();
  let calls = 0, oldStops = 0, newStops = 0;
  const node = () => ({ gain: {}, connect() {}, disconnect() {} });
  const h = harness({ navigator: { mediaDevices: { getUserMedia: () => (++calls === 1 ? older : newer).promise } } });
  h.context.ctx = { createMediaStreamSource: node, createAnalyser: node, createGain: node, sampleRate: 44100 };
  h.run("mics.allowed = true; audioContext = ctx");
  const a = h.run("openMic(0)"), b = h.run("openMic(0)");
  const current = { getTracks: () => [{ stop() { newStops++; } }] };
  newer.resolve(current);
  await b;
  older.resolve({ getTracks: () => [{ stop() { oldStops++; } }] });
  await a;
  assert.equal(oldStops, 1);
  assert.equal(newStops, 0);
  assert.equal(h.run("mics.detectors[0].stream"), current);
});

test("lyrics lookups coalesce and abort stalled services within a total time limit", async () => {
  let timeout, cleared = 0, calls = 0, signal;
  const h = harness({
    setTimeout(fn, ms) { assert.equal(ms, 8000); timeout = fn; return 1; },
    clearTimeout() { cleared++; },
    fetch(_url, options) {
      calls++; signal = options.signal;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    }
  });
  h.run('state.song = { id: "song", title: "Song" }');
  const first = h.run("lookUpLyrics(state.song)"), second = h.run("lookUpLyrics(state.song)");
  assert.equal(calls, 1);
  timeout();
  assert.equal(signal.aborted, true);
  assert.equal((await first).lines.length, 0);
  await second;
  assert.equal(cleared, 1);
  assert.equal(h.run("state.lyricsPending.size"), 0);
});

test("saving lyrics during a lookup cannot be overwritten by its late response", async () => {
  const pending = deferred();
  const h = harness({ fetch: () => pending.promise });
  h.run('state.song = { id: "song", title: "Song" }');
  const first = h.run("lookUpLyrics(state.song)");
  h.run('invalidateLyrics(state.song); state.lyricsCache.set("song", { lines: [{ t: 1, text: "Mine" }], source: "your lyrics" })');
  pending.resolve({ ok: true, json: async () => [{ id: 1, artistName: "Yeat", trackName: "Song", syncedLyrics: "[00:01]Old online line" }] });
  assert.equal((await first).source, "your lyrics");
  assert.equal(h.run('state.lyricsCache.get("song").lines[0].text'), "Mine");
});

test("cancel during microphone permission prevents loading and duplicate Sing clicks", async () => {
  const mic = deferred();
  let loads = 0;
  const h = harness();
  h.context.permission = mic.promise;
  h.context.load = async () => { loads++; throw new Error("should not load"); };
  h.run('state.song = { id: "song", display: "Song", mode: "stems" }; audioContext = { resume: async () => {} }; enableMics = () => permission; loadStemSong = load');
  const first = h.run("startSong()");
  await Promise.resolve();
  await h.run("startSong()");
  h.run('state.job.cancel(); state.job = null; showScreen("setup")');
  mic.resolve(true);
  await first;
  assert.equal(loads, 0);
  assert.equal(h.node("#setup").hidden, false);
  assert.equal(h.run("state.job"), null);
});

test("a cancelled split never creates a worker", async () => {
  let workers = 0;
  const h = harness({ Worker: class { constructor() { workers++; } } });
  await assert.rejects(h.run("(() => { const job = makeJob(); job.cancel(); return runSplitter(null, null, null, job); })()"), /cancelled/);
  assert.equal(workers, 0);
});

test("finishing a karaoke round disconnects gains and releases sources exactly once", () => {
  let disconnects = 0, stops = 0, releases = 0;
  const h = harness({ cancelAnimationFrame() {} });
  h.context.gain = { disconnect() { disconnects++; } };
  h.context.src = { stop() { stops++; }, disconnect() { disconnects++; } };
  h.context.lock = { release() { releases++; } };
  h.run('audioContext = { state: "running" }; game = { sources: [src], instGain: gain, guideGain: gain, wakeLock: lock }; endGame(); endGame()');
  assert.equal(disconnects, 3);
  assert.equal(stops, 1);
  assert.equal(releases, 1);
});

test("a screen lock arriving after its round ends is released", async () => {
  const pending = deferred();
  let releases = 0;
  const h = harness({ navigator: { wakeLock: { request: () => pending.promise } }, requestAnimationFrame: () => 1 });
  h.context.ctx = { createGain: () => ({ connect() {} }) };
  h.run('audioContext = ctx; applyVolume = buildStage = resetRun = playFrom = resizeCanvas = () => {}; beginGame({id:"song"}, {}, {}, []); game.ended = true; game = null');
  pending.resolve({ release() { releases++; return Promise.resolve(); } });
  await pending.promise;
  await Promise.resolve();
  assert.equal(releases, 1);
});
