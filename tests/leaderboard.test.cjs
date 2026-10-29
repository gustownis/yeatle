const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fork } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { createLeaderboardStore, computeMetrics, mergeProgress, BLOCKED_USERNAME_MESSAGE } = require("../leaderboard.cjs");
const frontendModule = import(pathToFileURL(path.join(__dirname, "../build/assets/leaderboard.mjs")).href);

const root = path.resolve(__dirname, "..");
const DAY = 86400000;
const NOW = Date.parse("2026-10-27T12:00:00Z");
const day = offset => new Date(NOW + offset * DAY).toISOString().slice(0, 10);
const won = date => ({ id: `v1:${date}:song`, attempts: [{ kind: "right", text: "song" }], status: "won" });
const lost = date => ({ id: `v1:${date}:song`, attempts: Array(6).fill({ kind: "skip", text: "" }), status: "lost" });

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-lb-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function newStore(t, options) {
  return createLeaderboardStore(path.join(tempDir(t), "leaderboard-users.json"), options);
}

async function startServer(t, dir, dailyAuthority = "") {
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ tabs: [], refreshMinutes: 0, openBrowser: false, dailyAuthority }));
  const child = fork(path.join(root, "server.js"), [], {
    silent: true,
    env: { ...process.env, YEATLE_DATA_DIR: dir, YEATLE_STEMS_DIR: "", YEATLE_DESKTOP: "1", YEATLE_PORT: "0" }
  });
  let logs = "";
  child.stdout.on("data", b => { logs += b; });
  child.stderr.on("data", b => { logs += b; });
  t.after(async () => {
    if (child.exitCode === null && !child.signalCode) {
      const exit = new Promise(r => child.once("exit", r));
      child.kill();
      await exit;
    }
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(logs)), 5000);
    child.on("message", m => { if (m.type === "yeatle-ready") { clearTimeout(timeout); resolve(`http://127.0.0.1:${m.port}`); } });
    child.once("error", err => { clearTimeout(timeout); reject(err); });
    child.once("exit", () => { clearTimeout(timeout); reject(new Error(logs)); });
  });
}

function writeCatalog(dir, ids, extra = {}) {
  const songs = ids.map(id => ({ id, title: id, display: id, era: "Test", mode: "filter", length: "2:30", source: { kind: "url", id: `https://audio.invalid/${id}` }, ...extra[id] }));
  fs.writeFileSync(path.join(dir, "songs-cache.json"), JSON.stringify({ format: 3, updated: 1, songs, eras: [] }));
}

const post = (url, body, token) => fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body)
});

test("accounts hash passwords, reject duplicates, merge devices and rank players", async t => {
  const file = path.join(tempDir(t), "leaderboard-users.json");
  const store = createLeaderboardStore(file);
  const first = await store.register({
    username: "yugpoog", password: "secretPassword",
    progress: {
      completed: { stems: ["song1", "song2", "song3"], snippet: ["snip1"] },
      stats: { stems: { songsAttempted: 4, correctlyGuessed: 3, totalStars: 14, currentStreak: 3, highestStreak: 3 } },
      daily: { [day(-1)]: won(day(-1)), [day(0)]: won(day(0)) },
      karaoke: { "yeatle-karaoke-best:song1:medium": { score: 42000, name: "yugpoog" } }
    }
  }, NOW);
  assert.match(first.token, /^[a-f0-9]{48}$/);
  assert.equal(first.account.metrics.dailyStreak, 2);
  assert.equal(first.account.metrics.stemsSolved, 3);
  assert.doesNotMatch(fs.readFileSync(file, "utf8"), /secretPassword/);

  await assert.rejects(store.register({ username: "YUGPOOG", password: "otherPassword" }, NOW), /already taken/);
  await assert.rejects(store.login({ username: "yugpoog", password: "wrongPassword" }, NOW), /Wrong username or password/);

  const second = await store.login({
    username: "YugPoog", password: "secretPassword",
    progress: {
      completed: { stems: ["song3", "song4"] },
      stats: { stems: emptyStats() },
      karaoke: { "yeatle-karaoke-best:song1:medium": { score: 30000, name: "x" }, "yeatle-karaoke-best:song2:hard": { score: 50000, name: "x" } }
    }
  }, NOW);
  assert.equal(second.account.username, "yugpoog", "login with different case keeps the registered name");
  assert.deepEqual(second.account.progress.completed.stems, ["song1", "song2", "song3", "song4"]);
  assert.equal(second.account.progress.stats.stems.currentStreak, 3, "a blank device does not reset the streak");
  assert.equal(JSON.stringify(second.account.progress.karaoke["yeatle-karaoke-best:song2:hard"]), JSON.stringify({ score: 50000, name: "x" }), "local bests still sync between devices");
  assert.equal(second.account.metrics.karaokeTotalScore, 0, "synced karaoke bests are never ranked; only verified runs are");
  assert.equal(computeMetrics(second.account.progress, NOW).karaokeTotalScore, 92000, "the display total still adds the best per song");

  const other = await store.register({ username: "fewmet", password: "password2", progress: { completed: { stems: ["song1"] }, daily: { [day(0)]: won(day(0)) } } }, NOW);
  const boards = store.getLeaderboards(other.token, NOW);
  assert.deepEqual(boards.boards.stems.entries.map(e => e.username), ["yugpoog", "fewmet"]);
  assert.equal(boards.boards.stems.viewer.rank, 2);
  assert.equal(boards.boards.daily.entries[0].dailyStreak, 2);
  assert.equal(boards.viewer.username, "fewmet");
  assert.equal(boards.boards.stems.entries.some(e => "progress" in e), false, "boards never expose other players' progress");

  assert.equal(computeMetrics(second.account.progress, NOW + 2 * DAY).dailyStreak, 0, "a missed day ends the streak");
  assert.equal(computeMetrics(second.account.progress, NOW + 2 * DAY).bestDailyStreak, 2);

  // Tokens survive a restart and logout revokes only that device.
  const reopened = createLeaderboardStore(file);
  assert.equal(reopened.me(second.token).account.username, "yugpoog");
  reopened.logout(second.token);
  assert.equal(reopened.me(second.token).account, null);
  assert.equal(reopened.me(first.token).account.username, "yugpoog");
});

function emptyStats() {
  return { songsAttempted: 0, correctlyGuessed: 0, totalStars: 0, currentStreak: 0, highestStreak: 0 };
}

test("prestige clears songs on every device instead of being restored by a sync", async t => {
  const store = newStore(t);
  const { token } = await store.register({ username: "player", password: "pass1234", progress: { completed: { stems: ["s1", "s2", "s3"] } } }, NOW);
  const prestiged = store.sync(token, { completed: { stems: ["kept"] }, prestige: 1 }, NOW);
  assert.deepEqual(prestiged.account.progress.completed.stems, ["kept"]);
  assert.equal(prestiged.account.progress.prestige, 1);
  // A second device that never saw the prestige still has the old list.
  const stale = store.sync(token, { completed: { stems: ["s1", "s2", "s3"] }, prestige: 0 }, NOW);
  assert.deepEqual(stale.account.progress.completed.stems, ["kept"]);
  // After catching up, devices merge normally again.
  assert.deepEqual(store.sync(token, { completed: { stems: ["s9"] }, prestige: 1 }, NOW).account.progress.completed.stems, ["kept", "s9"]);
});

test("rankings ignore self-reported stats, unknown song ids, backfilled and future Dailies", async t => {
  const catalog = new Map([["real1", "real1"], ["real2", "real2"], ["oldname", "real1"]]);
  const store = newStore(t, { canonicalSongId: id => catalog.get(id) || null });

  const stats = await store.register({ username: "stats", password: "pass1234", progress: { stats: { stems: { correctlyGuessed: 99999999, songsAttempted: 99999999 } } } }, NOW);
  assert.equal(stats.account.metrics.stemsSolved, 0);

  const ids = await store.register({
    username: "ids", password: "pass1234",
    progress: {
      completed: { stems: ["real1", "oldname", "real2", ...Array.from({ length: 500 }, (_, i) => `fake${i}`)] },
      karaoke: {
        "yeatle-karaoke-best:real1:medium": { score: 25000, name: "ids" },
        "yeatle-karaoke-best:oldname:hard:wpm": { score: 40000, name: "ids" },
        "yeatle-karaoke-best:fake99:expert": { score: 999999, name: "ids" }
      }
    }
  }, NOW);
  assert.equal(ids.account.metrics.stemsSolved, 2, "former ids count once and invented ids not at all");
  const karaoke = computeMetrics(ids.account.progress, NOW, id => catalog.get(id) || null);
  assert.equal(karaoke.karaokeSongs, 1, "equivalent/former karaoke song ids deduplicate and unknown songs are ignored");
  assert.equal(karaoke.karaokeTotalScore, 40000);
  assert.equal(ids.account.metrics.karaokeTotalScore, 0, "self-reported karaoke scores never rank");

  const daily = {};
  for (let i = 0; i < 300; i++) daily[day(-i)] = won(day(-i));
  daily[day(1)] = won(day(1));
  const backfill = await store.register({ username: "backfill", password: "pass1234", progress: { daily } }, NOW);
  assert.equal(backfill.account.metrics.dailyStreak, 2, "only today and yesterday can be claimed");
  assert.equal(backfill.account.progress.daily[day(1)], undefined, "future dates are dropped");
  // Days synced on time keep counting; a client cannot mark an entry verified itself.
  const later = store.sync(backfill.token, { daily: { [day(1)]: won(day(1)), [day(-50)]: { ...won(day(-50)), verified: true } } }, NOW + DAY);
  assert.equal(later.account.metrics.dailyStreak, 3);
  assert.equal(later.account.progress.daily[day(-50)].verified, undefined);

  // A finished Daily cannot be rewritten into a better result, and impossible rounds are rejected.
  const { token } = await store.register({ username: "flip", password: "pass1234", progress: { daily: { [day(0)]: lost(day(0)) } } }, NOW);
  assert.equal(store.sync(token, { daily: { [day(0)]: won(day(0)) } }, NOW).account.metrics.dailyWins, 0);
  const impossible = store.sync(token, { daily: { [day(-1)]: { id: "x", attempts: [], status: "won" } } }, NOW);
  assert.equal(impossible.account.progress.daily[day(-1)], undefined);
});

test("repeated wrong passwords lock that username briefly", async t => {
  const store = newStore(t);
  await store.register({ username: "victim", password: "rightpass" }, NOW);
  for (let i = 0; i < 5; i++) await assert.rejects(store.login({ username: "victim", password: "nope" }, NOW), /Wrong/);
  await assert.rejects(store.login({ username: "victim", password: "rightpass" }, NOW), /Too many/);
  assert.ok((await store.login({ username: "victim", password: "rightpass" }, NOW + 61000)).token);
});

test("an unreadable account file stops startup instead of being overwritten", t => {
  const file = path.join(tempDir(t), "leaderboard-users.json");
  fs.writeFileSync(file, "{broken");
  assert.throws(() => createLeaderboardStore(file), /Restore or fix it/);
  assert.equal(fs.readFileSync(file, "utf8"), "{broken");
});

test("frontend helpers collect local progress and apply the server's copy", async () => {
  const { collectLocalProgress, applyServerProgress, computeLocalDailyStreak } = await frontendModule;
  const map = new Map();
  const storage = {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); }
  };
  storage.setItem("yeatle:completed", JSON.stringify(["a", "b"]));
  storage.setItem(`yeatle:daily:${day(-1)}`, JSON.stringify(won(day(-1))));
  storage.setItem(`yeatle:daily:${day(0)}`, JSON.stringify(lost(day(0))));

  const collected = collectLocalProgress(storage);
  assert.deepEqual(collected.completed.stems, ["a", "b"]);
  assert.equal(Object.keys(collected.daily).length, 2);
  assert.equal(computeLocalDailyStreak(storage, NOW), 2);

  const merged = mergeProgress(collected, { completed: { stems: ["b", "c"], snippet: ["s1"] }, prestige: 2, karaoke: { "yeatle-karaoke-best:song1:easy": { score: 15000, name: "mat" } } }, NOW);
  assert.equal(applyServerProgress(merged, storage), true);
  assert.deepEqual(JSON.parse(storage.getItem("yeatle:completed")), ["b", "c"], "the higher prestige's list wins");
  assert.deepEqual(JSON.parse(storage.getItem("yeatle:completed:snippet")), ["s1"]);
  assert.equal(JSON.parse(storage.getItem("yeatle:prestige")), 2);
  assert.equal(JSON.parse(storage.getItem("yeatle-karaoke-best:song1:easy")).score, 15000);
  assert.equal(applyServerProgress(merged, storage), false, "re-applying the same copy changes nothing");
});

test("the server shares accounts through dailyAuthority and accepts a full-catalog sync", async t => {
  const hostDir = tempDir(t);
  // Solves only count for songs in the host's catalog, and none before it has loaded.
  writeCatalog(hostDir, ["flawless", "talk"]);
  const hostUrl = await startServer(t, hostDir, "");
  const clientDir = tempDir(t);
  const clientUrl = await startServer(t, clientDir, hostUrl);

  const reg = await post(`${clientUrl}/api/account/register`, { username: "mat", password: "yeatfan1", progress: { completed: { stems: ["flawless", "talk", "invented"] } } });
  assert.equal(reg.status, 200);
  const regBody = await reg.json();
  assert.equal(regBody.scope, "global");
  assert.equal(regBody.account.metrics.stemsSolved, 2);
  assert.equal(fs.existsSync(path.join(clientDir, "leaderboard-users.json")), false, "clients keep no account copy");

  const ids = Array.from({ length: 1500 }, (_, i) => `someyeatsongtitle${i}`);
  const heavy = { completed: Object.fromEntries(["stems", "snippet", "snippet:base", "snippet:easy", "snippet:hard", "snippet:extreme"].map(m => [m, ids])) };
  const sync = await post(`${clientUrl}/api/account/sync`, { progress: heavy }, regBody.token);
  assert.equal(sync.status, 200, await sync.clone().text());

  const board = await (await fetch(`${hostUrl}/api/leaderboard`, { headers: { Authorization: `Bearer ${regBody.token}` } })).json();
  assert.equal(board.totalAccounts, 1);
  assert.equal(board.boards.stems.viewer.username, "mat");

  assert.equal((await post(`${clientUrl}/api/account/login`, { username: "mat", password: "wrongpass" })).status, 401);
  assert.equal((await fetch(`${hostUrl}/api/account/sync`, { method: "PUT" })).status, 405);
});

test("an unreachable shared host never creates local accounts", async t => {
  const dir = tempDir(t);
  const url = await startServer(t, dir, "http://127.0.0.1:1");
  const response = await post(`${url}/api/account/register`, { username: "mat", password: "yeatfan1" });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /shared leaderboard is unavailable/);
  assert.equal((await fetch(`${url}/api/leaderboard`)).status, 503);
  assert.equal(fs.existsSync(path.join(dir, "leaderboard-users.json")), false);
});

test("players can change their username and keep their sessions and progress", async t => {
  const store = newStore(t);
  const mat = await store.register({ username: "mat", password: "yeatfan1", progress: { completed: { stems: ["talk"] } } }, NOW);
  await store.register({ username: "ken", password: "yeatfan2" }, NOW);

  await assert.rejects(() => Promise.resolve().then(() => store.rename(mat.token, "KEN", NOW)), { status: 409 });
  await assert.rejects(() => Promise.resolve().then(() => store.rename(mat.token, "x", NOW)), /2 to 20/);
  await assert.rejects(() => Promise.resolve().then(() => store.rename("nope", "matty", NOW)), { status: 401 });

  assert.equal(store.rename(mat.token, "Mat", NOW).account.username, "Mat", "a case-only change keeps the same account");
  const renamed = store.rename(mat.token, "matty", NOW);
  assert.equal(renamed.account.username, "matty");
  assert.equal(renamed.account.metrics.stemsSolved, 1);
  assert.equal(store.me(mat.token).account.username, "matty", "existing sessions stay signed in");
  assert.equal((await store.login({ username: "matty", password: "yeatfan1" }, NOW)).account.username, "matty");
  await assert.rejects(() => store.login({ username: "mat", password: "yeatfan1" }, NOW), { status: 401 });
  assert.equal((await store.register({ username: "mat", password: "other1" }, NOW)).account.username, "mat", "the old name is free again");
});

test("filtered usernames block sign-ups and name changes but keep existing accounts", async t => {
  const dir = tempDir(t);
  const file = path.join(dir, "leaderboard-users.json");
  const store = createLeaderboardStore(file);
  const old = await store.register({ username: "badguy", password: "yeatfan1" }, NOW);

  assert.throws(() => store.setUsernameFilter("  ", true), /1 to 40/);
  assert.deepEqual(store.setUsernameFilter(" BAD ", true), { filters: ["bad"], matches: ["badguy"] });
  for (const name of ["bad", "B.a_d-guy", "superBAD"]) {
    await assert.rejects(() => store.register({ username: name, password: "yeatfan1" }, NOW), err => err.status === 400 && err.message === BLOCKED_USERNAME_MESSAGE);
  }
  const ken = await store.register({ username: "ken", password: "yeatfan2" }, NOW);
  assert.throws(() => store.rename(ken.token, "bad_ken", NOW), { message: BLOCKED_USERNAME_MESSAGE });
  assert.equal(BLOCKED_USERNAME_MESSAGE, "Error Username cannot be chosen because the song is dogshit");
  assert.equal((await store.login({ username: "badguy", password: "yeatfan1" }, NOW)).account.username, "badguy", "existing accounts can still log in");
  assert.equal(store.me(old.token).account.username, "badguy");

  const reopened = createLeaderboardStore(file);
  assert.deepEqual(reopened.getUsernameFilters().filters, ["bad"], "filters survive a restart");
  assert.deepEqual(reopened.setUsernameFilter("bad", false), { filters: [], matches: [] });
  assert.equal((await reopened.register({ username: "bad", password: "yeatfan1" }, NOW)).account.username, "bad");
});

test("the admin panel filters usernames on the shared host and clients rename through it", async t => {
  const hostDir = tempDir(t);
  fs.writeFileSync(path.join(hostDir, "admin.json"), JSON.stringify({ password: "letmein" }));
  const hostUrl = await startServer(t, hostDir, "");
  const clientUrl = await startServer(t, tempDir(t), hostUrl);

  assert.equal((await post(`${hostUrl}/api/admin/username-filters`, { word: "bad" })).status, 401, "admins only");
  const login = await post(`${hostUrl}/api/admin/login`, { password: "letmein" });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const admin = (url, body) => fetch(url, body === undefined ? { headers: { Cookie: cookie } } : {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body)
  });
  const added = await (await admin(`${hostUrl}/api/admin/username-filters`, { word: "bad", blocked: true })).json();
  assert.deepEqual(added, { filters: ["bad"], matches: [], authority: "" });
  assert.equal(JSON.parse(fs.readFileSync(path.join(hostDir, "username-filters.json"), "utf8")).filters[0], "bad");

  const blocked = await post(`${clientUrl}/api/account/register`, { username: "BadSinger", password: "yeatfan1" });
  assert.equal(blocked.status, 400);
  assert.equal((await blocked.json()).error, "Error Username cannot be chosen because the song is dogshit");

  const reg = await (await post(`${clientUrl}/api/account/register`, { username: "mat", password: "yeatfan1" })).json();
  const badRename = await post(`${clientUrl}/api/account/rename`, { username: "mat_bad" }, reg.token);
  assert.equal(badRename.status, 400);
  assert.equal((await badRename.json()).error, "Error Username cannot be chosen because the song is dogshit");
  const rename = await post(`${clientUrl}/api/account/rename`, { username: "matty" }, reg.token);
  assert.equal(rename.status, 200);
  assert.equal((await rename.json()).account.username, "matty");
  const board = await (await fetch(`${hostUrl}/api/leaderboard`, { headers: { Authorization: `Bearer ${reg.token}` } })).json();
  assert.equal(board.viewer.username, "matty");

  const removed = await (await admin(`${hostUrl}/api/admin/username-filters`, { word: "bad", blocked: false })).json();
  assert.deepEqual(removed.filters, []);
  assert.equal((await admin(`${hostUrl}/api/admin/username-filters`)).status, 200);
});

test("alive 4 a min, regular person and terrified are blocked in any spelling", async t => {
  const { isBuiltInBlockedUsername } = require("../leaderboard.cjs");
  for (const name of ["alive4amin", "Alive_4_A_Min", "aliveforaminute", "a1ive4min", "xxalive4aminxx", "regularperson", "Reguler.Persn", "r3gul4rp3rs0n", "regperson", "Terrified", "t3rr1f13d", "terrrifyed", "im_terifid"]) {
    assert.ok(isBuiltInBlockedUsername(name), `${name} should be blocked`);
  }
  for (const name of ["alive", "regular", "person", "teriyaki", "territory", "terry", "fewmet", "IShat4aMin", "Lyfestealer"]) {
    assert.ok(!isBuiltInBlockedUsername(name), `${name} should be allowed`);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-builtin-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createLeaderboardStore(path.join(dir, "leaderboard-users.json"));
  await assert.rejects(() => store.register({ username: "Alive-4-A-Min", password: "yeatfan1" }, NOW), err => err.status === 400 && err.message === BLOCKED_USERNAME_MESSAGE);
  const ok = await store.register({ username: "yeatfan", password: "yeatfan1" }, NOW);
  assert.throws(() => store.rename(ok.token, "t3rrified", NOW), { message: BLOCKED_USERNAME_MESSAGE });
  assert.deepEqual(store.getUsernameFilters().filters, [], "built-in blocks are not editable admin filters");
});
