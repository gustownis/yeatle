export const BASE_LENGTHS = Object.freeze([0.1, 0.5, 1, 3, 7, 15]);

export function normalizeGuess(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/gi, "ae").replace(/ø/gi, "o").replace(/\$/g, "s")
    .replace(/&/g, "and").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function matchesSong(song, text) {
  const key = normalizeGuess(text);
  return Boolean(key && [...(song.keys || []), song.title, song.display]
    .some(value => normalizeGuess(value) === key));
}

export function restoreRound(saved, id) {
  if (saved?.id !== id || !Array.isArray(saved.attempts) || saved.attempts.length > BASE_LENGTHS.length ||
      !saved.attempts.every(a => a && ["wrong", "skip", "right"].includes(a.kind) && typeof a.text === "string") ||
      !["playing", "won", "lost"].includes(saved.status)) return { id, attempts: [], status: "playing" };
  const right = saved.attempts.findIndex(a => a.kind === "right");
  if ((saved.status === "won" && (right < 0 || right !== saved.attempts.length - 1)) ||
      (saved.status !== "won" && right !== -1) ||
      (saved.status === "playing" && saved.attempts.length >= BASE_LENGTHS.length) ||
      (saved.status === "lost" && saved.attempts.length !== BASE_LENGTHS.length)) return { id, attempts: [], status: "playing" };
  return { id, attempts: saved.attempts, status: saved.status };
}

export function shareResult(date, round, url) {
  const won = round.status === "won";
  const blocks = BASE_LENGTHS.map((_, i) => {
    const kind = round.attempts[i]?.kind;
    return kind === "right" ? "🟩" : kind === "wrong" ? "🟥" : kind === "skip" ? "⬛" : "⬜";
  }).join("");
  return `Yeatle Daily ${date}\n${won ? `${BASE_LENGTHS[round.attempts.length - 1]}s · ${round.attempts.length}/${BASE_LENGTHS.length}` : `X/${BASE_LENGTHS.length}`}\n${blocks}\n${url}`;
}
