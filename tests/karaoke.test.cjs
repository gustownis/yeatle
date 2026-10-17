const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "build", "assets", "karaoke.js")).href);
const SR = 44100;

function tone(out, from, to, midi) {
  const freq = 440 * 2 ** ((midi - 69) / 12);
  let phase = 0;
  for (let i = Math.floor(from * SR); i < to * SR; i++) {
    const vibrato = 1 + 0.01 * Math.sin(2 * Math.PI * 5.5 * (i / SR));
    phase += (2 * Math.PI * freq * vibrato) / SR;
    out[i] = 0.3 * (Math.sin(phase) + 0.4 * Math.sin(2 * phase) + 0.2 * Math.sin(3 * phase));
  }
}

test("karaoke charts held notes and rapped parts from a vocal track", async () => {
  const { analyzeVocals, buildChart } = await load();
  const vocals = new Float32Array(10 * SR);
  tone(vocals, 0.5, 1.5, 60);
  tone(vocals, 1.6, 2.4, 64);
  tone(vocals, 4, 5, 55);
  tone(vocals, 8, 9, 69);
  let seed = 1;
  for (let i = 6 * SR; i < 7.5 * SR; i++) { seed = (seed * 16807) % 2147483647; vocals[i] = 0.2 * ((seed / 2147483647) * 2 - 1); }

  const chart = buildChart(await analyzeVocals(vocals, SR));
  const pitched = chart.notes.filter(n => n.kind === "pitch");
  assert.deepEqual(pitched.map(n => n.midi), [60, 64, 55, 69]);
  pitched.forEach((n, i) => assert.ok(Math.abs(n.start - [0.5, 1.6, 4, 8][i]) < 0.06, `note ${i} starts on time`));
  const talk = chart.notes.filter(n => n.kind === "talk");
  assert.equal(talk.length, 1);
  assert.ok(Math.abs(talk[0].start - 6) < 0.06 && Math.abs(talk[0].end - 7.5) < 0.06);
  assert.equal(chart.phrases.length, 3);
});

test("karaoke scoring ignores which octave you sing in", async () => {
  const { chromaDistance } = await load();
  assert.equal(chromaDistance(48, 60), 0);
  assert.equal(chromaDistance(61, 48), 1);
  assert.equal(chromaDistance(54, 60), 6);
});

test("karaoke vocal analysis honours cancellation before allocation and after yielding", async () => {
  const { analyzeVocals } = await load();
  await assert.rejects(analyzeVocals(null, SR, () => {}, () => true), /cancelled/);
  let cancelled = false;
  const progress = [];
  await assert.rejects(analyzeVocals(new Float32Array(SR * 10), SR, value => { progress.push(value); cancelled = true; }, () => cancelled), /cancelled/);
  assert.deepEqual(progress, [0]);
});

test("karaoke reads synced and word-timed LRC lyrics", async () => {
  const { parseLrc } = await load();
  const lines = parseLrc("[ti:Test]\n[offset:+200]\n[00:01.00]hello world\n[00:03.50]<00:03.50>word <00:03.90>two\n[00:05.00]");
  assert.deepEqual(lines.map(l => [Number(l.t.toFixed(2)), l.text]), [[0.8, "hello world"], [3.3, "word two"], [4.8, ""]]);
  assert.deepEqual(lines[1].words.map(w => Number(w.t.toFixed(2))), [3.3, 3.7]);
  assert.deepEqual(parseLrc("no timestamps here"), []);
});

test("karaoke lines up plain lyrics with the sung phrases", async () => {
  const { timePlainLyrics, plainLyricLines } = await load();
  assert.deepEqual(plainLyricLines("[Chorus]\nfirst line\n\nsecond line\n(Intro)"), ["first line", "second line"]);
  const phrases = [{ start: 5, end: 8 }, { start: 9, end: 12 }, { start: 30, end: 33 }];
  const lines = timePlainLyrics(["a", "b", "c", "d", "e", "f"], phrases).filter(l => l.text);
  assert.deepEqual(lines.map(l => l.text), ["a", "b", "c", "d", "e", "f"]);
  assert.ok(Math.abs(lines[0].t - 4.85) < 1e-9 && Math.abs(lines[4].t - 29.85) < 1e-9);
  const blanks = timePlainLyrics(["a", "b", "c"], phrases).filter(l => !l.text).map(l => l.t);
  assert.deepEqual(blanks, [12.8, 33.8]);
});

test("karaoke delay tests match taps and claps to the beeps", async () => {
  const { estimateDelay } = await load();
  const clicks = [0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.6, 4.2];
  const taps = clicks.map((c, i) => c + 0.12 + (i % 2 ? 0.01 : -0.01));
  const tap = estimateDelay(clicks, taps, 0.3, 0.3);
  assert.ok(tap.ok && Math.abs(tap.delay - 0.12) < 0.011);
  // a clap's echo right after it shouldn't count; the first sound in the window does
  const claps = clicks.flatMap(c => [c + 0.2, c + 0.35]);
  const mic = estimateDelay(clicks, claps, 0.1, 0.6, "first");
  assert.ok(mic.ok && Math.abs(mic.delay - 0.2) < 1e-9);
  assert.equal(estimateDelay(clicks, [0.1, 0.7], 0.3, 0.3).reason, "few");
  const messy = clicks.map((c, i) => c + (i % 2 ? 0.25 : -0.05));
  assert.equal(estimateDelay(clicks, messy, 0.3, 0.3).reason, "uneven");
});
