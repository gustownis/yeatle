const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createLeaderboardStore, SOLVE_CREDIT_BURST, SOLVE_CREDIT_PER_HOUR } = require("../leaderboard.cjs");

const scoringModule = import(pathToFileURL(path.join(__dirname, "../build/assets/karaoke-scoring.mjs")).href);
const karaokeModule = import(pathToFileURL(path.join(__dirname, "../build/assets/karaoke.js")).href);
const NOW = Date.parse("2026-10-27T12:00:00Z");
const MIN = 60000;

// Seeded random numbers keep these "singers" the same on every run.
function random(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

// A three-minute song with 30 phrases.
function phrases(rand) {
  const list = [];
  let t = 8;
  for (let i = 0; i < 30; i++) {
    const span = 2 + rand() * 3;
    list.push({ start: t, end: t + span, dur: span * (0.7 + rand() * 0.3) });
    t += span + 0.6 + rand() * 2;
  }
  return list;
}

// A good human singer: hits most notes, loosely follows the record's loudness, wanders
// tens of cents from its pitch and drifts in timing from phrase to phrase.
function humanTrace(seed = 7) {
  const rand = random(seed);
  return phrases(rand).map(ph => [ph.start, ph.end, ph.dur, 0.62 + rand() * 0.38, 0.25 + rand() * 0.55, Math.round(25 + rand() * 60), Math.round(-160 + rand() * 320)]);
}

// The song's own vocal fed in as the microphone (the stem injector).
function injectorTrace(seed = 3) {
  const rand = random(seed);
  return phrases(rand).map(ph => [ph.start, ph.end, ph.dur, 1, 0.96 + rand() * 0.035, Math.round(rand() * 6), 116]);
}

function newStore(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-runs-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const catalog = new Set(["song", "short"]);
  return createLeaderboardStore(path.join(dir, "leaderboard-users.json"), {
    canonicalSongId: id => (catalog.has(id) ? id : null),
    songSeconds: id => (id === "song" ? 180 : id === "short" ? 20 : null),
    ...extra
  });
}

const integrity = { ok: true, failed: [] };

test("the game's scoring and the server's re-scoring agree on every phrase", async () => {
  const { scorePhrase } = await karaokeModule;
  const { rescoreTrace } = await scoringModule;
  for (let seed = 1; seed <= 25; seed++) {
    const rand = random(seed);
    const list = phrases(rand).map(ph => ({ ...ph, notes: [{ hitTime: [0] }], results: [null], freeDur: rand() < 0.15 ? ph.dur : 0 }));
    const player = { detector: {}, score: 0, mult: 1, streak: 0, bestStreak: 0, accSum: 0, durSum: 0, skipped: 0, counts: { awesome: 0, strong: 0, good: 0, ok: 0, messy: 0, awful: 0 } };
    const g = { chart: { phrases: list }, players: [player] };
    const trace = list.map((ph, i) => {
      ph.notes[0].hitTime[0] = ph.dur * rand();
      const result = scorePhrase(g, i)[0];
      return [ph.start, ph.end, ph.dur, result.skipped ? null : result.acc];
    });
    assert.equal(rescoreTrace(trace), player.score, `seed ${seed}`);
  }
});

test("a realistic human run is ranked; forged and replayed runs are rejected", async t => {
  const scoring = await scoringModule;
  const store = newStore(t);
  const singer = await store.register({ username: "singer", password: "pass1234" }, NOW);
  const other = await store.register({ username: "other", password: "pass1234" }, NOW);

  const human = humanTrace();
  const score = scoring.rescoreTrace(human);
  const run = store.startKaraokeRun(singer.token, { songId: "song", difficulty: "hard", white: false }, NOW);
  const body = { runId: run.runId, score, duration: 180, phrases: human, integrity };
  assert.throws(() => store.submitKaraokeRun(other.token, body, scoring, NOW + 4 * MIN), { status: 403 }, "another account's run");
  const ranked = store.submitKaraokeRun(singer.token, body, scoring, NOW + 4 * MIN);
  assert.equal(ranked.ranked, true);
  assert.equal(ranked.account.metrics.karaokeTotalScore, score);
  assert.throws(() => store.submitKaraokeRun(singer.token, body, scoring, NOW + 5 * MIN), { status: 409 }, "a run is single use");

  const submit = (patch, at = NOW + 4 * MIN) => {
    const r = store.startKaraokeRun(singer.token, { songId: "song", difficulty: "hard" }, NOW);
    return () => store.submitKaraokeRun(singer.token, { runId: r.runId, score, duration: 180, phrases: human, integrity, ...patch }, scoring, at);
  };
  assert.throws(submit({}, NOW + 30000), /faster than the song/);
  assert.throws(submit({}, NOW + 31 * MIN), { status: 409 }, "an expired run");
  assert.throws(submit({ score: score + 1 }), /doesn't match/);
  const perfect = human.map(ph => [ph[0], ph[1], ph[2], 1]);
  assert.throws(submit({ score: scoring.maxTraceScore(perfect) + 1, phrases: perfect }), /more than the song allows/);
  assert.throws(submit({ score: 10000000 }), /more than the song allows/);
  assert.throws(submit({ duration: 600 }), /longer than the song/);
  assert.throws(submit({ phrases: [[5, 4, 1, 0.5]] }), /don't fit/);
  assert.throws(() => store.submitKaraokeRun(singer.token, { runId: "nope", score, duration: 180, phrases: human, integrity }, scoring, NOW), { status: 409 });
  assert.throws(() => store.startKaraokeRun("bad-token", { songId: "song", difficulty: "hard" }, NOW), { status: 401 });
  assert.throws(() => store.startKaraokeRun(singer.token, { songId: "invented", difficulty: "hard" }, NOW), { status: 404 });

  // A forged sync with a huge karaoke score changes nothing on the board.
  store.sync(other.token, { karaoke: { "yeatle-karaoke-best:song:expert": { score: 9999999, name: "x" } } }, NOW);
  const board = store.getLeaderboards("", NOW).boards.karaoke.entries;
  assert.deepEqual(board.map(e => [e.username, e.primary]), [["singer", score]]);
});

test("White people mode runs that are mostly skipped aren't ranked", async t => {
  const scoring = await scoringModule;
  const store = newStore(t);
  const { token } = await store.register({ username: "skipper", password: "pass1234" }, NOW);
  const trace = humanTrace().map((ph, i) => (i % 2 ? [ph[0], ph[1], ph[2], null, null, null, null] : ph));
  const run = store.startKaraokeRun(token, { songId: "song", difficulty: "easy", white: true }, NOW);
  const res = store.submitKaraokeRun(token, { runId: run.runId, score: scoring.rescoreTrace(trace), duration: 180, phrases: trace, integrity }, scoring, NOW + 4 * MIN);
  assert.equal(res.ranked, false);
  assert.equal(res.flagged, false);
});

test("ranked solves grow at a bounded rate and wait for the catalog", async t => {
  let ready = false;
  const ids = Array.from({ length: 1000 }, (_, i) => `s${i}`);
  const catalog = new Set(ids);
  const store = newStore(t, { canonicalSongId: id => (catalog.has(id) ? id : null), catalogReady: () => ready });
  const early = await store.register({ username: "early", password: "pass1234", progress: { completed: { stems: ["s1", "s2"] } } }, NOW);
  assert.equal(early.account.metrics.stemsSolved, 0, "nothing is credited before the catalog loads");
  ready = true;
  const fast = await store.register({ username: "backlog", password: "pass1234", progress: { completed: { stems: ids, "snippet:hard": ids.slice(0, 10) } } }, NOW);
  assert.equal(fast.account.metrics.stemsSolved, SOLVE_CREDIT_BURST, "a big first sync is credited gradually");
  assert.equal(fast.account.metrics.snippetSolved, 0, "synced Snippets solves no longer rank; only verified rounds do");
  assert.equal(store.sync(fast.token, {}, NOW + 3600000).account.metrics.stemsSolved, SOLVE_CREDIT_BURST + SOLVE_CREDIT_PER_HOUR);
  let caught;
  for (let hour = 2; hour <= 6; hour++) caught = store.sync(fast.token, {}, NOW + hour * 3600000).account.metrics.stemsSolved;
  assert.equal(caught, 1000, "and catches up within hours of normal play");
  assert.equal(store.sync(early.token, {}, NOW).account.metrics.stemsSolved, 2);

  // A solve every 30 seconds for two hours, much faster than real rounds, is never held back.
  const player = await store.register({ username: "speedy", password: "pass1234" }, NOW);
  let metrics;
  for (let i = 1; i <= 240; i++) metrics = store.sync(player.token, { completed: { stems: ids.slice(0, i) } }, NOW + i * 30000).account.metrics;
  assert.equal(metrics.stemsSolved, 240);

  // Forged prestige rises one level a day at most.
  assert.equal(store.sync(player.token, { completed: { stems: [] }, prestige: 10000 }, NOW + DAY_MS()).account.metrics.prestige, 1);
});
const DAY_MS = () => 86400000;

test("a won Daily only counts when its right guess matches that day's answer", async t => {
  const answers = { "2026-10-27": { id: "v1:2026-10-27:flawless", song: { title: "Flawless", display: "Flawless" } } };
  const { matchesSong } = await import(pathToFileURL(path.join(__dirname, "../build/assets/snippet-rules.mjs")).href);
  const store = newStore(t, {
    checkDailyWin: (date, entry) => {
      const saved = answers[date];
      const right = entry.attempts[entry.attempts.length - 1];
      return Boolean(saved && entry.id === saved.id && matchesSong(saved.song, right.text));
    }
  });
  const win = text => ({ id: "v1:2026-10-27:flawless", status: "won", attempts: [{ kind: "wrong", text: "talk" }, { kind: "right", text }] });
  const forged = await store.register({ username: "forger", password: "pass1234", progress: { daily: { "2026-10-27": win("definitely wrong") } } }, NOW);
  assert.equal(forged.account.metrics.dailyWins, 0);
  assert.equal(forged.account.progress.daily["2026-10-27"].verified, undefined);
  const real = await store.register({ username: "real", password: "pass1234", progress: { daily: { "2026-10-27": win("flawless") } } }, NOW);
  assert.equal(real.account.metrics.dailyWins, 1);
  const lost = { id: "v1:2026-10-27:flawless", status: "lost", attempts: Array(6).fill({ kind: "skip", text: "" }) };
  assert.equal((await store.register({ username: "loser", password: "pass1234", progress: { daily: { "2026-10-27": lost } } }, NOW)).account.metrics.dailyPlayed, 1);
});
