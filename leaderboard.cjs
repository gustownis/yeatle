const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MODES = ["stems", "snippet", "snippet:base", "snippet:easy", "snippet:hard", "snippet:extreme"];
const SNIPPET_MODES = ["snippet", "snippet:base", "snippet:easy", "snippet:hard", "snippet:extreme"];
const MAX_TOKENS_PER_USER = 10;

function emptyStats() {
  return { songsAttempted: 0, correctlyGuessed: 0, totalStars: 0, currentStreak: 0, highestStreak: 0 };
}

function emptyProgress() {
  return {
    completed: Object.fromEntries(MODES.map(m => [m, []])),
    stats: Object.fromEntries(MODES.map(m => [m, emptyStats()])),
    prestige: 0,
    daily: {},
    karaoke: {}
  };
}

function validateUsername(raw) {
  const username = String(raw || "").trim();
  if (!/^[a-zA-Z0-9_.-]{2,20}$/.test(username)) {
    throw new Error("Use 2 to 20 letters, numbers, underscores, hyphens, or dots for your username.");
  }
  return { username, key: username.toLowerCase() };
}

function validatePassword(raw) {
  const password = String(raw || "");
  if (password.length < 4 || password.length > 128) {
    throw new Error("Use a password between 4 and 128 characters.");
  }
  return password;
}

function clampInt(value, max = 100000000) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), max);
}

function cleanSongIdList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  for (const item of list) {
    if (typeof item === "string" && item.length > 0 && item.length <= 120) {
      seen.add(item);
      if (seen.size >= 3000) break;
    }
  }
  return [...seen];
}

function cleanStats(raw, minSolved = 0) {
  const src = raw && typeof raw === "object" ? raw : {};
  const correctlyGuessed = Math.max(clampInt(src.correctlyGuessed), minSolved);
  const songsAttempted = Math.max(clampInt(src.songsAttempted), correctlyGuessed);
  const totalStars = clampInt(src.totalStars);
  const currentStreak = clampInt(src.currentStreak);
  const highestStreak = Math.max(clampInt(src.highestStreak), currentStreak);
  return { songsAttempted, correctlyGuessed, totalStars, currentStreak, highestStreak };
}

function cleanDailyEntry(raw, date) {
  if (!raw || typeof raw !== "object" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const status = ["playing", "won", "lost"].includes(raw.status) ? raw.status : null;
  if (!status) return null;
  const id = typeof raw.id === "string" && raw.id.length <= 160 ? raw.id : `v1:${date}:unknown`;
  const attempts = Array.isArray(raw.attempts)
    ? raw.attempts.slice(0, 6).filter(a => a && ["wrong", "skip", "right"].includes(a.kind)).map(a => ({
        kind: a.kind,
        text: typeof a.text === "string" ? a.text.slice(0, 200) : ""
      }))
    : [];
  return { id, attempts, status };
}

function mergeDailyEntry(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const rank = s => (s === "won" ? 3 : s === "lost" ? 2 : 1);
  if (rank(incoming.status) > rank(existing.status)) return incoming;
  if (rank(existing.status) > rank(incoming.status)) return existing;
  return (incoming.attempts?.length || 0) >= (existing.attempts?.length || 0) ? incoming : existing;
}

function mergeProgress(existingRaw, incomingRaw) {
  const base = existingRaw && typeof existingRaw === "object" ? existingRaw : emptyProgress();
  const inc = incomingRaw && typeof incomingRaw === "object" ? incomingRaw : {};

  const completed = {};
  const stats = {};
  for (const mode of MODES) {
    const baseList = cleanSongIdList(base.completed?.[mode]);
    const incList = cleanSongIdList(inc.completed?.[mode]);
    const mergedSet = new Set([...baseList, ...incList]);
    completed[mode] = [...mergedSet];

    const baseStats = cleanStats(base.stats?.[mode], baseList.length);
    const incStats = cleanStats(inc.stats?.[mode], incList.length);
    const clientAheadOrEqual = incStats.songsAttempted >= baseStats.songsAttempted;
    const currentStreak = clientAheadOrEqual ? incStats.currentStreak : baseStats.currentStreak;
    const correctlyGuessed = Math.max(baseStats.correctlyGuessed, incStats.correctlyGuessed, completed[mode].length);
    const songsAttempted = Math.max(baseStats.songsAttempted, incStats.songsAttempted, correctlyGuessed);
    const totalStars = Math.max(baseStats.totalStars, incStats.totalStars);
    const highestStreak = Math.max(baseStats.highestStreak, incStats.highestStreak, currentStreak);
    stats[mode] = { songsAttempted, correctlyGuessed, totalStars, currentStreak, highestStreak };
  }

  const prestige = Math.max(clampInt(base.prestige, 10000), clampInt(inc.prestige, 10000));

  const dailyMap = {};
  for (const source of [base.daily, inc.daily]) {
    if (!source || typeof source !== "object") continue;
    for (const [date, value] of Object.entries(source)) {
      const cleaned = cleanDailyEntry(value, date);
      if (cleaned) dailyMap[date] = mergeDailyEntry(dailyMap[date], cleaned);
    }
  }
  const daily = Object.fromEntries(Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).slice(-400));

  const karaokeMap = {};
  for (const source of [base.karaoke, inc.karaoke]) {
    if (!source || typeof source !== "object") continue;
    for (const [key, value] of Object.entries(source)) {
      if (typeof key !== "string" || !key.startsWith("yeatle-karaoke-best:") || key.length > 180) continue;
      if (!value || typeof value !== "object") continue;
      const score = clampInt(value.score, 10000000);
      if (score <= 0) continue;
      const name = typeof value.name === "string" ? value.name.trim().slice(0, 40) : "Singer";
      if (!karaokeMap[key] || score > karaokeMap[key].score) {
        karaokeMap[key] = { score, name };
      }
    }
  }
  const karaoke = Object.fromEntries(Object.entries(karaokeMap).slice(0, 2000));

  return { completed, stats, prestige, daily, karaoke };
}

function utcDayNumber(dateStr) {
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 86400000) : null;
}

function computeMetrics(progress, now = Date.now()) {
  const p = progress || emptyProgress();
  const dailyEntries = Object.entries(p.daily || {});
  const completedDays = [];
  let dailyWins = 0;
  let dailyPlayed = 0;

  for (const [date, entry] of dailyEntries) {
    if (!entry || (entry.status !== "won" && entry.status !== "lost")) continue;
    const dayNum = utcDayNumber(date);
    if (dayNum === null) continue;
    completedDays.push(dayNum);
    dailyPlayed++;
    if (entry.status === "won") dailyWins++;
  }

  completedDays.sort((a, b) => a - b);
  const uniqueDays = [...new Set(completedDays)];

  let bestDailyStreak = 0;
  let run = 0;
  for (let i = 0; i < uniqueDays.length; i++) {
    if (i > 0 && uniqueDays[i] === uniqueDays[i - 1] + 1) run++;
    else run = 1;
    if (run > bestDailyStreak) bestDailyStreak = run;
  }

  let dailyStreak = 0;
  const todayNum = Math.floor(now / 86400000);
  if (uniqueDays.length > 0) {
    const lastDay = uniqueDays[uniqueDays.length - 1];
    if (lastDay >= todayNum - 1) {
      dailyStreak = 1;
      for (let i = uniqueDays.length - 2; i >= 0; i--) {
        if (uniqueDays[i] === uniqueDays[i + 1] - 1) dailyStreak++;
        else break;
      }
    }
  }

  const stemsSolved = Math.max((p.completed?.stems || []).length, p.stats?.stems?.correctlyGuessed || 0);
  const stemsStars = p.stats?.stems?.totalStars || 0;
  const stemsBestStreak = p.stats?.stems?.highestStreak || 0;

  const snippetCompletedSet = new Set();
  let snippetMaxModeSolved = 0;
  let snippetStars = 0;
  let snippetBestStreak = 0;
  for (const mode of SNIPPET_MODES) {
    for (const id of p.completed?.[mode] || []) snippetCompletedSet.add(id);
    const st = p.stats?.[mode];
    if (st) {
      if (st.correctlyGuessed > snippetMaxModeSolved) snippetMaxModeSolved = st.correctlyGuessed;
      snippetStars += st.totalStars || 0;
      if (st.highestStreak > snippetBestStreak) snippetBestStreak = st.highestStreak;
    }
  }
  const snippetSolved = Math.max(snippetCompletedSet.size, snippetMaxModeSolved);

  const songBestScores = new Map();
  for (const [key, entry] of Object.entries(p.karaoke || {})) {
    const m = /^yeatle-karaoke-best:([^:]+):/.exec(key);
    const songId = m ? m[1] : key;
    const score = clampInt(entry?.score, 10000000);
    if (score > (songBestScores.get(songId) || 0)) {
      songBestScores.set(songId, score);
    }
  }
  let karaokeTotalScore = 0;
  let karaokeBestScore = 0;
  for (const score of songBestScores.values()) {
    karaokeTotalScore += score;
    if (score > karaokeBestScore) karaokeBestScore = score;
  }
  const karaokeSongs = songBestScores.size;

  return {
    dailyStreak,
    bestDailyStreak,
    dailyWins,
    dailyPlayed,
    stemsSolved,
    stemsStars,
    stemsBestStreak,
    snippetSolved,
    snippetStars,
    snippetBestStreak,
    karaokeTotalScore,
    karaokeBestScore,
    karaokeSongs,
    prestige: clampInt(p.prestige, 10000)
  };
}

function createLeaderboardStore(file) {
  let state = { users: {} };
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed && typeof parsed === "object" && parsed.users && typeof parsed.users === "object" && !Array.isArray(parsed.users)) {
        state = parsed;
      }
    } catch (err) {
      console.warn(`[leaderboard] Could not read ${path.basename(file)}: ${err.message}`);
    }
  }

  function save() {
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2));
    fs.renameSync(temp, file);
  }

  function userByToken(token) {
    if (!token || typeof token !== "string") return null;
    for (const user of Object.values(state.users)) {
      if (Array.isArray(user.tokens) && user.tokens.includes(token)) return user;
    }
    return null;
  }

  function issueToken(user) {
    const token = crypto.randomBytes(24).toString("hex");
    if (!Array.isArray(user.tokens)) user.tokens = [];
    user.tokens.push(token);
    if (user.tokens.length > MAX_TOKENS_PER_USER) {
      user.tokens = user.tokens.slice(-MAX_TOKENS_PER_USER);
    }
    return token;
  }

  function verifyPassword(user, password) {
    const expected = Buffer.from(user.hash, "hex");
    const given = crypto.scryptSync(String(password || ""), user.salt, 64);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  }

  function publicProfile(user, now = Date.now()) {
    return {
      username: user.username,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      progress: user.progress,
      metrics: computeMetrics(user.progress, now)
    };
  }

  function register({ username, password, progress }, now = Date.now()) {
    const { username: cleanName, key } = validateUsername(username);
    const cleanPass = validatePassword(password);
    if (state.users[key]) {
      const err = new Error("That username is already taken. Log in if it is yours, or pick another name.");
      err.status = 409;
      throw err;
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(cleanPass, salt, 64).toString("hex");
    const user = {
      username: cleanName,
      key,
      salt,
      hash,
      tokens: [],
      createdAt: now,
      updatedAt: now,
      progress: mergeProgress(emptyProgress(), progress)
    };
    const token = issueToken(user);
    state.users[key] = user;
    save();
    return { token, account: publicProfile(user, now) };
  }

  function login({ username, password, progress }, now = Date.now()) {
    const { username: cleanName, key } = validateUsername(username);
    const cleanPass = validatePassword(password);
    const user = state.users[key];
    if (!user || !verifyPassword(user, cleanPass)) {
      const err = new Error("Wrong username or password.");
      err.status = 401;
      throw err;
    }
    user.username = cleanName;
    if (progress && typeof progress === "object") {
      user.progress = mergeProgress(user.progress, progress);
    }
    user.updatedAt = now;
    const token = issueToken(user);
    save();
    return { token, account: publicProfile(user, now) };
  }

  function sync(token, progress, now = Date.now()) {
    const user = userByToken(token);
    if (!user) {
      const err = new Error("Session expired. Please log in again.");
      err.status = 401;
      throw err;
    }
    user.progress = mergeProgress(user.progress, progress);
    user.updatedAt = now;
    save();
    return { account: publicProfile(user, now) };
  }

  function logout(token) {
    const user = userByToken(token);
    if (user && Array.isArray(user.tokens)) {
      user.tokens = user.tokens.filter(t => t !== token);
      save();
    }
    return { ok: true };
  }

  function me(token, now = Date.now()) {
    const user = userByToken(token);
    if (!user) return { account: null };
    return { account: publicProfile(user, now) };
  }

  function getLeaderboards(token = "", now = Date.now()) {
    const viewerUser = userByToken(token);
    const viewerKey = viewerUser ? viewerUser.key : "";
    const allUsers = Object.values(state.users).map(u => ({
      key: u.key,
      username: u.username,
      metrics: computeMetrics(u.progress, now)
    }));

    const buildBoard = (id, compare, filterFn, mapEntry) => {
      const eligible = allUsers.filter(filterFn).sort((a, b) => compare(a.metrics, b.metrics) || a.username.localeCompare(b.username));
      const ranked = eligible.map((u, index) => ({
        rank: index + 1,
        username: u.username,
        isViewer: u.key === viewerKey,
        dailyStreak: u.metrics.dailyStreak,
        bestDailyStreak: u.metrics.bestDailyStreak,
        prestige: u.metrics.prestige,
        ...mapEntry(u.metrics)
      }));
      const viewerEntry = viewerKey ? ranked.find(r => r.isViewer) || null : null;
      return {
        id,
        totalPlayers: ranked.length,
        entries: ranked.slice(0, 50),
        viewer: viewerEntry
      };
    };

    const boards = {
      daily: buildBoard(
        "daily",
        (a, b) => (b.dailyStreak - a.dailyStreak) || (b.dailyWins - a.dailyWins) || (b.bestDailyStreak - a.bestDailyStreak) || (b.dailyPlayed - a.dailyPlayed),
        u => u.metrics.dailyPlayed > 0 || u.metrics.dailyWins > 0 || u.metrics.dailyStreak > 0 || u.key === viewerKey,
        m => ({
          primary: m.dailyWins,
          secondary: m.bestDailyStreak,
          dailyWins: m.dailyWins,
          dailyPlayed: m.dailyPlayed
        })
      ),
      stems: buildBoard(
        "stems",
        (a, b) => (b.stemsSolved - a.stemsSolved) || (b.prestige - a.prestige) || (b.stemsStars - a.stemsStars) || (b.stemsBestStreak - a.stemsBestStreak),
        u => u.metrics.stemsSolved > 0 || u.metrics.prestige > 0 || u.key === viewerKey,
        m => ({
          primary: m.stemsSolved,
          secondary: m.stemsStars,
          bestStreak: m.stemsBestStreak
        })
      ),
      snippet: buildBoard(
        "snippet",
        (a, b) => (b.snippetSolved - a.snippetSolved) || (b.prestige - a.prestige) || (b.snippetStars - a.snippetStars) || (b.snippetBestStreak - a.snippetBestStreak),
        u => u.metrics.snippetSolved > 0 || u.metrics.prestige > 0 || u.key === viewerKey,
        m => ({
          primary: m.snippetSolved,
          secondary: m.snippetStars,
          bestStreak: m.snippetBestStreak
        })
      ),
      karaoke: buildBoard(
        "karaoke",
        (a, b) => (b.karaokeTotalScore - a.karaokeTotalScore) || (b.karaokeSongs - a.karaokeSongs) || (b.karaokeBestScore - a.karaokeBestScore),
        u => u.metrics.karaokeTotalScore > 0 || u.metrics.karaokeSongs > 0 || u.key === viewerKey,
        m => ({
          primary: m.karaokeTotalScore,
          secondary: m.karaokeSongs,
          bestScore: m.karaokeBestScore
        })
      )
    };

    return {
      serverTime: now,
      totalAccounts: allUsers.length,
      boards,
      viewer: viewerUser ? publicProfile(viewerUser, now) : null
    };
  }

  return {
    register,
    login,
    sync,
    logout,
    me,
    getLeaderboards
  };
}

module.exports = {
  MODES,
  SNIPPET_MODES,
  validateUsername,
  validatePassword,
  mergeProgress,
  computeMetrics,
  createLeaderboardStore
};
