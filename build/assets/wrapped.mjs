// Yeatle Wrapped: a yearly recap of a player's own Yeatle year, shown in a pop-up window
// over the current page (never a new tab or page).
//
// Timing, every year: it opens on November 16 and stays viewable through January 7 of the
// next year (the player's local time). Until then it shows the current year and keeps
// updating as they play until December 31 ends; January 1-7 shows the finished year, and
// play in those days only counts towards the new year. A one-time pop-up announces it
// each year, then a small button in the bottom-right corner reopens it.
//
// Everything is kept in this browser's storage under "yeatle:wrapped:*", one record per
// year, so a year's Wrapped never includes another year's play. When a year is over it is
// archived in a short summary that the next year's Wrapped compares against.
//
// Add ?wrapped=preview to any page's address to open the current year's Wrapped early.

const OPENS = { month: 10, day: 16 };  // November 16
const CLOSES = { month: 0, day: 7 };   // through January 7 of the next year
// Yeatle launched in 2026, so everything a player did before Wrapped existed happened in
// 2026. Only that year counts progress saved before recording started.
const FIRST_YEAR = 2026;
const PUBLIC_URL = "https://playyeatle.duckdns.org/";

const MODES = ["stems", "snippet", "snippet:base", "snippet:easy", "snippet:hard", "snippet:extreme"];
const MODE_GROUP = mode => (mode === "stems" ? "stems" : mode.startsWith("snippet") ? "snippets" : mode);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const KEY = {
  year: y => `yeatle:wrapped:${y}`,
  archive: y => `yeatle:wrapped:archive:${y}`,
  seen: y => `yeatle:wrapped:seen:${y}`,
  chip: y => `yeatle:wrapped:chip:${y}`,
  known: "yeatle:wrapped:known"
};

/* ---------- storage ---------- */

function read(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

const num = value => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0);
const pad = n => String(n).padStart(2, "0");
const statsKey = mode => (mode === "stems" ? "yeatle:stats" : `yeatle:stats:${mode}`);
const completedKey = mode => (mode === "stems" ? "yeatle:completed" : `yeatle:completed:${mode}`);

// The game's saved totals, which have no dates. A year's totals are how much these grew
// while that year was the current one.
function snapshot() {
  const out = {};
  for (const mode of MODES) {
    const st = read(statsKey(mode), null) || {};
    out[mode] = { a: num(st.songsAttempted), c: num(st.correctlyGuessed), s: num(st.totalStars) };
  }
  return out;
}

const zeroSnapshot = () => Object.fromEntries(MODES.map(m => [m, { a: 0, c: 0, s: 0 }]));

function completedIds() {
  const ids = new Set();
  for (const mode of MODES) {
    const list = read(completedKey(mode), []);
    if (Array.isArray(list)) list.forEach(id => typeof id === "string" && ids.add(id));
  }
  return ids;
}

function karaokeBests() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("yeatle-karaoke-best:")) continue;
      const id = key.slice("yeatle-karaoke-best:".length).replace(/:(easy|medium|hard|expert)(:wpm)?$/, "");
      const score = num(read(key, null)?.score);
      if (score > (out[id] || 0)) out[id] = score;
    }
  } catch { /* ignore */ }
  return out;
}

function dailyEntries(year) {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const m = key && /^yeatle:daily:(\d{4})-(\d{2})-(\d{2})$/.exec(key);
      if (!m || Number(m[1]) !== year) continue;
      const entry = read(key, null);
      if (entry && (entry.status === "won" || entry.status === "lost")) out[`${m[1]}-${m[2]}-${m[3]}`] = entry;
    }
  } catch { /* ignore */ }
  return out;
}

function emptyYear(year) {
  return {
    v: 1, year, start: null, end: null, first: 0, last: 0,
    days: {}, hours: Array(24).fill(0), months: Array(12).fill(0),
    modes: {}, songs: {}, run: { cur: 0, best: 0 }, karaoke: {}, daily: {},
    // Launch year only: songs and Karaoke scores saved before recording started.
    before: null
  };
}

function loadYear(year, create = false) {
  const rec = read(KEY.year(year), null);
  if (rec && rec.v === 1) return rec;
  if (!create) return null;
  const fresh = emptyYear(year);
  // Carry on from where last year's totals stopped, so progress synced from another
  // device later still lands in a year rather than nowhere.
  const prev = read(KEY.year(year - 1), null);
  fresh.start = year === FIRST_YEAR ? zeroSnapshot() : (prev?.end || snapshot());
  if (year === FIRST_YEAR) fresh.before = { solved: [], karaoke: {} };
  return fresh;
}

const saveYear = rec => write(KEY.year(rec.year), rec);

/* ---------- recording ---------- */

let songIndex = null;
let songIndexPromise = null;
let closeAnnounce = null;
let closeViewer = null;
function loadSongIndex() {
  if (!songIndexPromise) {
    songIndexPromise = fetch("api/songs").then(r => (r.ok ? r.json() : null)).catch(() => null).then(list => {
      if (!list || (!Array.isArray(list.songs) && !Array.isArray(list.retiredSongs))) {
        songIndexPromise = null;
        return null;
      }
      songIndex = new Map();
      for (const song of [...(list.songs || []), ...(list.retiredSongs || [])]) if (song?.id) songIndex.set(song.id, song);
      return songIndex;
    });
  }
  return songIndexPromise;
}

const songInfo = song => ({
  t: String(song?.display || song?.title || "").slice(0, 120),
  e: String(song?.eraDisplay || song?.era || "").slice(0, 80)
});

function stamp(rec, when) {
  const d = new Date(when);
  const day = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  rec.days[day] = (rec.days[day] || 0) + 1;
  rec.hours[d.getHours()]++;
  rec.months[d.getMonth()]++;
  if (!rec.first) rec.first = when;
  rec.last = when;
}

function noteKnown(id, year) {
  const known = read(KEY.known, {}) || {};
  if (!(id in known)) { known[id] = year; write(KEY.known, known); }
}

function songEntry(rec, id, song) {
  const entry = rec.songs[id] || (rec.songs[id] = { ...songInfo(song), p: 0, w: 0, l: 0, ft: 0, b: 0 });
  const info = songInfo(song);
  if (info.t) entry.t = info.t;
  if (info.e) entry.e = info.e;
  return entry;
}

function recordRound(mode, round) {
  const song = round.song || {};
  const id = String(round.songId || song.id || "");
  if (!id) return;
  const when = Date.now();
  const year = new Date(when).getFullYear();
  const rec = loadYear(year, true);
  const won = round.status === "won";
  const attempts = Array.isArray(round.attempts) ? round.attempts : [];
  const hasRight = attempts.some(a => a?.kind === "right");
  const tries = won
    ? (Number.isInteger(round.solvedLevel) ? round.solvedLevel + 1 : hasRight ? attempts.length : attempts.length + 1)
    : attempts.length;
  stamp(rec, when);
  const m = rec.modes[mode] || (rec.modes[mode] = { p: 0, w: 0, l: 0, ft: 0, s: 0 });
  m.p++;
  won ? m.w++ : m.l++;
  if (won && tries === 1) m.ft++;
  if (won) m.s += num(round.stars);
  const entry = songEntry(rec, id, song);
  entry.p++;
  if (won) {
    entry.w++;
    if (tries === 1) entry.ft++;
    if (tries && (!entry.b || tries < entry.b)) entry.b = tries;
    rec.run.cur++;
    rec.run.best = Math.max(rec.run.best, rec.run.cur);
  } else {
    entry.l++;
    rec.run.cur = 0;
  }
  rec.end = snapshot();
  saveYear(rec);
  if (won) noteKnown(id, year);
}

function recordDaily({ date, status, song }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !song) return;
  const year = Number(date.slice(0, 4));
  const rec = loadYear(year, true);
  if (rec.daily[date]) return;
  rec.daily[date] = songInfo(song);
  if (new Date().getFullYear() === year) stamp(rec, Date.now());
  if (song.id) {
    const entry = songEntry(rec, song.id, song);
    entry.p++;
    status === "won" ? entry.w++ : entry.l++;
  }
  saveYear(rec);
  if (status === "won" && song.id) noteKnown(song.id, year);
}

function recordKaraoke({ song, score, accuracy }) {
  if (!song?.id || !(score > 0)) return;
  const when = Date.now();
  const rec = loadYear(new Date(when).getFullYear(), true);
  stamp(rec, when);
  const k = rec.karaoke[song.id] || (rec.karaoke[song.id] = { ...songInfo(song), runs: 0, best: 0, acc: 0 });
  k.runs++;
  if (score > k.best) { k.best = Math.round(score); k.acc = Math.round((accuracy || 0) * 100); }
  saveYear(rec);
}

// A Stems or Snippets round is recorded when it goes from playing to won or lost. The
// game saves the round several times as it ends (Snippets reveals the song only after
// the last guess), so the final copy is taken a moment later.
const pending = new Map();
function commitPending(key) {
  const item = pending.get(key);
  if (!item) return;
  pending.delete(key);
  clearTimeout(item.timer);
  try { recordRound(item.mode, item.round); } catch { /* never break the game */ }
}

function onRoundSaved({ key, before, value }) {
  let prev = null;
  let next = null;
  try { prev = before ? JSON.parse(before) : null; } catch {}
  try { next = value ? JSON.parse(value) : null; } catch {}
  if (!next) return;
  const mode = key.slice("yeatle:round:".length);
  if (!MODES.includes(mode)) return;
  const final = next.status === "won" || next.status === "lost";
  const item = pending.get(key);
  if (item) {
    if (final && next.status === item.round.status) { item.round = next; return; }
    commitPending(key);
  }
  if (final && prev && prev.status === "playing") {
    pending.set(key, { mode, round: next, timer: setTimeout(() => commitPending(key), 1500) });
  }
}

// Keeps the current year's totals, the launch year's earlier progress and the list of
// songs each year first solved in step with what the game has saved.
function refresh(now = new Date()) {
  const year = now.getFullYear();
  const rec = loadYear(year, true);
  rec.end = snapshot();
  const ids = completedIds();
  if (rec.before) {
    const solved = new Set(rec.before.solved);
    ids.forEach(id => solved.add(id));
    rec.before.solved = [...solved];
    const bests = karaokeBests();
    for (const [id, score] of Object.entries(bests)) rec.before.karaoke[id] = Math.max(rec.before.karaoke[id] || 0, score);
  }
  saveYear(rec);
  const hadKnown = localStorage.getItem(KEY.known) != null;
  const known = read(KEY.known, {}) || {};
  let changed = !hadKnown;
  // Songs already solved when this device first ran Wrapped after the launch year can't be
  // dated, so they don't count as anyone's new discoveries.
  for (const id of ids) if (!(id in known)) { known[id] = hadKnown || year === FIRST_YEAR ? year : 0; changed = true; }
  if (changed) write(KEY.known, known);
}

/* ---------- the recap ---------- */

function diffTotals(rec) {
  const start = rec.start || zeroSnapshot();
  const end = rec.end || start;
  const out = {};
  for (const mode of MODES) {
    const a = end[mode] || { a: 0, c: 0, s: 0 };
    const b = start[mode] || { a: 0, c: 0, s: 0 };
    out[mode] = { a: Math.max(0, a.a - b.a), c: Math.max(0, a.c - b.c), s: Math.max(0, a.s - b.s) };
  }
  return out;
}

function bestRun(dates) {
  const days = [...new Set(dates.map(d => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000)))].sort((a, b) => a - b);
  let best = 0;
  let cur = 0;
  days.forEach((day, i) => { cur = i && day === days[i - 1] + 1 ? cur + 1 : 1; best = Math.max(best, cur); });
  return best;
}

function hourLabel(h) {
  if (h >= 0 && h < 5) return { name: "the 3AM shift", when: "late at night" };
  if (h < 12) return { name: "the morning crew", when: "in the morning" };
  if (h < 17) return { name: "the afternoon crew", when: "in the afternoon" };
  if (h < 21) return { name: "the evening crew", when: "in the evening" };
  return { name: "the late-night crew", when: "late at night" };
}

const PERSONAS = [
  { key: "sniper", name: "Sniper", line: "A lot of your solves came on the very first try.", test: s => s.firstTry >= 10 && s.firstTry / Math.max(1, s.solved) >= 0.3 },
  { key: "daily", name: "Regular", line: "You played the Daily more than almost anything else.", test: s => s.daily.played >= 20 && s.daily.played * 4 >= s.rounds },
  { key: "booth", name: "Vocalist", line: "You spent a lot of the year singing in Karaoke.", test: s => s.karaoke.runs >= 8 },
  { key: "extreme", name: "Hardcore", line: "You played a lot of Snippets on Extreme.", test: s => s.extreme >= 15 },
  { key: "loyalist", name: s => `${s.topEras[0].name} Fan`, line: "Most of the songs you solved came from one era.", test: s => s.topEras[0] && s.solved >= 20 && s.topEras[0].count / s.solved >= 0.3 },
  { key: "night", name: "Night Owl", line: "Most of your rounds were played late at night.", test: s => s.logged >= 20 && s.nightShare >= 0.3 },
  { key: "stems", name: "Producer", line: "Most of your rounds were in Stems.", test: s => s.modes.stems.p >= 20 && s.modes.stems.p >= s.rounds * 0.6 },
  { key: "grinder", name: "Grinder", line: "You played hundreds of rounds this year.", test: s => s.rounds >= 400 },
  { key: "head", name: "All-Rounder", line: "You played a bit of everything.", test: () => true }
];

function summarize(year, now = new Date()) {
  const rec = loadYear(year, false) || emptyYear(year);
  const totals = diffTotals(rec);
  const modes = { stems: { p: 0, w: 0 }, snippets: { p: 0, w: 0 } };
  let stars = 0;
  for (const mode of MODES) {
    const g = MODE_GROUP(mode);
    const logged = rec.modes[mode] || { p: 0, w: 0, s: 0 };
    modes[g].p += Math.max(totals[mode].a, logged.p);
    modes[g].w += Math.max(totals[mode].c, logged.w);
    stars += Math.max(totals[mode].s, logged.s || 0);
  }
  const extreme = Math.max(totals["snippet:extreme"].a, rec.modes["snippet:extreme"]?.p || 0);
  const rounds = modes.stems.p + modes.snippets.p;
  const solved = modes.stems.w + modes.snippets.w;
  const firstTry = Object.values(rec.modes).reduce((sum, m) => sum + (m.ft || 0), 0);
  const logged = Object.values(rec.modes).reduce((sum, m) => sum + (m.p || 0), 0);

  // Daily: the game's own dated results, plus the song names recorded since Wrapped began.
  const dailies = dailyEntries(year);
  const dailyDates = Object.keys(dailies).sort();
  const dailyWins = dailyDates.filter(d => dailies[d].status === "won");
  const daily = {
    played: dailyDates.length,
    won: dailyWins.length,
    streak: bestRun(dailyDates),
    firstTry: dailyWins.filter(d => dailies[d].attempts?.length === 1).length,
    avg: dailyWins.length ? dailyWins.reduce((s, d) => s + (dailies[d].attempts?.length || 0), 0) / dailyWins.length : 0
  };

  // Songs solved this year, with their eras.
  const solvedSongs = new Map();
  for (const [id, s] of Object.entries(rec.songs)) if (s.w > 0) solvedSongs.set(id, { t: s.t, e: s.e, w: s.w });
  for (const id of rec.before?.solved || []) {
    if (solvedSongs.has(id)) continue;
    const song = songIndex?.get(id);
    if (song) solvedSongs.set(id, { ...songInfo(song), w: 1 });
  }
  const eraCounts = new Map();
  for (const s of solvedSongs.values()) if (s.e) eraCounts.set(s.e, (eraCounts.get(s.e) || 0) + s.w);
  const topEras = [...eraCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([name, count]) => ({ name, count }));

  const songs = Object.entries(rec.songs).map(([id, s]) => ({ id, ...s }));
  const quickest = songs.filter(s => s.ft > 0 && s.t).sort((a, b) => b.ft - a.ft || b.w - a.w).slice(0, 3);
  const nemesis = songs.filter(s => s.l > 0 && s.t).sort((a, b) => (a.w ? 1 : 0) - (b.w ? 1 : 0) || b.l - a.l)[0] || null;
  const lost = songs.filter(s => s.l > 0 && !s.w).map(s => s.id);

  // Karaoke: runs recorded this year, plus launch-year best scores saved earlier.
  const karaokeSongs = new Map(Object.entries(rec.karaoke).map(([id, k]) => [id, { ...k }]));
  for (const [id, score] of Object.entries(rec.before?.karaoke || {})) {
    const k = karaokeSongs.get(id);
    if (k) k.best = Math.max(k.best, score);
    else {
      const song = songIndex?.get(id);
      karaokeSongs.set(id, { ...(song ? songInfo(song) : { t: "", e: "" }), runs: 1, best: score, acc: 0 });
    }
  }
  const kList = [...karaokeSongs.values()];
  const bestK = kList.filter(k => k.t).sort((a, b) => b.best - a.best)[0] || null;
  const karaoke = { runs: kList.reduce((s, k) => s + k.runs, 0), songs: kList.length, best: bestK };

  // When they played.
  const months = [...rec.months];
  dailyDates.forEach(d => { if (!rec.daily[d]) months[Number(d.slice(5, 7)) - 1]++; });
  const busiest = months.some(Boolean) ? months.indexOf(Math.max(...months)) : -1;
  const activeDays = new Set([...Object.keys(rec.days), ...dailyDates.map(d => d.slice(5))]).size;
  const hourTotal = rec.hours.reduce((a, b) => a + b, 0);
  const peakHour = hourTotal ? rec.hours.indexOf(Math.max(...rec.hours)) : -1;
  const nightShare = hourTotal ? rec.hours.slice(0, 5).reduce((a, b) => a + b, 0) / hourTotal : 0;

  const known = read(KEY.known, {}) || {};
  const discoveries = Object.values(known).filter(y => y === year).length;

  const summary = {
    year, rounds, solved, stars, firstTry, logged, extreme, modes, daily, karaoke, topEras,
    quickest, nemesis, lost, busiest, activeDays, peakHour, nightShare, discoveries,
    accuracy: rounds ? Math.round((solved / rounds) * 100) : 0,
    winRun: rec.run.best,
    live: now.getFullYear() === year,
    since: rec.first || 0
  };
  const persona = PERSONAS.find(p => { try { return p.test(summary); } catch { return false; } });
  summary.persona = { key: persona.key, name: typeof persona.name === "function" ? persona.name(summary) : persona.name, line: persona.line };

  // Last year, for comparisons.
  const prev = read(KEY.archive(year - 1), null);
  if (prev) {
    const redeemed = new Set(prev.lost || []);
    summary.prev = prev;
    summary.redemptions = songs.filter(s => redeemed.has(s.id) && s.w > 0 && s.t).map(s => s.t).slice(0, 3);
    const priorArchives = Object.keys(localStorageKeys()).filter(k => {
      const m = /^yeatle:wrapped:archive:(\d{4})$/.exec(k);
      return m && Number(m[1]) < year;
    }).length;
    summary.yearsPlayed = 1 + priorArchives;
  }
  return summary;
}

function localStorageKeys() {
  const out = {};
  try { for (let i = 0; i < localStorage.length; i++) out[localStorage.key(i)] = true; } catch {}
  return out;
}

// Once a year is over, keep a short summary of it for next year's comparisons, and drop
// detailed records nothing will show again.
function pastYears(now = new Date()) {
  return Object.keys(localStorageKeys()).map(key => /^yeatle:wrapped:(\d{4})$/.exec(key)).filter(Boolean)
    .map(m => Number(m[1])).filter(year => year < now.getFullYear());
}

function archiveFinishedYears(now = new Date()) {
  const current = now.getFullYear();
  for (const key of Object.keys(localStorageKeys())) {
    const m = /^yeatle:wrapped:(\d{4})$/.exec(key);
    if (!m) continue;
    const year = Number(m[1]);
    if (year >= current) continue;
    const archived = read(KEY.archive(year), null);
    if (!archived?.final) {
      const s = summarize(year, now);
      write(KEY.archive(year), {
        final: true, year, rounds: s.rounds, solved: s.solved, accuracy: s.accuracy, firstTry: s.firstTry,
        topEras: s.topEras.slice(0, 3).map(e => e.name), persona: s.persona.key, personaName: s.persona.name,
        dailyWon: s.daily.won, dailyStreak: s.daily.streak, karaokeBest: s.karaoke.best?.best || 0,
        discoveries: s.discoveries, lost: s.lost.slice(0, 300)
      });
    }
    if (year < current - 1) { try { localStorage.removeItem(key); } catch {} }
  }
}

/* ---------- when it's shown ---------- */

export function wrappedYear(now = new Date()) {
  const m = now.getMonth();
  const d = now.getDate();
  if (m > OPENS.month || (m === OPENS.month && d >= OPENS.day)) return now.getFullYear();
  if (m === CLOSES.month && d <= CLOSES.day) return now.getFullYear() - 1;
  return null;
}

function previewRequested() {
  try { return new URL(location.href).searchParams.get("wrapped") === "preview"; } catch { return false; }
}

/* ---------- sharing ---------- */

function shareUrl() {
  try {
    const { hostname, origin } = location;
    if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(hostname) || location.protocol === "file:") return PUBLIC_URL;
    return `${origin}/`;
  } catch { return PUBLIC_URL; }
}

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

// Short on purpose: five lines and a link, so pasting it doesn't flood a chat.
export function shareText(s) {
  const lines = [`Yeatle Wrapped ${s.year}`];
  lines.push(s.rounds ? `${plural(s.solved, "song")} guessed (${s.accuracy}%)` : `${plural(s.daily.won, "Daily", "Dailies")} won`);
  if (s.topEras[0]) lines.push(`Top era: ${s.topEras[0].name}`);
  if (s.daily.streak >= 2) lines.push(`${s.daily.streak}-day Daily streak`);
  else if (s.firstTry) lines.push(plural(s.firstTry, "first-try solve"));
  else if (s.karaoke.best) lines.push(`Karaoke best: ${s.karaoke.best.best.toLocaleString()}`);
  lines.push(`Type: ${s.persona.name}`);
  lines.push(shareUrl().replace(/^https?:\/\//, "").replace(/\/$/, ""));
  return lines.join("\n");
}

function loadImage(src, timeout = 4000) {
  return new Promise(resolve => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), timeout);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
}

// A cover stand-in: the era name's first letter.
const initial = name => (String(name || "").trim().match(/[\p{L}\p{N}]/u) || ["?"])[0].toUpperCase();
const coverUrl = era => `api/cover?era=${encodeURIComponent(era)}`;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A 1080x1350 summary card for saving or sharing as an image.
export async function renderCard(s) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const [logo, cover] = await Promise.all([
    loadImage("Images/Yeatle-Logo.webp"),
    s.topEras[0] ? loadImage(coverUrl(s.topEras[0].name)) : Promise.resolve(null)
  ]);

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#14001d");
  bg.addColorStop(0.55, "#3c0052");
  bg.addColorStop(1, "#8901b9");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.12, 0, W * 0.85, H * 0.12, 620);
  glow.addColorStop(0, "rgba(214,120,255,0.45)");
  glow.addColorStop(1, "rgba(214,120,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const left = 80;
  if (logo) {
    const lw = 340;
    const lh = (logo.height / logo.width) * lw;
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(logo, left - 10, 64, lw, lh);
    ctx.globalCompositeOperation = "source-over";
  } else {
    ctx.fillStyle = "#fff";
    ctx.font = `800 96px ${FONT}`;
    ctx.fillText("Yeatle", left, 160);
  }
  ctx.fillStyle = "#e9c6ff";
  ctx.font = `800 44px ${FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`WRAPPED ${s.year}`, left, 256);

  // Top era block.
  let y = 312;
  if (s.topEras[0]) {
    const size = 300;
    ctx.save();
    roundRect(ctx, left, y, size, size, 22);
    ctx.clip();
    if (cover) {
      const side = Math.min(cover.width, cover.height);
      ctx.drawImage(cover, (cover.width - side) / 2, (cover.height - side) / 2, side, side, left, y, size, size);
    } else {
      ctx.fillStyle = "#2a0838";
      ctx.fillRect(left, y, size, size);
      ctx.fillStyle = "#fff";
      ctx.font = `800 150px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(initial(s.topEras[0].name), left + size / 2, y + size / 2 + 54);
      ctx.textAlign = "left";
    }
    ctx.restore();
    const tx = left + size + 44;
    const tw = W - tx - left;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText("TOP ERAS", tx, y + 40);
    s.topEras.slice(0, 5).forEach((era, i) => {
      ctx.fillStyle = i ? "rgba(255,255,255,0.85)" : "#fff";
      ctx.font = `${i ? 600 : 800} ${i ? 34 : 44}px ${FONT}`;
      ctx.fillText(fitText(ctx, `${i + 1}  ${era.name}`, tw), tx, y + 100 + i * 50 + (i ? 10 : 0));
    });
    y += size + 64;
  }

  // Stat tiles.
  const tiles = [
    s.rounds ? ["Songs guessed", s.solved.toLocaleString()] : null,
    s.rounds ? ["Accuracy", `${s.accuracy}%`] : null,
    s.firstTry ? ["First-try solves", s.firstTry.toLocaleString()] : null,
    s.daily.played ? ["Daily wins", `${s.daily.won}`] : null,
    s.daily.streak >= 2 ? ["Best Daily streak", `${s.daily.streak} days`] : null,
    s.karaoke.best ? ["Karaoke best", s.karaoke.best.best.toLocaleString()] : null,
    s.activeDays ? ["Days played", `${s.activeDays}`] : null
  ].filter(Boolean).slice(0, 4);
  const gap = 28;
  const tileW = (W - left * 2 - gap) / 2;
  const tileH = 150;
  tiles.forEach(([label, value], i) => {
    const tx = left + (i % 2) * (tileW + gap);
    const ty = y + Math.floor(i / 2) * (tileH + gap);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(ctx, tx, ty, tileW, tileH, 20);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `600 28px ${FONT}`;
    ctx.fillText(label, tx + 28, ty + 50);
    ctx.fillStyle = "#fff";
    ctx.font = `800 64px ${FONT}`;
    ctx.fillText(fitText(ctx, value, tileW - 56), tx + 28, ty + 122);
  });
  y += Math.ceil(tiles.length / 2) * (tileH + gap) + 20;

  // Persona.
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText("YOUR YEATLE TYPE", left, Math.min(y + 30, H - 170));
  ctx.fillStyle = "#fff";
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText(fitText(ctx, s.persona.name, W - left * 2), left, Math.min(y + 104, H - 96));

  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(shareUrl().replace(/^https?:\/\//, "").replace(/\/$/, ""), left, H - 50);
  return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

/* ---------- interface ---------- */

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const child of children.flat()) if (child != null && child !== false) node.append(child);
  return node;
};

const big = (value, label) => el("div", { class: "yeatle-wrapped-big" }, el("b", { text: value }), el("span", { text: label }));

function coverImg(era, cls = "yeatle-wrapped-cover") {
  const img = el("img", { class: cls, alt: "", src: coverUrl(era), loading: "lazy" });
  img.addEventListener("error", () => img.replaceWith(el("span", { class: `${cls} missing`, "aria-hidden": "true", text: initial(era) })));
  return img;
}

function buildSlides(s) {
  const slides = [];
  const add = (theme, ...content) => slides.push(el("section", { class: `yeatle-wrapped-slide ${theme}` }, ...content));

  add("t-intro",
    el("img", { class: "yeatle-wrapped-logo", src: "Images/Yeatle-Logo.webp", alt: "Yeatle" }),
    el("p", { class: "yeatle-wrapped-kicker", text: "Your year in Yeatle" }),
    el("h2", { class: "yeatle-wrapped-year", text: `Wrapped ${s.year}` }),
    el("p", { class: "yeatle-wrapped-sub", text: s.live ? "It keeps updating as you play until December 31." : `Your finished ${s.year}. Tap to go through it.` }),
    s.prev ? el("p", { class: "yeatle-wrapped-badge", text: `Year ${s.yearsPlayed} on Yeatle` }) : null
  );

  if (s.rounds) {
    add("t-numbers",
      el("p", { class: "yeatle-wrapped-kicker", text: `This year you played` }),
      big(s.rounds.toLocaleString(), s.rounds === 1 ? "round" : "rounds"),
      el("p", { class: "yeatle-wrapped-line", text: `and guessed ${plural(s.solved, "song")} right. That's ${s.accuracy}% of them.` }),
      el("div", { class: "yeatle-wrapped-row" },
        s.stars ? el("span", { text: `★ ${s.stars.toLocaleString()} stars` }) : null,
        s.activeDays ? el("span", { text: `${plural(s.activeDays, "day")} played` }) : null,
        s.winRun >= 3 ? el("span", { text: `${s.winRun} wins in a row` }) : null)
    );
  }

  if (s.topEras.length) {
    add("t-eras",
      el("p", { class: "yeatle-wrapped-kicker", text: "Your top eras" }),
      el("div", { class: "yeatle-wrapped-top-era" },
        coverImg(s.topEras[0].name, "yeatle-wrapped-cover lead"),
        el("div", {}, el("span", { class: "yeatle-wrapped-rank", text: "#1" }), el("h3", { text: s.topEras[0].name }), el("p", { class: "muted", text: `${plural(s.topEras[0].count, "song")} solved` }))),
      el("ol", { class: "yeatle-wrapped-list" },
        s.topEras.slice(1).map((era, i) => el("li", {}, el("span", { class: "num", text: String(i + 2) }), coverImg(era.name), el("span", { class: "name", text: era.name }), el("span", { class: "count", text: era.count.toLocaleString() }))))
    );
  }

  if (s.quickest.length || s.nemesis) {
    add("t-songs",
      s.quickest.length ? el("div", {},
        el("p", { class: "yeatle-wrapped-kicker", text: "Instant recognition" }),
        el("p", { class: "yeatle-wrapped-line", text: s.firstTry > s.quickest.length ? `You got ${plural(s.firstTry, "song")} on the very first try, including:` : "Songs you got on the very first try:" }),
        el("ol", { class: "yeatle-wrapped-list plain" }, s.quickest.map(q => el("li", {}, el("span", { class: "name", text: q.t }), el("span", { class: "count", text: q.e })))))
        : null,
      s.nemesis ? el("div", { class: "yeatle-wrapped-nemesis" },
        el("p", { class: "yeatle-wrapped-kicker", text: "Your nemesis" }),
        el("h3", { text: s.nemesis.t }),
        el("p", { class: "muted", text: s.nemesis.w ? `It beat you ${plural(s.nemesis.l, "time")} before you finally got it.` : `It beat you ${plural(s.nemesis.l, "time")} and you still haven't gotten it.` }))
        : null
    );
  }

  const modeRows = [
    ["Stems", s.modes.stems.p],
    ["Snippets", s.modes.snippets.p],
    ["Daily", s.daily.played],
    ["Karaoke", s.karaoke.runs]
  ].filter(([, n]) => n > 0);
  if (modeRows.length > 1) {
    const max = Math.max(...modeRows.map(([, n]) => n));
    const fav = modeRows.find(([, n]) => n === max)[0];
    add("t-modes",
      el("p", { class: "yeatle-wrapped-kicker", text: "Where you spent your time" }),
      el("h3", { class: "yeatle-wrapped-headline", text: `${fav} was your mode.` }),
      el("div", { class: "yeatle-wrapped-bars" }, modeRows.map(([name, n]) =>
        el("div", { class: "bar" }, el("span", { class: "label", text: name }), el("span", { class: "fill", style: `--w:${Math.max(4, Math.round((n / max) * 100))}%` }), el("span", { class: "n", text: n.toLocaleString() }))))
    );
  }

  if (s.daily.played) {
    add("t-daily",
      el("p", { class: "yeatle-wrapped-kicker", text: "The Daily" }),
      big(`${s.daily.won}/${s.daily.played}`, "Dailies won"),
      el("div", { class: "yeatle-wrapped-row" },
        s.daily.streak >= 2 ? el("span", { text: `${s.daily.streak}-day best streak` }) : null,
        s.daily.won ? el("span", { text: `${s.daily.avg.toFixed(1)} tries on average` }) : null,
        s.daily.firstTry ? el("span", { text: `${plural(s.daily.firstTry, "first-try win")}` }) : null)
    );
  }

  if (s.karaoke.best) {
    add("t-karaoke",
      el("p", { class: "yeatle-wrapped-kicker", text: "On the mic" }),
      big(s.karaoke.best.best.toLocaleString(), "your best Karaoke score"),
      el("p", { class: "yeatle-wrapped-line", text: `on ${s.karaoke.best.t}${s.karaoke.best.acc ? ` with ${s.karaoke.best.acc}% of the notes hit` : ""}.` }),
      el("div", { class: "yeatle-wrapped-row" }, el("span", { text: `${plural(s.karaoke.songs, "song")} sung` }), s.karaoke.runs > s.karaoke.songs ? el("span", { text: `${plural(s.karaoke.runs, "run")}` }) : null)
    );
  }

  if (s.busiest >= 0 || s.peakHour >= 0) {
    const hour = s.peakHour >= 0 ? hourLabel(s.peakHour) : null;
    add("t-time",
      el("p", { class: "yeatle-wrapped-kicker", text: "When you played" }),
      s.busiest >= 0 ? el("h3", { class: "yeatle-wrapped-headline", text: `${MONTHS[s.busiest]} was your biggest month.` }) : null,
      hour && s.logged >= 5 ? el("p", { class: "yeatle-wrapped-line", text: `You mostly played ${hour.when}, so you're part of ${hour.name}.` }) : null
    );
  }

  if (s.prev) {
    const delta = s.solved - (s.prev.solved || 0);
    const pct = s.prev.solved ? Math.round((delta / s.prev.solved) * 100) : 0;
    add("t-compare",
      el("p", { class: "yeatle-wrapped-kicker", text: `${s.year} vs ${s.prev.year}` }),
      el("h3", { class: "yeatle-wrapped-headline", text: delta >= 0 ? `${plural(delta, "more song")} guessed than last year${pct ? ` (+${pct}%)` : ""}.` : `${plural(-delta, "fewer song")} than last year. Quality over quantity.` }),
      el("ul", { class: "yeatle-wrapped-compare" },
        s.prev.topEras?.[0] && s.topEras[0] ? el("li", { text: s.prev.topEras[0] === s.topEras[0].name ? `${s.topEras[0].name} was your top era again.` : `Your top era went from ${s.prev.topEras[0]} to ${s.topEras[0].name}.` }) : null,
        s.prev.accuracy && s.rounds ? el("li", { text: `Accuracy: ${s.prev.accuracy}% → ${s.accuracy}%` }) : null,
        s.prev.dailyStreak || s.daily.streak ? el("li", { text: `Best Daily streak: ${s.prev.dailyStreak || 0} → ${s.daily.streak}` }) : null,
        s.discoveries ? el("li", { text: `${plural(s.discoveries, "song")} you solved for the first time ever.` }) : null,
        s.redemptions?.length ? el("li", { text: `Revenge: you finally got ${s.redemptions.join(", ")} after missing ${s.redemptions.length === 1 ? "it" : "them"} last year.` }) : null)
    );
  }

  add("t-persona",
    el("p", { class: "yeatle-wrapped-kicker", text: "Your Yeatle type" }),
    el("h2", { class: "yeatle-wrapped-persona", text: s.persona.name }),
    el("p", { class: "yeatle-wrapped-line", text: s.persona.line }),
    s.prev?.personaName ? el("p", { class: "muted", text: s.prev.persona === s.persona.key ? `Same as ${s.prev.year}. Consistent.` : `In ${s.prev.year} you were ${s.prev.personaName}.` }) : null
  );

  return slides;
}

function summarySlide(s, notify) {
  const text = shareText(s);
  const preview = el("pre", { class: "yeatle-wrapped-preview", text });
  const status = el("p", { class: "yeatle-wrapped-status", role: "status", "aria-live": "polite" });
  const say = msg => { status.textContent = msg; notify?.(msg); };
  const copy = el("button", { class: "btn solid", type: "button", text: "Copy text" });
  const save = el("button", { class: "btn", type: "button", text: "Save image" });
  const share = el("button", { class: "btn", type: "button", text: "Share image", hidden: true });
  let blob = null;
  const getBlob = async () => blob || (blob = await renderCard(s));
  const fileName = `yeatle-wrapped-${s.year}.png`;

  try {
    const probe = new File([new Blob()], fileName, { type: "image/png" });
    if (navigator.canShare?.({ files: [probe] })) share.hidden = false;
  } catch { /* no file sharing here */ }

  copy.addEventListener("click", async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      say("Copied. Paste it wherever you like.");
    } catch {
      const range = document.createRange();
      range.selectNodeContents(preview);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      say("Select and copy the text above.");
    }
  });
  save.addEventListener("click", async () => {
    save.disabled = true;
    try {
      const file = await getBlob();
      const url = URL.createObjectURL(file);
      const a = el("a", { href: url, download: fileName });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      say("Image saved.");
    } catch { say("Couldn't make the image here."); }
    finally { save.disabled = false; }
  });
  share.addEventListener("click", async () => {
    share.disabled = true;
    try {
      const file = new File([await getBlob()], fileName, { type: "image/png" });
      await navigator.share({ files: [file], title: `Yeatle Wrapped ${s.year}` });
    } catch (error) { if (error?.name !== "AbortError") say("Sharing didn't work. Try Save image."); }
    finally { share.disabled = false; }
  });

  return el("section", { class: "yeatle-wrapped-slide t-share" },
    el("p", { class: "yeatle-wrapped-kicker", text: "Share your Wrapped" }),
    preview,
    el("div", { class: "yeatle-wrapped-actions" }, copy, share, save),
    status,
    el("p", { class: "muted", text: s.live ? `Your ${s.year} keeps updating until December 31. Reopen it from the corner until January 7.` : "Viewable until January 7." })
  );
}

let viewer = null;
let opening = false;

export async function openWrapped(year) {
  // A second tap while the song list loads must not open a second window.
  if (viewer || opening) return;
  opening = true;
  try {
    refresh();
    await Promise.race([loadSongIndex(), new Promise(r => setTimeout(r, 2500))]);
  } finally {
    opening = false;
  }
  const s = summarize(year);
  const slides = buildSlides(s);
  slides.push(summarySlide(s));
  let index = 0;
  const bars = el("div", { class: "yeatle-wrapped-bars-top" }, slides.map(() => el("span")));
  const stage = el("div", { class: "yeatle-wrapped-stage" }, slides);
  const close = el("button", { class: "yeatle-wrapped-close", type: "button", "aria-label": "Close Wrapped", text: "×" });
  const prevBtn = el("button", { class: "yeatle-wrapped-nav prev", type: "button", "aria-label": "Previous", text: "‹" });
  const nextBtn = el("button", { class: "yeatle-wrapped-nav next", type: "button", "aria-label": "Next", text: "›" });
  const card = el("div", { class: "yeatle-wrapped-card", role: "dialog", "aria-modal": "true", "aria-label": `Yeatle Wrapped ${year}` }, bars, close, stage, prevBtn, nextBtn);
  const overlay = el("div", { class: "yeatle-wrapped-overlay" }, card);

  const show = i => {
    index = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((slide, n) => slide.classList.toggle("on", n === index));
    [...bars.children].forEach((bar, n) => bar.classList.toggle("done", n <= index));
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === slides.length - 1;
  };
  const shut = () => {
    overlay.remove();
    removeEventListener("keydown", onKey, true);
    viewer = null;
    if (closeViewer === shut) closeViewer = null;
  };
  closeViewer = shut;
  // While Wrapped is open, keys belong to it: the game's shortcuts (Space, S, Enter) wait.
  const onKey = e => {
    if (e.key === "Tab") return;
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); shut(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); show(index + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); show(index - 1); }
  };
  close.addEventListener("click", shut);
  prevBtn.addEventListener("click", () => show(index - 1));
  nextBtn.addEventListener("click", () => show(index + 1));
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) shut(); });
  // Tap the left or right side of a slide to move through it, like stories.
  stage.addEventListener("click", e => {
    if (e.target.closest("button, a, pre, .yeatle-wrapped-actions")) return;
    const rect = stage.getBoundingClientRect();
    show(e.clientX - rect.left < rect.width * 0.3 ? index - 1 : index + 1);
  });
  addEventListener("keydown", onKey, true);
  document.body.append(overlay);
  viewer = overlay;
  show(0);
  close.focus({ preventScroll: true });
}

function announce(year) {
  const later = el("button", { class: "btn", type: "button", text: "Later" });
  const go = el("button", { class: "btn solid", type: "button", text: "Show me" });
  const box = el("div", { class: "yeatle-wrapped-popup", role: "dialog", "aria-modal": "true", "aria-labelledby": "yeatle-wrapped-popup-title" },
    el("img", { class: "yeatle-wrapped-popup-logo", src: "Images/Yeatle-Logo.webp", alt: "" }),
    el("h2", { id: "yeatle-wrapped-popup-title", text: `Your Yeatle Wrapped ${year} is here` }),
    el("p", { text: wrappedYear() === year && new Date().getFullYear() === year
      ? "Your year in Yeatle is ready to view. It keeps updating as you play until the year ends."
      : "Your year in Yeatle is ready to view." }),
    el("p", { class: "muted", text: "You can open it again from the button in the bottom-right corner until January 7." }),
    el("div", { class: "yeatle-wrapped-actions" }, later, go));
  const overlay = el("div", { class: "yeatle-wrapped-overlay soft" }, box);
  const onKey = e => {
    if (e.key === "Tab") return;
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); shut(); }
  };
  const shut = () => {
    overlay.remove();
    removeEventListener("keydown", onKey, true);
    if (closeAnnounce === shut) closeAnnounce = null;
  };
  closeAnnounce = shut;
  later.addEventListener("click", shut);
  go.addEventListener("click", () => { shut(); openWrapped(year); });
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) shut(); });
  addEventListener("keydown", onKey, true);
  document.body.append(overlay);
  go.focus({ preventScroll: true });
}

function mountChip(year) {
  if (document.querySelector(".yeatle-wrapped-chip")) return;
  const small = () => read(KEY.chip(year), false) === "small";
  const open = el("button", { class: "yeatle-wrapped-chip-open", type: "button", "aria-label": `Open your Yeatle Wrapped ${year}` },
    el("img", { class: "icon", src: "favicon-64.png", alt: "" }), el("span", { class: "label", text: `Wrapped ${year}` }));
  const shrink = el("button", { class: "yeatle-wrapped-chip-shrink", type: "button", "aria-label": "Make this button smaller", text: "×" });
  const chip = el("div", { class: "yeatle-wrapped-chip" }, open, shrink);
  const sync = () => chip.classList.toggle("small", small());
  open.addEventListener("click", () => {
    if (small()) write(KEY.chip(year), "full");
    sync();
    openWrapped(year);
  });
  shrink.addEventListener("click", () => { write(KEY.chip(year), "small"); sync(); });
  sync();
  document.body.append(chip);
}

function bannedScreenShown() {
  return [...(document.body?.children || [])].some(n => /^yeatle-banned/.test(String(n.className || "")));
}

function start() {
  try { refresh(); } catch { /* storage unavailable */ }
  addEventListener("yeatle:round-saved", e => { try { onRoundSaved(e.detail || {}); } catch {} });
  addEventListener("yeatle:wrapped-record", e => {
    const d = e.detail || {};
    try {
      if (d.kind === "daily") recordDaily(d);
      else if (d.kind === "karaoke") recordKaraoke(d);
    } catch { /* never break the game */ }
  });
  addEventListener("yeatle:progress-synced", () => { try { refresh(); } catch {} });
  addEventListener("yeatle:banned", () => {
    try { closeAnnounce?.(); } catch {}
    try { closeViewer?.(); } catch {}
    document.querySelector(".yeatle-wrapped-chip")?.remove();
  });
  addEventListener("pagehide", () => [...pending.keys()].forEach(commitPending));
  // Archive a finished year once the song list is in, so its top eras are complete.
  try {
    if (pastYears().some(year => !read(KEY.archive(year), null)?.final)) {
      loadSongIndex().then(index => { if (index) try { archiveFinishedYears(); } catch {} });
    }
  } catch { /* ignore */ }

  const preview = previewRequested();
  const year = preview ? new Date().getFullYear() : wrappedYear();
  if (!year) return;
  setTimeout(() => {
    if (bannedShown()) return;
    mountChip(year);
    if (preview) { openWrapped(year); return; }
    if (!read(KEY.seen(year), false)) {
      write(KEY.seen(year), true);
      announce(year);
    }
  }, 1200);
}

function bannedShown() {
  try { return bannedScreenShown() || read("yeatle:banned", false) === true; } catch { return false; }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

export const _test = { summarize, refresh, recordRound, recordDaily, recordKaraoke, onRoundSaved, commitPending, snapshot, archiveFinishedYears };
