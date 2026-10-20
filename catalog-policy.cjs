const { corrections } = require("./catalog-metadata.json");

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
    guessingEligible: song.guessingEligible !== false && role !== "producer-only"
  };
}

function isGuessingEligible(song) {
  return song.guessingEligible !== false && creditFor(song).guessingEligible;
}

function applyCatalogMetadata(song) {
  let result = song;
  for (const rule of corrections) {
    if (Object.entries(rule.match).every(([key, value]) => typeof value === "object" ? Object.entries(value).every(([field, expected]) => result[key]?.[field] === expected) : result[key] === value)) result = { ...result, ...rule.set };
  }
  if (result.poolVariants) result = { ...result, poolVariants: Object.fromEntries(Object.entries(result.poolVariants).map(([pool, variant]) => [pool, applyCatalogMetadata(variant)])) };
  if (result.sourceVariants) result = { ...result, sourceVariants: result.sourceVariants.map(applyCatalogMetadata) };
  return result;
}

module.exports = { creditFor, isGuessingEligible, applyCatalogMetadata };
