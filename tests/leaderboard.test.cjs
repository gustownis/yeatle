const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fork } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { createLeaderboardStore, computeMetrics, mergeProgress } = require("../leaderboard.cjs");
const frontendModule = import(pathToFileURL(path.join(__dirname, "../build/assets/leaderboard.mjs")).href);

const root = path.resolve(__dirname, "..");

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-lb-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function startServer(t, dir, dailyAuthority = "") {
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({
    tabs: [],
    refreshMinutes: 0,
    openBrowser: false,
    dailyAuthority
  }));
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
    child.on("message", m => {
      if (m.type === "yeatle-ready") {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${m.port}`);
      }
    });
    child.once("error", err => { clearTimeout(timeout); reject(err); });
    child.once("exit", () => { clearTimeout(timeout); reject(new Error(logs)); });
  });
}

test("store registers users, hashes passwords, merges device progress, and computes streaks and rankings", t => {
  const dir = tempDir(t);
  const file = path.join(dir, "leaderboard-users.json");
  const store = createLeaderboardStore(file);
  const now = Date.parse("2026-10-27T12:00:00Z");

  const reg1 = store.register({
    username: "yugpoog",
    password: "secretPassword",
    progress: {
      completed: { stems: ["song1", "song2", "song3"], snippet: ["snip1"] },
      stats: { stems: { songsAttempted: 4, correctlyGuessed: 3, totalStars: 14, currentStreak: 3, highestStreak: 3 } },
      daily: {
        "2026-10-25": { id: "v1:2026-10-25:a", attempts: [{ kind: "right", text: "a" }], status: "won" },
        "2026-10-26": { id: "v1:2026-10-26:b", attempts: [{ kind: "right", text: "b" }], status: "won" },
        "2026-10-27": { id: "v1:2026-10-27:c", attempts: [{ kind: "right", text: "c" }], status: "won" }
      },
      karaoke: {
        "yeatle-karaoke-best:song1:medium": { score: 42000, name: "yugpoog" }
      }
    }
  }, now);

  assert.ok(reg1.token);
  assert.equal(reg1.account.username, "yugpoog");
  assert.equal(reg1.account.metrics.dailyStreak, 3);
  assert.equal(reg1.account.metrics.dailyWins, 3);
  assert.equal(reg1.account.metrics.stemsSolved, 3);
  assert.equal(reg1.account.metrics.karaokeTotalScore, 42000);

  // Case-insensitive duplicate registration is rejected
  assert.throws(() => store.register({ username: "YUGPOOG", password: "otherPassword" }, now), /already taken/);
  assert.throws(() => store.login({ username: "yugpoog", password: "wrongPassword" }, now), /Wrong username or password/);

  // Logging in from a second device merges completed songs without wiping existing streaks
  const loginDevice2 = store.login({
    username: "yugpoog",
    password: "secretPassword",
    progress: {
      completed: { stems: ["song3", "song4"] },
      stats: { stems: { songsAttempted: 0, correctlyGuessed: 0, totalStars: 0, currentStreak: 0, highestStreak: 0 } },
      karaoke: {
        "yeatle-karaoke-best:song1:medium": { score: 30000, name: "yugpoog" },
        "yeatle-karaoke-best:song2:hard": { score: 50000, name: "yugpoog" }
      }
    }
  }, now);

  assert.deepEqual(loginDevice2.account.progress.completed.stems, ["song1", "song2", "song3", "song4"]);
  assert.equal(loginDevice2.account.progress.stats.stems.currentStreak, 3, "blank device does not overwrite active streak");
  assert.equal(loginDevice2.account.metrics.stemsSolved, 4);
  assert.equal(loginDevice2.account.metrics.karaokeTotalScore, 92000);
  assert.equal(loginDevice2.account.metrics.karaokeSongs, 2);

  // Register a second player and verify rankings
  const reg2 = store.register({
    username: "fewmet",
    password: "password2",
    progress: {
      completed: { stems: ["song1"] },
      daily: {
        "2026-10-27": { id: "v1:2026-10-27:c", attempts: [{ kind: "right", text: "c" }], status: "won" }
      }
    }
  }, now);

  const boards = store.getLeaderboards(reg2.token, now);
  assert.equal(boards.totalAccounts, 2);
  assert.equal(boards.boards.stems.entries[0].username, "yugpoog");
  assert.equal(boards.boards.stems.entries[1].username, "fewmet");
  assert.equal(boards.boards.stems.viewer.rank, 2);
  assert.equal(boards.boards.daily.entries[0].dailyStreak, 3);
  assert.equal(boards.boards.daily.entries[1].dailyStreak, 1);

  // Missed day expires current streak while preserving bestDailyStreak
  const twoDaysLater = now + 2 * 86400000;
  const expiredMetrics = computeMetrics(loginDevice2.account.progress, twoDaysLater);
  assert.equal(expiredMetrics.dailyStreak, 0);
  assert.equal(expiredMetrics.bestDailyStreak, 3);
});

test("frontend storage helpers collect and restore cross-device progress cleanly", async () => {
  const { collectLocalProgress, applyServerProgress, computeLocalDailyStreak } = await frontendModule;
  const map = new Map();
  const storage = {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); }
  };

  storage.setItem("yeatle:completed", JSON.stringify(["a", "b"]));
  storage.setItem("yeatle:daily:2026-10-26", JSON.stringify({ id: "v1:2026-10-26:a", attempts: [], status: "won" }));
  storage.setItem("yeatle:daily:2026-10-27", JSON.stringify({ id: "v1:2026-10-27:b", attempts: [], status: "lost" }));

  const collected = collectLocalProgress(storage);
  assert.deepEqual(collected.completed.stems, ["a", "b"]);
  assert.equal(computeLocalDailyStreak(storage, Date.parse("2026-10-27T18:00:00Z")), 2);

  const merged = mergeProgress(collected, {
    completed: { stems: ["b", "c"], snippet: ["s1"] },
    prestige: 2,
    karaoke: { "yeatle-karaoke-best:song1:easy": { score: 15000, name: "mat" } }
  });

  const changed = applyServerProgress(merged, storage);
  assert.equal(changed, true);
  assert.deepEqual(JSON.parse(storage.getItem("yeatle:completed")), ["a", "b", "c"]);
  assert.deepEqual(JSON.parse(storage.getItem("yeatle:completed:snippet")), ["s1"]);
  assert.equal(JSON.parse(storage.getItem("yeatle:prestige")), 2);
  assert.equal(JSON.parse(storage.getItem("yeatle-karaoke-best:song1:easy")).score, 15000);
});

test("server leaderboard API syncs accounts and proxies through dailyAuthority when configured", async t => {
  const hostDir = tempDir(t);
  const clientDir = tempDir(t);
  const hostUrl = await startServer(t, hostDir, "");
  const clientUrl = await startServer(t, clientDir, hostUrl);

  // Register on the client server (which proxies to hostUrl)
  const regRes = await fetch(`${clientUrl}/api/account/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "mat",
      password: "yeatfan1",
      progress: {
        completed: { stems: ["flawless", "talk"] },
        daily: { [new Date().toISOString().slice(0, 10)]: { id: "v1:today:flawless", attempts: [], status: "won" } }
      }
    })
  });
  assert.equal(regRes.status, 200);
  const regBody = await regRes.json();
  assert.equal(regBody.scope, "global");
  assert.equal(regBody.account.username, "mat");
  assert.equal(regBody.account.metrics.stemsSolved, 2);
  assert.equal(regBody.account.metrics.dailyStreak, 1);

  // Fetching leaderboard directly from the host shows the account created via the client proxy
  const lbRes = await fetch(`${hostUrl}/api/leaderboard`, {
    headers: { Authorization: `Bearer ${regBody.token}` }
  });
  assert.equal(lbRes.status, 200);
  const lbBody = await lbRes.json();
  assert.equal(lbBody.totalAccounts, 1);
  assert.equal(lbBody.boards.stems.entries[0].username, "mat");
  assert.equal(lbBody.boards.stems.viewer.rank, 1);
});
