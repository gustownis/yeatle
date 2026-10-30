const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLeaderboardStore, SNIPPET_TRIES, FAST_FIRST_TRY_MS, BANNED_MESSAGE } = require("../leaderboard.cjs");

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
  assert.deepEqual(Object.keys(round).sort(), ["roundId", "stems", "tries"], "only the round's id, its tries and whether it plays as stems");
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

test("right answers before the audio was requested ban automatically, pending review", async t => {
  const store = newStore(t);
  const cheat = await store.register({ username: "krank", password: "pass1234", progress: { completed: { stems: ["talk"] } } }, NOW, ip);
  const blind = round => store.snippetRoundAct(cheat.token, { roundId: round.roundId, kind: "guess", text: "outside" }, NOW + 300, ip);
  const first = blind(store.startSnippetRound(cheat.token, { candidates: ["outside"] }, NOW, ip));
  assert.equal(first.status, "won", "one blind answer could be luck (iOS may not have asked for the audio yet)");
  assert.equal(store.listBans().bans.length, 0);
  assert.throws(() => blind(store.startSnippetRound(cheat.token, { candidates: ["outside"] }, NOW + 1000, ip)), isBanned, "a second one bans");

  const { bans } = store.listBans();
  assert.equal(bans.length, 1);
  assert.equal(bans[0].username, "krank");
  assert.equal(bans[0].auto, true);
  assert.equal(bans[0].confirmed, false);
  assert.match(bans[0].evidence[0], /before its audio was requested/);
  assert.throws(() => store.me(cheat.token, NOW + 1000, ip), isBanned, "every session is signed out");
  assert.throws(() => store.startSnippetRound("", { candidates: SONGS }, NOW + 1000, ip), isBanned, "and the device is blocked");

  // Automatic bans block addresses only once an admin confirms them.
  const other = { ipHash: ip.ipHash, deviceHash: "e".repeat(32) };
  await store.register({ username: "roommate", password: "pass1234" }, NOW + 2000, other);
  assert.equal(store.confirmBan(bans[0].accountId, NOW + 3000).bans[0].confirmed, true);
  await assert.rejects(() => store.register({ username: "roommate2", password: "pass1234" }, NOW + 4000, other), { status: 403 });
  assert.throws(() => store.confirmBan(bans[0].accountId), /doesn't need confirming/);

  const restored = store.unbanUser(bans[0].accountId, { restore: true }, NOW + 5000);
  assert.equal(restored.bans.length, 0);
  const back = await store.login({ username: "krank", password: "pass1234" }, NOW + 6000, ip);
  assert.deepEqual(back.account.progress.completed.stems, ["talk"], "Unban with Restore progress undoes it completely");
});

test("three instant first-clip answers in a week ban; normal speed never does", async t => {
  const store = newStore(t);
  const fast = await store.register({ username: "bot", password: "pass1234" }, NOW, ip);
  const human = await store.register({ username: "fan", password: "pass1234" }, NOW, { ipHash: "b".repeat(32), deviceHash: "c".repeat(32) });
  const fanCtx = { ipHash: "b".repeat(32), deviceHash: "c".repeat(32) };

  for (let i = 0; i < 12; i++) {
    const { result } = play(store, human.token, { at: NOW + i * 60000, listenMs: FAST_FIRST_TRY_MS + 500, guesses: id => [id], ctx: fanCtx, difficulty: "easy" });
    assert.equal(result.status, "won");
  }
  assert.equal(store.listBans().bans.length, 0, "a fast human isn't struck");

  play(store, fast.token, { at: NOW, listenMs: 400, guesses: id => [id] });
  play(store, fast.token, { at: NOW + 60000, listenMs: 400, guesses: id => [id] });
  assert.equal(store.listBans().bans.length, 0, "two strikes aren't enough");
  assert.throws(() => play(store, fast.token, { at: NOW + 120000, listenMs: 400, guesses: id => [id] }), isBanned);
  assert.match(store.listBans().bans[0].evidence.join(" "), /first clip \d+ ms after/);
});

test("naming nearly every song from a tiny first clip bans, while a strong player doesn't", async t => {
  const store = newStore(t);
  const solver = await store.register({ username: "solver", password: "pass1234" }, NOW, ip);
  const strong = { ipHash: "b".repeat(32), deviceHash: "c".repeat(32) };
  const expert = await store.register({ username: "expert", password: "pass1234" }, NOW, strong);

  // The expert gets 60% on the first clip and needs more clips for the rest.
  for (let i = 0; i < 30; i++) {
    const { result } = play(store, expert.token, { at: NOW + i * 60000, ctx: strong, guesses: id => (i % 5 < 3 ? [id] : [null, id]) });
    assert.equal(result.status, "won");
  }
  assert.equal(store.listBans().bans.length, 0);

  let banned = false;
  for (let i = 0; i < 25 && !banned; i++) {
    try { play(store, solver.token, { at: NOW + i * 60000, guesses: id => [id] }); }
    catch (err) { assert.ok(isBanned(err)); banned = i; }
  }
  assert.equal(banned, 19, "banned at the 20th straight first-clip answer");
  assert.match(store.listBans().bans[0].evidence[0], /100% of the last 20/);
});

test("a known cheat panel on the page bans its own account", async t => {
  const store = newStore(t);
  const user = await store.register({ username: "krankez", password: "pass1234" }, NOW, ip);
  assert.deepEqual(store.reportCheatTool(user.token, { tools: ["something-else"] }, NOW, ip), { ok: true });
  assert.throws(() => store.reportCheatTool(user.token, { tools: ["yeatle-cracked", "snippets-solver"] }, NOW, ip), isBanned);
  assert.match(store.listBans().bans[0].evidence.join(" "), /Yeatle Cracked.*Snippets answer solver/);
  assert.throws(() => store.reportCheatTool("", { tools: ["yeatle-cracked"] }, NOW, { ipHash: "", deviceHash: "" }), { status: 401 }, "nobody can report someone else");
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

test("captured cheat code is kept for admins; a known tool bans and other injections only report", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-evidence-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createLeaderboardStore(path.join(dir, "leaderboard-users.json"));
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
  assert.match(store.listBans().bans[0].evidence.join(" "), /code was captured/);
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
