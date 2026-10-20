// White people mode: which words are skipped, when, and how skipped time is scored.
// The scoring tests feed a fake microphone (a scripted detector) through the same
// scoreFrame / scorePhrase code the game loop uses.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "build", "assets", "karaoke.js")).href);

test("only the n-word and its spellings are skipped, as whole words", async () => {
  const { isSkipWord, countSkipWords } = await load();
  for (const w of ["nigga", "Niggas,", "NIGGAZ", "nigger", "niggers", "nigguh", "niggah", "nigga's", "niggas'", "(nigga)", "nïgga", "n*gga", "n***a", "n****", "ni**a", "n**gas"]) {
    assert.equal(isSkipWord(w), true, w);
  }
  for (const w of ["night", "Niger", "Nigeria", "Nigerian", "niggle", "niggling", "niggard", "snigger", "nig", "ninja", "nugget", "begging", "n*", "", "nigga-nigga-nigga-nigga"]) {
    assert.equal(isSkipWord(w), false, w);
  }
  assert.equal(countSkipWords([{ text: "Young nigga, yeah, I'm raw" }, { text: "lil-niggas outside" }, { text: "Snigger at Niger" }]), 2);
});

const chartOf = (...phrases) => {
  const notes = [];
  const out = phrases.map((list, index) => {
    const ph = { start: list[0][0], end: list[list.length - 1][1], notes: [], results: [] };
    for (const [start, end, kind = "pitch"] of list) {
      const note = { kind, start, end, midi: 60, phrase: index };
      ph.notes.push(note);
      notes.push(note);
    }
    ph.dur = ph.notes.reduce((sum, n) => sum + n.end - n.start, 0);
    return ph;
  });
  return { notes, phrases: out, lo: 50, hi: 70 };
};

test("word-timed lyrics give exact skip windows; LRC offsets and lyric shifts move them", async () => {
  const { parseLrc, findSkips } = await load();
  const lrc = "[00:10.00]<00:10.00> Young <00:10.40> nigga <00:10.90> yeah\n[00:12.00]<00:12.00> nothing <00:12.50> here";
  let skips = findSkips(parseLrc(lrc), chartOf([[9.5, 12.5]]), 0, "word");
  assert.equal(skips.length, 1);
  assert.equal(skips[0].exact, true);
  assert.ok(Math.abs(skips[0].start - 10.34) < 1e-6 && Math.abs(skips[0].end - 11.0) < 1e-6, JSON.stringify(skips[0]));
  // [offset:+500] shows lyrics 0.5 s sooner, so the word is sung 0.5 s sooner too
  skips = findSkips(parseLrc("[offset:+500]\n" + lrc), chartOf([[9.5, 12.5]]), 0, "word");
  assert.ok(Math.abs(skips[0].start - 9.84) < 1e-6);
  // a lyric shift of +0.3 s means lyrics run 0.3 s ahead of the song
  skips = findSkips(parseLrc(lrc), chartOf([[9.5, 12.5]]), 0.3, "word");
  assert.ok(Math.abs(skips[0].start - 10.04) < 1e-6);
});

test("line-timed lyrics place the skip inside the line's singing and mark it as an estimate", async () => {
  const { parseLrc, findSkips } = await load();
  // four equal words sung across 20.0-22.0; the slur is the third word
  const lines = parseLrc("[00:20.00]Run it nigga up\n[00:24.00]Next line with nothing");
  const chart = chartOf([[20, 22]], [[24, 26]]);
  const [skip, ...rest] = findSkips(lines, chart, 0, "line");
  assert.equal(rest.length, 0);
  assert.equal(skip.exact, false);
  const mid = (skip.start + skip.end) / 2;
  assert.ok(mid > 20.8 && mid < 21.6, `estimated middle ${mid}`);
  assert.ok(skip.end - skip.start <= 1.6, "an estimate never covers more than about a word and a half");
  // the singing starts late in the line: the estimate follows the vocals, not the timestamp
  const late = findSkips(parseLrc("[00:20.00]nigga what\n[00:26.00]x"), chartOf([[23, 25]]), 0, "line")[0];
  assert.ok(late.start > 22 && late.end < 24.5, JSON.stringify(late));
  // a long verse with one slur skips about a word, never the verse
  const verse = findSkips(parseLrc("[00:30.00]" + "word ".repeat(30) + "nigga " + "word ".repeat(30) + "\n[00:38.00]x"), chartOf([[30, 38]]), 0, "line");
  assert.equal(verse.length, 1);
  assert.ok(verse[0].end - verse[0].start < 1.6);
});

test("overlapping skips merge, and your own times join the found ones", async () => {
  const { mergeSkips, marksToSkips, parseSkipMarks, formatSkipMarks } = await load();
  const merged = mergeSkips([{ start: 5, end: 6, exact: true, word: "a" }, { start: 5.5, end: 7, exact: false, word: "b" }, { start: 9, end: 9.5, exact: true, word: "c" }]);
  assert.deepEqual(merged.map(s => [s.start, s.end, s.exact]), [[5, 7, false], [9, 9.5, true]]);
  const { marks, bad } = parseSkipMarks("1:23.4\n2:05 1.5 # chorus\n\n0:07.25 0.1\nnope\n1:75");
  assert.deepEqual(bad, [5, 6]);
  assert.deepEqual(marks, [{ t: 7.25, len: 0.2 }, { t: 83.4, len: 0.8 }, { t: 125, len: 1.5 }]);
  assert.equal(formatSkipMarks(marks), "0:07.3 0.2\n1:23.4\n2:05.0 1.5");
  assert.deepEqual(parseSkipMarks(formatSkipMarks(marks)).marks.map(m => m.len), [0.2, 0.8, 1.5]);
  assert.deepEqual(mergeSkips([...marksToSkips([{ t: 10, len: 1 }]), { start: 10.5, end: 11.5, exact: false, word: "x" }]).map(s => [s.start, s.end, s.mine]), [[9.95, 11.5, true]]);
});

// A scripted microphone: sings the chart's note (pitch 60) whenever sing(t) is true.
function play(mod, chart, skips, sing, players = 1) {
  mod.markFreeTime(chart, skips);
  chart.notes.forEach(n => { n.hits = Array.from({ length: players }, () => []); n.hitTime = new Array(players).fill(0); });
  chart.phrases.forEach(ph => { ph.results = new Array(players).fill(null); });
  let now = 0;
  const g = {
    chart, tolerance: 2, noteIdx: 0,
    players: Array.from({ length: players }, (_, i) => ({
      detector: i === players - 1 && players > 1 ? null : { read: () => (sing(now) ? { loud: true, voiced: true, midi: 60 } : { loud: false, voiced: false, midi: NaN }) },
      score: 0, mult: 1, streak: 0, bestStreak: 0, accSum: 0, durSum: 0, skipped: 0, counts: { awesome: 0, strong: 0, good: 0, ok: 0, messy: 0, awful: 0 }, trail: [], lastMidi: NaN
    }))
  };
  let phraseIdx = 0, last = 0;
  const end = chart.phrases[chart.phrases.length - 1].end + 0.5;
  for (now = 0; now <= end; now += 1 / 60) {
    mod.scoreFrame(g, now, now - last, 0.01);
    last = now;
    while (g.noteIdx < chart.notes.length && chart.notes[g.noteIdx].end <= now) g.noteIdx++;
    while (phraseIdx < chart.phrases.length && chart.phrases[phraseIdx].end <= now) mod.scorePhrase(g, phraseIdx++);
  }
  const p = g.players[0];
  return { ...p, acc: p.accSum / p.durSum, results: chart.phrases.map(ph => ph.results[0]), all: g.players };
}

test("silence during a skip is forgiven; silence during ordinary notes still costs", async () => {
  const mod = await load();
  const song = () => chartOf([[1, 3]], [[4, 6]], [[7, 9]]);
  const skip = [{ start: 4.5, end: 5.3, exact: false }];
  const inSkip = t => !(t >= 4.5 && t < 5.3);
  const inNote = t => !(t >= 7.5 && t < 8.3);
  const always = () => true;

  const perfect = play(mod, song(), [], always);
  assert.ok(perfect.acc > 0.99);
  const normalSilentAtWord = play(mod, song(), [], inSkip);
  const whiteSilentAtWord = play(mod, song(), skip, inSkip);
  const whitePerfect = play(mod, song(), skip, always);
  const whiteSilentElsewhere = play(mod, song(), skip, inNote);
  const normalSilentElsewhere = play(mod, song(), [], inNote);

  assert.ok(normalSilentAtWord.acc < 0.9, `normal mode counts the gap (${normalSilentAtWord.acc})`);
  assert.ok(whiteSilentAtWord.acc > 0.99, `the skipped word costs nothing (${whiteSilentAtWord.acc})`);
  assert.equal(whiteSilentAtWord.results[1].rating.text, "Awesome!");
  assert.equal(whiteSilentAtWord.bestStreak, 3, "the streak and multiplier keep going");
  assert.equal(whiteSilentAtWord.score, whitePerfect.score, "staying silent scores the same as singing through the skip");
  assert.ok(whiteSilentElsewhere.acc < 0.9, "missing an ordinary note still counts in White people mode");
  assert.equal(whiteSilentElsewhere.results[2].rating.text, normalSilentElsewhere.results[2].rating.text, "and is rated exactly like normal mode");
  assert.equal(whiteSilentElsewhere.results[2].points, normalSilentElsewhere.results[2].points);
  assert.ok(normalSilentAtWord.score < whiteSilentAtWord.score);
  assert.equal(whiteSilentAtWord.score, perfect.score, "staying silent for the word scores like singing it in normal mode");
  const whiteSilentBoth = play(mod, song(), skip, t => inSkip(t) && inNote(t));
  assert.equal(whiteSilentBoth.score, normalSilentElsewhere.score, "the ordinary miss costs exactly what it costs in normal mode");
});

test("a phrase that's entirely skipped isn't rated and doesn't break the streak", async () => {
  const mod = await load();
  const chart = chartOf([[1, 3]], [[4, 4.6]], [[6, 8]]);
  const r = play(mod, chart, [{ start: 3.9, end: 4.7, exact: true }], t => !(t >= 3.9 && t < 4.7));
  assert.equal(r.results[1].skipped, true);
  assert.equal(r.results[1].points, Math.round(0.6 * 250) * 2, "it scores like a sung phrase at the current multiplier");
  assert.equal(r.skipped, 1);
  assert.equal(Object.values(r.counts).reduce((a, b) => a + b, 0), 2, "only the two sung phrases get a rating");
  assert.equal(r.bestStreak, 2);
  assert.equal(r.mult, 3);
  assert.ok(r.acc > 0.99);
});

test("the No mic singer still scores nothing in White people mode", async () => {
  const mod = await load();
  const r = play(mod, chartOf([[1, 3]], [[4, 6]]), [{ start: 4.5, end: 5 }], () => true, 2);
  const watcher = r.all[1];
  assert.equal(watcher.score, 0);
  assert.equal(watcher.streak, 0);
});

test("restarting in normal mode on the same chart clears the skipped time", async () => {
  const mod = await load();
  const chart = chartOf([[1, 3]], [[4, 6]]);
  const inSkip = t => !(t >= 4.5 && t < 5.3);
  const white = play(mod, chart, [{ start: 4.5, end: 5.3 }], inSkip);
  const normal = play(mod, chart, [], inSkip);
  assert.ok(white.acc > 0.99);
  assert.ok(normal.acc < 0.9);
  assert.equal(chart.phrases[1].freeDur, 0);
});

test("White people mode is off by default, saved with the other settings, and keeps separate best scores", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../build/assets/karaoke.js"), "utf8")
    .replace(/\bexport /g, "").replaceAll("import.meta.url", '"http://127.0.0.1/assets/karaoke.js"');
  const run = saved => {
    const data = new Map(Object.entries(saved));
    const context = vm.createContext({
      URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Float32Array,
      localStorage: { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), key: i => [...data.keys()][i], get length() { return data.size; } },
      navigator: {}, document: { getElementById: () => null }
    });
    vm.runInContext(source, context);
    return { run: code => vm.runInContext(code, context), data };
  };
  const fresh = run({});
  assert.equal(fresh.run("settings.whiteMode"), false);
  fresh.run("settings.whiteMode = true; saveSettings()");
  assert.equal(JSON.parse(fresh.data.get("yeatle-karaoke-settings")).whiteMode, true);
  assert.equal(run(Object.fromEntries(fresh.data)).run("settings.whiteMode"), true);
  assert.equal(fresh.run('bestKey("soup", "hard", false)'), "yeatle-karaoke-best:soup:hard", "normal best scores keep their old key");
  assert.equal(fresh.run('bestKey("soup", "hard", true)'), "yeatle-karaoke-best:soup:hard:wpm");
  const merged = run({ "yeatle-karaoke-best:old:hard:wpm": "{\"score\":5}", "yeatle-karaoke-skips:old": "{\"auto\":false,\"marks\":[]}" });
  merged.run('carryFormerIds([{ id: "new", formerIds: ["old"] }], localStorage)');
  assert.equal(merged.data.get("yeatle-karaoke-best:new:hard:wpm"), "{\"score\":5}");
  assert.equal(merged.data.get("yeatle-karaoke-skips:new"), "{\"auto\":false,\"marks\":[]}");
});
