const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { dailyOverrides = {} } = require("../data/catalog-metadata.json");

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

// EU DST transitions happen at 01:00 UTC on the last Sunday of March and October.
function lastSundayUtc(year, monthIndex) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
  return Date.UTC(year, monthIndex, lastDay.getUTCDate() - lastDay.getUTCDay(), 1, 0, 0);
}

function isEuropeanSummer(ms) {
  const year = new Date(ms).getUTCFullYear();
  return ms >= lastSundayUtc(year, 2) && ms < lastSundayUtc(year, 9);
}

// Daily resets at 06:00 CET/CEST (05:00 UTC in winter / 04:00 UTC in summer, matching 12am EST/EDT).
function dailyOffsetMs(ms = Date.now()) {
  return (isEuropeanSummer(ms) ? 4 : 5) * HOUR_MS;
}

function dailyDayNumber(now = Date.now()) {
  return Math.floor((now - dailyOffsetMs(now)) / DAY_MS);
}

function dailyDate(now = Date.now()) {
  return new Date(now - dailyOffsetMs(now)).toISOString().slice(0, 10);
}

function dailyResetAt(dateOrNow = Date.now()) {
  const date = typeof dateOrNow === "string" ? dateOrNow : dailyDate(dateOrNow);
  const nextMidnightUtc = Date.parse(`${date}T00:00:00Z`) + DAY_MS;
  return nextMidnightUtc + dailyOffsetMs(nextMidnightUtc + 3 * HOUR_MS);
}

function previousDailyDate(dateOrNow = Date.now()) {
  const date = typeof dateOrNow === "string" ? dateOrNow : dailyDate(dateOrNow);
  return new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

// One shared clock and one persisted choice per server, independent of clients,
// tracker ordering, filters, refreshes, and process restarts.
function createDailyChallenges(file, { overrides = dailyOverrides, resolveSong = null } = {}) {
  let days = {};
  if (fs.existsSync(file)) {
    try {
      days = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!days || typeof days !== "object" || Array.isArray(days)) throw new Error("expected an object");
    } catch {
      throw new Error(`Could not read ${path.basename(file)}. Restore its saved daily choices before restarting.`);
    }
  }
  const saveDays = next => {
    // Refuse to issue an unpersisted challenge: a restart must never reroll it.
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(next));
    fs.renameSync(temp, file);
    days = next;
  };
  const applyPremaster = (song, override) => (
    override?.premaster ? { ...song, premaster: { ...override.premaster }, preview: false } : song
  );
  // Repairs a pinned Daily entry when a date override moves it to the released catalog entry
  // or pins a pre-master source, preserving challenge id, seed, and clip start.
  const reconcile = (date, songs = null) => {
    const entry = days[date];
    const override = overrides?.[date];
    if (!entry?.song?.id || !override?.songId) return entry || null;
    if (Array.isArray(override.replaceIds) && override.replaceIds.includes(entry.song.id)) {
      const target = (Array.isArray(songs) && songs.find(s => s.id === override.songId))
        || (resolveSong ? resolveSong(override.songId) : null);
      if (!target) return entry;
      const updated = { ...entry, song: applyPremaster(target, override) };
      saveDays({ ...days, [date]: updated });
      return updated;
    }
    if (entry.song.id === override.songId && override.premaster) {
      const pm = entry.song.premaster;
      if (pm?.kind === override.premaster.kind && pm?.id === override.premaster.id && entry.song.preview === false) {
        return entry;
      }
      const updated = { ...entry, song: applyPremaster(entry.song, override) };
      saveDays({ ...days, [date]: updated });
      return updated;
    }
    return entry;
  };
  // replaced lists songs an admin replaced on this date; they can't be picked again, and
  // each replacement draws from its own hash so it lands on a different song and clip.
  const pick = (date, songs, replaced = []) => {
    const pool = [...songs].filter(s => s.source && (s.mode !== "stems" || s.folder) && !replaced.includes(s.id))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (!pool.length) return null;
    const hash = createHash("sha256").update(`yeatle-daily-v1:${date}${replaced.length ? `:${replaced.length}` : ""}`).digest();
    const override = overrides?.[date];
    const forced = override?.songId && !replaced.includes(override.songId) ? pool.find(s => s.id === override.songId) : null;
    const song = forced ? applyPremaster(forced, override) : pool[hash.readUInt32BE(0) % pool.length];
    const seed = hash.readUInt32BE(4);
    const entry = { song, seed, clipAt: 5 + (seed % 5001) / 1000, id: `v1:${date}:${song.id}`, ...(replaced.length ? { replaced } : {}) };
    saveDays(Object.fromEntries(Object.entries({ ...days, [date]: entry }).sort().slice(-32)));
    return entry;
  };
  const challengeFor = (songs, now = Date.now()) => {
    const date = dailyDate(now);
    const resetsAt = dailyResetAt(date);
    if (!days[date] && !pick(date, songs)) return null;
    const entry = reconcile(date, songs);
    if (!entry?.song?.id || !Number.isInteger(entry.seed)) throw new Error("Invalid saved daily challenge.");
    return { ...entry, clipAt: entry.clipAt ?? 5 + (entry.seed % 5001) / 1000, date, resetsAt, serverTime: now };
  };
  // The challenge this server issued on a date (kept for 32 days), or null.
  challengeFor.saved = date => {
    const entry = reconcile(date);
    return entry?.song?.id ? entry : null;
  };
  // An admin's replacement of a day's song, for a Daily that should never have been picked.
  // Players' saved rounds are tied to the challenge id, so everyone gets a fresh round.
  challengeFor.replace = (date, songs) => {
    const old = challengeFor.saved(date);
    if (!old) throw new Error("No Daily has been picked for that date yet.");
    const entry = pick(date, songs, [...(old.replaced || []), old.song.id]);
    if (!entry) throw new Error("No other song can be picked for the Daily.");
    return { replaced: old.song, entry };
  };
  return challengeFor;
}

module.exports = { createDailyChallenges, dailyOffsetMs, dailyDayNumber, dailyDate, dailyResetAt, previousDailyDate };
