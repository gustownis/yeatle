const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Exercise the shipped game's playback methods directly. The original React
// sources were not supplied, so these tests load the methods from its bundle.
const bundle = fs.readFileSync(path.join(__dirname, "../build/assets/yeatle.js"), "utf8");
function method(start, next) {
  const first = bundle.indexOf(start), last = bundle.indexOf(next, first + start.length);
  assert.ok(first >= 0 && last > first, `Playback method missing: ${start}`);
  return bundle.slice(first, last);
}
const prototype = vm.runInNewContext(`({${[
  method("prepareClip(customTime,token){", "tickStemSync(){"),
  method("tickStemSync(){", "async resyncStems(t){"),
  method("async resyncStems(t){", "async playSnippet(t){"),
  method("onJob(t){", "position(){"),
  method("position(){", "startSources(t){"),
  method("startSources(t){", "stopSources(){"),
  method("stopSources(){", "useFiltersInstead(reason){"),
  method("setLevel(t){", "goFull(){"),
  method("goFull(){", "async play(t){")
].join(",")}})`, { console, setInterval, clearInterval, Date });

function player() {
  const created = [], stopped = [];
  const original = { label: "original decoded song" };
  const p = Object.assign(Object.create(prototype), {
    mode: "split", level: 3, playing: true, wantPlay: false,
    destroyed: false, snippet: false, readySent: true,
    offset: 2, startedAt: 9, loopEnd: 8,
    job: { duration: 120, readySeconds: 8, readySamples: 8 * 44100, progress: 0.1, complete: false, buffers: { drums: {}, bass: {}, other: {}, mix: original } },
    inputs: { drums: {}, bass: {}, other: {}, mix: {} },
    sources: Array.from({ length: 4 }, (_, i) => ({ stop: time => stopped.push({ i, time }) })),
    ctx: { currentTime: 10, createBufferSource() {
      const source = { connect(node) { this.destination = node; }, start(time, offset) { this.startTime = time; this.startOffset = offset; }, stop(time) { stopped.push({ source: this, time }); } };
      created.push(source);
      return source;
    } },
    applyLevel() {}, onProgress() {}, onReady() {},
    useFiltersInstead() { throw new Error("Unexpected filter fallback"); }
  });
  return { p, created, stopped, original };
}

test("last AI-split level uses one original-song source and stops the old split sources", () => {
  const { p, created, stopped, original } = player();
  p.setLevel(4);
  assert.equal(p.fullOnly, true);
  assert.equal(p.loopEnd, 120);
  assert.equal(created.length, 1);
  assert.equal(created[0].buffer, original);
  assert.equal(created[0].destination, p.inputs.mix);
  assert.equal(created[0].startOffset, 3);
  assert.equal(created[0].loopEnd, 120);
  assert.equal(stopped.length, 4);
  assert.ok(stopped.every(source => source.time === created[0].startTime));
});

test("new split chunks and completion do not restart the final-level original song", () => {
  const { p, created, stopped } = player();
  p.setLevel(4);
  const playingSource = p.sources[0];
  for (const readySeconds of [16, 32, 64, 120]) {
    p.job.readySeconds = readySeconds;
    p.job.complete = readySeconds === 120;
    p.onJob(p.job);
    assert.equal(p.sources[0], playingSource);
    assert.equal(created.length, 1);
    assert.equal(stopped.length, 4);
    assert.equal(p.loopEnd, 120);
  }
});

test("earlier split levels keep the four-source preview and hand-made stems remain unchanged", () => {
  const { p, created } = player();
  p.job.readySeconds = 16;
  p.onJob(p.job);
  assert.equal(created.length, 4);
  assert.equal(p.loopEnd, 16);
  assert.equal(p.fullOnly, undefined);
  const local = player();
  local.p.mode = "stems";
  const sources = local.p.sources;
  local.p.setLevel(4);
  assert.equal(local.p.sources, sources);
  assert.equal(local.created.length, 0);
  assert.equal(local.p.fullOnly, undefined);
});

test("multi-stem playback waits for all stems to buffer on seek and phase-locks drift", async () => {
  const makeStem = (name, readyState = 4) => ({
    name,
    currentTime: 0,
    duration: 188,
    readyState,
    seeking: false,
    playbackRate: 1,
    paused: false,
    pause() { this.paused = true; },
    play() { this.paused = false; return Promise.resolve(); }
  });
  const drums = makeStem("drums", 2);
  const bass = makeStem("bass", 4);
  const other = makeStem("other", 4);
  const vocals = makeStem("vocals", 4);
  drums.seeking = true;

  const p = Object.assign(Object.create(prototype), {
    mode: "stems",
    playing: true,
    destroyed: false,
    syncToken: 0,
    syncing: false,
    lead: drums,
    elements: [drums, bass, other, vocals],
    onError() {}
  });

  const syncPromise = p.resyncStems(126);
  assert.equal(p.syncing, true);
  assert.ok(p.elements.every(el => el.paused), "all stems pause while waiting for drums to finish seeking");

  setTimeout(() => {
    drums.seeking = false;
    drums.readyState = 4;
  }, 40);
  await syncPromise;

  assert.equal(p.syncing, false);
  assert.ok(p.elements.every(el => !el.paused && Math.abs(el.currentTime - 126) < 0.05), "all stems resume together at 2:06");

  // Drift of 35ms (out of beat) is smoothly phase-locked via playbackRate
  drums.currentTime = 130.035;
  bass.currentTime = 130.000;
  other.currentTime = 130.035;
  vocals.currentTime = 130.035;
  p.tickStemSync();
  assert.ok(bass.playbackRate > 1.02 && bass.playbackRate <= 1.06);
  assert.equal(other.playbackRate, 1);

  // Once aligned within 8ms, playbackRate returns to 1
  bass.currentTime = 130.032;
  p.tickStemSync();
  assert.equal(bass.playbackRate, 1);
});
