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
