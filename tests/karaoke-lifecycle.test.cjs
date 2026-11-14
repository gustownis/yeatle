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
    if (!nodes.has(id)) nodes.set(id, { id: id.slice(1), hidden: false, replaceChildren() {}, style: { setProperty() {} }, classList: { toggle() {}, remove() {}, add() {} } });
    return nodes.get(id);
  };
  const context = vm.createContext({
    URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Float32Array,
    localStorage: { getItem() { return null; } },
    navigator: {}, document: { createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {}, append() {} }), getElementById: () => null, querySelector: node, querySelectorAll: () => [node("#setup"), node("#loading")] },
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
  assert.equal(check(null, "media", "about:blank", { mediaType: "audio", requestingUrl: "about:blank", securityOrigin: origin + "/" }), true);
  assert.equal(check(null, "media", "about:blank", { mediaType: "audio", requestingUrl: "about:blank", securityOrigin: "https://example.org" }), false);
  for (const mediaType of ["video", "unknown", undefined]) assert.equal(check(null, "media", origin, { mediaType }), false);
  for (const url of ["https://example.org", "http://127.0.0.1:3093", "invalid"]) assert.equal(check(null, "media", url, { mediaType: "audio" }), false);
  const ask = (permission, details) => { let allowed; request(null, permission, value => { allowed = value; }, details); return allowed; };
  assert.equal(ask("media", { mediaTypes: ["audio"], requestingUrl: origin + "/karaoke.html" }), true);
  assert.equal(ask("media", { mediaTypes: ["audio"], requestingUrl: "about:blank", securityOrigin: origin + "/" }), true);
  assert.equal(ask("media", { mediaTypes: ["audio"], requestingUrl: "about:blank", securityOrigin: "https://example.org" }), false);
  assert.equal(ask("media", { mediaTypes: ["audio"], requestingUrl: "about:blank" }), false);
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

function playbackHarness() {
  const starts = [], beeps = [], stopped = [], disconnected = [];
  const source = kind => ({
    connect() {}, start(when, offset) { starts.push({ kind, when, offset }); },
    stop() { stopped.push(this); }, disconnect() { disconnected.push(this); }
  });
  const ctx = { currentTime: 10, state: "running", createBufferSource: () => source("buffer"),
    suspend() { this.state = "suspended"; }, resume() { this.state = "running"; } };
  const h = harness({ cancelAnimationFrame() {} });
  h.context.ctx = ctx;
  h.context.testBeep = (_ctx, when) => { beeps.push(when); return source("beep"); };
  h.run('audioContext = ctx; settings.audioDelay = 0; beep = testBeep; game = { sources: [], audio: { inst: {}, guide: {} }, instGain: {disconnect() {}}, guideGain: {disconnect() {}} }');
  return { ...h, ctx, starts, beeps, stopped, disconnected };
}

test("karaoke schedules three count-in beeps before the music, with a negative playback clock", () => {
  const h = playbackHarness();
  h.run("playFrom(0, COUNT_IN)");
  assert.equal(h.starts.length, 2);
  assert.ok(h.starts.every(start => start.when === 13.08 && start.offset === 0));
  assert.deepEqual(h.beeps.map(t => Number(t.toFixed(2))), [10.08, 11.08, 12.08]);
  assert.ok(Math.abs(h.run("playbackTime()") + 3.08) < 1e-9);
});

test("seeking replaces scheduled sources and never adds another count-in", () => {
  const h = playbackHarness();
  h.run("playFrom(0, COUNT_IN); playFrom(42)");
  assert.equal(h.stopped.length, 5);
  assert.equal(h.disconnected.length, 5);
  assert.equal(new Set(h.stopped).size, 5);
  assert.equal(h.beeps.length, 3);
  assert.ok(h.starts.slice(2).every(start => start.offset === 42 && Math.abs(start.when - 10.08) < 1e-9));
});

test("quitting during the count-in stops music and every pending beep once", () => {
  const h = playbackHarness();
  h.run('playFrom(0, COUNT_IN); endGame(); endGame()');
  assert.equal(h.stopped.length, 5);
  assert.equal(h.disconnected.length, 5);
  assert.equal(h.run("game.sources.length"), 0);
  assert.equal(h.node("#countdown").textContent, "");
});

test("pausing the count-in suspends its clock without scheduling duplicate sources", () => {
  const h = playbackHarness();
  h.run("playFrom(0, COUNT_IN); setPaused(true); setPaused(true)");
  assert.equal(h.ctx.state, "suspended");
  assert.equal(h.node("#pause").hidden, false);
  h.run("setPaused(false)");
  assert.equal(h.ctx.state, "running");
  assert.equal(h.node("#pause").hidden, true);
  assert.equal(h.starts.length, 2);
  assert.equal(h.beeps.length, 3);
});

test("countdown labels follow negative time and clear after Go", () => {
  const h = playbackHarness();
  const labels = [-3.08, -2, -1, 0, 0.59, 0.6].map(time => {
    h.context.heard = time;
    h.run("updateCountdown(heard)");
    return h.node("#countdown").textContent;
  });
  assert.deepEqual(labels, ["3", "2", "1", "Go!", "Go!", ""]);
});

test("a paused skip is ignored and a resumed skip does not count in again", () => {
  const h = playbackHarness();
  h.run("game.skipTarget = 42; game.paused = true; skipAhead()");
  assert.equal(h.starts.length, 0);
  h.run("game.paused = false; skipAhead()");
  assert.equal(h.starts.length, 2);
  assert.equal(h.beeps.length, 0);
  assert.ok(h.starts.every(start => start.offset === 42));
});

test("blocked microphone access in the desktop app points to Microphone Settings instead of an address bar", async () => {
  let settingsOpened = 0;
  const h = harness({
    yeatleDesktop: true,
    yeatleOpenMicSettings() { settingsOpened++; },
    navigator: {
      mediaDevices: {
        getUserMedia: () => Promise.reject(Object.assign(new Error("Permission denied"), { name: "NotAllowedError" }))
      }
    }
  });
  h.context.ctx = { resume() {} };
  h.run("audioContext = ctx");
  const ok = await h.run("enableMics()");
  assert.equal(ok, false);
  assert.match(h.node("#mic-error").textContent, /Microphone settings/);
  assert.doesNotMatch(h.node("#mic-error").textContent, /address bar/);
  assert.equal(h.node("#mic-settings").hidden, false);
  h.run("openMicSettings()");
  assert.equal(settingsOpened, 1);
});
test("an overconstrained mic request falls back to default audio instead of erroring", async () => {
  const node = () => ({ gain: {}, connect() {}, disconnect() {} });
  const attempts = [];
  const fakeStream = { getAudioTracks: () => [{ label: "Default mic", getSettings: () => ({ deviceId: "default" }), stop() {} }], getTracks: () => [{ stop() {} }] };
  const h = harness({
    navigator: {
      mediaDevices: {
        enumerateDevices: () => Promise.resolve([{ kind: "audioinput", deviceId: "default", label: "Default mic" }]),
        getUserMedia: constraints => {
          attempts.push(constraints);
          if (constraints.audio?.channelCount === 1 || constraints.audio?.deviceId?.exact === "old-mic") {
            const err = new Error("Constraints not satisfied");
            err.name = "OverconstrainedError";
            return Promise.reject(err);
          }
          return Promise.resolve(fakeStream);
        }
      }
    }
  });
  h.context.ctx = { createMediaStreamSource: node, createAnalyser: node, createGain: node, sampleRate: 44100 };
  h.run('settings.players[0].deviceId = "old-mic"; mics.allowed = true; audioContext = ctx');
  await h.run("openMic(0)");
  assert.equal(h.run("mics.error"), "");
  assert.equal(h.run("settings.players[0].deviceId"), "");
  assert.ok(h.run("mics.detectors[0]"));
  assert.ok(attempts.length >= 2);
});

test("closing delay calibration early stops and disconnects every scheduled beep", async () => {
  const scheduled = [], manualStops = [], disconnects = [], rafs = [];
  const listeners = new Map();
  const bodyChildren = [];
  const makeNode = tagName => {
    const node = {
      tagName,
      className: "",
      textContent: "",
      hidden: false,
      style: {},
      children: [],
      attributes: {},
      classList: { toggle() {}, remove() {}, add() {} },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(type, fn) { (this._events ||= {})[type] = fn; },
      append(...kids) {
        for (const kid of kids) {
          kid.parent = this;
          this.children.push(kid);
        }
      },
      remove() {
        this.removed = true;
        const idx = bodyChildren.indexOf(this);
        if (idx >= 0) bodyChildren.splice(idx, 1);
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = list => {
          for (const child of list) {
            if (child.tagName === sel) out.push(child);
            if (child.children.length) walk(child.children);
          }
        };
        walk(this.children);
        return out;
      }
    };
    return node;
  };
  const findText = (node, text) => {
    if (node.textContent === text) return node;
    for (const child of node.children) {
      const hit = findText(child, text);
      if (hit) return hit;
    }
    return null;
  };
  const doc = {
    body: {
      children: bodyChildren,
      append(...kids) { for (const kid of kids) bodyChildren.push(kid); }
    },
    createElement: makeNode,
    getElementById: () => null,
    querySelector: () => makeNode("div"),
    querySelectorAll: () => [],
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    }
  };
  const ctx = {
    currentTime: 10,
    destination: {},
    outputLatency: 0,
    resume: async () => {},
    createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
    createOscillator() {
      const osc = {
        frequency: { value: 0 },
        connect() {},
        start(when) { scheduled.push({ osc, when }); },
        stop(when) { if (when === undefined) manualStops.push(osc); },
        disconnect() { disconnects.push(osc); }
      };
      return osc;
    }
  };
  const h = harness({
    document: doc,
    requestAnimationFrame(fn) { rafs.push(fn); return rafs.length; }
  });
  h.context.ctx = ctx;
  h.run('audioContext = ctx; openCalibration("tap")');
  assert.equal(bodyChildren.length, 1);

  const modal = bodyChildren[0];
  const startBtn = findText(modal, "Start");
  const closeBtn = findText(modal, "Close");
  await startBtn.onclick();
  assert.equal(scheduled.length, 12);
  assert.equal(manualStops.length, 0);
  assert.equal(disconnects.length, 0);
  assert.equal(rafs.length, 1);

  closeBtn.onclick();
  closeBtn.onclick();
  assert.equal(manualStops.length, 12);
  assert.equal(disconnects.length, 12);
  assert.equal(new Set(manualStops).size, 12);
  assert.equal(new Set(disconnects).size, 12);
  assert.equal(modal.removed, true);
  assert.equal(bodyChildren.length, 0);
  assert.equal(listeners.get("keydown")?.size ?? 0, 0);

  // An already-queued animation frame sees run.stop and does not reschedule.
  rafs[0]();
  assert.equal(rafs.length, 1);

  // Closing via Escape also stops and disconnects every scheduled beep.
  h.run('openCalibration("tap")');
  await findText(bodyChildren[0], "Start").onclick();
  assert.equal(scheduled.length, 24);
  const [onKey] = [...listeners.get("keydown")];
  onKey({ key: "Escape" });
  assert.equal(manualStops.length, 24);
  assert.equal(disconnects.length, 24);
  assert.equal(listeners.get("keydown")?.size ?? 0, 0);
  assert.equal(bodyChildren.length, 0);
});

