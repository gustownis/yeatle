export function inSongPool(song, pool = "all") {
  if (song.guessingEligible === false || ["producer-only", "non-vocal"].includes(song.artistRole) || (!song.artistRole && /^production$/i.test(song.type || ""))) return false;
  if (song.poolVariants && pool !== "all") return Boolean(song.poolVariants[pool]);
  return pool === "released" ? song.tab === "Released"
    : pool === "unreleased" ? song.tab === "Unreleased"
    : pool === "stems" ? song.mode === "stems" && Boolean(song.folder) : true;
}

export function restorePracticeSong(saved, songs) {
  if (!saved) return null;
  const current = songs.find(song => song.id === saved.songId);
  const snapshot = saved.song;
  // A verified pack correction can move its files to a different recording.
  // Keep the same audible round and attempts while correcting its metadata.
  const pack = snapshot?.mode === "stems" && snapshot.folder
    ? songs.find(song => song.mode === "stems" && song.folder === snapshot.folder) : null;
  if (pack && pack.id !== saved.songId) return pack;
  return current && snapshot?.id === current.id
    ? { ...snapshot, keys: current.keys, answerKeys: current.answerKeys } : current;
}

// A released row and a leak can share an answer while keeping their own
// playable source, release status and era. Never project the parent's audio
// onto a different pool just because it is the higher-quality file.
export function songsForPool(songs, pool = "all") {
  const entries = songs.filter(song => inSongPool(song, pool)).map(song =>
    pool !== "all" && song.poolVariants?.[pool]
      ? { ...song, ...song.poolVariants[pool], id: song.id, poolVariants: song.poolVariants }
      : song);
  const unique = new Map();
  for (const song of entries) {
    const key = song.answerId || song.id || song.display || song.title;
    const held = unique.get(key);
    // Only a verified shared recording identity deduplicates suggestions and
    // future selection. Keep the installed playable pack when both are present.
    if (!held || (song.mode === "stems" && held.mode !== "stems")) unique.set(key, song);
  }
  return [...unique.values()];
}

export function eraCounts(songs, pool) {
  const eras = new Map(), seen = new Set();
  for (const song of songs.filter(song => inSongPool(song))) {
    for (const variant of [song, ...Object.values(song.poolVariants || {})]) {
      const name = variant.era || "No era listed", key = `${song.answerId || song.id}|${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const held = eras.get(name) || { count: 0, inPool: 0, cover: "" };
      held.count++;
      held.cover ||= variant.cover || "";
      eras.set(name, held);
    }
  }
  for (const song of songsForPool(songs, pool)) {
    const name = song.era || "No era listed", held = eras.get(name) || { count: 0, inPool: 0, cover: "" };
    held.inPool++;
    held.cover ||= song.cover || "";
    eras.set(name, held);
  }
  return eras;
}
