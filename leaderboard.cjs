const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);

const MODES = ["stems", "snippet", "snippet:base", "snippet:easy", "snippet:hard", "snippet:extreme"];
const SNIPPET_MODES = ["snippet", "snippet:base", "snippet:easy", "snippet:hard", "snippet:extreme"];
const MAX_TOKENS_PER_USER = 10;
const LOGIN_FAILS_BEFORE_LOCK = 5;
const LOGIN_LOCK_MS = 60000;
const DAY_MS = 86400000;
const BLOCKED_USERNAME_MESSAGE = "Error Username cannot be chosen because the song is dogshit";
const MAX_USERNAME_FILTERS = 1000;

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

// Filters ignore case and the separators allowed in usernames, so "bad" also blocks "B.a_d-guy".
const filterForm = text => String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function cleanUsernameFilter(raw) {
  const word = String(raw || "").trim().toLowerCase();
  if (!filterForm(word) || word.length > 40) throw httpError("Use 1 to 40 characters with at least one letter or number for a filtered username.", 400);
  return word;
}

function usernameMatchesFilters(username, filters) {
  const name = filterForm(username);
  return filters.some(word => {
    const form = filterForm(word);
    return form && name.includes(form);
  });
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

function cleanStats(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const correctlyGuessed = clampInt(src.correctlyGuessed);
  const songsAttempted = Math.max(clampInt(src.songsAttempted), correctlyGuessed);
  const totalStars = clampInt(src.totalStars);
  const currentStreak = clampInt(src.currentStreak);
  const highestStreak = Math.max(clampInt(src.highestStreak), currentStreak);
  return { songsAttempted, correctlyGuessed, totalStars, currentStreak, highestStreak };
}

function utcDayNumber(dateStr) {
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / DAY_MS) : null;
}

// `verified` is never read from a client. The server sets it when it first receives a
// finished Daily on that UTC day or the day after, so old days cannot be backfilled.
function cleanDailyEntry(raw, date, keepVerified) {
  if (!raw || typeof raw !== "object" || utcDayNumber(date) === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!["playing", "won", "lost"].includes(raw.status)) return null;
  const id = typeof raw.id === "string" && raw.id.length <= 160 ? raw.id : `v1:${date}:unknown`;
  const attempts = Array.isArray(raw.attempts)
    ? raw.attempts.slice(0, 6).filter(a => a && ["wrong", "skip", "right"].includes(a.kind)).map(a => ({
        kind: a.kind,
        text: typeof a.text === "string" ? a.text.slice(0, 200) : ""
      }))
    : [];
  const entry = { id, attempts, status: raw.status };
  // Match the game's own rules (snippet-rules.mjs restoreRound): a win ends on the right
  // guess, a loss uses all six clips, and an unfinished round has no right guess.
  const right = attempts.findIndex(a => a.kind === "right");
  if ((entry.status === "won" && (right < 0 || right !== attempts.length - 1)) ||
      (entry.status !== "won" && right !== -1) ||
      (entry.status === "lost" && attempts.length !== 6)) return null;
  if (keepVerified && raw.verified === true) entry.verified = true;
  return entry;
}

const finished = entry => entry && (entry.status === "won" || entry.status === "lost");

function mergeProgress(existingRaw, incomingRaw, now = Date.now()) {
  const base = existingRaw && typeof existingRaw === "object" ? existingRaw : emptyProgress();
  const inc = incomingRaw && typeof incomingRaw === "object" ? incomingRaw : {};

  const basePrestige = clampInt(base.prestige, 10000);
  const incPrestige = clampInt(inc.prestige, 10000);

  // Prestige deliberately clears completed songs. A device that prestiged is the newest
  // record; a device still on an older prestige is stale and must not restore old songs.
  const completed = {};
  const stats = {};
  for (const mode of MODES) {
    const baseList = cleanSongIdList(base.completed?.[mode]);
    const incList = cleanSongIdList(inc.completed?.[mode]);
    completed[mode] = incPrestige > basePrestige ? incList
      : incPrestige < basePrestige ? baseList
      : [...new Set([...baseList, ...incList])];

    // Stats are self-reported and only synced for display; rankings never use them.
    const baseStats = cleanStats(base.stats?.[mode]);
    const incStats = cleanStats(inc.stats?.[mode]);
    const currentStreak = incStats.songsAttempted >= baseStats.songsAttempted ? incStats.currentStreak : baseStats.currentStreak;
    const correctlyGuessed = Math.max(baseStats.correctlyGuessed, incStats.correctlyGuessed);
    stats[mode] = {
      songsAttempted: Math.max(baseStats.songsAttempted, incStats.songsAttempted, correctlyGuessed),
      correctlyGuessed,
      totalStars: Math.max(baseStats.totalStars, incStats.totalStars),
      currentStreak,
      highestStreak: Math.max(baseStats.highestStreak, incStats.highestStreak, currentStreak)
    };
  }

  const today = Math.floor(now / DAY_MS);
  const dailyMap = {};
  if (base.daily && typeof base.daily === "object") {
    for (const [date, value] of Object.entries(base.daily)) {
      const cleaned = cleanDailyEntry(value, date, true);
      if (cleaned) dailyMap[date] = cleaned;
    }
  }
  if (inc.daily && typeof inc.daily === "object") {
    for (const [date, value] of Object.entries(inc.daily)) {
      const cleaned = cleanDailyEntry(value, date, false);
      if (!cleaned) continue;
      const age = today - utcDayNumber(date);
      if (age < 0) continue; // a future Daily cannot have been played
      const existing = dailyMap[date];
      if (finished(existing)) continue; // a finished Daily never changes result
      if (!existing || finished(cleaned) || cleaned.attempts.length >= existing.attempts.length) {
        if (finished(cleaned) && age <= 1) cleaned.verified = true;
        dailyMap[date] = cleaned;
      }
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
      if (!karaokeMap[key] || score > karaokeMap[key].score) karaokeMap[key] = { score, name };
    }
  }
  const karaoke = Object.fromEntries(Object.entries(karaokeMap).slice(0, 2000));

  return { completed, stats, prestige: Math.max(basePrestige, incPrestige), daily, karaoke };
}

// canonicalSongId maps a saved id to the catalog's current id, or null for an unknown id.
function countSolved(ids, canonicalSongId) {
  const solved = new Set();
  for (const id of ids) {
    const canonical = canonicalSongId ? canonicalSongId(id) : id;
    if (canonical) solved.add(canonical);
  }
  return solved.size;
}

function computeMetrics(progress, now = Date.now(), canonicalSongId = null) {
  const p = progress || emptyProgress();
  const days = [];
  let dailyWins = 0;
  let dailyPlayed = 0;
  for (const [date, entry] of Object.entries(p.daily || {})) {
    if (!finished(entry) || entry.verified !== true) continue;
    const day = utcDayNumber(date);
    if (day === null) continue;
    days.push(day);
    dailyPlayed++;
    if (entry.status === "won") dailyWins++;
  }
  const uniqueDays = [...new Set(days)].sort((a, b) => a - b);

  let bestDailyStreak = 0;
  let run = 0;
  for (let i = 0; i < uniqueDays.length; i++) {
    run = i > 0 && uniqueDays[i] === uniqueDays[i - 1] + 1 ? run + 1 : 1;
    if (run > bestDailyStreak) bestDailyStreak = run;
  }

  let dailyStreak = 0;
  const today = Math.floor(now / DAY_MS);
  if (uniqueDays.length && uniqueDays[uniqueDays.length - 1] >= today - 1) {
    dailyStreak = 1;
    for (let i = uniqueDays.length - 2; i >= 0 && uniqueDays[i] === uniqueDays[i + 1] - 1; i--) dailyStreak++;
  }

  const stemsSolved = countSolved(p.completed?.stems || [], canonicalSongId);
  const snippetSolved = countSolved(SNIPPET_MODES.flatMap(mode => p.completed?.[mode] || []), canonicalSongId);

  const songBestScores = new Map();
  for (const [key, entry] of Object.entries(p.karaoke || {})) {
    const m = /^yeatle-karaoke-best:(.+):(easy|medium|hard|expert)(?::wpm)?$/.exec(key) || /^yeatle-karaoke-best:([^:]+):/.exec(key);
    const rawId = m ? m[1] : key;
    const songId = canonicalSongId ? canonicalSongId(rawId) : rawId;
    if (!songId) continue;
    const score = clampInt(entry?.score, 10000000);
    if (score > (songBestScores.get(songId) || 0)) songBestScores.set(songId, score);
  }
  let karaokeTotalScore = 0;
  let karaokeBestScore = 0;
  for (const score of songBestScores.values()) {
    karaokeTotalScore += score;
    if (score > karaokeBestScore) karaokeBestScore = score;
  }

  return {
    dailyStreak,
    bestDailyStreak,
    dailyWins,
    dailyPlayed,
    stemsSolved,
    snippetSolved,
    karaokeTotalScore,
    karaokeBestScore,
    karaokeSongs: songBestScores.size,
    prestige: clampInt(p.prestige, 10000)
  };
}

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function readJsonFile(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    // Refuse to start over an unreadable file: saving would erase what it holds.
    throw new Error(`Could not read ${path.basename(file)} (${err.message}). Restore or fix it before restarting.`);
  }
}

function writeJsonFile(file, value) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value));
  fs.renameSync(temp, file);
}

function createLeaderboardStore(file, { canonicalSongId = null, filtersFile = path.join(path.dirname(file), "username-filters.json") } = {}) {
  let state = { users: {} };
  const parsed = readJsonFile(file, null);
  if (parsed && typeof parsed === "object" && parsed.users && typeof parsed.users === "object" && !Array.isArray(parsed.users)) {
    state = parsed;
  }
  const savedFilters = readJsonFile(filtersFile, {});
  let usernameFilters = Array.isArray(savedFilters?.filters)
    ? [...new Set(savedFilters.filters.filter(w => typeof w === "string" && filterForm(w)).map(w => w.trim().toLowerCase()))]
    : [];

  const tokenIndex = new Map();
  for (const user of Object.values(state.users)) {
    for (const token of user.tokens || []) tokenIndex.set(token, user);
  }
  const loginFailures = new Map(); // username key -> { count, lockedUntil }

  const save = () => writeJsonFile(file, state);

  function checkNotFiltered(username) {
    if (usernameMatchesFilters(username, usernameFilters)) throw httpError(BLOCKED_USERNAME_MESSAGE, 400);
  }

  const userByToken = token => (token && typeof token === "string" ? tokenIndex.get(token) || null : null);

  function issueToken(user) {
    const token = crypto.randomBytes(24).toString("hex");
    if (!Array.isArray(user.tokens)) user.tokens = [];
    user.tokens.push(token);
    tokenIndex.set(token, user);
    while (user.tokens.length > MAX_TOKENS_PER_USER) tokenIndex.delete(user.tokens.shift());
    return token;
  }

  async function verifyPassword(user, password) {
    const expected = Buffer.from(user.hash, "hex");
    const given = await scrypt(String(password || ""), user.salt, 64);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  }

  function publicProfile(user, now = Date.now()) {
    return {
      username: user.username,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      progress: user.progress,
      metrics: computeMetrics(user.progress, now, canonicalSongId)
    };
  }

  async function register({ username, password, progress }, now = Date.now()) {
    const { username: cleanName, key } = validateUsername(username);
    checkNotFiltered(cleanName);
    const cleanPass = validatePassword(password);
    if (state.users[key]) throw httpError("That username is already taken. Log in if it is yours, or pick another name.", 409);
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = (await scrypt(cleanPass, salt, 64)).toString("hex");
    // Re-check after the asynchronous hash so two simultaneous sign-ups cannot share a name.
    if (state.users[key]) throw httpError("That username is already taken. Log in if it is yours, or pick another name.", 409);
    const user = { username: cleanName, key, salt, hash, tokens: [], createdAt: now, updatedAt: now, progress: mergeProgress(emptyProgress(), progress, now) };
    const token = issueToken(user);
    state.users[key] = user;
    save();
    return { token, account: publicProfile(user, now) };
  }

  async function login({ username, password, progress }, now = Date.now()) {
    const { key } = validateUsername(username);
    const cleanPass = validatePassword(password);
    const failures = loginFailures.get(key);
    if (failures && failures.lockedUntil > now) {
      throw httpError(`Too many wrong passwords. Wait ${Math.ceil((failures.lockedUntil - now) / 1000)} seconds.`, 429);
    }
    const user = state.users[key];
    if (!user || !(await verifyPassword(user, cleanPass))) {
      const count = (failures?.count || 0) + 1;
      loginFailures.set(key, count >= LOGIN_FAILS_BEFORE_LOCK ? { count: 0, lockedUntil: now + LOGIN_LOCK_MS } : { count, lockedUntil: 0 });
      throw httpError("Wrong username or password.", 401);
    }
    loginFailures.delete(key);
    if (progress && typeof progress === "object") user.progress = mergeProgress(user.progress, progress, now);
    user.updatedAt = now;
    const token = issueToken(user);
    save();
    return { token, account: publicProfile(user, now) };
  }

  function sync(token, progress, now = Date.now()) {
    const user = userByToken(token);
    if (!user) throw httpError("Session expired. Please log in again.", 401);
    user.progress = mergeProgress(user.progress, progress, now);
    user.updatedAt = now;
    save();
    return { account: publicProfile(user, now) };
  }

  // Existing sessions stay signed in: tokens point at the account, not at its name.
  function rename(token, newUsername, now = Date.now()) {
    const user = userByToken(token);
    if (!user) throw httpError("Session expired. Please log in again.", 401);
    const { username: cleanName, key } = validateUsername(newUsername);
    checkNotFiltered(cleanName);
    if (key !== user.key && state.users[key]) throw httpError("That username is already taken. Pick another name.", 409);
    delete state.users[user.key];
    user.username = cleanName;
    user.key = key;
    user.updatedAt = now;
    state.users[key] = user;
    save();
    return { account: publicProfile(user, now) };
  }

  function getUsernameFilters() {
    const filters = [...usernameFilters].sort();
    const matches = Object.values(state.users)
      .filter(u => usernameMatchesFilters(u.username, filters))
      .map(u => u.username)
      .sort((a, b) => a.localeCompare(b));
    return { filters, matches };
  }

  function setUsernameFilter(raw, blocked) {
    const word = cleanUsernameFilter(raw);
    const next = usernameFilters.filter(w => w !== word);
    if (blocked) {
      if (next.length >= MAX_USERNAME_FILTERS) throw httpError(`Keep the list to ${MAX_USERNAME_FILTERS} filtered usernames or fewer.`, 400);
      next.push(word);
    }
    usernameFilters = next;
    writeJsonFile(filtersFile, { filters: usernameFilters });
    return getUsernameFilters();
  }

  function logout(token) {
    const user = userByToken(token);
    if (user) {
      user.tokens = (user.tokens || []).filter(t => t !== token);
      tokenIndex.delete(token);
      save();
    }
    return { ok: true };
  }

  function me(token, now = Date.now()) {
    const user = userByToken(token);
    return { account: user ? publicProfile(user, now) : null };
  }

  function getLeaderboards(token = "", now = Date.now()) {
    const viewerUser = userByToken(token);
    const viewerKey = viewerUser ? viewerUser.key : "";
    const allUsers = Object.values(state.users).map(u => ({ key: u.key, username: u.username, metrics: computeMetrics(u.progress, now, canonicalSongId) }));

    const buildBoard = (id, compare, include, mapEntry) => {
      const ranked = allUsers.filter(u => include(u.metrics) || u.key === viewerKey)
        .sort((a, b) => compare(a.metrics, b.metrics) || a.username.localeCompare(b.username))
        .map((u, index) => ({
          rank: index + 1,
          username: u.username,
          isViewer: u.key === viewerKey,
          dailyStreak: u.metrics.dailyStreak,
          bestDailyStreak: u.metrics.bestDailyStreak,
          prestige: u.metrics.prestige,
          ...mapEntry(u.metrics)
        }));
      return { id, totalPlayers: ranked.length, entries: ranked.slice(0, 50), viewer: viewerKey ? ranked.find(r => r.isViewer) || null : null };
    };

    const boards = {
      daily: buildBoard("daily",
        (a, b) => (b.dailyStreak - a.dailyStreak) || (b.dailyWins - a.dailyWins) || (b.bestDailyStreak - a.bestDailyStreak) || (b.dailyPlayed - a.dailyPlayed),
        m => m.dailyPlayed > 0,
        m => ({ primary: m.dailyWins, secondary: m.bestDailyStreak, dailyWins: m.dailyWins, dailyPlayed: m.dailyPlayed })),
      stems: buildBoard("stems",
        (a, b) => (b.stemsSolved - a.stemsSolved) || (b.prestige - a.prestige),
        m => m.stemsSolved > 0 || m.prestige > 0,
        m => ({ primary: m.stemsSolved, secondary: 0 })),
      snippet: buildBoard("snippet",
        (a, b) => (b.snippetSolved - a.snippetSolved) || (b.prestige - a.prestige),
        m => m.snippetSolved > 0 || m.prestige > 0,
        m => ({ primary: m.snippetSolved, secondary: 0 })),
      karaoke: buildBoard("karaoke",
        (a, b) => (b.karaokeTotalScore - a.karaokeTotalScore) || (b.karaokeSongs - a.karaokeSongs) || (b.karaokeBestScore - a.karaokeBestScore),
        m => m.karaokeTotalScore > 0,
        m => ({ primary: m.karaokeTotalScore, secondary: m.karaokeSongs, bestScore: m.karaokeBestScore }))
    };

    return { serverTime: now, totalAccounts: allUsers.length, boards, viewer: viewerUser ? publicProfile(viewerUser, now) : null };
  }

  return { register, login, sync, rename, logout, me, getLeaderboards, getUsernameFilters, setUsernameFilter };
}

module.exports = {
  BLOCKED_USERNAME_MESSAGE,
  MODES,
  SNIPPET_MODES,
  validateUsername,
  validatePassword,
  usernameMatchesFilters,
  mergeProgress,
  computeMetrics,
  createLeaderboardStore
};
