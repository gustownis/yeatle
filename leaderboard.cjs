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
// One documented answer for every banned account or device: HTTP 403 with
// { banned: true, error }. It never says why, or which address or device matched.
const BANNED_MESSAGE = "This account or device is banned from Yeatle.";
// An address shared with a banned account only stops sign-ups and sign-ins; plain play
// stays open, so other people on the same school or mobile network can still play.
const NETWORK_BLOCKED_MESSAGE = "New accounts and sign-ins are blocked on this network right now. You can still play without an account.";
const TOKEN_IDLE_MS = 180 * DAY_MS;
const SEEN_MS = 90 * DAY_MS;
const SEEN_MAX = 20;
const DEFAULT_IP_BLOCK_MS = 30 * DAY_MS;
const MAX_BAN_REASON = 500;
// Ranked Stems/Snippets solves grow at most this fast. Faster than anyone can play a
// round, so only a first sign-in with a large local backlog is credited over a few hours.
const SOLVE_CREDIT_PER_HOUR = 120;
const SOLVE_CREDIT_BURST = 300;
const KARAOKE_RUN_MS = 30 * 60000;
const KARAOKE_MAX_SECONDS = 20 * 60;
const KARAOKE_DIFFICULTIES = ["easy", "medium", "hard", "expert"];
const MAX_FLAGS = 500;

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

// Always blocked, whatever the admin list says. Names are checked after undoing number
// swaps (4 -> a, 1 -> i or l, 3 -> e, 0 -> o, ...) and collapsing doubled letters, so
// "Alive_4_A_Min", "aliveforaminute", "T3rrrif1ed" and "reguler-persn" are all caught.
const BUILT_IN_BLOCKED_USERNAMES = [
  { label: "alive 4 a min", pattern: /al[iy]v[e]?(?:f[ou]?r)?a?m[iey]n/ },
  { label: "regular person", pattern: /reg(?:[ue]?l[aeu]?r)?p[eu]?r?s[oau]?n/ },
  { label: "terrified", pattern: /t[aeiu]r[iy]f[iy]?e?d|t[aeiu]r[iy]f[iy]e/ }
];
const LEET = { 0: "o", 2: "z", 3: "e", 4: "a", 5: "s", 6: "g", 7: "t", 8: "b", 9: "g" };

function builtInForms(username) {
  const base = filterForm(username);
  return ["i", "l"].map(one => base.replace(/[0-9]/g, d => (d === "1" ? one : LEET[d])).replace(/(.)\1+/g, "$1"));
}

function isBuiltInBlockedUsername(username) {
  const forms = builtInForms(username);
  return BUILT_IN_BLOCKED_USERNAMES.some(({ pattern }) => forms.some(form => pattern.test(form)));
}

function usernameMatchesFilters(username, filters) {
  if (isBuiltInBlockedUsername(username)) return true;
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

// checkDailyWin(date, entry), when given, confirms a won Daily's right guess against that
// day's answer. A win it rejects is kept for the player's own history but never verified.
function mergeProgress(existingRaw, incomingRaw, now = Date.now(), { checkDailyWin = null } = {}) {
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
        if (finished(cleaned) && age <= 1 && (cleaned.status !== "won" || !checkDailyWin || checkDailyWin(date, cleaned))) cleaned.verified = true;
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

// `ranked`, when given, holds what the server itself verified for the account: karaoke
// best scores from verified runs and credited solve and prestige counts. Rankings then use
// it instead of the self-reported progress, which still syncs for display.
function computeMetrics(progress, now = Date.now(), canonicalSongId = null, ranked = null) {
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

  let stemsSolved = countSolved(p.completed?.stems || [], canonicalSongId);
  let snippetSolved = countSolved(SNIPPET_MODES.flatMap(mode => p.completed?.[mode] || []), canonicalSongId);
  let prestige = clampInt(p.prestige, 10000);
  if (ranked) {
    stemsSolved = Math.min(stemsSolved, ranked.stems ?? stemsSolved);
    snippetSolved = Math.min(snippetSolved, ranked.snippet ?? snippetSolved);
    prestige = Math.min(prestige, ranked.prestige ?? prestige);
  }

  const songBestScores = new Map();
  for (const [key, entry] of Object.entries(ranked ? ranked.karaoke || {} : p.karaoke || {})) {
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
    prestige
  };
}

const sha256 = text => crypto.createHash("sha256").update(text).digest("hex");

function isEmptyProgress(progress) {
  return JSON.stringify(progress) === JSON.stringify(emptyProgress());
}

// Adds what the bucket allows of `actual` to `ranked`. A drop (prestige, a removed song)
// lowers the ranked count straight away.
function creditBucket(bucket, actual, now) {
  const b = bucket && typeof bucket === "object" ? bucket : { ranked: 0, tokens: SOLVE_CREDIT_BURST, at: now };
  const tokens = Math.min(SOLVE_CREDIT_BURST, (Number(b.tokens) || 0) + Math.max(0, now - (Number(b.at) || now)) * SOLVE_CREDIT_PER_HOUR / 3600000);
  let ranked = Math.min(clampInt(b.ranked, 1000000), actual);
  const gain = Math.min(actual - ranked, Math.floor(tokens));
  ranked += Math.max(0, gain);
  return { ranked, tokens: tokens - Math.max(0, gain), at: now };
}

// A finite number in [lo, hi], or NaN.
const num = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : NaN);

// Checks the shape of a submitted karaoke trace and returns it cleaned, or throws.
function cleanTrace(raw, durationLimit) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 1500) throw httpError("This karaoke run has no usable phrase list.", 400);
  let lastStart = -1;
  return raw.map(ph => {
    if (!Array.isArray(ph) || ph.length < 4) throw httpError("This karaoke run has a malformed phrase.", 400);
    const start = num(ph[0], 0, durationLimit), end = num(ph[1], 0, durationLimit + 1), dur = num(ph[2], 0.001, 120);
    const acc = ph[3] === null ? null : num(ph[3], 0, 1);
    if ([start, end, dur].some(Number.isNaN) || Number.isNaN(acc) || end < start || dur > end - start + 0.01 || start < lastStart) {
      throw httpError("This karaoke run has phrases that don't fit the song.", 400);
    }
    lastStart = start;
    const opt = (v, lo, hi) => (v === null || v === undefined ? null : Number.isNaN(num(v, lo, hi)) ? null : v);
    return [start, end, dur, acc, opt(ph[4], -1, 1), opt(ph[5], 0, 600), opt(ph[6], -1000, 1000)];
  });
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


const bannedError = () => Object.assign(httpError(BANNED_MESSAGE, 403), { banned: true });
const networkBlockedError = () => Object.assign(httpError(NETWORK_BLOCKED_MESSAGE, 403), { banned: true });

// Options:
//   canonicalSongId(id)  catalog id for a saved id, or null for an unknown song
//   catalogReady()       true once the song catalog has loaded (solve credit waits for it)
//   songSeconds(id)      the song's length in seconds when the catalog knows it, else null
//   checkDailyWin(date, entry)  confirms a won Daily against that day's answer
//   ipBlockMs            how long a banned account's addresses stay restricted
//   pendingBans          [{ username, reason }] to ban once, the first time this store sees them
function createLeaderboardStore(file, {
  canonicalSongId = null,
  catalogReady = () => true,
  songSeconds = () => null,
  checkDailyWin = null,
  ipBlockMs = DEFAULT_IP_BLOCK_MS,
  pendingBans = [],
  filtersFile = path.join(path.dirname(file), "username-filters.json"),
  bansFile = path.join(path.dirname(file), "leaderboard-bans.json")
} = {}) {
  let state = { users: {} };
  const parsed = readJsonFile(file, null);
  if (parsed && typeof parsed === "object" && parsed.users && typeof parsed.users === "object" && !Array.isArray(parsed.users)) {
    state = parsed;
  }
  const savedFilters = readJsonFile(filtersFile, {});
  let usernameFilters = Array.isArray(savedFilters?.filters)
    ? [...new Set(savedFilters.filters.filter(w => typeof w === "string" && filterForm(w)).map(w => w.trim().toLowerCase()))]
    : [];
  const savedBans = readJsonFile(bansFile, {});
  const moderation = {
    bans: savedBans?.bans && typeof savedBans.bans === "object" ? savedBans.bans : {},
    ipBlocks: savedBans?.ipBlocks && typeof savedBans.ipBlocks === "object" ? savedBans.ipBlocks : {},
    deviceBlocks: savedBans?.deviceBlocks && typeof savedBans.deviceBlocks === "object" ? savedBans.deviceBlocks : {},
    flags: Array.isArray(savedBans?.flags) ? savedBans.flags : [],
    appliedPending: Array.isArray(savedBans?.appliedPending) ? savedBans.appliedPending : []
  };

  const save = () => writeJsonFile(file, state);
  const saveModeration = (now = Date.now()) => {
    for (const [hash, block] of Object.entries(moderation.ipBlocks)) if (!(block.until > now)) delete moderation.ipBlocks[hash];
    writeJsonFile(bansFile, moderation);
  };

  const freshRanked = now => ({ karaoke: {}, stems: { ranked: 0, tokens: SOLVE_CREDIT_BURST, at: now }, snippet: { ranked: 0, tokens: SOLVE_CREDIT_BURST, at: now }, prestige: { ranked: 0, at: now } });

  // Older records get a stable id, token activity times and ranked data. Usernames, tokens
  // and progress are untouched. Karaoke bests from before verified runs are kept aside in
  // legacyKaraoke, and solves already on the account are credited in full once the catalog
  // has loaded.
  let migrated = false;
  const loadedAt = Date.now();
  for (const user of Object.values(state.users)) {
    if (typeof user.id !== "string" || !/^[a-f0-9]{24}$/.test(user.id)) { user.id = crypto.randomBytes(12).toString("hex"); migrated = true; }
    if (!user.tokenUsed || typeof user.tokenUsed !== "object") { user.tokenUsed = Object.fromEntries((user.tokens || []).map(t => [t, loadedAt])); migrated = true; }
    if (!user.ranked || typeof user.ranked !== "object") {
      user.ranked = { karaoke: {}, grandfather: true };
      user.legacyKaraoke = user.progress?.karaoke && typeof user.progress.karaoke === "object" ? { ...user.progress.karaoke } : {};
      migrated = true;
    }
  }
  const byId = new Map(Object.values(state.users).map(u => [u.id, u]));

  // A ban is saved before the account is reset. If the server stopped in between, finish
  // the reset now: the ban record already holds the progress snapshot.
  for (const [accountId, ban] of Object.entries(moderation.bans)) {
    const user = byId.get(accountId);
    if (user && ((user.tokens || []).length || !isEmptyProgress(user.progress))) {
      user.tokens = []; user.tokenUsed = {}; user.progress = emptyProgress(); user.ranked = freshRanked(ban.bannedAt || loadedAt); delete user.legacyKaraoke;
      migrated = true;
    }
  }
  if (migrated) save();

  const tokenIndex = new Map();
  for (const user of Object.values(state.users)) {
    for (const token of user.tokens || []) tokenIndex.set(token, user);
  }
  // Sessions an account had when it was banned answer with the banned response.
  const revokedTokens = new Map();
  for (const [accountId, ban] of Object.entries(moderation.bans)) for (const hash of ban.tokenHashes || []) revokedTokens.set(hash, accountId);

  const loginFailures = new Map(); // username key + address -> { count, lockedUntil }
  const karaokeRuns = new Map(); // run id -> run
  const dummySalt = crypto.randomBytes(16).toString("hex");

  function checkNotFiltered(username) {
    if (usernameMatchesFilters(username, usernameFilters)) throw httpError(BLOCKED_USERNAME_MESSAGE, 400);
  }

  const isBanned = user => Boolean(user && moderation.bans[user.id]);

  // ctx carries this request's keyed address and device hashes (either may be empty).
  function checkDevice(ctx) {
    if (ctx?.deviceHash && moderation.deviceBlocks[ctx.deviceHash]) throw bannedError();
  }
  function checkNetwork(ctx, now) {
    if (ctx?.ipHash && moderation.ipBlocks[ctx.ipHash]?.until > now) throw networkBlockedError();
  }

  function recordSeen(user, ctx, now) {
    let changed = false;
    if (!user.seen || typeof user.seen !== "object") { user.seen = { ips: {}, devices: {} }; changed = true; }
    for (const [kind, hash] of [["ips", ctx?.ipHash], ["devices", ctx?.deviceHash]]) {
      const map = user.seen[kind] || (user.seen[kind] = {});
      if (hash && !(map[hash] > now - DAY_MS)) { map[hash] = now; changed = true; }
      const kept = Object.entries(map).filter(([, at]) => at > now - SEEN_MS).sort((a, b) => b[1] - a[1]).slice(0, SEEN_MAX);
      if (kept.length !== Object.keys(map).length) { user.seen[kind] = Object.fromEntries(kept); changed = true; }
    }
    return changed;
  }

  // The signed-in account for a token, or an error. Touches the session's last use and the
  // account's recent addresses and devices; returns whether the record changed.
  function authUser(token, ctx, now, { optional = false } = {}) {
    checkDevice(ctx);
    if (token && typeof token === "string" && revokedTokens.has(sha256(token))) throw bannedError();
    const user = token && typeof token === "string" ? tokenIndex.get(token) || null : null;
    if (!user || now - (user.tokenUsed?.[token] ?? now) > TOKEN_IDLE_MS) {
      if (user) dropToken(user, token);
      if (optional) return { user: null, changed: Boolean(user) };
      throw httpError("Session expired. Please log in again.", 401);
    }
    if (isBanned(user)) throw bannedError();
    let changed = recordSeen(user, ctx, now);
    if (!(user.tokenUsed[token] > now - DAY_MS)) { user.tokenUsed[token] = now; changed = true; }
    return { user, changed };
  }

  function dropToken(user, token) {
    user.tokens = (user.tokens || []).filter(t => t !== token);
    if (user.tokenUsed) delete user.tokenUsed[token];
    tokenIndex.delete(token);
  }

  function issueToken(user, now) {
    const token = crypto.randomBytes(24).toString("hex");
    if (!Array.isArray(user.tokens)) user.tokens = [];
    if (!user.tokenUsed) user.tokenUsed = {};
    user.tokens.push(token);
    user.tokenUsed[token] = now;
    tokenIndex.set(token, user);
    while (user.tokens.length > MAX_TOKENS_PER_USER) {
      const old = user.tokens.shift();
      delete user.tokenUsed[old];
      tokenIndex.delete(old);
    }
    return token;
  }

  async function verifyPassword(user, password) {
    const expected = Buffer.from(user.hash, "hex");
    const given = await scrypt(String(password || ""), user.salt, 64);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  }

  // Credits newly solved songs and prestige at a bounded rate. Waits for the catalog, so
  // ids can be checked before anything is credited.
  function creditProgress(user, now) {
    if (!catalogReady()) return;
    const stems = countSolved(user.progress.completed?.stems || [], canonicalSongId);
    const snippet = countSolved(SNIPPET_MODES.flatMap(mode => user.progress.completed?.[mode] || []), canonicalSongId);
    const prestige = clampInt(user.progress.prestige, 10000);
    const r = user.ranked;
    if (r.grandfather) {
      r.stems = { ranked: stems, tokens: SOLVE_CREDIT_BURST, at: now };
      r.snippet = { ranked: snippet, tokens: SOLVE_CREDIT_BURST, at: now };
      r.prestige = { ranked: prestige, at: now };
      delete r.grandfather;
      return;
    }
    r.stems = creditBucket(r.stems, stems, now);
    r.snippet = creditBucket(r.snippet, snippet, now);
    // A prestige means finishing the whole catalog again, so a day apart is generous.
    const p = r.prestige || { ranked: 0, at: now };
    if (prestige < p.ranked) r.prestige = { ranked: prestige, at: now };
    else if (prestige > p.ranked && (p.ranked === 0 || now - p.at >= DAY_MS)) r.prestige = { ranked: p.ranked + 1, at: now };
  }

  function rankedFor(user) {
    const r = user.ranked || {};
    // Karaoke bests from before verified runs (legacyKaraoke) are kept but never ranked.
    const karaoke = { ...(r.karaoke || {}) };
    if (r.grandfather) return { karaoke };
    return { karaoke, stems: r.stems?.ranked ?? 0, snippet: r.snippet?.ranked ?? 0, prestige: r.prestige?.ranked ?? 0 };
  }

  const metricsFor = (user, now) => computeMetrics(user.progress, now, canonicalSongId, rankedFor(user));

  function publicProfile(user, now = Date.now()) {
    return {
      username: user.username,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      progress: user.progress,
      metrics: metricsFor(user, now)
    };
  }

  const merge = (base, incoming, now) => mergeProgress(base, incoming, now, { checkDailyWin });

  async function register({ username, password, progress }, now = Date.now(), ctx = {}) {
    checkDevice(ctx);
    checkNetwork(ctx, now);
    const { username: cleanName, key } = validateUsername(username);
    checkNotFiltered(cleanName);
    const cleanPass = validatePassword(password);
    if (state.users[key]) throw httpError("That username is already taken. Log in if it is yours, or pick another name.", 409);
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = (await scrypt(cleanPass, salt, 64)).toString("hex");
    // Re-check after the asynchronous hash so two simultaneous sign-ups cannot share a name.
    if (state.users[key]) throw httpError("That username is already taken. Log in if it is yours, or pick another name.", 409);
    const user = {
      id: crypto.randomBytes(12).toString("hex"), username: cleanName, key, salt, hash, tokens: [], tokenUsed: {},
      createdAt: now, updatedAt: now, progress: merge(emptyProgress(), progress, now), ranked: freshRanked(now)
    };
    recordSeen(user, ctx, now);
    creditProgress(user, now);
    const token = issueToken(user, now);
    state.users[key] = user;
    byId.set(user.id, user);
    save();
    return { token, account: publicProfile(user, now) };
  }

  async function login({ username, password, progress }, now = Date.now(), ctx = {}) {
    checkDevice(ctx);
    checkNetwork(ctx, now);
    const { key } = validateUsername(username);
    const cleanPass = validatePassword(password);
    // Failures count per name and address, so a stranger can't lock the owner out.
    const failKey = `${key}\n${ctx.ipHash || ""}`;
    const failures = loginFailures.get(failKey);
    if (failures && failures.lockedUntil > now) {
      throw httpError(`Too many wrong passwords. Wait ${Math.ceil((failures.lockedUntil - now) / 1000)} seconds.`, 429);
    }
    const user = state.users[key];
    // Unknown names cost the same scrypt as known ones, so timing doesn't reveal accounts.
    const ok = user ? await verifyPassword(user, cleanPass) : (await scrypt(cleanPass, dummySalt, 64), false);
    if (!ok) {
      const count = (failures?.count || 0) + 1;
      loginFailures.set(failKey, count >= LOGIN_FAILS_BEFORE_LOCK ? { count: 0, lockedUntil: now + LOGIN_LOCK_MS } : { count, lockedUntil: 0 });
      if (loginFailures.size > 50000) loginFailures.delete(loginFailures.keys().next().value);
      throw httpError("Wrong username or password.", 401);
    }
    loginFailures.delete(failKey);
    if (isBanned(user)) throw bannedError();
    if (progress && typeof progress === "object") user.progress = merge(user.progress, progress, now);
    user.updatedAt = now;
    recordSeen(user, ctx, now);
    creditProgress(user, now);
    const token = issueToken(user, now);
    save();
    return { token, account: publicProfile(user, now) };
  }

  function sync(token, progress, now = Date.now(), ctx = {}) {
    const { user } = authUser(token, ctx, now);
    user.progress = merge(user.progress, progress, now);
    user.updatedAt = now;
    creditProgress(user, now);
    save();
    return { account: publicProfile(user, now) };
  }

  // Existing sessions stay signed in: tokens point at the account, not at its name.
  function rename(token, newUsername, now = Date.now(), ctx = {}) {
    const { user } = authUser(token, ctx, now);
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

  function logout(token, now = Date.now(), ctx = {}) {
    checkDevice(ctx);
    if (token && typeof token === "string" && revokedTokens.has(sha256(token))) throw bannedError();
    const user = token && typeof token === "string" ? tokenIndex.get(token) : null;
    if (user) {
      dropToken(user, token);
      save();
    }
    return { ok: true };
  }

  function me(token, now = Date.now(), ctx = {}) {
    const { user, changed } = authUser(token, ctx, now, { optional: true });
    if (changed) save();
    return { account: user ? publicProfile(user, now) : null };
  }

  // A light check every page makes on load, signed in or not.
  function status(token, now = Date.now(), ctx = {}) {
    checkDevice(ctx);
    if (token && typeof token === "string" && revokedTokens.has(sha256(token))) throw bannedError();
    return { banned: false };
  }

  function getLeaderboards(token = "", now = Date.now(), ctx = {}) {
    const { user: viewerUser, changed } = authUser(token, ctx, now, { optional: true });
    const viewerKey = viewerUser ? viewerUser.key : "";
    let grandfathered = false;
    const allUsers = Object.values(state.users).filter(u => !isBanned(u)).map(u => {
      if (u.ranked?.grandfather && catalogReady()) { creditProgress(u, now); grandfathered = true; }
      return { key: u.key, username: u.username, metrics: metricsFor(u, now) };
    });
    if (changed || grandfathered) save();

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
        m => m.stemsSolved > 0,
        m => ({ primary: m.stemsSolved, secondary: 0 })),
      snippet: buildBoard("snippet",
        (a, b) => (b.snippetSolved - a.snippetSolved) || (b.prestige - a.prestige),
        m => m.snippetSolved > 0,
        m => ({ primary: m.snippetSolved, secondary: 0 })),
      karaoke: buildBoard("karaoke",
        (a, b) => (b.karaokeTotalScore - a.karaokeTotalScore) || (b.karaokeSongs - a.karaokeSongs) || (b.karaokeBestScore - a.karaokeBestScore),
        m => m.karaokeTotalScore > 0,
        m => ({ primary: m.karaokeTotalScore, secondary: m.karaokeSongs, bestScore: m.karaokeBestScore }))
    };

    return { serverTime: now, totalAccounts: allUsers.length, boards, viewer: viewerUser ? publicProfile(viewerUser, now) : null };
  }

  /* ---------- verified karaoke runs ---------- */

  // A ranked song starts with a single-use run bound to the account, the song, the
  // difficulty and mode, and the server's own clock.
  function startKaraokeRun(token, body, now = Date.now(), ctx = {}) {
    const { user, changed } = authUser(token, ctx, now);
    if (changed) save();
    const songId = canonicalSongId ? canonicalSongId(String(body?.songId || "")) : String(body?.songId || "");
    if (!songId || !catalogReady()) throw httpError("This song can't be ranked right now.", 404);
    const difficulty = String(body?.difficulty || "");
    if (!KARAOKE_DIFFICULTIES.includes(difficulty)) throw httpError("Unknown karaoke difficulty.", 400);
    for (const [id, run] of karaokeRuns) if (run.expiresAt <= now) karaokeRuns.delete(id);
    const mine = [...karaokeRuns.entries()].filter(([, run]) => run.accountId === user.id);
    if (mine.length >= 5) karaokeRuns.delete(mine[0][0]);
    const runId = crypto.randomBytes(18).toString("hex");
    karaokeRuns.set(runId, { accountId: user.id, songId, rawSongId: String(body.songId), difficulty, white: body?.white === true, startedAt: now, expiresAt: now + KARAOKE_RUN_MS });
    return { runId, expiresAt: now + KARAOKE_RUN_MS };
  }

  function flagRun(user, run, score, reasons, now) {
    moderation.flags.unshift({ id: crypto.randomBytes(8).toString("hex"), accountId: user.id, username: user.username, songId: run.songId, difficulty: run.difficulty, white: run.white, score, reasons, at: now });
    moderation.flags.length = Math.min(moderation.flags.length, MAX_FLAGS);
    saveModeration(now);
  }

  // scoring is build/assets/karaoke-scoring.mjs, shared with the game.
  function submitKaraokeRun(token, body, scoring, now = Date.now(), ctx = {}) {
    const { user } = authUser(token, ctx, now);
    const runId = String(body?.runId || "");
    const run = karaokeRuns.get(runId);
    if (!run || run.expiresAt <= now) throw httpError("This karaoke run has expired or was already submitted. Start the song again to rank it.", 409);
    if (run.accountId !== user.id) throw httpError("This karaoke run belongs to another account.", 403);
    karaokeRuns.delete(runId); // single use, whatever happens next

    const known = songSeconds(run.rawSongId) ?? songSeconds(run.songId);
    const limit = known ? Math.min(KARAOKE_MAX_SECONDS, known * 1.1 + 5) : KARAOKE_MAX_SECONDS;
    const duration = num(body?.duration, 1, limit);
    if (Number.isNaN(duration)) throw httpError("This karaoke run is longer than the song.", 400);
    const phrases = cleanTrace(body?.phrases, duration);
    const score = clampInt(body?.score, 10000000);
    if (score !== body?.score) throw httpError("This karaoke run has an invalid score.", 400);

    // Every phrase plays in real time; skipping only jumps the gaps between them.
    const sungSeconds = phrases.reduce((sum, ph) => sum + (ph[1] - ph[0]), 0);
    if (now - run.startedAt < (sungSeconds * 0.95 + 2) * 1000) throw httpError("This karaoke run finished faster than the song can be sung.", 400);
    if (score > scoring.maxTraceScore(phrases) || score > Math.ceil(duration * scoring.POINTS_PER_SECOND * scoring.MAX_MULT)) {
      throw httpError("This karaoke run scored more than the song allows.", 400);
    }
    if (scoring.rescoreTrace(phrases) !== score) throw httpError("This karaoke run's score doesn't match its phrases.", 400);

    const reasons = [];
    const similarity = scoring.similarityVerdict(phrases);
    reasons.push(...similarity.reasons);
    const integrity = body?.integrity && typeof body.integrity === "object" ? body.integrity : { ok: false, failed: ["missing"] };
    if (integrity.ok !== true) {
      const failed = Array.isArray(integrity.failed) ? integrity.failed.filter(f => typeof f === "string").slice(0, 10).map(f => f.slice(0, 60)) : [];
      reasons.push(`modified browser audio or microphone (${failed.join(", ") || "unknown"})`);
    }
    if (reasons.length) {
      flagRun(user, run, score, reasons, now);
      return { ranked: false, flagged: true, message: "This run wasn't ranked: the microphone or audio looked modified, or too much like the song's own vocal. An admin will review it." };
    }
    // Skipping is part of White people mode, but a run that is mostly skipped isn't singing.
    const skipped = phrases.filter(ph => ph[3] === null).length;
    if (run.white && skipped > phrases.length * 0.3) {
      return { ranked: false, flagged: false, message: "Runs with more than 30% of phrases skipped aren't ranked." };
    }
    const key = `yeatle-karaoke-best:${run.songId}:${run.difficulty}${run.white ? ":wpm" : ""}`;
    const best = user.ranked.karaoke[key];
    if (!best || score > best.score) {
      user.ranked.karaoke[key] = { score, name: user.username, at: now };
      user.updatedAt = now;
      save();
    }
    return { ranked: true, best: user.ranked.karaoke[key].score, account: publicProfile(user, now) };
  }

  /* ---------- bans (admin) ---------- */

  // Banning signs the account out everywhere, resets its progress to a new account's and
  // restricts the addresses and devices it used. Only this one user's record changes; the
  // old progress is kept in the ban record so an accidental ban can be undone.
  function banUser(username, reason = "", now = Date.now()) {
    const key = String(username || "").trim().toLowerCase();
    const user = key ? state.users[key] : null;
    if (!user) throw httpError(`No account is called "${String(username || "").trim().slice(0, 40)}".`, 404);
    if (isBanned(user)) throw httpError(`${user.username} is already banned.`, 409);
    const cleanReason = String(reason || "").trim().slice(0, MAX_BAN_REASON);
    const tokenHashes = (user.tokens || []).map(sha256);
    moderation.bans[user.id] = {
      accountId: user.id, username: user.username, bannedAt: now, reason: cleanReason, tokenHashes,
      snapshot: { progress: user.progress, ranked: user.ranked, legacyKaraoke: user.legacyKaraoke }
    };
    for (const hash of Object.keys(user.seen?.ips || {})) moderation.ipBlocks[hash] = { accountId: user.id, until: now + ipBlockMs };
    for (const hash of Object.keys(user.seen?.devices || {})) moderation.deviceBlocks[hash] = { accountId: user.id };
    saveModeration(now);
    for (const t of user.tokens || []) tokenIndex.delete(t);
    for (const hash of tokenHashes) revokedTokens.set(hash, user.id);
    user.tokens = [];
    user.tokenUsed = {};
    user.progress = emptyProgress();
    user.ranked = freshRanked(now);
    delete user.legacyKaraoke;
    for (const [id, run] of karaokeRuns) if (run.accountId === user.id) karaokeRuns.delete(id);
    save();
    return listBans();
  }

  function unbanUser(accountId, { restore = false } = {}, now = Date.now()) {
    const ban = moderation.bans[String(accountId || "")];
    if (!ban) throw httpError("That account isn't banned.", 404);
    delete moderation.bans[ban.accountId];
    for (const [hash, block] of Object.entries(moderation.ipBlocks)) if (block.accountId === ban.accountId) delete moderation.ipBlocks[hash];
    for (const [hash, block] of Object.entries(moderation.deviceBlocks)) if (block.accountId === ban.accountId) delete moderation.deviceBlocks[hash];
    for (const hash of ban.tokenHashes || []) revokedTokens.delete(hash);
    const user = byId.get(ban.accountId);
    if (user && restore && ban.snapshot) {
      user.progress = ban.snapshot.progress || emptyProgress();
      user.ranked = ban.snapshot.ranked || freshRanked(now);
      if (ban.snapshot.legacyKaraoke) user.legacyKaraoke = ban.snapshot.legacyKaraoke;
      user.updatedAt = now;
    }
    saveModeration(now);
    if (user && restore) save();
    return listBans();
  }

  // What the admin panel sees: no addresses, devices or hashes of either.
  function listBans() {
    const bans = Object.values(moderation.bans).map(ban => {
      const user = byId.get(ban.accountId);
      return { accountId: ban.accountId, username: ban.username, currentUsername: user ? user.username : "", bannedAt: ban.bannedAt, reason: ban.reason || "" };
    }).sort((a, b) => b.bannedAt - a.bannedAt);
    const flags = moderation.flags.map(f => ({
      id: f.id, accountId: f.accountId, username: byId.get(f.accountId)?.username || f.username, songId: f.songId, difficulty: f.difficulty,
      white: Boolean(f.white), score: f.score, reasons: f.reasons, at: f.at, banned: Boolean(moderation.bans[f.accountId])
    }));
    return { bans, flags };
  }

  function dismissFlag(id, now = Date.now()) {
    const before = moderation.flags.length;
    moderation.flags = moderation.flags.filter(f => f.id !== String(id || ""));
    if (moderation.flags.length === before) throw httpError("That flagged run is no longer listed.", 404);
    saveModeration(now);
    return listBans();
  }

  // Each pending ban applies once. A name that isn't taken yet is still marked done, so
  // whoever registers it later isn't banned, and a later unban in the panel sticks.
  let pendingChanged = false;
  for (const entry of Array.isArray(pendingBans) ? pendingBans : []) {
    const key = String(entry?.username || "").trim().toLowerCase();
    if (!key || moderation.appliedPending.includes(key)) continue;
    moderation.appliedPending.push(key);
    pendingChanged = true;
    if (state.users[key] && !isBanned(state.users[key])) banUser(key, entry.reason || "", loadedAt);
  }
  if (pendingChanged) saveModeration(loadedAt);

  return {
    register, login, sync, rename, logout, me, status, getLeaderboards, getUsernameFilters, setUsernameFilter,
    startKaraokeRun, submitKaraokeRun, banUser, unbanUser, listBans, dismissFlag
  };
}

module.exports = {
  BLOCKED_USERNAME_MESSAGE,
  BANNED_MESSAGE,
  NETWORK_BLOCKED_MESSAGE,
  MODES,
  SNIPPET_MODES,
  SOLVE_CREDIT_PER_HOUR,
  SOLVE_CREDIT_BURST,
  validateUsername,
  validatePassword,
  usernameMatchesFilters,
  isBuiltInBlockedUsername,
  BUILT_IN_BLOCKED_USERNAMES,
  emptyProgress,
  mergeProgress,
  computeMetrics,
  createLeaderboardStore
};
