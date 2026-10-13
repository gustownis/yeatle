const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const { staticCacheHeaders, isNotModified, rangeAllowed } = require("../static-cache.cjs");
const performanceModule = import(pathToFileURL(path.join(__dirname, "../build/assets/performance.mjs")).href);

test("static files revalidate without downloading unchanged bytes, and updates invalidate validators", () => {
  const stat = { size: 22000000, mtimeMs: 1700000000123 };
  const headers = staticCacheHeaders("runtime.wasm", stat, "1.9.3");
  assert.equal(headers["Cache-Control"], "no-cache");
  assert.equal(isNotModified({ "if-none-match": headers.ETag }, headers.ETag, stat.mtimeMs), true);
  assert.equal(isNotModified({ "if-none-match": `"other", ${headers.ETag}` }, headers.ETag, stat.mtimeMs), true);
  assert.equal(isNotModified({ "if-none-match": "*" }, headers.ETag, stat.mtimeMs), true);
  for (const next of [staticCacheHeaders("runtime.wasm", stat, "1.9.4"), staticCacheHeaders("runtime.wasm", { ...stat, mtimeMs: stat.mtimeMs + 1 }, "1.9.3"), staticCacheHeaders("runtime.wasm", { ...stat, size: stat.size + 1 }, "1.9.3")]) {
    assert.equal(isNotModified({ "if-none-match": headers.ETag }, next.ETag, stat.mtimeMs), false);
  }
  assert.equal(isNotModified({ "if-modified-since": headers["Last-Modified"] }, headers.ETag, stat.mtimeMs), true);
  assert.equal(isNotModified({ "if-none-match": '"stale"', "if-modified-since": headers["Last-Modified"] }, headers.ETag, stat.mtimeMs), false);
  assert.equal(rangeAllowed({ "if-range": headers.ETag }, stat.mtimeMs), false);
  assert.equal(rangeAllowed({ "if-range": headers["Last-Modified"] }, stat.mtimeMs), true);
  assert.equal(rangeAllowed({ "if-range": "invalid" }, stat.mtimeMs), false);
});

test("phones, iPad desktop mode, and low-memory devices use the constrained policy", async () => {
  const { performancePolicy } = await performanceModule;
  for (const device of [{ userAgent: "iPhone" }, { userAgent: "Android" }, { userAgentData: { mobile: true } }, { userAgent: "Macintosh", maxTouchPoints: 5 }, { userAgent: "Desktop", deviceMemory: 4 }]) {
    const policy = performancePolicy(device);
    assert.equal(policy.constrained, true);
    assert.equal(policy.maxJobs, 1);
    assert.equal(policy.waveformFps, 30);
  }
  assert.equal(performancePolicy({ userAgent: "Desktop", deviceMemory: 8 }).constrained, false);
  assert.equal(performancePolicy({ userAgent: "Desktop" }).maxJobs, 2);
});

test("shortcut hints identify phones and tablets without treating narrow or touch desktops as mobile", async () => {
  const { isMobileDevice, performancePolicy } = await performanceModule;
  for (const device of [{userAgent:"Android"}, {userAgent:"iPhone"}, {userAgent:"iPad"}, {userAgent:"Macintosh",maxTouchPoints:5}, {userAgent:"Silk"}]) {
    assert.equal(isMobileDevice(device),true);
    assert.equal(performancePolicy(device).mobile,true);
  }
  for (const device of [{userAgent:"Windows NT",maxTouchPoints:10,width:320}, {userAgent:"Linux x86_64",maxTouchPoints:5}, {userAgent:"Macintosh",maxTouchPoints:0}, {userAgent:"Windows NT",deviceMemory:4}]) {
    assert.equal(isMobileDevice(device),false);
    assert.equal(performancePolicy(device).mobile,false);
  }
});

test("memory limits evict only idle songs, protecting active audio and a newly requested round", async () => {
  const { trimAudioCache, performancePolicy, audioBytes } = await performanceModule;
  const makeJob = (total, active, lastUsed) => ({ total, listeners: new Set(active ? [() => {}] : []), lastUsed, cancel() { this.cancelled = true; } });
  const current = makeJob(180 * 44100, true, 1), idle = makeJob(180 * 44100, false, 2);
  const phone = performancePolicy({ userAgent: "iPhone" });
  const jobs = new Map([["current", current], ["idle", idle]]);
  assert.equal(audioBytes(current), 158760000);
  assert.deepEqual(trimAudioCache(jobs, null, phone), ["idle"]);
  assert.equal(jobs.get("current"), current);
  assert.equal(current.cancelled, undefined);
  assert.equal(idle.cancelled, true);
  // A new round is protected until its listener attaches, even during cleanup.
  const next = makeJob(180 * 44100, false, 3);
  jobs.set("next", next);
  assert.deepEqual(trimAudioCache(jobs, "next", phone), []);
  current.listeners.clear();
  assert.deepEqual(trimAudioCache(jobs, "next", phone), ["current"]);
  assert.equal(jobs.get("next"), next);
});

test("desktop audio budget evicts an oversized background job and retains normal preloading", async () => {
  const { trimAudioCache, performancePolicy, audioBytes } = await performanceModule;
  const desktop = performancePolicy({ userAgent: "Desktop", deviceMemory: 8 });
  const current = { total: 180 * 44100, listeners: new Set([() => {}]), lastUsed: 1, cancel() { throw new Error("Active song must remain"); } };
  const next = { total: 180 * 44100, listeners: new Set(), lastUsed: 2, cancel() { this.cancelled = true; } };
  const jobs = new Map([["current", current], ["next", next]]);
  assert.deepEqual(trimAudioCache(jobs, null, desktop), []);
  next.total = 600 * 44100;
  assert.deepEqual(trimAudioCache(jobs, null, desktop), ["next"]);
  assert.equal(current.cancelled, undefined);
  assert.equal(audioBytes({ buffers: { mix: { length: 100, numberOfChannels: 2 }, drums: { length: 100, numberOfChannels: 1 } } }), 1200);
});

test("waveform gate draws about 30 frames per second on phones and skips hidden tabs", async () => {
  const { createWaveformGate, performancePolicy } = await performanceModule;
  const gate = createWaveformGate(performancePolicy({ userAgent: "iPhone" }));
  let draws = 0;
  for (let i = 0; i < 120; i++) if (gate(i * 1000 / 120)) draws++;
  assert.equal(draws, 30);
  assert.equal(gate(2000, false), false);
  assert.equal(gate(2000, true), true);
  const desktop = createWaveformGate(performancePolicy({ userAgent: "Desktop" }));
  for (let i = 0; i < 120; i++) assert.equal(desktop(i * 1000 / 120), true);
  // A slightly early RAF must not cause an extra draw on the next frame.
  const jitter = createWaveformGate(performancePolicy({ userAgent: "iPhone" }));
  assert.equal(jitter(0), true);
  assert.equal(jitter(32.9), true);
  assert.equal(jitter(33.4), false);
});

function splitClass(context) {
  const source = fs.readFileSync(path.join(__dirname, "../build/assets/yeatle.js"), "utf8");
  const first = source.indexOf("class xm{"), last = source.indexOf("function Em(", first);
  return vm.runInNewContext(source.slice(first, last) + ";xm", { YeatleCacheInputs: async () => {}, YeatleScheduleWorkerIdle() {}, ...context });
}

test("oversized background audio is rejected before allocating its original/stem buffers", async () => {
  const { trimAudioCache, performancePolicy } = await performanceModule;
  const jobs = new Map();
  let allocations = 0;
  const Class = splitClass({ bt: 44100, fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }), OfflineAudioContext: class { async decodeAudioData() { return { length: 600 * 44100 }; } }, YeatleTrim: entries => trimAudioCache(entries, null, performancePolicy({ userAgent: "iPhone" })), yt: jobs, zt: null });
  const job = Object.assign(Object.create(Class.prototype), { song: { id: "background" }, buffers: null, total: 0, lastUsed: 1, listeners: new Set(), abortController: new AbortController(), ctx: { createBuffer() { allocations++; } } });
  jobs.set("background", job);
  await job.start();
  assert.equal(allocations, 0);
  assert.equal(job.cancelled, true);
  assert.equal(job.error, undefined);
  assert.equal(jobs.size, 0);
});

test("cancelled network loads do not allocate audio or trigger a playback fallback", async () => {
  const Class = splitClass({ fetch: async (_url, options) => { assert.ok(options.signal); throw new Error("aborted"); } });
  let failed = false;
  const job = Object.assign(Object.create(Class.prototype), { song: { id: "old" }, cancelled: true, abortController: new AbortController(), fail() { failed = true; } });
  await job.start();
  assert.equal(failed, false);
});

test("an active song can exceed the phone budget and still decode, allocate, and split normally", async () => {
  const { trimAudioCache, performancePolicy } = await performanceModule;
  const jobs = new Map();
  const channels = [new Float32Array([0.25, 0.5]), new Float32Array([0.75, 1])];
  const allocated = [], messages = [];
  const Class = splitClass({ bt: 44100, fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }), OfflineAudioContext: class { async decodeAudioData() { return { length: 180 * 44100, numberOfChannels: 2, getChannelData: i => channels[i] }; } }, YeatleTrim: entries => trimAudioCache(entries, null, performancePolicy({ userAgent: "iPhone" })), yt: jobs, gd: () => ({ postMessage: message => messages.push(message) }), zt: null });
  const job = Object.assign(Object.create(Class.prototype), { song: { id: "current" }, buffers: null, total: 0, lastUsed: 1, listeners: new Set([() => {}]), abortController: new AbortController(), ctx: { createBuffer(numberOfChannels, length) {
    const buffer = { numberOfChannels, length, copyToChannel() {} };
    allocated.push(buffer);
    return buffer;
  } } });
  jobs.set("current", job);
  await job.start();
  assert.equal(job.cancelled, undefined);
  assert.equal(jobs.get("current"), job);
  assert.equal(allocated.length, 4);
  assert.equal(job.buffers.mix.numberOfChannels, 2);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "split");
  assert.deepEqual([...messages[0].left], [...channels[0]]);
});

test("phone preloading is disabled while desktop preloading keeps the same path", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../build/assets/yeatle.js"), "utf8");
  const first = source.indexOf("function jm("), last = source.indexOf("let Ss=", first);
  for (const constrained of [true, false]) {
    let requested = 0;
    const preload = vm.runInNewContext(source.slice(first, last) + ";jm", { YeatlePerf: { constrained }, gu: () => true, yd: () => ({}), vd: () => { requested++; } });
    preload({ mode: "filter" });
    assert.equal(requested, constrained ? 0 : 1);
  }
});

test("admin-song checks pause while hidden, resume immediately, and never overlap", async () => {
  const { startVisiblePolling } = await performanceModule;
  const timers = new Map(), handlers = new Set();
  let nextTimer = 0, calls = 0, finish;
  const document = { hidden: true, addEventListener(_name, handler) { handlers.add(handler); }, removeEventListener(_name, handler) { handlers.delete(handler); } };
  const stop = startVisiblePolling(() => { calls++; return new Promise(resolve => { finish = resolve; }); }, {
    document, setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); }
  });
  const visibility = () => handlers.forEach(handler => handler());
  assert.equal(calls, 0);
  document.hidden = false; visibility();
  assert.equal(calls, 1);
  document.hidden = true; visibility();
  document.hidden = false; visibility();
  assert.equal(calls, 1);
  finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(timers.size, 1);
  document.hidden = true; visibility();
  assert.equal(timers.size, 0);
  document.hidden = false; visibility();
  assert.equal(calls, 2);
  stop(); finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(timers.size, 0);
  assert.equal(handlers.size, 0);
});
