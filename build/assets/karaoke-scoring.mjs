/*
  Karaoke scoring rules shared by the game (karaoke.js) and the server, which re-scores
  submitted runs with exactly the same arithmetic.

  A ranked run is submitted with a compact trace: one entry per phrase,
    [start, end, dur, acc, corr, cents, lag]
  where acc is null for a phrase that was skipped (White people mode) and corr, cents and
  lag describe how closely the microphone matched the song's own vocal (null when there
  wasn't enough sound to measure).
*/

export const POINTS_PER_SECOND = 250;   // points for one second of perfectly sung notes, before the multiplier
export const STREAK_MIN = 0.6;          // phrase accuracy that keeps the multiplier going
export const MAX_MULT = 4;
export const MAX_TRACE_PHRASES = 1500;

// Points for one finished phrase, and the singer's streak and multiplier afterwards.
// acc === null is a skipped phrase: full points, streak and multiplier unchanged.
export function ratePhrase(state, dur, acc) {
  if (acc === null) return { points: Math.round(dur * POINTS_PER_SECOND) * state.mult, streak: state.streak, mult: state.mult };
  const points = Math.round(dur * POINTS_PER_SECOND * acc) * state.mult;
  const streak = acc >= STREAK_MIN ? state.streak + 1 : 0;
  return { points, streak, mult: Math.min(MAX_MULT, 1 + streak) };
}

export function rescoreTrace(phrases) {
  let state = { streak: 0, mult: 1 }, score = 0;
  for (const ph of phrases) {
    const next = ratePhrase(state, ph[2], ph[3]);
    score += next.points;
    state = next;
  }
  return score;
}

// The most any singing of these phrases could score: every phrase perfect.
export const maxTraceScore = phrases => rescoreTrace(phrases.map(ph => [ph[0], ph[1], ph[2], 1]));

// How closely a run may follow the song's own recording. Defaults only; the website sets
// its own values privately.
export const SIMILARITY_RULES = Object.freeze({
  minPhrases: 6,      // measured phrases needed before any rule applies
  identicalCorr: 0.97,// loudness this close to the record on most phrases
  corr: 0.8,          // loudness close, with pitch this close (median cents)...
  cents: 10,
  minCentsPhrases: 4,
  lagPhrases: 8,      // ...or loudness close and timing that never drifts
  lagCorr: 0.8,
  lagStdMs: 12
});

const median = values => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

export function similarityVerdict(phrases, rules = SIMILARITY_RULES) {
  const measured = phrases.filter(ph => typeof ph[4] === "number");
  const corrs = measured.map(ph => ph[4]);
  const cents = measured.filter(ph => typeof ph[5] === "number").map(ph => ph[5]);
  const lags = measured.filter(ph => typeof ph[6] === "number").map(ph => ph[6]);
  const medianCorr = median(corrs), medianCents = median(cents);
  const lagMean = lags.reduce((a, b) => a + b, 0) / (lags.length || 1);
  const lagStd = lags.length ? Math.sqrt(lags.reduce((a, b) => a + (b - lagMean) ** 2, 0) / lags.length) : null;
  const reasons = [];
  if (measured.length >= rules.minPhrases) {
    if (medianCorr >= rules.identicalCorr) reasons.push("loudness matches the original vocal");
    if (medianCorr >= rules.corr && cents.length >= rules.minCentsPhrases && medianCents <= rules.cents) reasons.push("pitch matches the original vocal");
    if (lags.length >= rules.lagPhrases && medianCorr >= rules.lagCorr && lagStd <= rules.lagStdMs) reasons.push("timing never drifts from the original vocal");
  }
  return { flagged: reasons.length > 0, reasons, measured: measured.length, medianCorr, medianCents, lagStd };
}
