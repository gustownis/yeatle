const { corrections, stemBindings = [], excludedRecordings = [] } = require("./catalog-metadata.json");
const crypto = require("node:crypto");
const titleKey = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function stemBindingFor(folder) {
  return stemBindings.find(binding => binding.folder === folder);
}

// Repair old metadata caches too, without touching source files. This runs on
// the working catalog only; pinned Daily snapshots retain their stored source.
function correctStemMetadata(song) {
  const binding = song.mode === "stems" && stemBindingFor(song.folder);
  if (binding) song = { ...song, ...binding.metadata, ...(song.source ? { fallback: { ...binding.source } } : {}) };
  if (song.poolVariants) song = { ...song, poolVariants: Object.fromEntries(Object.entries(song.poolVariants).map(([pool, variant]) => [pool, correctStemMetadata(variant)])) };
  if (song.sourceVariants) song = { ...song, sourceVariants: song.sourceVariants.map(correctStemMetadata) };
  return song;
}

function reconcileStemSources(songs) {
  const sameSource = (left, right) => left?.kind === right.kind && left?.id === right.id;
  songs = [...songs];
  for (const binding of stemBindings) {
    const wrongIndex = songs.findIndex(song => song.mode === "stems" && song.folder === binding.folder && song.fallback && !sameSource(song.fallback, binding.source));
    if (wrongIndex < 0) continue;
    const targetIndex = songs.findIndex(song => [song, ...song.sourceVariants || []].some(variant => sameSource(variant.source, binding.source)));
    if (targetIndex < 0 || targetIndex === wrongIndex) continue;
    const wrong = songs[wrongIndex], target = songs[targetIndex];
    const originals = (wrong.sourceVariants || []).filter(song => !(song.mode === "stems" && song.folder === binding.folder));
    const original = originals.find(song => sameSource(song.source, wrong.fallback)) || { ...wrong, audioId: undefined, mode: "filter", folder: null, source: wrong.fallback, fallback: null };
    // Restore the unrelated recording under its existing progress id. Never
    // migrate completion between these distinct vocal performances.
    const { poolVariants: _p, sourceVariants: _s, audioId: _a, ...restored } = wrong;
    const { poolVariants: _op, sourceVariants: _os, ...originalFields } = original;
    const remainingPools = Object.fromEntries(Object.entries(wrong.poolVariants || {})
      .filter(([pool]) => pool !== "stems")
      .map(([pool, variant]) => [pool, variant.mode === "stems"
        ? originals.find(item => item.tab?.toLowerCase() === pool) || original : variant]));
    songs[wrongIndex] = { ...restored, ...originalFields, id: wrong.id,
      ...(originals.length > 1 ? { sourceVariants: originals, poolVariants: remainingPools } : {}) };
    const source = { kind: "stems", folder: binding.folder };
    const origin = (target.sourceVariants || [target]).find(song => sameSource(song.source, binding.source));
    const { poolVariants: _tp, sourceVariants: _ts, ...fields } = origin;
    const stem = { ...fields, ...binding.metadata, id: target.id, source, fallback: binding.source, mode: "stems", folder: binding.folder,
      audioId: `${target.id}@audio-${crypto.createHash("sha256").update(JSON.stringify([origin.trackerKey, source])).digest("hex").slice(0, 16)}` };
    songs[targetIndex] = { ...target, ...stem, sourceVariants: [...target.sourceVariants || [origin], stem],
      poolVariants: { ...target.poolVariants, [stem.tab.toLowerCase()]: stem, stems: stem } };
  }
  return songs.map(correctStemMetadata);
}

// A tracker credit describes Yeat's involvement, independently of a song's
// release status, recording era, audio host, or installed stem files.
function creditFor(song, artist = "Yeat") {
  const features = song.features || [];
  const hasYeatFeature = features.some(value => /\b(?:feat\.?|ft\.?|with)\s+yeat\b/i.test(value));
  const type = String(song.type || "").trim();
  const role = song.artistRole || (hasYeatFeature || /^feature$/i.test(type) ? "featured"
    : /^(?:production|producer(?:[- ]only)?)$/i.test(type) ? "producer-only"
    : (type ? "vocalist" : "unknown"));
  const prefix = /^(.*?)\s+[-–—]\s+(.+)$/.exec(song.title || "");
  return {
    artist: song.artist || (prefix && ["featured", "producer-only"].includes(role) ? prefix[1] : role === "unknown" ? "" : artist),
    artistRole: role,
    guessingEligible: song.guessingEligible !== false && !["producer-only", "non-vocal"].includes(role)
  };
}

function isGuessingEligible(song) {
  return song.guessingEligible !== false && creditFor(song).guessingEligible;
}

function isExcludedRecording(song) {
  const sameSource = (left, right) => left && right && left.kind === right.kind && left.id === right.id;
  const versionRange = value => /^V(\d+)(?:-V?(\d+))?$/i.exec(value || "");
  return excludedRecordings.some(rule => {
    // Source ids also identify older caches, which did not retain version labels.
    if ((rule.sources || []).some(source => sameSource(song.source, source) || sameSource(song.fallback, source))) return true;
    if (titleKey(song.title) !== rule.titleKey || song.tab !== rule.tab) return false;
    const aliases = [...song.aliases || [], ...song.keys || []].map(titleKey);
    if ((rule.aliases || (rule.alias ? [rule.alias] : [])).some(alias => !aliases.includes(titleKey(alias)))) return false;
    if (!rule.versions) return true;
    const version = versionRange(song.trackerVersion);
    return version && rule.versions.some(value => {
      const range = versionRange(value);
      return Number(version[1]) >= Number(range[1]) && Number(version[2] || version[1]) <= Number(range[2] || range[1]);
    });
  });
}

// Metadata changes can retire the source previously selected for a merged title.
// Keep every audio mapping, but choose an eligible recording for future rounds.
function reconcileCatalogEligibility(song, sourceRank) {
  if (!song.sourceVariants) return song;
  const eligible = song.sourceVariants.filter(isGuessingEligible)
    .sort((a, b) => sourceRank[a.source?.kind] - sourceRank[b.source?.kind]);
  const poolVariants = {};
  for (const [pool, accepts] of Object.entries({
    released: row => row.tab === "Released",
    unreleased: row => row.tab === "Unreleased",
    stems: row => row.mode === "stems"
  })) {
    const current = song.poolVariants?.[pool];
    const replacement = current && isGuessingEligible(current) ? current : eligible.find(accepts);
    if (replacement) poolVariants[pool] = replacement;
  }
  const replacement = !isGuessingEligible(song) && eligible[0];
  return { ...song, ...(replacement ? { ...replacement, id: song.id, keys: song.keys, mergedFrom: song.mergedFrom,
    guessingEligible: true } : {}), sourceVariants: song.sourceVariants, poolVariants };
}

function applyCatalogMetadata(song) {
  let result = song;
  for (const rule of corrections) {
    if (Object.entries(rule.match).every(([key, value]) => key === "titleKey" ? titleKey(result.title) === value : typeof value === "object" ? Object.entries(value).every(([field, expected]) => result[key]?.[field] === expected) : result[key] === value)) result = { ...result, ...rule.set };
  }
  if (result.poolVariants) result = { ...result, poolVariants: Object.fromEntries(Object.entries(result.poolVariants).map(([pool, variant]) => [pool, applyCatalogMetadata(variant)])) };
  if (result.sourceVariants) result = { ...result, sourceVariants: result.sourceVariants.map(applyCatalogMetadata) };
  if (isExcludedRecording(result)) result = { ...result, guessingEligible: false };
  return result;
}

module.exports = { creditFor, isGuessingEligible, applyCatalogMetadata, stemBindingFor, reconcileStemSources, reconcileCatalogEligibility };
