const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLeaderboardStore, SNIPPET_TRIES, STAND_IN_JUDGE, BANNED_MESSAGE } = require("../leaderboard.cjs");

const NOW = Date.parse("2026-10-27T12:00:00Z");
const SONGS = ["flawless", "talk", "gettinold", "monë", "sorry", "wat", "ruby", "outside", "nun", "go2work"];
const ip = { ipHash: "a".repeat(32), deviceHash: "d".repeat(32) };

// A catalog stub: every song is playable except "broken", the answer is the id itself,
// and hints are made up so tests can see when each one unlocks.
function newStore(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-rounds-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const known = new Set([...SONGS, "broken"]);
  return createLeaderboardStore(path.join(dir, "leaderboard-users.json"), {
    canonicalSongId: id => (known.has(id) ? id : null),
    snippetSong: id => (known.has(id) ? { playable: id !== "broken", stems: false, canonical: id } : null),
    snippetHints: id => ({ era: `${id} era`, eraYear: 2023, year: 2022, producers: [`${id} producer`] }),
    snippetReveal: id => ({ id, title: id, display: id.toUpperCase() }),
    matchesAnswer: (id, text) => text.trim().toLowerCase() === id,
    ...extra
  });
}

const isBanned = err => err.status === 403 && err.banned === true && err.message === BANNED_MESSAGE;

// Plays one round: requests its audio `listenMs` before acting, then guesses `guesses` in
// order (null means skip). Returns the last answer and the song the server picked.
function play(store, token, { candidates = SONGS, difficulty = "base", at = NOW, listenMs = 4000, audio = true, guesses, ctx = ip } = {}) {
  const round = store.startSnippetRound(token, { candidates, difficulty, pool: "all" }, at, ctx);
  const songId = audio ? store.snippetRoundAudio(round.roundId, at).songId : null;
  let result;
  for (const guess of guesses(songId)) {
    result = guess === null
      ? store.snippetRoundAct(token, { roundId: round.roundId, kind: "skip" }, at + listenMs, ctx)
      : store.snippetRoundAct(token, { roundId: round.roundId, kind: "guess", text: guess }, at + listenMs, ctx);
  }
  return { round, result, songId };
}

test("the page never learns the song until the round is over", async t => {
  const store = newStore(t);
  const round = store.startSnippetRound("", { candidates: ["broken", "flawless", "flawless"], difficulty: "base" }, NOW, ip);
  assert.deepEqual(Object.keys(round).sort(), ["ranked", "roundId", "stems", "tries"], "only the round's id, its tries, whether it plays as stems and whether it ranks");
  assert.match(round.roundId, /^[a-f0-9]{32}$/);
  assert.equal(round.tries, SNIPPET_TRIES.base);
  assert.equal(store.snippetRoundAudio(round.roundId, NOW).songId, "flawless", "the server picks among playable candidates only");

  const act = (kind, text) => store.snippetRoundAct("", { roundId: round.roundId, kind, text }, NOW + 5000, ip);
  let res = act("guess", "talk");
  assert.deepEqual(res, { status: "playing", level: 1, hints: {} }, "a wrong guess tells nothing about the song");
  res = act("skip");
  assert.equal(res.level, 2);
  assert.deepEqual(res.hints, {});
  res = act("skip");
  assert.deepEqual(res.hints, { era: "flawless era" }, "Era unlocks at the fourth clip, as in the game");
  res = act("skip");
  assert.deepEqual(res.hints, { era: "flawless era", eraYear: 2023, year: 2022 });
  res = act("skip");
  assert.deepEqual(res.hints.producers, ["flawless producer"]);
  assert.equal(res.song, undefined);
  assert.throws(() => act("skip"), /longest clip/, "the last clip can't be skipped past");
  res = act("guess", "nope");
  assert.equal(res.status, "lost");
  assert.deepEqual(res.song, { id: "flawless", title: "flawless", display: "FLAWLESS" }, "the answer arrives with the loss");
  assert.throws(() => act("guess", "flawless"), /already over/);
  assert.throws(() => store.snippetRoundAct("", { roundId: "f".repeat(32), kind: "skip" }, NOW, ip), /expired/);
  assert.throws(() => store.startSnippetRound("", { candidates: ["broken"], difficulty: "base" }, NOW, ip), /can be played/);
  assert.throws(() => store.startSnippetRound("", { candidates: SONGS, difficulty: "insane" }, NOW, ip), /difficulty/);
});

test("extreme gives no hints, giving up reveals the song, and rounds expire", async t => {
  const store = newStore(t);
  const round = store.startSnippetRound("", { candidates: ["talk"], difficulty: "extreme" }, NOW, ip);
  assert.equal(round.tries, 3);
  const act = (kind, text, at = NOW) => store.snippetRoundAct("", { roundId: round.roundId, kind, text }, at, ip);
  assert.deepEqual(act("skip").hints, {});
  const res = act("giveup");
  assert.equal(res.status, "lost");
  assert.equal(res.song.id, "talk");

  const late = store.startSnippetRound("", { candidates: ["talk"], difficulty: "base" }, NOW, ip);
  assert.throws(() => store.snippetRoundAct("", { roundId: late.roundId, kind: "skip" }, NOW + 4 * 3600000, ip), /expired/);
  assert.equal(store.snippetRoundAudio(late.roundId, NOW + 4 * 3600000), null);
});

test("a signed-in win ranks once, and only the round's own account can play it", async t => {
  const store = newStore(t);
  const mat = await store.register({ username: "mat", password: "pass1234" }, NOW, ip);
  const ken = await store.register({ username: "ken", password: "pass1234" }, NOW, ip);
  const { result, songId } = play(store, mat.token, { guesses: id => ["wrong", id] });
  assert.equal(result.status, "won");
  assert.equal(result.ranked, true);
  assert.equal(result.song.id, songId);

  // The page then marks the song solved and syncs, as it always has.
  const metrics = store.sync(mat.token, { completed: { snippet: [songId, "talk", "wat"] } }, NOW + 10000, ip).account.metrics;
  assert.equal(metrics.snippetSolved, 1, "only the verified win ranks, not the songs the page claims");

  const theirs = store.startSnippetRound(mat.token, { candidates: SONGS }, NOW, ip);
  store.snippetRoundAudio(theirs.roundId, NOW);
  assert.throws(() => store.snippetRoundAct(ken.token, { roundId: theirs.roundId, kind: "skip" }, NOW + 5000, ip), { status: 403 });
  assert.throws(() => store.snippetRoundAct("", { roundId: theirs.roundId, kind: "skip" }, NOW + 5000, ip), { status: 401 });

  const anon = play(store, "", { guesses: id => [id] });
  assert.equal(anon.result.status, "won");
  assert.equal(anon.result.ranked, undefined, "a signed-out win isn't ranked anywhere");
});

test("the players list shows when each account was made, newest first, and nothing private", async t => {
  const store = newStore(t);
  await store.register({ username: "first", password: "pass1234" }, NOW, ip);
  const second = await store.register({ username: "Second", password: "pass1234" }, NOW + 60000, ip);
  store.sync(second.token, {}, NOW + 120000, ip);
  store.banUser("first", "", NOW + 180000);
  const list = store.listPlayers("", NOW);
  assert.equal(list.total, 2);
  assert.deepEqual(list.players.map(p => p.username), ["Second", "first"]);
  assert.equal(list.players[0].createdAt, NOW + 60000);
  assert.equal(list.players[0].lastActive, NOW + 120000);
  assert.equal(list.players[1].banned, true);
  assert.deepEqual(Object.keys(list.players[0]).sort(), ["banned", "createdAt", "lastActive", "nameBlocked", "username"]);
  assert.deepEqual(store.listPlayers("SEC").players.map(p => p.username), ["Second"]);
  assert.ok(!/[a-f0-9]{32}/.test(JSON.stringify(list)), "no hashes, ids or tokens");
});

test("the game finds known cheat panels by their own text", async () => {
  const { findCheatTools } = await import("../build/assets/leaderboard.mjs");
  const fakeDoc = text => ({ textContent: text });
  globalThis.document = { querySelector: () => null, body: fakeDoc("") };
  try {
    assert.deepEqual(findCheatTools(fakeDoc("Yeatle Cracked by krankez Karaoke Snippets Solver Captured Song Answer")), ["yeatle-cracked", "snippets-solver"]);
    assert.deepEqual(findCheatTools(fakeDoc("Leaderboards mat_bad YeatleCracked Snippets")), [], "usernames can't contain these phrases");
  } finally {
    delete globalThis.document;
  }
});

test("captured cheat code is kept for admins, and the judge decides whether a report bans", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-evidence-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // A judge that bans for any named tool, as the website's private module may.
  const judge = { ...STAND_IN_JUDGE, cheatToolReport: ({ tools, captured }) => (tools.length ? { ban: [`tool: ${tools.join(", ")}`, ...(captured ? ["code captured"] : [])] } : {}) };
  const store = createLeaderboardStore(path.join(dir, "leaderboard-users.json"), { judge });
  const ext = await store.register({ username: "extuser", password: "pass1234" }, NOW, ip);
  const other = { ipHash: "b".repeat(32), deviceHash: "c".repeat(32) };
  const cheat = await store.register({ username: "krankez", password: "pass1234" }, NOW, other);
  const evidence = { page: "/", functions: [{ name: "fetch", source: "function(u){ steal(u) }" }], scripts: [], panels: [], storage: [{ key: "solver_settings", value: "{}" }] };

  // Something injected but unrecognised (it could be an extension): kept, nobody banned.
  for (let i = 0; i < 4; i++) assert.deepEqual(store.reportCheatTool(ext.token, { tools: [], evidence }, NOW + i, ip), { ok: true });
  let list = store.listBans().evidence;
  assert.equal(list.length, 3, "at most three unrecognised reports per account a day");
  assert.deepEqual(list[0].functions, ["fetch"]);
  assert.deepEqual(list[0].storage, ["solver_settings"]);
  assert.equal(store.listBans().bans.length, 0);

  // A known tool bans, and its capture is kept with the ban.
  const panel = { ...evidence, panels: ["<div>Yeatle Cracked · Captured Song Answer</div>"], scripts: [{ src: "(inline)", text: "/* solver */" }] };
  assert.throws(() => store.reportCheatTool(cheat.token, { tools: ["yeatle-cracked"], evidence: panel }, NOW, other), err => err.banned === true);
  list = store.listBans().evidence;
  assert.equal(list[0].username, "krankez");
  assert.equal(list[0].banned, true);
  assert.match(store.listBans().bans[0].evidence.join(" "), /tool: yeatle-cracked.*code captured/);
  const saved = store.readEvidence(list[0].id);
  assert.match(saved.json, /Yeatle Cracked/);
  assert.match(saved.json, /solver/);
  assert.ok(fs.existsSync(path.join(dir, "cheat-evidence", `${list[0].id}.json`)));

  // Oversized or malformed evidence isn't stored; deleting removes the file.
  const big = await store.register({ username: "bigsender", password: "pass1234" }, NOW, ip);
  store.reportCheatTool(big.token, { tools: [], evidence: { functions: [{ name: "x", source: "a".repeat(900000) }] } }, NOW, ip);
  store.reportCheatTool(big.token, { tools: [], evidence: "nope" }, NOW, ip);
  assert.equal(store.listBans().evidence.filter(e => e.username === "bigsender").length, 0);
  store.deleteEvidence(list[0].id);
  assert.ok(!fs.existsSync(path.join(dir, "cheat-evidence", `${list[0].id}.json`)));
  assert.throws(() => store.readEvidence(list[0].id), { status: 404 });
  assert.throws(() => store.reportCheatTool("", { tools: [], evidence }, NOW, ip), { status: 401 }, "only signed-in pages report");
});

test("the server rebuilds the song list, so a page can't offer one song it knows", async t => {
  const big = Array.from({ length: 300 }, (_, i) => `song${i}`);
  const eraOf = id => (Number(id.slice(4)) < 250 ? "Alivë" : "Lyfë");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-pool-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createLeaderboardStore(path.join(dir, "leaderboard-users.json"), {
    canonicalSongId: id => id,
    snippetSong: id => ({ playable: true, stems: false, canonical: id }),
    snippetPool: (pool, excluded) => big.filter(id => !excluded.includes(eraOf(id))),
    snippetReveal: id => ({ id }),
    matchesAnswer: (id, text) => text === id
  });
  const user = await store.register({ username: "solo", password: "pass1234" }, NOW, ip);
  const picks = new Set();
  for (let i = 0; i < 30; i++) {
    const round = store.startSnippetRound(user.token, { candidates: ["song7"], difficulty: "base", pool: "all", excludedEras: [] }, NOW, ip);
    assert.equal(round.ranked, true);
    picks.add(store.snippetRoundAudio(round.roundId, NOW).songId);
  }
  assert.ok(picks.size > 20, "a one-song list is topped up to at least 100 songs from the pool");

  const outside = store.startSnippetRound(user.token, { candidates: ["notinpool"], difficulty: "base" }, NOW, ip);
  assert.notEqual(store.snippetRoundAudio(outside.roundId, NOW).songId, "notinpool", "songs outside the pool are dropped");

  // Excluding every era but one leaves 50 songs: that round plays but can't rank.
  const small = store.startSnippetRound(user.token, { candidates: big, difficulty: "base", excludedEras: ["Alivë"] }, NOW, ip);
  assert.equal(small.ranked, false);
  const songId = store.snippetRoundAudio(small.roundId, NOW).songId;
  assert.ok(Number(songId.slice(4)) >= 250);
  const won = store.snippetRoundAct(user.token, { roundId: small.roundId, kind: "guess", text: songId }, NOW + 5000, ip);
  assert.equal(won.status, "won");
  assert.equal(won.ranked, false);
});

// A judge for testing the plumbing: it strikes or bans exactly when told to.
function scriptedJudge(overrides = {}) {
  const calls = [];
  return {
    calls,
    strikePolicy: { windowDays: 7, toBan: 3 },
    rankedMinCandidates: 5,
    snippetGuess(facts) { calls.push(["guess", facts.attempt]); facts.scratch.guesses = (facts.scratch.guesses || 0) + 1; },
    snippetFinished(facts) {
      calls.push(["finished", facts.won, facts.attempts, facts.scratch.guesses]);
      facts.memory.rounds = (facts.memory.rounds || 0) + 1;
      return overrides.snippetFinished ? overrides.snippetFinished(facts) : {};
    },
    karaokeRun() { return {}; },
    cheatToolReport() { return {}; }
  };
}

test("without a private judge nobody is ever struck, flagged or banned automatically", async t => {
  const store = newStore(t);
  const fast = await store.register({ username: "anyone", password: "pass1234" }, NOW, ip);
  for (let i = 0; i < 30; i++) play(store, fast.token, { at: NOW + i * 1000, listenMs: 1, audio: i % 2 === 0, guesses: id => [id] });
  assert.deepEqual(store.reportCheatTool(fast.token, { tools: ["yeatle-cracked"] }, NOW, ip), { ok: true });
  assert.equal(store.listBans().bans.length, 0);
  assert.equal(store.me(fast.token, NOW).account.username, "anyone");
});

test("the judge sees each round's guesses and result, keeps memory per account, and its strikes add up to a ban", async t => {
  const judge = scriptedJudge({ snippetFinished: f => (f.won ? { strikes: [{ weight: 1, reason: `round ${f.memory.rounds}` }] } : {}) });
  const store = newStore(t, { judge });
  const user = await store.register({ username: "watched", password: "pass1234" }, NOW, ip);
  const first = play(store, user.token, { guesses: id => ["nope", id] });
  assert.equal(first.result.status, "won");
  assert.deepEqual(judge.calls, [["guess", 0], ["guess", 1], ["finished", true, 2, 2]]);
  play(store, user.token, { at: NOW + 60000, guesses: id => [id] });
  assert.equal(store.listBans().bans.length, 0, "two strikes are under the judge's limit of three");
  assert.throws(() => play(store, user.token, { at: NOW + 120000, guesses: id => [id] }), isBanned);
  const ban = store.listBans().bans[0];
  assert.equal(ban.auto, true);
  assert.deepEqual(ban.evidence, ["round 1", "round 2", "round 3"], "memory was kept between rounds");
});

test("a judge's ban verdict bans at once, and a judge missing a hook is refused", async t => {
  const store = newStore(t, { judge: scriptedJudge({ snippetFinished: () => ({ ban: ["told to"] }) }) });
  const user = await store.register({ username: "banme", password: "pass1234" }, NOW, ip);
  assert.throws(() => play(store, user.token, { guesses: id => [id] }), isBanned);
  assert.deepEqual(store.listBans().bans[0].evidence, ["told to"]);
  assert.throws(() => newStore(t, { judge: { snippetGuess() {} } }), /has no snippetFinished\(\) hook/);
});

test("the website loads its judge from antiCheatModule, and a broken one stops it", async t => {
  const { spawnSync } = require("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-judge-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const start = config => {
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ tabs: [], openBrowser: false, dailyAuthority: "", ...config }));
    return spawnSync(process.execPath, ["-e", `process.on("message",()=>{});const s=require(${JSON.stringify(path.join(__dirname, "..", "server.js"))});setTimeout(()=>process.exit(0),1500)`], {
      env: { ...process.env, YEATLE_DATA_DIR: dir, YEATLE_PORT: "0", YEATLE_DESKTOP: "1" }, encoding: "utf8", timeout: 15000
    });
  };
  fs.writeFileSync(path.join(dir, "judge.cjs"), `module.exports = { createAntiCheat: settings => ({ snippetGuess() {}, snippetFinished() { return {}; }, karaokeRun() { return {}; }, cheatToolReport() { return {}; }, strikePolicy: { windowDays: 1, toBan: settings.toBan } }) };`);
  const loaded = start({ antiCheatModule: "judge.cjs", antiCheat: { toBan: 2 } });
  assert.match(loaded.stdout, /Loaded the private module/);
  assert.match(loaded.stdout, /Yeatle is running/);
  const missing = start({ antiCheatModule: "nope.cjs" });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /anti-cheat module .*nope\.cjs could not load/);
  const none = start({});
  assert.match(none.stderr + none.stdout, /No antiCheatModule is set/);
});
