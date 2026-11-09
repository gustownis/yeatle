const { corrections, stemBindings = [], excludedRecordings = [], answerGroups = [], sameRecordings = [], premasters = [] } = require("./catalog-metadata.json");
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

function catalogExclusionReason(song) {
  if (isGuessingEligible(song)) return "";
  const role = creditFor(song).artistRole;
  return role === "producer-only" ? "Production credit only" : role === "non-vocal" ? "No Yeat vocal performance" : "Excluded by catalog rules";
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

// The same normalization as the server's norm() and the game's normalizeGuess().
function answerKey(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/gi, "ae").replace(/ø/gi, "o").replace(/\$/g, "s")
    .replace(/&/g, "and").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// The tracker names a song accepts. A featured song's aliases also answer with
// its lead artist in front: "Yung Bans - YEA X2" aliased "Yea Yea" accepts
// "Yung Bans - Yea Yea", which is how the dropdown names the released feature.
function guessKeys(entry) {
  const keys = new Set();
  const add = value => { const key = answerKey(value); if (key) keys.add(key); };
  add(entry.title);
  add(entry.title.replace(/\s*\(.*?\)\s*/g, " "));
  const artist = / - /.test(entry.title) ? entry.title.split(" - ")[0] : "";
  // "Drake - IDGAF" also answers to "IDGAF"
  if (artist) add(entry.title.split(" - ").slice(1).join(" - "));
  (entry.features || []).forEach(feature => add(`${entry.title} (${feature})`));
  for (const alias of entry.aliases || []) {
    add(alias);
    if (artist && !answerKey(alias).startsWith(answerKey(artist))) add(`${artist} - ${alias}`);
  }
  return [...keys];
}

// Recordings players can't tell apart by name: open-verse demos and the
// features they became, and the same song listed twice. Each answers to the
// others' names but stays its own round. sameRecordings are one song listed
// more than once: they also share an answerId (one entry in pools and
// suggestions) and progress, and answer to each other unless a larger group
// already holds them.
const answerGroupById = new Map();
for (const group of answerGroups) for (const id of group.ids) answerGroupById.set(id, group);
const groupById = new Map(answerGroupById);
for (const same of sameRecordings) if (!same.ids.some(id => groupById.has(id))) for (const id of same.ids) groupById.set(id, same);
const sameById = new Map();
for (const same of sameRecordings) for (const id of same.ids) sameById.set(id, same);

function answerGroupFor(id) {
  return groupById.get(id) || null;
}

function sameRecordingFor(id) {
  return sameById.get(id) || null;
}

function expandGuestKeys(baseKeys, song) {
  const keys = new Set([...baseKeys].map(answerKey).filter(Boolean));
  const guests = [...(song.features || [])];
  const inline = /\((?:feat\.?|ft\.?|with)\s+([^)]*)\)/ig;
  for (const value of [song.title, song.display]) {
    for (const match of String(value || "").matchAll(inline)) guests.push(match[1]);
  }
  const titles = [...keys];
  for (const guest of guests) {
    const name = answerKey(String(guest).replace(/^(?:feat\.?|ft\.?|with)\s+/i, ""));
    if (!name) continue;
    for (const title of titles) {
      for (const prefix of ["feat", "ft", "with"]) keys.add(`${title}${prefix}${name}`);
    }
  }
  return keys;
}

// The union of every member's accepted names. acceptedKeys is the game's own
// expansion (snippet-rules.mjs); lookup returns a member's catalog record.
function groupAnswerKeys(group, lookup, acceptedKeys) {
  const keys = new Set();
  for (const id of group.ids) {
    const member = lookup(id);
    if (!member) continue;
    const corrected = applyCatalogMetadata(member);
    for (const key of acceptedKeys ? acceptedKeys(corrected) : expandGuestKeys([corrected.title, corrected.display, ...corrected.keys || [], ...corrected.answerKeys || []], corrected)) {
      const normalized = answerKey(key);
      if (normalized) keys.add(normalized);
    }
  }
  return keys;
}

// Separates same-recording answers (Green: answerKeys) from related-version
// answers in an answerGroup (Yellow: versionKeys, free re-guess on the same clip).
function resolveGroupKeys(song, lookup, acceptedKeys) {
  song = applyCatalogMetadata(song);
  const same = sameById.get(song.id);
  const group = answerGroupById.get(song.id);
  if (!same && !group) return song;
  if (same && !group) {
    const linked = [...groupAnswerKeys(same, lookup, acceptedKeys)];
    return linked.length ? { ...song, answerKeys: [...new Set([...song.answerKeys || [], ...linked])] } : song;
  }
  const members = group.ids.map(id => lookup(id)).filter(Boolean).map(applyCatalogMetadata);
  const allMemberExact = new Set();
  for (const m of members) {
    allMemberExact.add(answerKey(m.title));
    allMemberExact.add(answerKey(m.display));
  }
  const primaryByMember = new Map();
  for (const m of members) {
    const base = new Set([answerKey(m.title), answerKey(m.display)].filter(Boolean));
    const noParen = answerKey(String(m.title || "").replace(/\s*\(.*?\)\s*/g, " "));
    if (noParen && (!allMemberExact.has(noParen) || base.has(noParen))) base.add(noParen);
    if (/ - /.test(m.title)) {
      const afterDash = m.title.split(" - ").slice(1).join(" - ");
      const stripped = answerKey(afterDash);
      const strippedNoParen = answerKey(afterDash.replace(/\s*\(.*?\)\s*/g, " "));
      if (stripped && (!allMemberExact.has(stripped) || base.has(stripped))) base.add(stripped);
      if (strippedNoParen && (!allMemberExact.has(strippedNoParen) || base.has(strippedNoParen))) base.add(strippedNoParen);
    }
    primaryByMember.set(m.id, expandGuestKeys(base, m));
  }
  const stripGuestDisplay = value => answerKey(String(value || "").replace(/\s*\((?:feat\.?|ft\.?|with)\s+[^)]*\)/ig, ""));
  const sameIds = new Set([song.id, ...(same?.ids || [])]);
  for (const other of members) {
    if (answerKey(other.display) === answerKey(song.display) ||
        (answerKey(other.title) === answerKey(song.title) && stripGuestDisplay(other.display) === stripGuestDisplay(song.display))) {
      sameIds.add(other.id);
    }
  }
  const ownPrimary = new Set();
  for (const id of sameIds) for (const k of primaryByMember.get(id) || []) ownPrimary.add(k);
  const otherPrimary = new Set();
  for (const other of members) {
    if (sameIds.has(other.id)) continue;
    for (const k of primaryByMember.get(other.id) || []) if (!ownPrimary.has(k)) otherPrimary.add(k);
  }
  const sameKeys = new Set();
  for (const other of members) {
    if (!sameIds.has(other.id)) continue;
    const expanded = acceptedKeys ? acceptedKeys(other) : expandGuestKeys([other.title, other.display, ...(other.keys || []), ...(other.answerKeys || [])], other);
    for (const k of expanded) {
      const norm = answerKey(k);
      if (norm && !otherPrimary.has(norm)) sameKeys.add(norm);
    }
  }
  const keys = (song.keys || []).filter(k => !otherPrimary.has(answerKey(k)));
  const answerKeys = [...new Set([...(song.answerKeys || []), ...sameKeys])].filter(k => !otherPrimary.has(answerKey(k)));
  const greenSet = expandGuestKeys([song.title, song.display, ...keys, ...answerKeys], song);
  for (const k of otherPrimary) greenSet.delete(k);
  const versionSet = new Set(otherPrimary);
  for (const other of members) {
    if (sameIds.has(other.id)) continue;
    const otherAll = acceptedKeys ? acceptedKeys(other) : expandGuestKeys([other.title, other.display, ...(other.keys || []), ...(other.answerKeys || [])], other);
    for (const k of otherAll) {
      const norm = answerKey(k);
      if (norm && !greenSet.has(norm)) versionSet.add(norm);
    }
  }
  return {
    ...song,
    keys,
    ...(answerKeys.length ? { answerKeys } : {}),
    ...(versionSet.size ? { versionKeys: [...new Set([...(song.versionKeys || []), ...versionSet])] } : {})
  };
}

function trackSeconds(length) {
  const m = /^(\d+):(\d{2})$/.exec(String(length || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const guestFeatureKey = features => (features || []).map(f =>
  answerKey(String(f).replace(/^(feat|ft|with)\b\.?\s*/i, ""))).filter(Boolean).sort().join("+");

function findOgPremaster(releasedSong, variants) {
  if (!variants || !variants.length) return null;
  const relSec = trackSeconds(releasedSong.length);
  const relGuests = guestFeatureKey(releasedSong.features);

  const candidates = variants.filter(v => v !== releasedSong && v.tab === "Unreleased" && v.source?.kind === "pillows");
  if (!candidates.length) return null;

  const matching = candidates.filter(v => {
    const sec = trackSeconds(v.length);
    if (relSec != null && sec != null && Math.abs(relSec - sec) > 3) return false;
    if (guestFeatureKey(v.features) !== relGuests) return false;
    return true;
  });
  if (!matching.length) return null;

  const ogs = matching.filter(v => /og|master/i.test(v.type) || /og/i.test(v.availability));
  const picked = ogs.length ? ogs[ogs.length - 1] : matching[matching.length - 1];
  return picked ? picked.source : null;
}

// A released song that only has Apple's 30 s preview, but whose pre-master the maintainer has
// verified (see premasters in catalog-metadata.json), plays that full file instead. The
// preview stays the recorded source, so exclusions and saved references are unaffected, and
// already pinned Daily snapshots, which lack this field, keep the audio they were pinned with.
const premasterById = new Map(premasters.map(entry => [entry.id, entry]));
function premasterFor(song, variants) {
  const played = song.mode === "stems" ? song.fallback : song.source;
  const isPreview = played && (played.kind === "apple" || played.kind === "search");
  const entry = premasterById.get(song.id);
  if (entry && (song.tab === "Released" || song.releasedOn || song.poolVariants?.released)) {
    if (isPreview) return entry.source;
  }
  if ((song.tab === "Released" || song.poolVariants?.released) && isPreview) {
    const og = findOgPremaster(song, variants || song.sourceVariants);
    if (og) return og;
  }
  return null;
}

function applyCatalogMetadata(song, parentSourceVariants) {
  let result = song;
  const same = sameById.get(result.id);
  if (same) result = { ...result, answerId: same.answerId, equivalentIds: same.ids.filter(id => id !== result.id) };
  for (const rule of corrections) {
    if (Object.entries(rule.match).every(([key, value]) => key === "titleKey" ? titleKey(result.title) === value : typeof value === "object" ? Object.entries(value).every(([field, expected]) => result[key]?.[field] === expected) : result[key] === value)) result = { ...result, ...rule.set };
  }
  const sourceVariants = result.sourceVariants || parentSourceVariants;
  if (result.poolVariants) result = { ...result, poolVariants: Object.fromEntries(Object.entries(result.poolVariants).map(([pool, variant]) => [pool, applyCatalogMetadata(variant, sourceVariants)])) };
  if (result.sourceVariants) result = { ...result, sourceVariants: result.sourceVariants.map(v => applyCatalogMetadata(v, sourceVariants)) };
  if (isExcludedRecording(result)) result = { ...result, guessingEligible: false };
  const premaster = premasterFor(result, sourceVariants);
  if (premaster) result = { ...result, premaster, preview: false };
  return result;
}

module.exports = { answerKey, guessKeys, answerGroupFor, sameRecordingFor, groupAnswerKeys, resolveGroupKeys, creditFor, isGuessingEligible, catalogExclusionReason, applyCatalogMetadata, stemBindingFor, reconcileStemSources, reconcileCatalogEligibility };
