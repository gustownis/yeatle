/*
  Yeatle karaoke mode.

  A Rock Band / Fortnite Festival style vocals mode. The main game's React
  source isn't in this repo (only its compiled build), so karaoke lives on its
  own page and reuses the same server, song list, HQ stems and AI splitter.

  How a song gets ready:
  1. Get the instrumental and the vocals. HQ stem folders already have them;
     every other song goes through the game's AI splitter (sharing its stem
     cache, so a song you already played in Yeatle loads fast).
  2. Track the pitch of the vocal stem and turn it into note tubes (held,
     pitched notes) and rapped parts, placed at their rough pitch.
  3. Look up the lyrics: lyrics pasted in on this page, a lyrics.lrc in the
     song's folder, or online by title + artist (lrclib.net, then lyrics.ovh).
     Lyrics without timestamps get lined up with the sung phrases.

  Scoring works like Rock Band: the octave you sing in doesn't matter, every
  phrase gets a rating, and good phrases in a row build a multiplier up to x4.
*/

const VERSION = new URL(import.meta.url).searchParams.get("v") || "dev";
const SR = 44100;
const COLORS = ["#b565e0", "#38c6ff", "#ffb02e", "#4fe37a"];
const DIFFICULTIES = {
  easy: { label: "Easy", tolerance: 3 },
  medium: { label: "Medium", tolerance: 2 },
  hard: { label: "Hard", tolerance: 1.3 },
  expert: { label: "Expert", tolerance: 0.8 }
};
const RATINGS = [
  { min: 0.9, text: "Awesome!", cls: "awesome" },
  { min: 0.75, text: "Strong", cls: "strong" },
  { min: 0.6, text: "Good", cls: "good" },
  { min: 0.45, text: "OK", cls: "ok" },
  { min: 0.25, text: "Messy", cls: "messy" },
  { min: -1, text: "Awful", cls: "awful" }
];
const STREAK_MIN = 0.6;          // phrase accuracy that keeps the multiplier going
const POINTS_PER_SECOND = 250;   // points for one second of perfectly sung notes, before the multiplier
const LEAD = 4;                  // seconds of notes shown ahead of the now line
const COUNT_IN = 3;              // 3-2-1 before each song starts
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/* ---------- small helpers ---------- */

export const freqToMidi = f => 69 + 12 * Math.log2(f / 440);
export const chromaDistance = (a, b) => { const d = (((a - b) % 12) + 12) % 12; return Math.min(d, 12 - d); };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const idle = () => new Promise(resolve => setTimeout(resolve, 0));
const noteName = m => { const r = Math.round(m); return NOTE_NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1); };
const norm = s => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function median(values) {
  if (!values.length) return NaN;
  const s = Array.from(values).sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
function ratingFor(acc) { return RATINGS.find(r => acc >= r.min); }
function starsFor(acc) { return acc >= 0.88 ? 5 : acc >= 0.75 ? 4 : acc >= 0.6 ? 3 : acc >= 0.4 ? 2 : acc >= 0.2 ? 1 : 0; }

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage off */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* storage off */ } }
};

/* ---------- pitch tracking (YIN) ---------- */

// Returns { freq, conf } for the n-sample window at the start of buf, or null.
// buf must hold at least n + sr/minF + 1 samples.
export function yin(buf, n, sr, minF, maxF, scratch) {
  const tauMin = Math.max(2, Math.floor(sr / maxF));
  const tauMax = Math.min(Math.floor(sr / minF), buf.length - n - 1);
  if (n < 32 || tauMax <= tauMin + 2) return null;
  const d = scratch && scratch.length > tauMax ? scratch : new Float32Array(tauMax + 1);
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < n; j++) { const diff = buf[j] - buf[j + tau]; sum += diff * diff; }
    running += sum;
    d[tau] = running > 0 ? (sum * tau) / running : 1;
  }
  let best = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (d[tau] < 0.15) {
      while (tau + 1 <= tauMax && d[tau + 1] < d[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    let low = Infinity;
    for (let tau = tauMin; tau <= tauMax; tau++) if (d[tau] < low) { low = d[tau]; best = tau; }
  }
  let t = best;
  if (best > 1 && best < tauMax) {
    const a = d[best - 1], b = d[best], c = d[best + 1], den = a + c - 2 * b;
    if (den > 0) t = best + (a - c) / (2 * den);
  }
  return { freq: sr / t, conf: clamp(1 - d[best], 0, 1) };
}

// Box-filter then decimate; plenty for finding a voice's pitch.
export function downsample(input, factor, out) {
  const len = Math.floor(input.length / factor);
  const result = out && out.length >= len ? out : new Float32Array(len);
  const taps = factor * 2, back = factor >> 1;
  for (let i = 0; i < len; i++) {
    const from = i * factor - back;
    let sum = 0, count = 0;
    for (let j = from; j < from + taps; j++) if (j >= 0 && j < input.length) { sum += input[j]; count++; }
    result[i] = count ? sum / count : 0;
  }
  return result;
}

/* ---------- turning the vocal stem into a chart ---------- */

export async function analyzeVocals(vocals, sampleRate = SR, onProgress = () => {}, isCancelled = () => false) {
  if (isCancelled()) throw new Error("cancelled");
  const factor = 4, rate = sampleRate / factor;
  const ds = downsample(vocals, factor);
  const n = 384, hop = 256, tauMax = Math.floor(rate / 70);
  const frames = Math.max(0, Math.floor((ds.length - n - tauMax - 1) / hop));
  const midi = new Float32Array(frames), conf = new Float32Array(frames), rms = new Float32Array(frames);
  const scratch = new Float32Array(tauMax + 2);
  for (let i = 0; i < frames; i++) {
    const start = i * hop;
    let energy = 0;
    for (let j = 0; j < n; j++) { const v = ds[start + j]; energy += v * v; }
    rms[i] = Math.sqrt(energy / n);
    midi[i] = NaN;
    if (rms[i] > 1e-4) {
      const r = yin(ds.subarray(start, start + n + tauMax + 1), n, rate, 70, 1000, scratch);
      if (r) { midi[i] = freqToMidi(r.freq); conf[i] = r.conf; }
    }
    if (i % 64 === 0) {
      if (isCancelled()) throw new Error("cancelled");
      onProgress(i / frames);
      await idle();
    }
  }
  if (isCancelled()) throw new Error("cancelled");
  onProgress(1);
  return { midi, conf, rms, hop: hop / rate, offset: n / 2 / rate };
}

function groupPhrases(notes) {
  const phrases = [];
  for (const note of notes) {
    let ph = phrases[phrases.length - 1];
    if (!ph || note.start - ph.end > 0.85 || note.end - ph.start > 9) {
      ph = { start: note.start, end: note.end, notes: [] };
      phrases.push(ph);
    }
    ph.notes.push(note);
    ph.end = Math.max(ph.end, note.end);
  }
  phrases.forEach(ph => { ph.dur = ph.notes.reduce((sum, note) => sum + note.end - note.start, 0); });
  return phrases;
}

export function buildChart(analysis) {
  const { midi, conf, rms, hop, offset } = analysis;
  const N = rms.length;
  const time = i => offset + i * hop;

  // what counts as "someone is singing" depends on how loud this vocal stem is
  const sorted = Float32Array.from(rms).sort();
  const pct = q => (N ? sorted[Math.min(N - 1, Math.floor(q * (N - 1)))] : 0);
  const floor = pct(0.25), loud = pct(0.95);
  const gate = Math.max(0.003, floor + (loud - floor) * 0.14);

  const active = new Uint8Array(N), voiced = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    active[i] = rms[i] > gate ? 1 : 0;
    voiced[i] = active[i] && conf[i] > 0.7 && midi[i] > 33 && midi[i] < 88 ? 1 : 0;
  }

  // median-smoothed pitch, so vibrato and tracking blips don't split notes
  const pitch = new Float32Array(N).fill(NaN);
  const win = [];
  for (let i = 0; i < N; i++) {
    if (!voiced[i]) continue;
    win.length = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(N - 1, i + 2); j++) if (voiced[j]) win.push(midi[j]);
    pitch[i] = median(win);
  }
  // single frames that jumped an octave from both neighbours are tracking mistakes
  for (let i = 1; i < N - 1; i++) {
    if (!voiced[i] || !voiced[i - 1] || !voiced[i + 1]) continue;
    const around = (pitch[i - 1] + pitch[i + 1]) / 2, d = pitch[i] - around;
    if (Math.abs(pitch[i - 1] - pitch[i + 1]) < 1 && Math.abs(Math.abs(d) - 12) < 1.2) pitch[i] -= 12 * Math.sign(d);
  }
  // bridge tiny dropouts inside a held note
  for (let i = 1; i < N - 1; i++) {
    if (voiced[i] || !active[i] || !voiced[i - 1]) continue;
    let b = i;
    while (b < N && b - i < 3 && !voiced[b]) b++;
    if (b < N && voiced[b] && Math.abs(pitch[i - 1] - pitch[b]) < 1) {
      for (let k = i; k < b; k++) { voiced[k] = 1; pitch[k] = (pitch[i - 1] + pitch[b]) / 2; }
      i = b;
    }
  }

  // held notes: runs of frames that stay within a semitone
  const held = [];
  let run = null;
  const closeRun = () => {
    if (!run) return;
    const start = time(run.from) - hop / 2, end = time(run.to) + hop / 2;
    if (end - start >= 0.09) held.push({ kind: "pitch", start, end, midi: Math.round(median(run.vals)) });
    run = null;
  };
  for (let i = 0; i < N; i++) {
    if (!voiced[i]) { closeRun(); continue; }
    if (run) {
      if (Math.abs(pitch[i] - median(run.vals.slice(-6))) < 0.8) { run.to = i; run.vals.push(pitch[i]); continue; }
      closeRun();
    }
    run = { from: i, to: i, vals: [pitch[i]] };
  }
  closeRun();
  const pitched = [];
  for (const note of held) {
    const last = pitched[pitched.length - 1];
    if (last && last.midi === note.midi && note.start - last.end < 0.08) last.end = note.end;
    else pitched.push(note);
  }

  // talky notes: singing with no steady pitch (rapping, spoken bits)
  const covered = new Uint8Array(N);
  pitched.forEach(note => {
    for (let i = Math.max(0, Math.floor((note.start - offset) / hop)); i < N && time(i) < note.end; i++) covered[i] = 1;
  });
  const talk = [];
  let from = -1, lastEnd = -10;
  for (let i = 0; i <= N; i++) {
    const on = i < N && active[i] && !covered[i];
    if (on && from < 0) from = i;
    if (!on && from >= 0) {
      const start = time(from) - hop / 2, end = time(i - 1) + hop / 2;
      let joinable = talk.length && from - lastEnd <= Math.ceil(0.1 / hop);
      for (let k = lastEnd + 1; joinable && k < from; k++) if (covered[k]) joinable = false;
      if (joinable) { talk[talk.length - 1].end = end; talk[talk.length - 1].to = i - 1; }
      else talk.push({ kind: "talk", start, end, midi: null, from, to: i - 1 });
      lastEnd = i - 1;
      from = -1;
    }
  }

  // Rapped parts have no steady pitch, but the voice still sits somewhere. Place each one at its
  // rough pitch (splitting where it clearly moves) so the lane only shows piano-roll style notes.
  const rough = i => (conf[i] > 0.45 && midi[i] > 33 && midi[i] < 88 ? midi[i] : NaN);
  const nearestPitched = t => {
    let best = null;
    for (const note of pitched) if (!best || Math.abs(note.start - t) < Math.abs(best.start - t)) best = note;
    return best ? best.midi : null;
  };
  const talkNotes = [];
  for (const seg of talk) {
    if (seg.end - seg.start < 0.15) continue;
    const pieces = [];
    let piece = null;
    for (let i = seg.from; i <= seg.to; i++) {
      const m = rough(i);
      if (Number.isNaN(m)) { if (piece) piece.to = i; continue; }
      if (piece && piece.vals.length >= 5 && Math.abs(m - median(piece.vals.slice(-5))) > 2.5 && time(i) - time(piece.from) >= 0.15) {
        pieces.push(piece);
        piece = null;
      }
      if (!piece) piece = { from: i, to: i, vals: [] };
      piece.vals.push(m);
      piece.to = i;
    }
    if (piece) pieces.push(piece);
    const fallback = nearestPitched(seg.start);
    if (!pieces.length) {
      talkNotes.push({ kind: "talk", start: seg.start, end: seg.end, midi: fallback ?? 52 });
      continue;
    }
    pieces.forEach((pc, k) => {
      const start = k === 0 ? seg.start : time(pc.from) - hop / 2;
      const end = k === pieces.length - 1 ? seg.end : time(pieces[k + 1].from) - hop / 2;
      const m = pc.vals.length >= 3 ? Math.round(median(pc.vals)) : (fallback ?? Math.round(median(pc.vals)));
      const prev = talkNotes[talkNotes.length - 1];
      if (prev && prev.midi === m && Math.abs(prev.end - start) < 0.02) prev.end = end;
      else talkNotes.push({ kind: "talk", start, end, midi: m });
    });
  }

  let all = [...pitched, ...talkNotes].sort((a, b) => a.start - b.start);
  const clean = [];
  for (const note of all) {
    const prev = clean[clean.length - 1];
    if (prev && note.start < prev.end) note.start = prev.end;
    if (note.end - note.start >= 0.08) clean.push(note);
  }
  // lone blips (a quick ad-lib in a gap) aren't worth a phrase rating
  const kept = groupPhrases(clean).filter(ph => ph.dur >= 0.3).flatMap(ph => ph.notes);
  const phrases = groupPhrases(kept);
  phrases.forEach((ph, index) => ph.notes.forEach(note => { note.phrase = index; }));

  const tones = kept.map(note => note.midi).sort((a, b) => a - b);
  let lo = tones.length ? tones[Math.floor(tones.length * 0.03)] - 2 : 45;
  let hi = tones.length ? tones[Math.max(0, Math.ceil(tones.length * 0.97) - 1)] + 2 : 60;
  if (hi - lo < 12) { const mid = (hi + lo) / 2; lo = mid - 6; hi = mid + 6; }

  return { notes: kept, phrases, lo, hi, totalDur: phrases.reduce((sum, ph) => sum + ph.dur, 0), active, hop, offset };
}

/* ---------- lyrics ---------- */

export function parseLrc(text) {
  const lines = [];
  let shift = 0;
  const stampRe = /\[(\d+):(\d+(?:[.:]\d+)?)\]/g;
  const secs = (m, s) => Number(m) * 60 + Number(String(s).replace(":", "."));
  for (const raw of String(text || "").split(/\r?\n/)) {
    const offset = /^\s*\[offset:\s*([+-]?\d+)\s*\]/i.exec(raw);
    if (offset) { shift = Number(offset[1]) / 1000; continue; }
    const stamps = [...raw.matchAll(stampRe)];
    if (!stamps.length) continue;
    let body = raw.replace(stampRe, "");
    let words = null;
    if (/<\d+:\d+/.test(body)) {
      words = [...body.matchAll(/<(\d+):(\d+(?:\.\d+)?)>\s*([^<]*)/g)]
        .map(m => ({ t: secs(m[1], m[2]), text: m[3].trim() }))
        .filter(w => w.text);
      body = words.map(w => w.text).join(" ");
    }
    body = body.replace(/\s+/g, " ").trim();
    stamps.forEach(s => lines.push({ t: secs(s[1], s[2]), text: body, words: words ? words.map(w => ({ ...w })) : null }));
  }
  // a positive [offset] makes lyrics show up sooner
  lines.forEach(line => { line.t -= shift; if (line.words) line.words.forEach(w => { w.t -= shift; }); });
  lines.sort((a, b) => a.t - b.t);
  return lines.some(line => line.text) ? lines : [];
}

// Synced lyrics online are often timed to a different version of the song (longer intro,
// radio edit, different upload), which pushes every line early or late. This slides the
// lyrics to where the vocals really are, then nudges single lines onto nearby vocal entries.
export function alignLyrics(lines, chart, maxShift = 20) {
  const { active, hop, offset } = chart || {};
  const textLines = (lines || []).filter(l => l.text);
  if (!active || !active.length || textLines.length < 3) return { lines, shift: 0, score: 0, moved: 0 };
  const N = active.length;
  const pre = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) pre[i + 1] = pre[i] + active[i];
  const mean = pre[N] / N;
  const frac = (a, b) => {
    const i0 = clamp(Math.round((a - offset) / hop), 0, N), i1 = clamp(Math.round((b - offset) / hop), 0, N);
    return i1 > i0 ? (pre[i1] - pre[i0]) / (i1 - i0) : 0;
  };
  const sorted = lines.slice().sort((a, b) => a.t - b.t);
  const spans = [];
  sorted.forEach((l, k) => {
    if (!l.text) return;
    const next = sorted[k + 1];
    spans.push({ t: l.t, dur: clamp((next ? next.t : l.t + 4) - l.t, 0.4, 6) });
  });
  const totalDur = spans.reduce((sum, sp) => sum + sp.dur, 0);
  const onset = t => frac(t, t + 0.45) - frac(t - 0.45, t);
  const score = s => {
    let cover = 0, rise = 0;
    for (const sp of spans) { cover += frac(sp.t + s, sp.t + s + sp.dur) * sp.dur; rise += onset(sp.t + s); }
    return cover / totalDur - mean + 0.5 * (rise / spans.length);
  };
  // coarse search, then fine around the best
  let best = 0, bestScore = score(0);
  const base = bestScore;
  for (let s = -maxShift; s <= maxShift + 1e-9; s += 0.1) {
    const v = score(s) - Math.abs(s) * 0.0015;
    if (v > bestScore) { bestScore = v; best = s; }
  }
  for (let s = best - 0.1; s <= best + 0.1 + 1e-9; s += 0.02) {
    const v = score(s) - Math.abs(s) * 0.0015;
    if (v > bestScore) { bestScore = v; best = s; }
  }
  // only move everything when the vocals clearly agree better
  const shift = bestScore - base > 0.02 ? Math.round(best * 100) / 100 : 0;
  let moved = 0, last = -Infinity;
  const out = sorted.map(l => {
    let t = l.t + shift;
    if (l.text) {
      let bestD = 0, bestV = onset(t);
      for (let d = -0.6; d <= 0.6 + 1e-9; d += 0.05) {
        const v = onset(t + d) - Math.abs(d) * 0.25;
        if (v > bestV + 0.15) { bestV = v; bestD = d; }
      }
      if (bestD) moved++;
      t += bestD;
    }
    t = Math.max(t, last + 0.15);
    const delta = t - l.t;
    last = t;
    return { ...l, t, words: l.words ? l.words.map(w => ({ ...w, t: w.t + delta })) : null };
  });
  return { lines: out, shift, score: score(shift), moved };
}

/* ---------- White people mode: skipped words ---------- */

// The n-word and its usual spellings, matched as whole words only, so words
// like "Niger", "niggle" or "snigger" are never skipped.
const SKIP_WORD = /^n[i1!*]g{2,}(?:a|ah|uh|u|er|ur|ar)?(?:s|z|es)?$/;
const SKIP_CENSORED = /^n[i1*]?\*{2,}[a-z]{0,2}$|^n\*[g*]{2}[a-z*]{0,3}$/;
export function isSkipWord(word) {
  const w = String(word || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[‘’']/g, "").replace(/^[^a-z0-9*]+|[^a-z0-9*]+$/g, "");
  return w.length >= 4 && w.length <= 9 && (SKIP_WORD.test(w) || SKIP_CENSORED.test(w));
}

// Words of a lyric line with their character positions.
export function skipTokens(text) {
  const out = [], re = /[^\s\-–—/]+/g;
  let m;
  while ((m = re.exec(String(text || "")))) out.push({ text: m[0], index: m.index, skip: isSkipWord(m[0]) });
  return out;
}

export function countSkipWords(lines) {
  return (lines || []).reduce((sum, line) => sum + skipTokens(typeof line === "string" ? line : line.text).filter(x => x.skip).length, 0);
}

// Joins skip windows that touch or overlap, so overlapping skips never count twice.
export function mergeSkips(list) {
  const sorted = list
    .filter(s => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .map(s => ({ start: Math.max(0, s.start), end: s.end, exact: Boolean(s.exact), mine: Boolean(s.mine), words: s.words ? [...s.words] : [s.word || ""] }))
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end + 0.05) {
      last.end = Math.max(last.end, s.end);
      last.exact = last.exact && s.exact;
      last.mine = last.mine || s.mine;
      last.words.push(...s.words);
    } else out.push(s);
  }
  return out;
}

// Finds when the skipped words are sung, in song (audio) time. Lyrics are shown at
// song time + lyric shift, so a word at lyric time L is sung at L - shift.
// Word-timed lyrics give exact windows. Line-timed (and plain, auto-timed) lyrics only say
// when the line starts, so the word is placed by spreading the line's words over the singing
// heard during that line; those windows are wider and marked as estimates.
export function findSkips(lines, chart, shift = 0, kind = "line") {
  const out = [];
  const sorted = (lines || []).filter(l => l && Number.isFinite(l.t)).slice().sort((a, b) => a.t - b.t);
  sorted.forEach((line, k) => {
    if (!line.text) return;
    const lineEnd = sorted[k + 1] ? sorted[k + 1].t : line.t + 6;
    if (line.words && line.words.length) {
      line.words.forEach((w, j) => {
        const toks = skipTokens(w.text);
        if (!toks.some(x => x.skip)) return;
        const end = clamp(line.words[j + 1] ? line.words[j + 1].t : lineEnd, w.t + 0.2, w.t + 1.2);
        if (toks.length === 1) { out.push({ start: w.t - shift - 0.06, end: end - shift + 0.1, exact: true, word: w.text }); return; }
        // a timed chunk holding several words: place the word by its letters within the chunk
        const total = w.text.length || 1;
        toks.forEach(x => {
          if (!x.skip) return;
          const a = w.t + ((end - w.t) * x.index) / total, b = w.t + ((end - w.t) * (x.index + x.text.length)) / total;
          out.push({ start: a - shift - 0.12, end: b - shift + 0.15, exact: true, word: x.text });
        });
      });
      return;
    }
    const toks = skipTokens(line.text);
    if (!toks.some(x => x.skip)) return;
    const a = line.t - shift, b = Math.min(lineEnd, line.t + 8) - shift;
    const segs = [];
    for (const note of (chart && chart.notes) || []) {
      if (note.end <= a - 0.3 || note.start >= b) continue;
      segs.push([Math.max(note.start, a - 0.3), Math.min(note.end, b)]);
    }
    let voiced = segs.reduce((sum, [x, y]) => sum + y - x, 0);
    if (voiced < 0.25) {
      segs.length = 0;
      segs.push([a, Math.max(a + 0.4, Math.min(b, a + Math.max(0.8, line.text.length * 0.065)))]);
      voiced = segs[0][1] - segs[0][0];
    }
    const at = f => {
      let left = f * voiced;
      for (const [x, y] of segs) { if (left <= y - x) return x + left; left -= y - x; }
      return segs[segs.length - 1][1];
    };
    const weights = toks.map(x => x.text.length + 1), total = weights.reduce((sum, v) => sum + v, 0);
    const pad = kind === "plain" ? 0.45 : 0.3;
    let before = 0;
    toks.forEach((x, i) => {
      if (x.skip) {
        const s = at(before / total), e = at((before + weights[i]) / total);
        const mid = (s + e) / 2, half = clamp((e - s) / 2, 0.15, 0.45);
        out.push({ start: mid - half - pad, end: mid + half + pad, exact: false, word: x.text });
      }
      before += weights[i];
    });
  });
  return mergeSkips(out);
}

export const fmtTime = t => {
  const s = Math.max(0, Math.round(t * 10) / 10);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};

// Your own skip times, one per line: "1:23.4" or "1:23.4 1.2" (start and length in seconds).
export function parseSkipMarks(text) {
  const marks = [], bad = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)(?:\s+\+?(\d+(?:\.\d+)?)s?)?$/.exec(line);
    if (!m || (m[1] && Number(m[2]) >= 60)) { bad.push(i + 1); return; }
    marks.push({ t: Math.round((Number(m[1] || 0) * 60 + Number(m[2])) * 100) / 100, len: clamp(m[3] ? Number(m[3]) : 0.8, 0.2, 3) });
  });
  marks.sort((a, b) => a.t - b.t);
  return { marks, bad };
}
export const formatSkipMarks = marks => (marks || []).map(m => `${fmtTime(m.t)}${Math.abs(m.len - 0.8) > 0.01 ? ` ${m.len}` : ""}`).join("\n");
export const marksToSkips = marks => (marks || []).map(m => ({ start: m.t - 0.05, end: m.t + m.len, exact: true, mine: true, word: "" }));

// Records which part of each note is skipped, so scoring can leave it out.
export function markFreeTime(chart, skips) {
  for (const note of chart.notes || []) {
    note.free = [];
    for (const s of skips) {
      if (s.end <= note.start) continue;
      if (s.start >= note.end) break;
      note.free.push([Math.max(s.start, note.start), Math.min(s.end, note.end)]);
    }
    note.freeDur = note.free.reduce((sum, [a, b]) => sum + b - a, 0);
  }
  (chart.phrases || []).forEach(ph => { ph.freeDur = ph.notes.reduce((sum, note) => sum + note.freeDur, 0); });
}
const freeIn = (note, a, b) => (note.free || []).reduce((sum, [x, y]) => sum + Math.max(0, Math.min(y, b) - Math.max(x, a)), 0);

/* ---------- scoring ---------- */

const SKIPPED_PHRASE = 0.25; // seconds left to sing after skips, below which a phrase isn't rated

// Adds what each singer hit between t - dt and t. Skipped time is never counted.
export function scoreFrame(g, t, dt, gate) {
  const notes = g.chart.notes;
  const ref = referencePitch(g, t);
  g.players.forEach((p, pi) => {
    const r = p.detector ? p.detector.read(gate) : { loud: false, voiced: false, midi: NaN };
    p.reading = r;
    const folded = r.voiced ? clamp(foldTo(r.midi, ref), g.chart.lo - 1, g.chart.hi + 1) : NaN;
    p.trail.push({ t, m: folded });
    if (r.voiced) p.lastMidi = folded;
    while (p.trail.length && p.trail[0].t < t - 2) p.trail.shift();
    if (dt <= 0) return;
    for (let k = g.noteIdx; k < notes.length && notes[k].start < t; k++) {
      const note = notes[k];
      const from = Math.max(note.start, t - dt), to = Math.min(note.end, t);
      if (to <= from) continue;
      const hit = note.kind === "talk" ? r.loud : r.voiced && chromaDistance(r.midi, note.midi) <= g.tolerance;
      if (!hit) continue;
      const counted = to - from - freeIn(note, from, to);
      if (counted > 0) note.hitTime[pi] += counted;
      const spans = note.hits[pi], last = spans[spans.length - 1];
      if (last && from - last[1] < 0.06) last[1] = to; else spans.push([from, to]);
    }
  });
}

// Rates a finished phrase for every singer. Skipped time counts as if it was sung, whatever
// the mic heard then, so staying silent scores exactly like singing the word in normal mode,
// and every other note counts as usual. A phrase with almost nothing left to sing after skips
// isn't rated: it gives the points of a sung phrase (for singers with a mic) and leaves the
// streak and multiplier as they were.
export function scorePhrase(g, index) {
  const ph = g.chart.phrases[index];
  const free = ph.freeDur || 0;
  return g.players.map((p, pi) => {
    if (ph.dur - free < SKIPPED_PHRASE) {
      const points = p.detector ? Math.round(ph.dur * POINTS_PER_SECOND) * p.mult : 0;
      p.score += points;
      p.skipped = (p.skipped || 0) + 1;
      return (ph.results[pi] = { skipped: true, acc: null, rating: null, points });
    }
    const sung = ph.notes.reduce((sum, note) => sum + note.hitTime[pi], 0) + (p.detector ? free : 0);
    // nobody hits every last frame, so a little slack makes 100% reachable
    const acc = clamp((sung / ph.dur) * 1.12, 0, 1);
    const rating = ratingFor(acc);
    const points = Math.round(ph.dur * POINTS_PER_SECOND * acc) * p.mult;
    p.score += points;
    p.accSum += acc * ph.dur;
    p.durSum += ph.dur;
    p.counts[rating.cls]++;
    if (acc >= STREAK_MIN) { p.streak++; p.bestStreak = Math.max(p.bestStreak, p.streak); }
    else p.streak = 0;
    p.mult = Math.min(4, 1 + p.streak);
    return (ph.results[pi] = { acc, rating, points });
  });
}

// the pitched note to fold a singer's pitch toward (octave doesn't matter)
function referencePitch(g, t) {
  const notes = g.chart.notes;
  for (let k = Math.max(0, g.noteIdx - 1); k < notes.length && notes[k].start < t + 2.5; k++) {
    if (notes[k].kind === "pitch" && notes[k].end > t - 0.4) return notes[k].midi;
  }
  for (let k = Math.min(notes.length - 1, g.noteIdx); k >= 0; k--) if (notes[k].kind === "pitch") return notes[k].midi;
  return (g.chart.lo + g.chart.hi) / 2;
}
const foldTo = (m, ref) => m + 12 * Math.round((ref - m) / 12);

/* ---------- everything below needs a browser ---------- */

const state = { songs: [], artist: "Yeat", song: null, lyricsCache: new Map(), lyricsPending: new Map(), job: null, foundSkips: new Map() };
const settings = Object.assign({
  difficulty: "medium", volume: 100, guide: 0, speakers: true, micDelay: 90, audioDelay: null, sensitivity: 50, whiteMode: false,
  players: [{ name: "Singer 1", deviceId: "" }]
}, store.get("yeatle-karaoke-settings", {}));
function saveSettings() { store.set("yeatle-karaoke-settings", settings); }
const micGate = () => 0.05 * Math.pow(0.04, settings.sensitivity / 100);

const $ = (sel, root = document) => root.querySelector(sel);
function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "style") node.style.cssText = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (["value", "checked", "selected", "disabled"].includes(key)) node[key] = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid);
  return node;
}
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => { s.hidden = s.id !== id; });
}

/* ---------- audio context and microphones ---------- */

let audioContext = null;
function audioCtx() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
  return audioContext;
}

class MicDetector {
  constructor(ctx, stream) {
    this.stream = stream;
    this.source = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.source.connect(this.analyser);
    this.analyser.connect(this.sink);
    this.sink.connect(ctx.destination);
    this.raw = new Float32Array(2048);
    this.factor = Math.max(1, Math.round(ctx.sampleRate / 11025));
    this.rate = ctx.sampleRate / this.factor;
    this.ds = new Float32Array(Math.floor(2048 / this.factor));
    this.tauMax = Math.floor(this.rate / 70);
    this.scratch = new Float32Array(this.tauMax + 2);
    this.level = 0;
    this.reading = { rms: 0, loud: false, voiced: false, midi: NaN };
  }
  read(gate) {
    this.analyser.getFloatTimeDomainData(this.raw);
    let energy = 0;
    for (let i = 1024; i < 2048; i++) energy += this.raw[i] * this.raw[i];
    const rms = Math.sqrt(energy / 1024);
    this.level = Math.max(rms, this.level * 0.92);
    let midi = NaN;
    if (rms > gate) {
      downsample(this.raw, this.factor, this.ds);
      const r = yin(this.ds, this.ds.length - this.tauMax - 1, this.rate, 70, 1000, this.scratch);
      if (r && r.conf > 0.6) midi = freqToMidi(r.freq);
    }
    this.reading = { rms, loud: rms > gate, voiced: !Number.isNaN(midi), midi };
    return this.reading;
  }
  stop() {
    try { this.source.disconnect(); this.analyser.disconnect(); this.sink.disconnect(); } catch { /* already gone */ }
    this.stream.getTracks().forEach(track => track.stop());
  }
}

const mics = { allowed: false, devices: [], detectors: [], requests: [], error: "" };

async function enableMics() {
  if (!navigator.mediaDevices?.getUserMedia) {
    mics.error = window.isSecureContext ? "This browser can't use a microphone." : "Microphones only work on https:// or localhost addresses.";
    renderPlayers();
    return false;
  }
  try {
    audioCtx().resume();
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach(track => track.stop());
    mics.allowed = true;
    mics.error = "";
    await refreshDevices();
    await openAllMics();
    return true;
  } catch (err) {
    mics.error = err.name === "NotAllowedError" ? "Microphone access was blocked. Allow it in the address bar and try again." : `Couldn't open a microphone (${err.message || err.name}).`;
    renderPlayers();
    return false;
  }
}

async function refreshDevices() {
  try { mics.devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput"); }
  catch { mics.devices = []; }
}

async function openMic(index) {
  const request = {};
  mics.requests[index] = request;
  if (mics.detectors[index]) { mics.detectors[index].stop(); mics.detectors[index] = null; }
  const player = settings.players[index];
  if (!mics.allowed || !player || player.deviceId === "none") return;
  const deviceId = player.deviceId;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: player.deviceId ? { exact: player.deviceId } : undefined,
        echoCancellation: settings.speakers, noiseSuppression: false, autoGainControl: false, channelCount: 1
      }
    });
    // A device change, singer removal, or a newer request may have won the race.
    if (mics.requests[index] !== request || settings.players[index] !== player || player.deviceId !== deviceId || !mics.allowed) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    mics.detectors[index] = new MicDetector(audioCtx(), stream);
  } catch (err) {
    stream?.getTracks().forEach(track => track.stop());
    if (mics.requests[index] === request && settings.players[index] === player) mics.error = `${player.name}'s mic couldn't open (${err.message || err.name}).`;
  }
}

async function openAllMics() {
  mics.error = "";
  for (let i = 0; i < Math.max(settings.players.length, mics.detectors.length); i++) {
    if (i < settings.players.length) await openMic(i);
    else if (mics.detectors[i]) { mics.detectors[i].stop(); mics.detectors[i] = null; }
  }
  mics.detectors.length = settings.players.length;
  renderPlayers();
}

/* ---------- song setup screen ---------- */

function songTag(song) {
  if (song.mode === "stems") return { text: "HQ stems", cls: "hq" };
  if (song.preview) return { text: "30s preview", cls: "preview" };
  return { text: "AI split", cls: "ai" };
}

function renderSongList() {
  const query = norm($("#search").value);
  const list = $("#song-list");
  const matches = state.songs.filter(song => !query || norm(`${song.display} ${song.era} ${(song.features || []).join(" ")}`).includes(query));
  list.replaceChildren(...matches.slice(0, 250).map(song => {
    const tag = songTag(song);
    return el("button", {
      class: "song" + (state.song && state.song.id === song.id ? " picked" : ""),
      onclick: () => pickSong(song)
    },
      song.cover ? el("img", { src: song.cover, alt: "", loading: "lazy" }) : el("span", { class: "nocover" }),
      el("span", { class: "song-text" }, el("b", { text: song.display }), el("small", { text: [song.era || "No era", song.eraYear || song.year, song.tab, song.relatedRecording].filter(Boolean).join(" · ") })),
      el("span", { class: "tag " + tag.cls, text: tag.text })
    );
  }));
  $("#song-count").textContent = matches.length > 250 ? `Showing 250 of ${matches.length}. Search to narrow it down.` : `${matches.length} song${matches.length === 1 ? "" : "s"}`;
}

function pickSong(song) {
  state.song = song;
  renderSongList();
  renderPicked();
  lookUpLyrics(song).then(() => { if (state.song === song) renderPicked(); });
}

function renderPicked() {
  const box = $("#picked");
  const song = state.song;
  if (!song) { box.replaceChildren(el("p", { class: "muted", text: "Pick a song from the list." })); $("#start").disabled = true; return; }
  const tag = songTag(song);
  const lyr = state.lyricsCache.get(song.id);
  const best = store.get(bestKey(song.id, settings.difficulty, settings.whiteMode), null);
  let lyricText = "Looking for synced lyrics…";
  if (lyr) lyricText = lyr.lines.length ? `Synced lyrics from ${lyr.source}` : lyr.plain ? `Lyrics from ${lyr.source}. They have no timing, so they get lined up with the singing automatically.` : "No lyrics found online, so you'll sing from the notes only. You can paste your own below.";
  const modeLabel = `${DIFFICULTIES[settings.difficulty].label}${settings.whiteMode ? " (White people mode)" : ""}`;
  // (leave out the parts that don't apply; replaceChildren would print a null as text)
  box.replaceChildren(...[
    el("div", { class: "picked-song" },
      song.cover ? el("img", { src: song.cover, alt: "" }) : null,
      el("div", {}, el("b", { text: song.display }), el("small", { text: `${song.era || "No era"} · ${tag.text}` }))
    ),
    el("p", { class: "muted", text: lyricText }),
    song.preview ? el("p", { class: "muted", text: "Only a 30-second preview of this song is available." }) : null,
    tag.cls === "ai" ? el("p", { class: "muted", text: "The vocals get split off by the AI first. That can take a minute the first time, then it's saved." }) : null,
    settings.whiteMode ? el("p", { class: "muted skip-info", text: skipSummary(song, lyr) }) : null,
    best ? el("p", { class: "muted", text: `Best on ${modeLabel}: ${best.score.toLocaleString()} by ${best.name}` }) : null,
    el("div", { class: "row" },
      el("button", { class: "btn small", text: lyr && lyr.source === "your lyrics" ? "Edit lyrics" : "Add your own lyrics", onclick: () => openLyricsEditor(song) }),
      settings.whiteMode ? el("button", { class: "btn small", id: "skip-timing", text: "Skip timing", onclick: () => openSkipEditor(song) }) : null
    )
  ].filter(Boolean));
  $("#start").disabled = false;
}

async function lookUpLyrics(song, duration) {
  if (state.lyricsCache.has(song.id)) return state.lyricsCache.get(song.id);
  if (state.lyricsPending.has(song.id)) return state.lyricsPending.get(song.id).promise;
  const request = { abort: new AbortController() };
  const timer = setTimeout(() => request.abort.abort(), 8000);
  state.lyricsPending.set(song.id, request);
  request.promise = findLyrics(song, duration, request.abort.signal).catch(() => ({ lines: [], source: "" })).then(found => {
    // A saved edit must not be overwritten by an older online lookup.
    if (state.lyricsPending.get(song.id) === request) state.lyricsCache.set(song.id, found);
    return state.lyricsCache.get(song.id) || found;
  }).finally(() => {
    clearTimeout(timer);
    if (state.lyricsPending.get(song.id) === request) state.lyricsPending.delete(song.id);
  });
  return request.promise;
}

function invalidateLyrics(song) {
  state.lyricsCache.delete(song.id);
  state.lyricsPending.get(song.id)?.abort.abort();
  state.lyricsPending.delete(song.id);
}

async function findLyrics(song, duration, signal) {
  const saved = store.get(`yeatle-karaoke-lrc:${song.id}`, null);
  if (saved) { const lines = parseLrc(saved); if (lines.length) return { lines, source: "your lyrics" }; }

  if (song.folder) {
    for (const name of ["lyrics.lrc", "Lyrics.lrc"]) {
      try {
        const res = await fetch(folderUrl(song, name), { signal });
        if (res.ok) { const lines = parseLrc(await res.text()); if (lines.length) return { lines, source: "the song folder" }; }
      } catch { /* not there */ }
    }
  }

  // a preview starts mid-song, so full-song lyrics wouldn't line up
  if (song.preview) return { lines: [], source: "" };
  return searchLyricsOnline(song.title.replace(/^.*?\s+[-–—]\s+/, ""), song.artist || state.artist || "Yeat", duration, signal);
}

const titleVariants = title => {
  const t = String(title || "");
  return [...new Set([
    t,
    t.replace(/\s*[([].*?[)\]]\s*/g, " "),
    t.replace(/\s*\b(feat|ft|with)\b\.?.*$/i, ""),
    t.replace(/\s+[-–]\s+.*$/, "")
  ].map(v => v.replace(/\s+/g, " ").trim()).filter(Boolean))];
};
const sameTitle = (a, b) => { const x = norm(a), y = norm(b); return Boolean(x && y && (x === y || x.startsWith(y + " ") || y.startsWith(x + " "))); };

// strip [Chorus] style headers and blank lines from plain lyrics
export function plainLyricLines(text) {
  return String(text || "").split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^[([].*[)\]]$/.test(l));
}

// Searches lrclib.net (synced or plain lyrics), then lyrics.ovh (plain) by title + artist.
async function searchLyricsOnline(title, artist, duration, signal) {
  const variants = titleVariants(title);
  const hits = [];
  const seen = new Set();
  const lrclib = async params => {
    try {
      const res = await fetch(`https://lrclib.net/api/search?${new URLSearchParams(params)}`, { credentials: "omit", signal });
      if (!res.ok) return;
      for (const r of await res.json()) {
        if (seen.has(r.id) || !(r.syncedLyrics || r.plainLyrics)) continue;
        if (!norm(r.artistName).includes(norm(artist)) || !variants.some(v => sameTitle(r.trackName, v))) continue;
        seen.add(r.id);
        hits.push(r);
      }
    } catch { /* offline or blocked */ }
  };
  for (const v of variants) {
    signal?.throwIfAborted();
    await lrclib({ track_name: v, artist_name: artist });
    if (hits.some(r => r.syncedLyrics)) break;
    signal?.throwIfAborted();
    await lrclib({ q: `${artist} ${v}` });
    if (hits.some(r => r.syncedLyrics)) break;
  }
  const closest = (a, b) => (duration ? Math.abs((a.duration || 0) - duration) - Math.abs((b.duration || 0) - duration) : 0);
  const synced = hits.filter(r => r.syncedLyrics && (!duration || !r.duration || Math.abs(r.duration - duration) <= 8)).sort(closest);
  if (synced.length) {
    const lines = parseLrc(synced[0].syncedLyrics);
    // keep a few other timings too; the one that fits the actual vocals gets picked later
    const seenText = new Set([synced[0].syncedLyrics.replace(/\s+/g, " ")]);
    const alternates = [];
    for (const r of synced.slice(1)) {
      const key = r.syncedLyrics.replace(/\s+/g, " ");
      if (seenText.has(key)) continue;
      seenText.add(key);
      alternates.push(r.syncedLyrics);
      if (alternates.length >= 4) break;
    }
    if (lines.length) return { lines, source: "lrclib.net", online: true, alternates };
  }
  const plain = hits.filter(r => r.plainLyrics).sort(closest);
  if (plain.length) {
    const lines = plainLyricLines(plain[0].plainLyrics);
    // (plain lyrics get placed on the sung phrases, so no alignment needed)
    if (lines.length) return { lines: [], plain: lines, source: "lrclib.net" };
  }
  for (const v of variants) {
    signal?.throwIfAborted();
    try {
      const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(v)}`, { credentials: "omit", signal });
      if (!res.ok) continue;
      const lines = plainLyricLines((await res.json()).lyrics);
      if (lines.length) return { lines: [], plain: lines, source: "lyrics.ovh" };
    } catch { /* offline or blocked */ }
  }
  return { lines: [], source: "" };
}

// Lyrics without timestamps get lined up with the sung phrases, in order.
export function timePlainLyrics(plain, phrases) {
  if (!plain || !plain.length || !phrases.length) return [];
  const out = [];
  const L = plain.length, P = phrases.length;
  if (L >= P) {
    for (let p = 0; p < P; p++) {
      const ph = phrases[p], from = Math.floor((p * L) / P), to = Math.floor(((p + 1) * L) / P);
      for (let k = from; k < to; k++) out.push({ t: ph.start + ((ph.end - ph.start) * (k - from)) / (to - from) - 0.15, text: plain[k], words: null });
    }
  } else {
    for (let i = 0; i < L; i++) out.push({ t: phrases[Math.floor((i * P) / L)].start - 0.15, text: plain[i], words: null });
  }
  // clear the old line during long breaks
  phrases.forEach((ph, i) => {
    const next = phrases[i + 1];
    if (!next || next.start - ph.end > 3) out.push({ t: ph.end + 0.8, text: "", words: null });
  });
  return out.sort((a, b) => a.t - b.t);
}

function openLyricsEditor(song) {
  const key = `yeatle-karaoke-lrc:${song.id}`;
  const area = el("textarea", { rows: 14, spellcheck: "false", placeholder: "[00:12.40] First lyric line\n[00:15.80] Next lyric line" });
  area.value = store.get(key, "") || "";
  const note = el("p", { class: "muted" });
  const close = () => modal.remove();
  const modal = el("div", { class: "modal" },
    el("div", { class: "modal-box" },
      el("h2", { text: `Lyrics for ${song.display}` }),
      el("p", { class: "muted", text: "Paste synced lyrics in LRC format: each line starts with its time, like [01:23.45]. lrclib.net has them for a lot of released songs, and any LRC maker works for unreleased ones." }),
      area, note,
      el("div", { class: "row" },
        el("button", { class: "btn primary", text: "Save", onclick: () => {
          if (!parseLrc(area.value).length) { note.textContent = "That doesn't have any timed lines like [00:12.40] yet."; return; }
          store.set(key, area.value);
          invalidateLyrics(song);
          close();
          lookUpLyrics(song).then(() => renderPicked());
        } }),
        el("button", { class: "btn", text: "Remove mine", onclick: () => { store.remove(key); invalidateLyrics(song); close(); lookUpLyrics(song).then(() => renderPicked()); } }),
        el("button", { class: "btn", text: "Cancel", onclick: close })
      )
    )
  );
  document.body.append(modal);
  area.focus();
}

// White people mode keeps its own best scores, so existing ones stay as they were.
const bestKey = (id, difficulty, white) => `yeatle-karaoke-best:${id}:${difficulty}${white ? ":wpm" : ""}`;
const skipPrefs = id => {
  const saved = store.get(`yeatle-karaoke-skips:${id}`, null) || {};
  return { auto: saved.auto !== false, marks: Array.isArray(saved.marks) ? saved.marks.filter(m => Number.isFinite(m.t) && Number.isFinite(m.len)) : [] };
};

// What the player can expect to be skipped, said plainly before they start.
function skipSummary(song, lyr) {
  const prefs = skipPrefs(song.id);
  const mine = prefs.marks.length ? ` Plus ${prefs.marks.length} skip time${prefs.marks.length === 1 ? "" : "s"} of your own.` : "";
  if (!lyr) return "Skips the n-word wherever the lyrics have it." + mine;
  const words = lyr.lines.length ? countSkipWords(lyr.lines) : countSkipWords(lyr.plain);
  const exact = lyr.lines.some(l => l.words && l.words.length);
  let text;
  if (!prefs.auto) text = "Times from the lyrics are turned off for this song, so only your own skip times count.";
  else if (!lyr.lines.length && !lyr.plain) text = "No lyrics, so nothing gets skipped automatically. Add skip times in Skip timing, or press K (Mark skip) while singing.";
  else if (!words) text = "These lyrics don't have any words to skip.";
  else {
    const n = `${words} word${words === 1 ? "" : "s"} to skip`;
    text = exact ? `${n}, timed word by word.`
      : lyr.lines.length ? `${n}. These lyrics are only timed per line, so each skip is an estimate (marked ≈ on the lane). If one is off, fix it in Skip timing.`
      : `${n}, but these lyrics have no timing at all, so the skips are rough guesses (≈). Set them in Skip timing for a fair round.`;
  }
  return text + mine;
}

function openSkipEditor(song) {
  const key = `yeatle-karaoke-skips:${song.id}`;
  const prefs = skipPrefs(song.id);
  const found = state.foundSkips.get(song.id);
  const area = el("textarea", { rows: 8, spellcheck: "false", placeholder: "1:23.4\n2:05.0 1.2" });
  area.value = formatSkipMarks(prefs.marks);
  const auto = el("input", { type: "checkbox" });
  auto.checked = prefs.auto;
  const note = el("p", { class: "muted" });
  const close = () => modal.remove();
  const foundText = found
    ? found.length ? `Found from the lyrics in your last round: ${found.map(s => `${s.exact ? "" : "≈"}${fmtTime(s.start)}–${fmtTime(s.end)}`).join(", ")}` : "Your last round found no skips in the lyrics."
    : "Sing a round in White people mode to see the times found from the lyrics here.";
  const modal = el("div", { class: "modal" },
    el("div", { class: "modal-box" },
      el("h2", { text: `Skip timing for ${song.display}` }),
      el("p", { class: "muted", text: "Add the moments to stay silent, one per line, as song time: 1:23.4 skips 0.8 seconds from 1:23.4, and 1:23.4 1.5 skips 1.5 seconds. Your times don't move when you nudge the lyric timing. Changes count from your next round." }),
      el("label", { class: "check" }, auto, " Also use the times found from the lyrics"),
      el("p", { class: "muted", text: foundText }),
      found && found.length ? el("button", { class: "btn small", text: "Copy those into my times", onclick: () => {
        const { marks } = parseSkipMarks(area.value);
        const merged = mergeSkips([...marksToSkips(marks), ...found]);
        area.value = formatSkipMarks(merged.map(s => {
          const t = Math.round((s.start + (s.mine ? 0.05 : 0)) * 10) / 10;
          return { t, len: clamp(Math.round((s.end - t) * 10) / 10, 0.2, 3) };
        }));
        auto.checked = false;
        note.textContent = "Copied. Edit any time that's off, then Save. Times from the lyrics are now off, so yours replace them.";
      } }) : null,
      area, note,
      el("div", { class: "row" },
        el("button", { class: "btn primary", text: "Save", onclick: () => {
          const { marks, bad } = parseSkipMarks(area.value);
          if (bad.length) { note.textContent = `Line ${bad.join(", ")} isn't a time like 1:23.4 or 1:23.4 1.2.`; return; }
          store.set(key, { auto: auto.checked, marks });
          close();
          renderPicked();
        } }),
        el("button", { class: "btn", text: "Clear my times", onclick: () => { area.value = ""; } }),
        el("button", { class: "btn", text: "Cancel", onclick: close })
      )
    )
  );
  document.body.append(modal);
  area.focus();
}

function renderPlayers() {
  const box = $("#players");
  if (!box) return;
  box.replaceChildren(...settings.players.map((player, index) => {
    const select = el("select", { onchange: async e => { player.deviceId = e.target.value; saveSettings(); await openMic(index); renderPlayers(); } },
      el("option", { value: "", text: "Default mic", selected: !player.deviceId }),
      ...mics.devices.filter(d => d.deviceId && d.deviceId !== "default").map((d, n) => el("option", { value: d.deviceId, text: d.label || `Mic ${n + 1}`, selected: player.deviceId === d.deviceId })),
      el("option", { value: "none", text: "No mic (just watch)", selected: player.deviceId === "none" })
    );
    return el("div", { class: "player-row", style: `--c:${COLORS[index]}` },
      el("span", { class: "dot" }),
      el("input", { value: player.name, maxlength: "16", "aria-label": `Singer ${index + 1} name`, oninput: e => { player.name = e.target.value || `Singer ${index + 1}`; saveSettings(); } }),
      select,
      el("div", { class: "meter" }, el("i", { "data-meter": index }), el("em", { style: `left:${clamp(micGate() / 0.25, 0, 1) * 100}%` })),
      el("span", { class: "heard", "data-heard": index }),
      index > 0 ? el("button", { class: "btn small", text: "✕", title: "Remove singer", onclick: async () => {
        settings.players.splice(index, 1);
        if (mics.detectors[index]) mics.detectors[index].stop();
        mics.detectors.splice(index, 1);
        mics.requests.splice(index, 1);
        saveSettings(); renderPlayers();
      } }) : null
    );
  }));
  $("#add-player").hidden = settings.players.length >= 4;
  $("#enable-mics").hidden = mics.allowed && mics.detectors.some(Boolean);
  $("#mic-error").textContent = mics.error;
}

// live level + note readout for each singer while on the setup screen
function setupMeters() {
  requestAnimationFrame(setupMeters);
  if ($("#setup").hidden) return;
  const gate = micGate();
  settings.players.forEach((_, index) => {
    const det = mics.detectors[index];
    const bar = document.querySelector(`[data-meter="${index}"]`), heard = document.querySelector(`[data-heard="${index}"]`);
    if (!bar || !heard) return;
    if (!det) { bar.style.width = "0%"; heard.textContent = ""; return; }
    const r = det.read(gate);
    bar.style.width = `${clamp(det.level / 0.25, 0, 1) * 100}%`;
    heard.textContent = r.voiced ? noteName(r.midi) : r.loud ? "~" : "";
  });
}

function buildOptions() {
  const diff = $("#difficulty");
  diff.replaceChildren(...Object.entries(DIFFICULTIES).map(([key, d]) => el("button", {
    class: "seg" + (settings.difficulty === key ? " on" : ""), text: d.label,
    onclick: () => { settings.difficulty = key; saveSettings(); buildOptions(); renderPicked(); }
  })));
  const bind = (id, key, fmt, after) => {
    const input = $(id), out = $(id + "-out");
    input.value = settings[key];
    out.textContent = fmt(settings[key]);
    input.oninput = () => { settings[key] = Number(input.value); out.textContent = fmt(settings[key]); saveSettings(); if (after) after(); };
  };
  bind("#volume", "volume", v => `${v}%`, applyVolume);
  bind("#guide", "guide", v => (v ? `${v}%` : "Off"), applyVolume);
  bind("#sensitivity", "sensitivity", v => `${v}%`, renderPlayers);
  bind("#mic-delay", "micDelay", v => `${v} ms`);
  const audio = $("#audio-delay"), audioOut = $("#audio-delay-out");
  const showAudio = () => {
    audio.value = settings.audioDelay != null ? settings.audioDelay : Math.round((audioContext?.outputLatency || 0) * 1000);
    audioOut.textContent = settings.audioDelay != null ? `${settings.audioDelay} ms` : "Auto";
  };
  showAudio();
  audio.oninput = () => { settings.audioDelay = Number(audio.value); saveSettings(); showAudio(); };
  $("#cal-audio").onclick = () => openCalibration("tap");
  $("#cal-mic").onclick = () => openCalibration("mic");
  $("#reset-delays").onclick = () => {
    settings.audioDelay = null;
    settings.micDelay = 90;
    saveSettings();
    buildOptions();
  };
  const white = $("#white-mode");
  white.checked = Boolean(settings.whiteMode);
  white.onchange = () => { settings.whiteMode = white.checked; saveSettings(); renderPicked(); };
  const speakers = $("#speakers");
  speakers.checked = settings.speakers;
  speakers.onchange = () => { settings.speakers = speakers.checked; saveSettings(); if (mics.allowed) openAllMics(); };
}

/* ---------- delay calibration ---------- */

// Matches what the player did (taps or claps, in seconds on the audio clock) to the
// beeps they heard. "nearest" suits taps; "first" suits claps, which can only come late.
export function estimateDelay(clicks, events, before, after, mode = "nearest") {
  const offsets = [];
  for (const c of clicks) {
    const inside = events.filter(e => e >= c - before && e < c + after);
    if (!inside.length) continue;
    const pick = mode === "first" ? Math.min(...inside) : inside.sort((a, b) => Math.abs(a - c) - Math.abs(b - c))[0];
    offsets.push(pick - c);
  }
  if (offsets.length < Math.ceil(clicks.length * 0.6)) return { ok: false, reason: "few", count: offsets.length };
  const delay = median(offsets);
  const spread = median(offsets.map(o => Math.abs(o - delay)));
  return { ok: spread <= 0.05, reason: spread <= 0.05 ? "" : "uneven", delay, spread, count: offsets.length };
}

function beep(ctx, when, high, level = 0.6, out = ctx.destination) {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.frequency.value = high ? 1320 : 880;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(level, when + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
  osc.connect(gain); gain.connect(out);
  osc.start(when); osc.stop(when + 0.07);
  return osc;
}

function openCalibration(kind) {
  const tap = kind === "tap";
  const title = tap ? "Tap test: audio delay" : "Clap test: mic delay";
  const intro = tap
    ? "Put on the headphones or speakers you'll sing with. You'll hear 4 count-in beeps, then 8 more. Tap along to the 8 by ear (Space, Enter, or the circle), not by watching the screen."
    : "Use the mic you'll sing with. You'll hear 4 count-in beeps, then 8 more. Clap, or say \"ta\" sharply, on each of the 8. Stay quiet between beeps.";
  const status = el("p", { class: "cal-status", text: "Press Start when you're ready." });
  const dots = el("div", { class: "cal-dots" }, ...Array.from({ length: 8 }, () => el("i")));
  const pad = tap ? el("button", { class: "cal-pad", text: "Tap" }) : el("div", { class: "cal-pad mic" }, el("span", { text: "🎤" }));
  const result = el("p", { class: "muted" });
  const startBtn = el("button", { class: "btn primary", text: "Start" });
  const useBtn = el("button", { class: "btn primary", text: "Use this", hidden: true });
  const closeBtn = el("button", { class: "btn", text: "Close" });
  const box = el("div", { class: "modal-box cal" }, el("h2", { text: title }), el("p", { class: "muted", text: intro }), pad, status, dots, result, el("div", { class: "row" }, startBtn, useBtn, closeBtn));
  const modal = el("div", { class: "modal" }, box);
  document.body.append(modal);

  let run = null, found = null;
  const onKey = e => {
    if (e.key === "Escape") { close(); return; }
    if (tap && run && (e.key === " " || e.key === "Enter")) { e.preventDefault(); if (!e.repeat) run.events.push(audioCtx().currentTime); }
  };
  if (tap) pad.addEventListener("pointerdown", e => { e.preventDefault(); if (run) run.events.push(audioCtx().currentTime); });
  document.addEventListener("keydown", onKey, true);
  function close() {
    if (run) run.stop = true;
    document.removeEventListener("keydown", onKey, true);
    modal.remove();
  }
  closeBtn.onclick = close;

  useBtn.onclick = () => {
    if (found == null) return;
    if (tap) settings.audioDelay = found; else settings.micDelay = found;
    saveSettings();
    buildOptions();
    close();
  };

  startBtn.onclick = async () => {
    const ctx = audioCtx();
    await ctx.resume();
    let det = null;
    if (!tap) {
      if (!mics.allowed) await enableMics();
      det = mics.detectors.find(Boolean);
      if (!det) { status.textContent = "Turn on a mic first (Singers → Turn on mics)."; return; }
    }
    found = null;
    useBtn.hidden = true;
    startBtn.hidden = true;
    result.textContent = "";
    dots.querySelectorAll("i").forEach(d => d.className = "");
    const beat = tap ? 0.6 : 0.8, lead = 4, count = 8;
    const t0 = ctx.currentTime + (tap ? 0.5 : 1.2);
    const clicks = [];
    for (let i = 0; i < lead + count; i++) { const t = t0 + i * beat; beep(ctx, t, i >= lead); if (i >= lead) clicks.push(t); }
    const before = tap ? 0.3 : 0.1, after = tap ? 0.3 : 0.6;
    run = { events: [], stop: false };
    const r = run;
    let lastScan = ctx.currentTime, quietPeak = 0, lastOnset = -1;
    const heardDelay = audioDelaySeconds();

    const frame = () => {
      if (r.stop) return;
      const now = ctx.currentTime;
      if (det) {
        // find claps in the samples that arrived since the last frame
        det.analyser.getFloatTimeDomainData(det.raw);
        const N = det.raw.length, fresh = Math.min(N, Math.max(0, Math.round((now - lastScan) * ctx.sampleRate)));
        lastScan = now;
        const threshold = Math.max(0.08, quietPeak * 3);
        for (let i = N - fresh; i < N; i++) {
          const v = Math.abs(det.raw[i]), t = now - (N - i) / ctx.sampleRate;
          if (t < t0 - 0.05) { quietPeak = Math.max(quietPeak, v); continue; }
          if (v > threshold && t - lastOnset > 0.3) { r.events.push(t); lastOnset = t; }
        }
      }
      const heard = now - heardDelay;
      const beatNo = Math.floor((heard - t0) / beat);
      if (heard < t0) status.textContent = "Get ready…";
      else if (beatNo < lead) status.textContent = `${lead - beatNo}…`;
      else if (beatNo < lead + count) status.textContent = tap ? "Tap!" : "Clap!";
      clicks.forEach((c, k) => {
        if (now < c + after) return;
        const got = r.events.some(e => e >= c - before && e < c + after);
        dots.children[k].className = got ? "hit" : "miss";
      });
      if (now < clicks[clicks.length - 1] + after + 0.1) { requestAnimationFrame(frame); return; }

      run = null;
      startBtn.hidden = false;
      startBtn.textContent = "Try again";
      const est = estimateDelay(clicks, r.events, before, after, tap ? "nearest" : "first");
      if (!est.ok) {
        status.textContent = est.reason === "few" ? (tap ? "Not enough taps landed near the beeps." : "The mic didn't pick up enough claps.") : (tap ? "Your taps were uneven." : "The claps were uneven.");
        result.textContent = est.reason === "few" && !tap ? "Clap louder or closer to the mic, or raise Mic sensitivity, then try again." : "Try again and keep a steady rhythm.";
        return;
      }
      if (tap) {
        found = clamp(Math.round((est.delay * 1000) / 5) * 5, 0, 500);
        status.textContent = `Your audio delay is ${found} ms.`;
        result.textContent = found > 150 ? "That's high, which is normal for Bluetooth headphones." : "";
      } else {
        // claps arrive after the sound reached you (audio delay) plus the mic's own delay
        found = clamp(Math.round((est.delay - heardDelay + 0.02) * 1000 / 5) * 5, 0, 400);
        status.textContent = `Your mic delay is ${found} ms.`;
        result.textContent = settings.audioDelay == null ? "Tip: do the tap test first, so this number doesn't include your headphone delay." : "";
      }
      useBtn.hidden = false;
    };
    requestAnimationFrame(frame);
  };
}

/* ---------- loading a song ---------- */

const folderUrl = (song, file) => "Songs/" + String(song.folder).split("/").map(encodeURIComponent).join("/") + "/" + file;

async function fetchBytes(url, job) {
  const res = await fetch(url, { signal: job.abort.signal });
  if (!res.ok) throw new Error(`couldn't load ${url.split("/").pop()} (${res.status})`);
  return res.arrayBuffer();
}
const decode = bytes => new OfflineAudioContext(2, 1, SR).decodeAudioData(bytes);

async function loadStemSong(song, job) {
  job.check();
  job.status("Loading the HQ stems…", 0);
  let done = 0;
  const names = ["drums", "bass", "other", "vocals"];
  const decoded = await Promise.all(names.map(async name => {
    let bytes;
    try { bytes = await fetchBytes(folderUrl(song, `${name}.mp3`), job); }
    catch (err) { if (job.cancelled) throw err; bytes = await fetchBytes(folderUrl(song, `${name[0].toUpperCase()}${name.slice(1)}.mp3`), job); }
    const buffer = await decode(bytes);
    job.check();
    job.status("Loading the HQ stems…", ++done / names.length);
    return buffer;
  }));
  const [drums, bass, other, vox] = decoded;
  job.check();
  const length = Math.max(...decoded.map(b => b.length));
  const ctx = audioCtx();
  const inst = ctx.createBuffer(2, length, SR), guide = ctx.createBuffer(2, length, SR);
  for (let ch = 0; ch < 2; ch++) {
    const out = inst.getChannelData(ch);
    for (const b of [drums, bass, other]) {
      const src = b.getChannelData(Math.min(ch, b.numberOfChannels - 1));
      for (let i = 0; i < src.length; i++) out[i] += src[i];
    }
    guide.copyToChannel(vox.getChannelData(Math.min(ch, vox.numberOfChannels - 1)), ch);
  }
  const vocals = new Float32Array(length);
  const vl = vox.getChannelData(0), vr = vox.getChannelData(vox.numberOfChannels > 1 ? 1 : 0);
  for (let i = 0; i < vl.length; i++) vocals[i] = (vl[i] + vr[i]) * 0.5;
  return { inst, guide, vocals, duration: length / SR };
}

function runSplitter(left, right, stems, job) {
  return new Promise((resolve, reject) => {
    job.check();
    const worker = new Worker(new URL(`./separator.worker.js?v=${VERSION}`, import.meta.url), { type: "module" });
    let revision = null, settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      job.onCancel = null;
      worker.terminate();
      fn(value);
    };
    job.onCancel = () => finish(reject, new Error("cancelled"));
    worker.onmessage = ({ data }) => {
      if (data.type === "status") {
        if (data.revision) revision = data.revision;
        job.status(data.text || "Splitting the vocals off the beat…", data.text ? null : 0);
        return;
      }
      if (data.id !== 1) return;
      if (data.type === "segment") {
        for (const name of ["drums", "bass", "other"]) stems[name].copyToChannel(data.stems[name], 0, data.from);
        job.status("Splitting the vocals off the beat…", data.done / data.splits);
      } else if (data.type === "done") finish(resolve, revision);
      else if (data.type === "error") finish(reject, new Error(data.message));
    };
    worker.onerror = event => finish(reject, new Error(event.message || "The song splitter couldn't start in this browser."));
    const l = new Float32Array(left), r = new Float32Array(right);
    worker.postMessage({ type: "split", id: 1, left: l, right: r, urgent: true }, [l.buffer, r.buffer]);
  });
}

async function loadSplitSong(song, job) {
  job.check();
  job.status("Downloading the song…", null);
  const bytes = await fetchBytes(`api/audio/${encodeURIComponent(song.audioId || song.id)}`, job);
  const ctx = audioCtx();
  let cache = null, hash = null;
  try {
    cache = await import(`./stem-cache.mjs?v=${VERSION}`);
    if (!cache.canCacheStems(ctx)) cache = null;
    else hash = await cache.hashAudio(bytes);
  } catch { cache = null; }

  job.status("Decoding the song…", null);
  const mix = await decode(bytes);
  job.check();
  const total = mix.length;
  const left = mix.getChannelData(0), right = mix.numberOfChannels > 1 ? mix.getChannelData(1) : left;
  const stems = { drums: ctx.createBuffer(1, total, SR), bass: ctx.createBuffer(1, total, SR), other: ctx.createBuffer(1, total, SR) };

  let revision = await fetch("api/separator-revision", { cache: "no-store", signal: job.abort.signal }).then(r => r.json()).then(j => j.revision || null).catch(() => null);
  job.check();
  let saved = false;
  if (cache && hash) {
    job.status("Checking for saved stems…", null);
    saved = await cache.loadStems(cache.stemCacheKey(hash, revision, SR), stems, total, () => job.cancelled);
  }
  if (!saved) {
    job.check();
    revision = (await runSplitter(left, right, stems, job)) || revision;
    job.check();
    const key = cache && hash ? cache.stemCacheKey(hash, revision, SR) : null;
    if (key) cache.saveStems(key, stems, total).catch(() => {});
  }

  job.check();
  // instrumental = the mix with the vocals taken out, which keeps it in stereo
  const d = stems.drums.getChannelData(0), b = stems.bass.getChannelData(0), o = stems.other.getChannelData(0);
  const vocals = new Float32Array(total);
  const inst = ctx.createBuffer(2, total, SR);
  const il = inst.getChannelData(0), ir = inst.getChannelData(1);
  for (let i = 0; i < total; i++) {
    const v = (left[i] + right[i]) * 0.5 - (d[i] + b[i] + o[i]);
    vocals[i] = v;
    il[i] = left[i] - v;
    ir[i] = right[i] - v;
  }
  const guide = ctx.createBuffer(1, total, SR);
  guide.copyToChannel(vocals, 0);
  return { inst, guide, vocals, duration: total / SR };
}

function makeJob() {
  const job = {
    cancelled: false, abort: new AbortController(), onCancel: null,
    check() { if (job.cancelled) throw new Error("cancelled"); },
    status(text, progress) {
      if (job.cancelled) return;
      $("#load-text").textContent = text;
      const bar = $("#load-bar");
      bar.classList.toggle("busy", progress == null);
      if (progress != null) bar.style.setProperty("--p", `${Math.round(clamp(progress, 0, 1) * 100)}%`);
    },
    cancel() { job.cancelled = true; job.abort.abort(); if (job.onCancel) job.onCancel(); }
  };
  return job;
}

async function startSong() {
  const song = state.song;
  if (!song || state.job) return;
  const job = makeJob();
  state.job = job;
  $("#load-title").textContent = song.display;
  showScreen("loading");
  try {
    await audioCtx().resume();
    job.check();
    if (!mics.allowed && settings.players.some(p => p.deviceId !== "none")) {
      job.status("Waiting for microphone access…", null);
      await enableMics();
      job.check();
    }
    const audio = song.mode === "stems" ? await loadStemSong(song, job) : await loadSplitSong(song, job);
    if (job.cancelled) return;
    job.status("Looking for lyrics…", null);
    let lyrics = state.lyricsCache.get(song.id);
    if (!lyrics || (!lyrics.lines.length && !lyrics.plain && !song.preview)) {
      lyrics = await lookUpLyrics(song, audio.duration);
    }
    job.check();
    job.status("Mapping out the vocal notes…", 0);
    const analysis = await analyzeVocals(audio.vocals, SR, p => job.status("Mapping out the vocal notes…", p), () => job.cancelled);
    const chart = buildChart(analysis);
    if (!chart.phrases.length) throw new Error("Couldn't find any vocals to sing in this song.");
    if (job.cancelled) return;
    state.job = null;
    let lines = lyrics.lines.length ? lyrics.lines : timePlainLyrics(lyrics.plain, chart.phrases);
    let lyricNote = "";
    if (lyrics.online && lyrics.lines.length) {
      // try every online timing against the vocals and keep the best fit
      const options = [lyrics.lines, ...(lyrics.alternates || []).map(parseLrc)].filter(l => l.length);
      let best = null;
      for (const option of options) {
        const fit = alignLyrics(option, chart);
        if (!best || fit.score > best.score) best = fit;
      }
      lines = best.lines;
      if (Math.abs(best.shift) >= 0.3) lyricNote = `Lyrics lined up with the vocals (moved ${Math.abs(best.shift).toFixed(1)}s ${best.shift > 0 ? "later" : "earlier"})`;
    }
    const lyricKind = lyrics.lines.length ? (lines.some(l => l.words && l.words.length) ? "word" : "line") : lyrics.plain ? "plain" : "none";
    beginGame(song, audio, chart, lines, lyricKind);
    if (lyricNote) showToast(lyricNote);
  } catch (err) {
    if (job.cancelled) return;
    state.job = null;
    $("#load-text").textContent = `Something went wrong: ${err.message || err}`;
    $("#load-bar").classList.remove("busy");
  }
}

/* ---------- the game ---------- */

let game = null;

function beginGame(song, audio, chart, lyrics, lyricKind = "line") {
  const ctx = audioCtx();
  const instGain = ctx.createGain(), guideGain = ctx.createGain();
  instGain.connect(ctx.destination);
  guideGain.connect(ctx.destination);

  game = {
    song, audio, chart, lyrics, lyricKind, instGain, guideGain,
    difficulty: settings.difficulty, tolerance: DIFFICULTIES[settings.difficulty].tolerance,
    // the scoring option is fixed for the whole round; changing it means starting a new one
    whiteMode: Boolean(settings.whiteMode), skipPrefs: settings.whiteMode ? skipPrefs(song.id) : null, skips: [],
    lyricShift: store.get(`yeatle-karaoke-shift:${song.id}`, 0),
    sources: [], startCtx: 0, startOffset: 0, paused: false, raf: 0, wakeLock: null
  };
  game.players = settings.players.map((p, index) => ({ index, name: p.name, color: COLORS[index], detector: mics.detectors[index] || null }));
  // iPhones mute Web Audio with the silent switch unless the page says it plays media (Safari 17+).
  // An open microphone already switches iOS to recording playback, so only "No mic" rounds need this.
  if (!game.players.some(p => p.detector)) {
    try { if (navigator.audioSession && navigator.audioSession.type === "auto") navigator.audioSession.type = "playback"; } catch { /* unsupported */ }
  }
  applyVolume();
  applySkips(game);
  if (game.whiteMode) state.foundSkips.set(song.id, game.foundSkips);
  buildStage();
  resetRun();
  playFrom(0, COUNT_IN);
  showScreen("stage");
  resizeCanvas();
  const currentGame = game;
  try { navigator.wakeLock?.request("screen").then(lock => {
    if (game === currentGame && !currentGame.ended) currentGame.wakeLock = lock;
    else lock.release().catch(() => {});
  }).catch(() => {}); } catch { /* not supported */ }
  game.raf = requestAnimationFrame(tick);
}

// Works out this round's skip windows (none outside White people mode) and marks them on the notes.
function applySkips(g) {
  g.foundSkips = g.whiteMode && g.skipPrefs.auto ? findSkips(g.lyrics, g.chart, g.lyricShift, g.lyricKind) : [];
  g.skips = g.whiteMode ? mergeSkips([...g.foundSkips, ...marksToSkips(g.skipPrefs.marks)]) : [];
  g.skipsEstimated = g.skips.some(s => !s.exact);
  markFreeTime(g.chart, g.skips);
}

function resetRun() {
  const n = game.players.length;
  game.chart.notes.forEach(note => { note.hits = Array.from({ length: n }, () => []); note.hitTime = new Array(n).fill(0); });
  game.chart.phrases.forEach(ph => { ph.results = new Array(n).fill(null); });
  game.players.forEach(p => Object.assign(p, {
    score: 0, mult: 1, streak: 0, bestStreak: 0, accSum: 0, durSum: 0, skipped: 0,
    counts: Object.fromEntries(RATINGS.map(r => [r.cls, 0])), trail: [], lastMidi: NaN, shown: {}
  }));
  game.noteIdx = 0; game.phraseIdx = 0; game.drawIdx = 0; game.lyricIdx = 0; game.lastT = null; game.shownLine = -2;
  game.ended = false;
}

// music volume scales the beat and the guide vocals together
function applyVolume() {
  if (!game) return;
  const volume = settings.volume / 100;
  game.instGain.gain.value = volume;
  game.guideGain.gain.value = volume * (settings.guide / 100);
}

function playbackTime() {
  const ctx = audioCtx();
  return game.startOffset + (ctx.currentTime - game.startCtx) - audioDelaySeconds();
}

// how late sound reaches the singer's ears: the tap test's result, else the browser's guess
function audioDelaySeconds() {
  return settings.audioDelay != null ? settings.audioDelay / 1000 : (audioCtx().outputLatency || 0);
}

function stopSources() {
  game.sources.forEach(src => { try { src.stop(); } catch { /* not started */ } src.disconnect(); });
  game.sources = [];
}

// countIn: seconds of 3-2-1 before the music starts; the notes scroll in meanwhile
function playFrom(offset, countIn = 0) {
  const ctx = audioCtx();
  stopSources();
  const inst = ctx.createBufferSource(), guide = ctx.createBufferSource();
  inst.buffer = game.audio.inst; guide.buffer = game.audio.guide;
  inst.connect(game.instGain); guide.connect(game.guideGain);
  const when = ctx.currentTime + 0.08 + countIn;
  inst.start(when, offset); guide.start(when, offset);
  game.sources = [inst, guide];
  for (let k = Math.round(countIn); k >= 1; k--) game.sources.push(beep(ctx, when - k, false, 0.25, game.instGain));
  game.startCtx = when;
  game.startOffset = offset;
  game.lastT = null;
}

function setPaused(paused) {
  if (!game || game.ended || game.paused === paused) return;
  game.paused = paused;
  $("#pause").hidden = !paused;
  if (paused) audioCtx().suspend(); else audioCtx().resume();
}

function tick() {
  if (!game || game.ended) return;
  game.raf = requestAnimationFrame(tick);
  const heard = playbackTime();
  const t = heard - settings.micDelay / 1000;
  const gate = micGate();
  const { notes, phrases } = game.chart;

  if (!game.paused) {
    if (game.lastT == null) game.lastT = t;
    const dt = clamp(t - game.lastT, 0, 0.1);
    scoreFrame(game, t, dt, gate);
    while (game.noteIdx < notes.length && notes[game.noteIdx].end <= t) game.noteIdx++;
    while (game.phraseIdx < phrases.length && phrases[game.phraseIdx].end <= t) finishPhrase(game.phraseIdx++);
    game.lastT = t;
  }

  draw(t);
  updateCountdown(heard);
  updateLyrics(heard + game.lyricShift);
  updateHud(t);
  if (heard >= game.audio.duration + 0.3) showResults();
}

function finishPhrase(index) {
  const results = scorePhrase(game, index);
  game.players.forEach((p, pi) => popRating(p, results[pi].rating, results[pi].points));
}

function popRating(p, rating, points) {
  const pop = p.card.querySelector(".pop");
  pop.textContent = !rating ? "Skipped" : points ? `${rating.text} +${points.toLocaleString()}` : rating.text;
  pop.className = `pop ${rating ? rating.cls : "skipped"}`;
  void pop.offsetWidth;
  pop.classList.add("show");
}

/* ---------- drawing ---------- */

function buildStage() {
  const stage = $("#stage");
  $("#stage-title").textContent = game.song.display;
  $("#stage-diff").textContent = DIFFICULTIES[game.difficulty].label + (game.whiteMode
    ? ` · White people mode · ${game.skips.length ? `${game.skips.length} skip${game.skips.length === 1 ? "" : "s"}${game.skipsEstimated ? " (≈ estimated)" : ""}` : "no skips found"}`
    : "");
  $("#mark-skip").hidden = !game.whiteMode;
  $("#stage-volume").value = settings.volume;
  const cards = $("#cards");
  cards.replaceChildren(...game.players.map(p => {
    p.card = el("div", { class: "card", style: `--c:${p.color}` },
      el("div", { class: "card-top" }, el("b", { text: p.name }), el("span", { class: "mult", text: "x1" })),
      el("div", { class: "score", text: "0" }),
      el("div", { class: "phrase-meter" }, el("i")),
      el("div", { class: "pop" }),
      p.detector ? null : el("small", { class: "muted", text: "no mic" })
    );
    return p.card;
  }));
  stage.dataset.players = String(game.players.length);
  $("#lyric-now").textContent = "";
  $("#lyric-next").textContent = game.lyrics.length ? "" : "No synced lyrics for this one. Follow the notes!";
}

function resizeCanvas() {
  if (!game) return;
  const canvas = $("#lane");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  game.g = canvas.getContext("2d");
  game.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  game.size = { w, h };
}

function pill(g, x, y, w, h) {
  const r = Math.min(h / 2, w / 2);
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
}

function draw(t) {
  const g = game.g;
  if (!g) return;
  const { w, h } = game.size;
  const { notes, phrases, lo, hi } = game.chart;
  g.clearRect(0, 0, w, h);

  const top = 10, bottom = h - 10;
  const nowX = Math.max(64, w * 0.2);
  const pps = (w - nowX) / LEAD;
  const X = tt => nowX + (tt - t) * pps;
  const Y = m => bottom - ((clamp(m, lo - 1, hi + 1) - lo) / (hi - lo)) * (bottom - top - 16) - 8;
  const row = (bottom - top) / (hi - lo);
  const tubeH = clamp(row * 0.95, 8, 22);
  const tStart = t - nowX / pps;

  // lane
  g.fillStyle = "rgba(10, 6, 18, 0.82)";
  pill(g, 0, top, w, bottom - top); g.fill();
  g.lineWidth = 1;
  for (let m = Math.ceil(lo); m <= hi; m++) {
    g.strokeStyle = m % 12 === 0 ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.035)";
    g.beginPath(); g.moveTo(0, Y(m)); g.lineTo(w, Y(m)); g.stroke();
  }
  // phrase ends
  g.strokeStyle = "rgba(181,101,224,0.35)";
  g.setLineDash([4, 6]);
  for (let k = Math.max(0, game.phraseIdx - 2); k < phrases.length && phrases[k].start < t + LEAD; k++) {
    const x = X(phrases[k].end);
    if (x < 0) continue;
    g.beginPath(); g.moveTo(x, top + 4); g.lineTo(x, bottom - 4); g.stroke();
  }
  g.setLineDash([]);

  // notes
  while (game.drawIdx < notes.length && notes[game.drawIdx].end < tStart) game.drawIdx++;
  const n = game.players.length;
  for (let k = game.drawIdx; k < notes.length && notes[k].start < t + LEAD + 0.2; k++) {
    const note = notes[k];
    const x1 = X(note.start), x2 = X(note.end);
    const bandH = tubeH;
    const y0 = Y(note.midi) - bandH / 2;
    const passed = note.end < t;
    g.fillStyle = passed ? "rgba(255,255,255,0.18)" : "rgba(240,232,255,0.92)";
    pill(g, x1, y0, x2 - x1, bandH); g.fill();
    if (!passed && x1 < nowX) {
      g.save(); g.beginPath(); g.rect(0, 0, nowX, h); g.clip();
      g.fillStyle = "rgba(60,50,80,0.85)";
      pill(g, x1, y0, x2 - x1, bandH); g.fill();
      g.restore();
    }
    // what each singer actually hit, as coloured stripes
    const stripe = bandH / n;
    note.hits.forEach((spans, pi) => {
      if (!spans.length) return;
      g.fillStyle = game.players[pi].color;
      spans.forEach(([a, b]) => {
        const sx = X(a), ex = Math.max(X(b), sx + 1);
        pill(g, sx, y0 + pi * stripe, ex - sx, stripe); g.fill();
      });
    });
  }

  // White people mode: shade the moments you can stay silent through
  for (const s of game.skips) {
    if (s.end < tStart || s.start > t + LEAD + 0.2) continue;
    const x1 = Math.max(0, X(s.start)), x2 = Math.min(w, X(s.end));
    if (x2 <= x1) continue;
    g.fillStyle = "rgba(12, 8, 20, 0.6)"; g.fillRect(x1, top, x2 - x1, bottom - top);
    g.fillStyle = s.exact ? "rgba(255, 196, 107, 0.2)" : "rgba(255, 196, 107, 0.11)"; g.fillRect(x1, top, x2 - x1, bottom - top);
    g.strokeStyle = "rgba(255, 196, 107, 0.85)"; g.lineWidth = 1.5;
    g.setLineDash(s.exact ? [] : [5, 5]);
    g.beginPath(); g.moveTo(x1, top); g.lineTo(x1, bottom); g.moveTo(x2, top); g.lineTo(x2, bottom); g.stroke();
    g.setLineDash([]);
    if (x2 - x1 > 34) {
      g.fillStyle = "#ffc46b"; g.font = "700 11px system-ui, sans-serif"; g.textBaseline = "top";
      g.fillText(s.exact ? "SKIP" : "≈ SKIP", x1 + 5, top + 6);
    }
  }

  // now line
  const glow = g.createLinearGradient(nowX - 14, 0, nowX + 14, 0);
  glow.addColorStop(0, "rgba(181,101,224,0)"); glow.addColorStop(0.5, "rgba(181,101,224,0.45)"); glow.addColorStop(1, "rgba(181,101,224,0)");
  g.fillStyle = glow; g.fillRect(nowX - 14, top, 28, bottom - top);
  g.fillStyle = "#fff"; g.fillRect(nowX - 1, top, 2, bottom - top);

  // singers' pitch trails and arrows
  game.players.forEach(p => {
    g.strokeStyle = p.color; g.lineWidth = 3; g.globalAlpha = 0.85;
    g.beginPath();
    let pen = false;
    p.trail.forEach(pt => {
      if (Number.isNaN(pt.m)) { pen = false; return; }
      const x = X(pt.t), y = Y(pt.m);
      if (pen) g.lineTo(x, y); else g.moveTo(x, y);
      pen = true;
    });
    g.stroke(); g.globalAlpha = 1;
    const r = p.reading;
    if (!Number.isNaN(p.lastMidi)) {
      const y = Y(r && r.voiced ? p.trail[p.trail.length - 1].m : p.lastMidi);
      g.globalAlpha = r && r.voiced ? 1 : 0.35;
      g.fillStyle = p.color; g.strokeStyle = "#fff"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(nowX + 13, y); g.lineTo(nowX - 9, y - 10); g.lineTo(nowX - 9, y + 10); g.closePath();
      g.fill(); g.stroke(); g.globalAlpha = 1;
    }
  });
}

function updateLyrics(lt) {
  const lines = game.lyrics;
  if (!lines.length) return;
  while (game.lyricIdx < lines.length - 1 && lines[game.lyricIdx + 1].t <= lt) game.lyricIdx++;
  while (game.lyricIdx > 0 && lines[game.lyricIdx].t > lt) game.lyricIdx--;
  const i = game.lyricIdx;
  const started = lines[i].t <= lt;
  const current = started && lines[i].text ? i : -1;
  let next = -1;
  for (let k = started ? i + 1 : i; k < lines.length; k++) if (lines[k].text) { next = k; break; }
  if (current < 0 && next >= 0 && lines[next].t - lt > 6) next = -1;

  const nowEl = $("#lyric-now"), nextEl = $("#lyric-next");
  if (game.shownLine !== current) {
    game.shownLine = current;
    const line = lines[current];
    if (!line) nowEl.replaceChildren();
    else if (line.words) nowEl.replaceChildren(...line.words.map(w => el("span", { class: "w" + (game.whiteMode && skipTokens(w.text).some(x => x.skip) ? " skip" : ""), text: w.text + " " })));
    else if (game.whiteMode && skipTokens(line.text).some(x => x.skip)) {
      // keep one sweep span (its gradient fills the whole line) and mark the skipped words inside it
      const sweep = el("span", { class: "sweep" });
      let at = 0;
      skipTokens(line.text).filter(x => x.skip).forEach(x => {
        sweep.append(line.text.slice(at, x.index), el("span", { class: "skip-word", text: x.text }));
        at = x.index + x.text.length;
      });
      sweep.append(line.text.slice(at));
      nowEl.replaceChildren(sweep);
    }
    else nowEl.replaceChildren(el("span", { class: "sweep", text: line.text }));
  }
  const nextText = next >= 0 ? lines[next].text : "";
  if (nextEl.textContent !== nextText) nextEl.textContent = nextText;

  const line = lines[current];
  if (!line) return;
  if (line.words) {
    nowEl.querySelectorAll(".w").forEach((span, k) => span.classList.toggle("sung", line.words[k].t <= lt));
  } else {
    const end = lines[i + 1] ? lines[i + 1].t : line.t + 5;
    const dur = Math.min(end - line.t, Math.max(0.8, line.text.length * 0.065));
    nowEl.firstChild.style.setProperty("--p", `${clamp((lt - line.t) / dur, 0, 1) * 100}%`);
  }
}

function updateCountdown(heard) {
  const box = $("#countdown");
  const text = heard < 0 ? String(Math.min(COUNT_IN, Math.ceil(-heard))) : heard < 0.6 ? "Go!" : "";
  if (box.textContent !== text) {
    box.textContent = text;
    box.classList.remove("tick");
    if (text) { void box.offsetWidth; box.classList.add("tick"); }
  }
}

function updateHud(t) {
  const { phrases } = game.chart;
  const ph = phrases[game.phraseIdx];
  game.players.forEach((p, pi) => {
    const card = p.card;
    if (p.shown.score !== p.score) { p.shown.score = p.score; card.querySelector(".score").textContent = p.score.toLocaleString(); }
    if (p.shown.mult !== p.mult) {
      p.shown.mult = p.mult;
      const m = card.querySelector(".mult");
      m.textContent = `x${p.mult}`;
      m.dataset.level = String(p.mult);
    }
    let live = 0;
    if (ph && ph.start < t) {
      let sung = 0, elapsed = 0;
      for (const note of ph.notes) {
        if (note.start >= t) break;
        elapsed += Math.min(note.end, t) - note.start;
        sung += note.hitTime[pi] + (p.detector ? freeIn(note, note.start, Math.min(note.end, t)) : 0);
      }
      live = elapsed > 0 ? clamp((sung / elapsed) * 1.12, 0, 1) : 0;
    }
    card.querySelector(".phrase-meter i").style.width = `${live * 100}%`;
  });

  // skip long intros, breaks and outros
  const heard = playbackTime();
  const nextPh = phrases[game.phraseIdx];
  const skip = $("#skip");
  let target = null, label = "";
  if (heard < 0) { /* counting in */ }
  else if (!nextPh) { if (game.audio.duration - heard > 4) { target = "end"; label = "Finish (S)"; } }
  else if (nextPh.start - t > 7) { target = nextPh.start - 2.5; label = "Skip ahead (S)"; }
  game.skipTarget = target;
  skip.hidden = target == null || game.paused;
  if (!skip.hidden && skip.textContent !== label) skip.textContent = label;
  $("#progress").style.width = `${clamp(heard / game.audio.duration, 0, 1) * 100}%`;
}

function skipAhead() {
  if (!game || game.skipTarget == null || game.paused) return;
  if (game.skipTarget === "end") { showResults(); return; }
  playFrom(game.skipTarget);
}

function shiftLyrics(delta) {
  if (!game || !game.lyrics.length) return;
  game.lyricShift = Math.round((game.lyricShift + delta) * 10) / 10;
  store.set(`yeatle-karaoke-shift:${game.song.id}`, game.lyricShift);
  game.shownLine = -2;
  // skips found from the lyrics move with them
  if (game.whiteMode) applySkips(game);
  showToast(`Lyrics ${game.lyricShift > 0 ? "earlier" : game.lyricShift < 0 ? "later" : "timing reset"}${game.lyricShift ? ` by ${Math.abs(game.lyricShift).toFixed(1)}s` : ""}`);
}

// Saves a skip time for the song from what you hear right now (allowing a moment to react).
function markSkip() {
  if (!game || game.ended || !game.whiteMode || game.paused) return;
  const at = Math.max(0, playbackTime() - 0.25);
  if (at <= 0) return;
  const prefs = skipPrefs(game.song.id);
  prefs.marks.push({ t: Math.round(at * 10) / 10, len: 0.8 });
  prefs.marks.sort((a, b) => a.t - b.t);
  store.set(`yeatle-karaoke-skips:${game.song.id}`, prefs);
  showToast(`Skip marked at ${fmtTime(at)}. It counts from your next round.`);
}

function showToast(text) {
  const toast = $("#toast");
  toast.textContent = text;
  toast.classList.remove("show"); void toast.offsetWidth; toast.classList.add("show");
}

/* ---------- results ---------- */

function endGame() {
  if (!game || game.ended) return;
  game.ended = true;
  cancelAnimationFrame(game.raf);
  stopSources();
  game.instGain.disconnect();
  game.guideGain.disconnect();
  if (audioCtx().state === "suspended") audioCtx().resume();
  try { game.wakeLock?.release(); } catch { /* fine */ }
  $("#pause").hidden = true;
  $("#countdown").textContent = "";
}

function showResults() {
  if (!game || game.ended) return;
  const { phrases } = game.chart;
  while (game.phraseIdx < phrases.length) finishPhrase(game.phraseIdx++);
  endGame();
  const top = Math.max(...game.players.map(p => p.score));
  const key = bestKey(game.song.id, game.difficulty, game.whiteMode);
  const previous = store.get(key, null);
  let newBest = null;
  const cards = game.players.map(p => {
    const acc = p.durSum ? p.accSum / p.durSum : 0;
    const stars = starsFor(acc);
    if (p.detector && (!previous || p.score > previous.score) && (!newBest || p.score > newBest.score)) newBest = { score: p.score, name: p.name };
    return el("div", { class: "result", style: `--c:${p.color}` },
      el("div", { class: "result-name" }, el("b", { text: (game.players.length > 1 && p.score === top && top > 0 ? "👑 " : "") + p.name })),
      el("div", { class: "stars" + (acc >= 0.96 ? " gold" : "") , text: "★".repeat(stars) + "☆".repeat(5 - stars) }),
      el("div", { class: "result-score", text: p.score.toLocaleString() }),
      el("div", { class: "result-stats" },
        el("span", { text: `${Math.round(acc * 100)}% notes hit` }),
        el("span", { text: `Best streak ${p.bestStreak}` }),
        game.whiteMode ? el("span", { text: p.skipped ? `${p.skipped} phrase${p.skipped === 1 ? "" : "s"} fully skipped` : "No phrases fully skipped" }) : null
      ),
      el("ul", { class: "breakdown" }, ...RATINGS.map(r => el("li", { class: r.cls }, el("span", { text: r.text.replace("!", "") }), el("b", { text: String(p.counts[r.cls]) }))))
    );
  });
  if (newBest) store.set(key, newBest);
  $("#results-title").textContent = game.song.display;
  $("#results-sub").textContent = `${DIFFICULTIES[game.difficulty].label}${game.whiteMode ? " · White people mode" : ""}${newBest ? ` · New best: ${newBest.score.toLocaleString()} by ${newBest.name}` : previous ? ` · Best: ${previous.score.toLocaleString()} by ${previous.name}` : ""}`;
  $("#results-cards").replaceChildren(...cards);
  showScreen("results");
}

function restart() {
  if (!game) return;
  const { song, audio, chart, lyrics, lyricKind } = game;
  endGame();
  beginGame(song, audio, chart, lyrics, lyricKind);
}

function backToSetup() {
  endGame();
  game = null;
  showScreen("setup");
  buildOptions();
  renderPlayers();
  renderPicked();
}

/* ---------- start up ---------- */

// Songs the tracker lists under two names became one entry. Keep best scores,
// pasted lyrics and lyric timing saved under an old id; the newer id wins.
export function carryFormerIds(songs, storage = globalThis.localStorage) {
  if (!storage) return 0;
  let moved = 0;
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
    for (const song of songs) {
      for (const old of [...song.formerIds || [], ...song.equivalentIds || []]) {
        for (const key of keys) {
          const m = /^(yeatle-karaoke-(?:best|lrc|shift|skips)):(.+?)(:[^:]*)?$/.exec(key);
          if (!m) continue;
          const [prefix, rest] = [m[1], key.slice(m[1].length + 1)];
          if (rest !== old && !rest.startsWith(`${old}:`)) continue;
          const next = `${prefix}:${song.id}${rest.slice(old.length)}`;
          if (storage.getItem(next) == null) { storage.setItem(next, storage.getItem(key)); moved++; }
        }
      }
    }
  } catch { /* storage unavailable */ }
  return moved;
}

async function loadSongs() {
  const list = $("#song-list");
  list.replaceChildren(el("p", { class: "muted", text: "Loading songs…" }));
  try {
    const res = await fetch("api/songs");
    const data = await res.json();
    const { songsForPool } = await import("./song-pools.mjs?v=1.11.6");
    state.songs = songsForPool(data.songs || []).slice().sort((a, b) => a.display.localeCompare(b.display));
    carryFormerIds(state.songs);
    state.artist = data.artist || "Yeat";
    renderSongList();
  } catch (err) {
    list.replaceChildren(el("p", { class: "muted", text: `Couldn't load the song list (${err.message}). Is Yeatle running?` }));
  }
}

function init() {
  buildOptions();
  renderPlayers();
  renderPicked();
  loadSongs();
  setupMeters();
  // Stems / Snippets tabs go back to the game in that mode
  document.querySelectorAll(".tabs [data-mode]").forEach(tab => tab.addEventListener("click", () => {
    store.set("yeatle:gameMode", tab.dataset.mode);
    window.location.href = "./";
  }));
  $("#search").addEventListener("input", renderSongList);
  $("#enable-mics").addEventListener("click", enableMics);
  $("#add-player").addEventListener("click", async () => {
    if (settings.players.length >= 4) return;
    settings.players.push({ name: `Singer ${settings.players.length + 1}`, deviceId: "" });
    saveSettings();
    await openMic(settings.players.length - 1);
    renderPlayers();
  });
  $("#start").addEventListener("click", startSong);
  $("#load-cancel").addEventListener("click", () => { if (state.job) state.job.cancel(); state.job = null; showScreen("setup"); });
  $("#pause-btn").addEventListener("click", () => setPaused(true));
  $("#resume").addEventListener("click", () => setPaused(false));
  $("#restart").addEventListener("click", () => { setPaused(false); restart(); });
  $("#quit").addEventListener("click", () => { setPaused(false); backToSetup(); });
  $("#skip").addEventListener("click", skipAhead);
  $("#mark-skip").addEventListener("click", markSkip);
  $("#stage-volume").addEventListener("input", e => { settings.volume = Number(e.target.value); saveSettings(); applyVolume(); });
  $("#again").addEventListener("click", restart);
  $("#another").addEventListener("click", backToSetup);
  window.addEventListener("resize", resizeCanvas);
  document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); });
  document.addEventListener("keydown", e => {
    if (!game || game.ended || $("#stage").hidden) return;
    if (e.key === "Escape" || e.key === " ") { e.preventDefault(); setPaused(!game.paused); }
    else if (e.key === "s" || e.key === "S") skipAhead();
    else if (e.key === "k" || e.key === "K") markSkip();
    else if (e.key === "[") shiftLyrics(-0.1);
    else if (e.key === "]") shiftLyrics(0.1);
  });
  navigator.mediaDevices?.addEventListener?.("devicechange", async () => { if (mics.allowed) { await refreshDevices(); renderPlayers(); } });
  // reopen mics straight away if permission was already given before
  navigator.permissions?.query({ name: "microphone" }).then(status => { if (status.state === "granted") enableMics(); }).catch(() => {});
}

if (typeof document !== "undefined" && document.getElementById("karaoke-app")) init();
