import { BASE_LENGTHS, matchesSong, matchesVersion, normalizeGuess, restoreRound, shareResult } from "./snippet-rules.mjs?v=1.15.0";
import { attachSongSuggestions } from "./song-suggestions.mjs?v=1.15.0";
import { dailyRounds } from "./leaderboard.mjs?v=1.15.0";

const $ = selector => document.querySelector(selector);
const suggestions = attachSongSuggestions($("#guess"), $("#song-suggestions"));
let challenge, round, storageKey, clockAt, serverAt, loading = false, copyResetTimer = 0;
let catalogSongs = [], catalogEras = [], catalogArtist = "Yeat";
const ALIVE_WHITE_COVER = "https://i1.sndcdn.com/artworks-3AabyPZmITS5OQRk-ylKvNA-original.jpg";
const coverRolls = new WeakMap();
function releasedEras(song) {
  if (!song || song.tab !== "Released") return null;
  let ref = null;
  if ((!song.recordedIn || !song.releasedOn) && song.id && catalogSongs.length) {
    const match = catalogSongs.find(item => item && item.id === song.id);
    ref = match ? (match.tab === "Released" ? match : match.poolVariants?.released) : null;
  }
  const recordedIn = song.recordedIn || ref?.recordedIn || "";
  const releasedOn = song.releasedOn || ref?.releasedOn || "";
  const throwaway = /\bthrowaway\b/i.test(String(song.type || ref?.type || ""));
  const baseEra = song.eraDisplay || song.era || ref?.eraDisplay || ref?.era || "";
  const releaseEra = throwaway ? (releasedOn || baseEra) : (baseEra || releasedOn || "");
  const recordingEra = throwaway ? (recordedIn || baseEra) : (recordedIn || baseEra || releasedOn || "");
  const recOut = recordingEra || releaseEra;
  const relOut = releaseEra || recordingEra;
  if (!recOut && !relOut) return null;
  return { recordingEra: recOut, releaseEra: relOut, same: normalizeGuess(recOut) === normalizeGuess(relOut) };
}
function formatSongCredit(song, defaultArtist = catalogArtist) {
  let ref = null;
  if ((!song?.artist || !song?.artistRole) && song?.id && catalogSongs.length) {
    ref = catalogSongs.find(item => item && item.id === song.id) || null;
  }
  const rawDisplay = String(song?.display || song?.title || "").trim();
  const explicitArtist = String(song?.artist || ref?.artist || "").trim();
  const role = song?.artistRole || ref?.artistRole || "";
  const def = String(defaultArtist || "Yeat").trim() || "Yeat";
  const defLower = def.toLowerCase();
  const defEsc = def.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let title = rawDisplay;
  let artist = explicitArtist || def;

  const dash = /^(.+?)\s+[-–—]\s+(.+)$/.exec(rawDisplay);
  if (dash) {
    const leftTrim = dash[1].trim();
    const rightTrim = dash[2].trim();
    const leftLower = leftTrim.toLowerCase();
    const explicitMatchesLeft = Boolean(explicitArtist) && explicitArtist.toLowerCase() === leftLower;
    const isDefaultPrefix = leftLower === defLower;
    const leftHasCollabWithDefault = !isDefaultPrefix && new RegExp(`\\b${defEsc}\\b`, "i").test(leftTrim) && /(?:\s+(?:&|and|x|\+)\s+|,\s*)/i.test(leftTrim);
    const rightFeaturesDefault = new RegExp(`\\b(?:feat\\.?|ft\\.?|with)\\s+${defEsc}\\b`, "i").test(rightTrim);
    const isFeaturedRole = role === "featured";
    if (isDefaultPrefix || (explicitMatchesLeft && !isDefaultPrefix) || leftHasCollabWithDefault || (isFeaturedRole && rightTrim) || rightFeaturesDefault) {
      title = rightTrim;
      artist = isDefaultPrefix ? def : (explicitMatchesLeft ? explicitArtist : leftTrim);
    }
  }

  const withMatch = /\(\s*with\s+([^)]+)\)/i.exec(title);
  if (withMatch) {
    const splitRe = /\s*(?:,|&|\band\b|\bx\b|\+)\s*/i;
    const seen = new Set();
    const parts = [];
    for (const p of [...artist.split(splitRe), ...withMatch[1].split(splitRe)]) {
      const t = String(p || "").trim();
      const k = t.toLowerCase();
      if (t && !seen.has(k)) { seen.add(k); parts.push(t); }
    }
    artist = parts.length > 2 ? `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}` : parts.join(" & ");
    const stripped = title.replace(/\s*\(\s*with\s+[^)]+\)/i, "").replace(/\s{2,}/g, " ").trim();
    if (stripped) title = stripped;
  }
  const plural = /(?:\s+(?:&|and|x|\+)\s+|,\s+)/i.test(artist);
  return { title, artist, label: plural ? "Artists" : "Artist" };
}
const DAILY_ALIAS_PARENS_RE = /\s*\(([^()]*(?:,|\([^()]*\))[^()]*)\)/g;
const DAILY_PAREN_BLOCK_RE = /\s*\([^()]*\)/g;
const DAILY_PAREN_CAP_RE = /\(([^()]+)\)/g;
const DAILY_GENERIC_ALIAS_RE = /^(yeat\s+)?(remix|mix|version|edit|intro|outro|interlude|freestyle|skit|open|solo|bonus)$/i;
const DAILY_N_AND_TEST_RE = /\b(?:n|and)\b/i;
const DAILY_N_AND_RE = /\b(?:n|and)\b/gi;
const DAILY_WS_RE = /\s+/g;
const dailyLooseNorm = value => {
  const s = String(value || "");
  return DAILY_N_AND_TEST_RE.test(s) ? normalizeGuess(s.replace(DAILY_N_AND_RE, "and")) : normalizeGuess(s);
};
function stripDailyAliasParens(str, extra) {
  const s = String(str || "");
  if (!s.includes("(")) return s.replace(DAILY_WS_RE, " ").trim();
  return s.replace(DAILY_ALIAS_PARENS_RE, (_, inner) => {
    for (const part of inner.split(",")) {
      const trimmed = part.trim();
      if (trimmed) extra.push(trimmed);
    }
    return "";
  }).replace(DAILY_WS_RE, " ").trim();
}
function songAltNames(song, creditTitle) {
  if (!song) return [];
  const extra = [];
  const rawTitle = String(song.title || "");
  const rawDisplay = String(song.display || rawTitle);
  const cleanTitle = stripDailyAliasParens(rawTitle, extra);
  const cleanDisplay = rawDisplay === rawTitle ? cleanTitle : stripDailyAliasParens(rawDisplay, extra);
  const seen = new Set();
  for (const v of [cleanTitle, cleanDisplay, creditTitle || ""]) {
    const s = String(v || "").trim();
    if (!s) continue;
    seen.add(normalizeGuess(s));
    seen.add(dailyLooseNorm(s));
    const base = s.includes("(") ? s.replace(DAILY_PAREN_BLOCK_RE, "").trim() : s;
    if (base && base !== s) {
      seen.add(normalizeGuess(base));
      seen.add(dailyLooseNorm(base));
    }
    if (s.includes("(")) {
      for (const m of s.matchAll(DAILY_PAREN_CAP_RE)) seen.add(dailyLooseNorm(m[1]));
    }
  }
  seen.delete("");
  let baseAliases = song.aliases;
  if ((!Array.isArray(baseAliases) || !baseAliases.length) && song.id && catalogSongs.length) {
    const hit = catalogSongs.find(item => item && item.id === song.id);
    if (hit && Array.isArray(hit.aliases)) baseAliases = hit.aliases;
  }
  const rawAliases = extra.length ? (baseAliases?.length ? [...extra, ...baseAliases] : extra) : (baseAliases || []);
  const out = [];
  for (const raw of rawAliases) {
    const t = String(raw || "").trim();
    if (!t) continue;
    const k = normalizeGuess(t);
    if (!k || k.length <= 1 || DAILY_GENERIC_ALIAS_RE.test(t)) continue;
    const kl = DAILY_N_AND_TEST_RE.test(t) ? dailyLooseNorm(t) : k;
    const ab = t.includes("(") ? t.replace(DAILY_PAREN_BLOCK_RE, "").trim() : t;
    const kb = ab === t ? kl : dailyLooseNorm(ab);
    if (seen.has(k) || seen.has(kl) || (kb && seen.has(kb))) continue;
    seen.add(k);
    seen.add(kl);
    if (kb) seen.add(kb);
    out.push(t);
  }
  return out;
}
function formatClipAt(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
function makeEraItem(label, value) {
  const wrap = document.createElement("span");
  wrap.className = "result-era-item";
  const dt = document.createElement("span");
  dt.textContent = label;
  const dd = document.createElement("strong");
  dd.textContent = value;
  wrap.append(dt, dd);
  return wrap;
}
function coverForSong(song) {
  if (!song) return "";
  const ref = song.id && catalogSongs.length ? catalogSongs.find(item => item && item.id === song.id) : null;
  const isFeat = song.artistRole === "featured" || ref?.artistRole === "featured"
    || /\bfeature\b/i.test(String(song.type || ref?.type || ""))
    || (song.features || ref?.features || []).some(v => /\b(?:feat\.?|ft\.?|with)\s+yeat\b/i.test(v));
  const rec = song.recordedIn || ref?.recordedIn || "";
  let cover = "";
  let effEra = song.era || "";
  if (isFeat && rec) {
    const recEra = catalogEras.find(item => item.name === rec && item.cover);
    const recSong = catalogSongs.find(item => item && item.era === rec && item.cover && item.artistRole !== "featured");
    cover = recEra?.cover || recSong?.cover || "";
    if (cover) effEra = rec;
  }
  if (!cover) cover = song.cover || "";
  if (!cover) {
    const match = catalogSongs.find(item => (song.id && item.id === song.id && item.cover) || (song.era && item.era === song.era && item.cover))
      || catalogEras.find(item => item.name === song.era && item.cover);
    cover = match?.cover || "";
  }
  if (!cover || String(effEra).normalize("NFD").replace(/\s*[\[(].*$/, "").toLowerCase().replace(/[^a-z0-9]/g, "") !== "alive") return cover;
  let pick = coverRolls.get(song);
  if (pick === undefined) coverRolls.set(song, pick = Math.random() < 0.5);
  return pick ? ALIVE_WHITE_COVER : cover;
}
let ctx, master, clipGain, clipBuffer, sources = [], audioLoad, abortAudio, playback = 0;
let ready = false, busy = false, playing = false, storageAvailable = true;
const isPhoneOrTablet = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "") || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent || ""));
if ($("#daily-keys")) $("#daily-keys").hidden = isPhoneOrTablet;
let playStartAt = 0, playDuration = 0, playFrame = 0;
const UNMUTED_WAVE = "M11 5.5q1.8 2.5 0 5";
const MUTED_WAVE = "M11 5.5l3.5 5M14.5 5.5l-3.5 5";
let volumeLevel = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem("yeatle:volume"));
    if (typeof saved === "number" && Number.isFinite(saved)) return Math.max(0, Math.min(1, saved));
  } catch {}
  return 0.8;
})();
let muted = false;
const notice = text => { $("#notice").textContent = text; };
const serverNow = () => serverAt + performance.now() - clockAt;

function syncVolume(persist = false) {
  const shown = muted ? 0 : volumeLevel;
  $("#volume").value = String(shown);
  $("#volume-pct").textContent = `${Math.round(shown * 100)}%`;
  $("#mute").title = muted ? "Unmute" : "Mute";
  $("#mute").setAttribute("aria-label", muted ? "Unmute" : "Mute");
  $("#volume-wave")?.setAttribute("d", muted || volumeLevel === 0 ? MUTED_WAVE : UNMUTED_WAVE);
  if (master) master.gain.value = shown ** 2;
  if (persist) {
    try { localStorage.setItem("yeatle:volume", JSON.stringify(volumeLevel)); } catch {}
  }
}

function clipPercent(seconds) {
  const max = BASE_LENGTHS.at(-1) || 15;
  return Math.min(100, Math.max(0, ((Number(seconds) || 0) / max) * 100));
}

function updatePlayhead() {
  cancelAnimationFrame(playFrame);
  playFrame = 0;
  const fill = $("#clips .daily-play-fill");
  if (!playing || !ctx || !fill) {
    if (fill) { fill.style.width = "0%"; fill.hidden = true; }
    return;
  }
  fill.hidden = false;
  const elapsed = Math.max(0, Math.min(playDuration, ctx.currentTime - playStartAt));
  fill.style.width = `${clipPercent(elapsed).toFixed(2)}%`;
  playFrame = requestAnimationFrame(updatePlayhead);
}

function stop() {
  playback++;
  cancelAnimationFrame(playFrame);
  playFrame = 0;
  for (const source of sources) { try { source.stop(); } catch {} source.disconnect(); }
  sources = [];
  clipGain?.disconnect();
  clipGain = null;
  playing = false;
  const fill = $("#clips .daily-play-fill");
  if (fill) { fill.style.width = "0%"; fill.hidden = true; }
}
function dispose() {
  suggestions.close();
  stop();
  abortAudio?.abort();
  abortAudio = null;
  audioLoad = null;
  clipBuffer = null;
  ready = false;
  busy = false;
  if (ctx) ctx.close().catch(() => {});
  ctx = master = null;
}
function readRound() {
  let raw = null;
  try { raw = localStorage.getItem(storageKey); }
  catch { storageAvailable = false; return restoreRound(null, challenge.id); }
  try { return restoreRound(raw ? JSON.parse(raw) : null, challenge.id); }
  catch { return restoreRound(null, challenge.id); }
}
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(round)); }
  catch { storageAvailable = false; notice("Browser storage is unavailable. Keep this tab open to retain today's progress."); }
}
// Tells Wrapped (wrapped.mjs) which song a finished Daily was, since the saved round
// doesn't name it. Only sent once the round is over and the song is known.
function noteFinished() {
  if (!challenge?.song || !round || round.status === "playing") return;
  try {
    dispatchEvent(new CustomEvent("yeatle:wrapped-record", { detail: { kind: "daily", date: challenge.date, status: round.status, tries: round.attempts.length, song: challenge.song } }));
  } catch { /* Wrapped is optional */ }
}
function level() { return Math.min(round.attempts.length, BASE_LENGTHS.length - 1); }
function render() {
  if (!challenge) return;
  const done = round.status !== "playing";
  const seconds = done ? BASE_LENGTHS.at(-1) : BASE_LENGTHS[level()];
  $("#clip-label").textContent = done ? `Full ${BASE_LENGTHS.at(-1)}s clip` : `${seconds} second${seconds === 1 ? "" : "s"}`;
  $("#attempt").textContent = done ? (round.status === "won" ? `Solved in ${round.attempts.length}/${BASE_LENGTHS.length}` : `${BASE_LENGTHS.length}/${BASE_LENGTHS.length} tries used`) : `Clip ${level() + 1} of ${BASE_LENGTHS.length}`;
  const curLevel = level();
  const solvedIndex = round.status === "won" ? Math.max(0, round.attempts.length - 1) : -1;
  const hasClose = !done && (round.close || []).some(c => c.level === curLevel);
  const clipNodes = BASE_LENGTHS.map((length, index) => {
    const li = document.createElement("li");
    const span = length - (BASE_LENGTHS[index - 1] || 0);
    li.style.flex = `${span} 0 0%`;
    const isLast = index === BASE_LENGTHS.length - 1;
    let state = "locked";
    let showCut = false;
    if (!done) {
      if (index <= curLevel) state = hasClose ? "now close" : "now";
      showCut = !isLast && index >= curLevel;
    } else if (round.status === "won") {
      if (index <= solvedIndex) state = "right";
      showCut = !isLast && index >= solvedIndex;
    } else {
      state = "wrong";
      showCut = false;
    }
    li.className = `seg ${state}${showCut ? " cut" : ""}`;
    li.setAttribute("aria-label", `${length} seconds: ${!done ? (index <= curLevel ? (hasClose ? "current, different version guessed" : "current") : "locked") : round.status === "won" && index <= solvedIndex ? "right" : state}`);
    return li;
  });
  const playFill = document.createElement("li");
  playFill.className = "daily-play-fill";
  playFill.hidden = !playing;
  playFill.setAttribute("aria-hidden", "true");
  $("#clips").replaceChildren(...clipNodes, playFill);
  updatePlayhead();
  $("#play").textContent = busy ? "Loading audio…" : playing ? "Stop" : done ? "Replay 15s" : `Play ${seconds}s`;
  $("#play").disabled = busy || loading;
  $("#guess-form").hidden = done;
  $("#guess").disabled = !ready || loading;
  $("#guess").readOnly = busy;
  for (const id of ["#submit", "#skip"]) $(id).disabled = !ready || busy || loading;
  if ($("#daily-keys")) $("#daily-keys").hidden = done || isPhoneOrTablet;
  if (done || !ready || busy || loading) suggestions.close();
  $("#skip").textContent = level() === BASE_LENGTHS.length - 1 ? "Give up" : "Skip";
  const guessRow = (cls, markText, whatText, whenText, noteText = "") => {
    const li = document.createElement("li");
    li.className = cls;
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = markText;
    const what = document.createElement("span");
    what.className = "what";
    if (noteText) {
      const nameSpan = document.createElement("span");
      nameSpan.className = "guess-name";
      nameSpan.textContent = whatText;
      const noteSpan = document.createElement("span");
      noteSpan.className = "guess-note";
      noteSpan.textContent = noteText;
      what.append(nameSpan, noteSpan);
    } else {
      what.textContent = whatText;
    }
    const when = document.createElement("span");
    when.className = "when";
    when.textContent = whenText;
    li.append(mark, what, when);
    return li;
  };
  const guessItems = [];
  for (let index = 0; index < BASE_LENGTHS.length; index++) {
    const lenLabel = `${BASE_LENGTHS[index]}s`;
    for (const c of (round.close || []).filter(item => item.level === index)) {
      guessItems.push(guessRow("close", "≈", c.text, lenLabel, "Different version"));
    }
    const attempt = round.attempts[index];
    if (attempt) {
      const mark = attempt.kind === "right" ? "✓" : attempt.kind === "wrong" ? "×" : "–";
      const what = attempt.kind === "skip" ? "Skipped" : attempt.kind === "right" ? attempt.text || "Correct" : attempt.text;
      guessItems.push(guessRow(attempt.kind, mark, what, lenLabel));
    }
  }
  $("#guesses").replaceChildren(...guessItems);
  const coverEl = $("#result-cover");
  const resultEl = $("#result");
  if (done && !challenge.song) {
    resultEl.hidden = true;
    coverEl.removeAttribute("src");
    delete coverEl.dataset.failedSrc;
    coverEl.hidden = true;
    if (!loading) loadChallenge();
    return;
  }
  resultEl.className = done ? `result ${round.status}` : "result";
  resultEl.hidden = !done;
  if (done) {
    const song = challenge.song;
    const src = coverForSong(song);
    if (src && coverEl.dataset.failedSrc !== src) {
      if (coverEl.getAttribute("src") !== src) {
        delete coverEl.dataset.failedSrc;
        coverEl.src = src;
      }
      coverEl.hidden = false;
    } else {
      coverEl.removeAttribute("src");
      coverEl.hidden = true;
    }
    const won = round.status === "won";
    const solvedSeconds = BASE_LENGTHS[round.attempts.length - 1];
    const outcomeEl = document.createElement("span");
    outcomeEl.className = `result-outcome ${won ? "won" : "lost"}`;
    outcomeEl.textContent = won ? "Solved" : "Missed";
    const ctxEl = document.createElement("span");
    ctxEl.className = "result-context";
    ctxEl.textContent = ` · ${won ? `in ${solvedSeconds}s · ${round.attempts.length}/${BASE_LENGTHS.length}` : (round.attempts.at(-1)?.kind === "skip" ? "Gave up" : "Out of tries")}`;
    const statusNodes = [outcomeEl, ctxEl];
    if (song.tab === "Released" || song.tab === "Unreleased") {
      const tabEl = document.createElement("span");
      tabEl.className = "result-tab";
      tabEl.textContent = song.tab;
      statusNodes.push(tabEl);
    }
    $("#result-label").replaceChildren(...statusNodes);
    const credit = formatSongCredit(song, catalogArtist);
    $("#answer").textContent = credit.title;
    const artistEl = $("#result-artist");
    if (credit.artist) {
      const aLabel = document.createElement("span");
      aLabel.textContent = `${credit.label}: `;
      const aName = document.createElement("strong");
      aName.textContent = credit.artist;
      artistEl.replaceChildren(aLabel, aName);
      artistEl.hidden = false;
    } else {
      artistEl.replaceChildren();
      artistEl.hidden = true;
    }
    const alts = songAltNames(song, credit.title);
    const altsEl = $("#result-alts");
    if (alts.length) {
      const altLabel = document.createElement("span");
      altLabel.textContent = alts.length === 1 ? "Alternate name: " : "Alternate names: ";
      const altNodes = [altLabel];
      alts.forEach((name, idx) => {
        if (idx > 0) altNodes.push(", ");
        const strong = document.createElement("strong");
        strong.textContent = name;
        altNodes.push(strong);
      });
      altsEl.replaceChildren(...altNodes);
      altsEl.hidden = false;
    } else {
      altsEl.replaceChildren();
      altsEl.hidden = true;
    }

    const relEras = releasedEras(song);
    const clipLabel = formatClipAt(challenge.clipAt);
    const detailText = clipLabel ? `Clip at ${clipLabel}` : "";
    $("#result-detail").textContent = detailText;
    $("#result-detail").hidden = !detailText;
    const rawEra = song.eraDisplay || song.era || "";
    if (relEras) {
      $("#result-eras").replaceChildren(...(relEras.same
        ? [makeEraItem("Era:", relEras.releaseEra)]
        : [makeEraItem("Recording era:", relEras.recordingEra), makeEraItem("Release era:", relEras.releaseEra)]));
      $("#result-eras").hidden = false;
    } else if (rawEra) {
      $("#result-eras").replaceChildren(makeEraItem("Era:", rawEra));
      $("#result-eras").hidden = false;
    } else {
      $("#result-eras").replaceChildren();
      $("#result-eras").hidden = true;
    }

    const subParts = [
      !relEras && song.recordedIn && song.recordedIn !== song.era && !(song.eraDisplay && song.eraDisplay.includes(song.recordedIn)) ? `Recorded in ${song.recordedIn}` : "",
      song.relatedRecording ? `Related recording: ${song.relatedRecording}` : ""
    ].filter(Boolean);
    $("#result-submeta").textContent = subParts.join(" · ");
    $("#result-submeta").hidden = subParts.length === 0;
  } else {
    coverEl.removeAttribute("src");
    delete coverEl.dataset.failedSrc;
    coverEl.hidden = true;
    $("#result-artist").replaceChildren();
    $("#result-artist").hidden = true;
    $("#result-alts").replaceChildren();
    $("#result-alts").hidden = true;
    $("#result-eras").replaceChildren();
    $("#result-eras").hidden = true;
    $("#result-detail").textContent = "";
    $("#result-detail").hidden = true;
    $("#result-submeta").hidden = true;
  }
}

async function loadAudio() {
  if (clipBuffer) return;
  if (audioLoad) return audioLoad;
  const current = challenge;
  const controller = new AbortController();
  abortAudio = controller;
  const context = ctx;
  audioLoad = (async () => {
    const urls = current.audio;
    const maxLen = BASE_LENGTHS.at(-1);
    const clipSamples = Math.ceil((maxLen + 0.05) * context.sampleRate);
    const startSample = Math.floor(current.clipAt * context.sampleRate);
    const mixed = context.createBuffer(2, clipSamples, context.sampleRate);
    const outL = mixed.getChannelData(0);
    const outR = mixed.getChannelData(1);
    let nextFetch = urls.length ? fetch(urls[0], { signal: controller.signal }) : null;
    nextFetch?.catch(() => {});
    // Pipeline the next fetch while decoding sequentially, keeping only the 15s clip slice in RAM.
    try {
      for (let i = 0; i < urls.length; i++) {
        const response = await nextFetch;
        nextFetch = null;
        if (!response.ok) throw new Error(`Audio host returned ${response.status}`);
        const bytesPromise = response.arrayBuffer();
        if (i + 1 < urls.length) {
          nextFetch = fetch(urls[i + 1], { signal: controller.signal });
          nextFetch.catch(() => {});
        }
        let decoded = await context.decodeAudioData(await bytesPromise);
        if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
        if (decoded.duration < current.clipAt + maxLen) throw new Error("Today's audio is too short for the shared clip");
        const srcL = decoded.getChannelData(0);
        const srcR = decoded.getChannelData(decoded.numberOfChannels > 1 ? 1 : 0);
        const copyLen = Math.min(clipSamples, Math.max(0, decoded.length - startSample));
        for (let j = 0; j < copyLen; j++) {
          const k = startSample + j;
          outL[j] += srcL[k];
          outR[j] += srcR[k];
        }
        decoded = null;
      }
    } catch (err) {
      nextFetch?.catch(() => {});
      throw err;
    }
    if (challenge !== current || controller.signal.aborted) return;
    clipBuffer = mixed;
    ready = true;
  })();
  try { await audioLoad; }
  finally { if (challenge === current) audioLoad = null; }
}

// iPhones mute Web Audio with the silent switch (and in some cases entirely) unless the
// page says it plays media. Safari 17+ exposes that as navigator.audioSession.
function mediaPlaybackSession() {
  try { if (navigator.audioSession && navigator.audioSession.type !== "playback") navigator.audioSession.type = "playback"; } catch { /* unsupported */ }
}

async function play() {
  if (loading || expired()) return;
  if (playing) { stop(); render(); return; }
  const current = challenge;
  const needLoad = !clipBuffer;
  mediaPlaybackSession();
  try {
    if (!ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (needLoad) {
      // Resume during the tap gesture, before waiting for the network (Android).
      busy = true;
      render();
      notice("Preparing today's audio. Your attempts start when it is ready.");
    }
    if (ctx.state !== "running") await ctx.resume();
    if (needLoad) await loadAudio();
    if (challenge !== current || document.hidden || !clipBuffer || expired()) return;
    stop();
    const token = playback;
    const length = round.status === "playing" ? BASE_LENGTHS[level()] : BASE_LENGTHS.at(-1);
    const when = ctx.currentTime + 0.02;
    const volume = (muted ? 0 : volumeLevel) ** 2;
    master.gain.value = volume;
    clipGain = ctx.createGain();
    clipGain.connect(master);
    clipGain.gain.setValueAtTime(0, when);
    clipGain.gain.linearRampToValueAtTime(1, when + 0.005);
    clipGain.gain.setValueAtTime(1, when + length - 0.005);
    clipGain.gain.linearRampToValueAtTime(0, when + length);
    const source = ctx.createBufferSource();
    source.buffer = clipBuffer;
    source.connect(clipGain);
    source.start(when, 0, length);
    sources = [source];
    source.onended = () => { if (playback === token) { stop(); render(); } };
    playStartAt = when;
    playDuration = length;
    playing = true;
    updatePlayhead();
    notice(storageAvailable ? "" : "Browser storage is unavailable. Keep this tab open to retain today's progress.");
  } catch (error) {
    if (challenge === current && error.name !== "AbortError") notice(`Couldn't play today's song. Tap Play to retry the same song; no attempt was used. ${error.message}`);
  } finally {
    if (challenge === current) {
      if (needLoad) busy = false;
      render();
    }
  }
}

// A checked Daily (challenge.checked): the website keeps the answer, checks each guess and
// sends the song only when the round is over. The round lives on the server, so it follows
// a signed-in player between devices.
function applyServerRound(result) {
  round = {
    id: result.id,
    attempts: result.attempts,
    status: result.status,
    ...(Array.isArray(result.close) && result.close.length ? { close: result.close } : {})
  };
  if (result.song) challenge.song = result.song;
  save();
  noteFinished();
}

async function checkedAttempt(text, skip) {
  const current = challenge;
  const wasFocused = document.activeElement === $("#guess");
  let shouldAutoPlay = false;
  busy = true;
  stop();
  render();
  try {
    const result = await dailyRounds.act({ challenge: current.id, kind: skip ? "skip" : "guess", text });
    if (challenge !== current) return;
    applyServerRound(result);
    $("#guess").value = "";
    suggestions.close();
    if (result.closeGuess) notice(`Different version — "${result.closeGuess.text}" is another version of this song. Try again on ${BASE_LENGTHS[level()]}s.`);
    else if (round.status === "playing" && ready) shouldAutoPlay = true;
  } catch (error) {
    if (challenge === current) {
      if (error?.status === 409) { busy = false; loadChallenge(); return; }
      notice(`${error.message} No attempt was used.`);
    }
  } finally {
    if (challenge === current) {
      busy = false;
      render();
      if (wasFocused && round.status === "playing" && !isPhoneOrTablet) $("#guess").focus({ preventScroll: true });
      if (shouldAutoPlay && !document.hidden) play();
    }
  }
}

function attempt(text, skip = false) {
  if (!challenge || !ready || busy || expired()) return;
  if (challenge.checked) { if (round.status === "playing") checkedAttempt(text, skip); return; }
  if (storageAvailable) round = readRound();
  if (round.status !== "playing") { render(); return; }
  const wasFocused = document.activeElement === $("#guess");
  const correct = !skip && matchesSong(challenge.song, text);
  const diffVersion = !skip && !correct && matchesVersion(challenge.song, text);
  stop();
  if (diffVersion) {
    round.close = [...(round.close || []), { level: level(), text }];
    save();
    $("#guess").value = "";
    suggestions.close();
    notice(`Different version — "${text}" is another version of this song. Try again on ${BASE_LENGTHS[level()]}s.`);
    render();
    if (wasFocused && !isPhoneOrTablet) $("#guess").focus({ preventScroll: true });
    return;
  }
  round.attempts.push({ kind: correct ? "right" : skip ? "skip" : "wrong", text: skip ? "" : text });
  round.status = correct ? "won" : round.attempts.length === BASE_LENGTHS.length ? "lost" : "playing";
  save();
  noteFinished();
  $("#guess").value = "";
  suggestions.close();
  render();
  if (wasFocused && round.status === "playing" && !isPhoneOrTablet) $("#guess").focus({ preventScroll: true });
  if (round.status === "playing" && ready && !document.hidden) play();
}
function expired() {
  if (challenge && serverNow() >= challenge.resetsAt) { loadChallenge(); return true; }
  return false;
}

// Everyone playing the same Daily sees and shares the same canonical challenge date
// (the day starting at 12am EST/EDT = 6am CET/CEST), regardless of browser timezone.
function dayLabel(daily) {
  return daily.date;
}

async function loadChallenge() {
  if (loading) return;
  loading = true;
  dispose();
  clearTimeout(copyResetTimer);
  $("#share").classList.remove("copied");
  $("#share").textContent = "Copy result";
  $("#game").hidden = true;
  $("#retry").hidden = true;
  $("#share-text").hidden = true;
  notice("Loading today's challenge…");
  const songsPromise = fetch("api/songs").then(r => (r.ok ? r.json() : null)).catch(() => null);
  try {
    const response = await fetch("api/daily", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Daily challenge unavailable");
    challenge = body;
    clockAt = performance.now();
    serverAt = body.serverTime;
    storageKey = `yeatle:daily:${body.date}`;
    round = readRound();
    if (body.checked) applyServerRound(await dailyRounds.act({ challenge: body.id, kind: "state" }));
    $("#day").textContent = `${dayLabel(body)} · ${body.scope === "global" ? "Same song and clip for every Yeatle player" : "Local test · shared by this server's clients"}`;
    $("#game").hidden = false;
    notice(round.status === "playing" ? "Tap Play to load today's song." : (storageAvailable ? "" : "Browser storage is unavailable. Keep this tab open to retain today's progress."));
    render();
    noteFinished();
    // Suggestions are optional; the pinned answer remains guessable after a tracker edit.
    // A checked Daily has no song to add: it would give the answer away.
    const pinned = body.checked ? [] : [body.song];
    suggestions.setSongs(pinned);
    songsPromise.then(list => {
      if (!list || challenge !== body) return;
      catalogSongs = Array.isArray(list.songs) ? list.songs : [];
      catalogEras = Array.isArray(list.eras) ? list.eras : [];
      catalogArtist = list.artist || "Yeat";
      suggestions.setSongs([...pinned, ...catalogSongs]);
      if (round && round.status !== "playing") render();
    });
  } catch (error) { challenge = null; notice(error.message); $("#retry").hidden = false; }
  finally { loading = false; render(); }
}

$("#play").onclick = play;
$("#retry").onclick = loadChallenge;
$("#result-cover").onerror = () => {
  const coverEl = $("#result-cover");
  coverEl.dataset.failedSrc = coverEl.getAttribute("src") || "";
  coverEl.hidden = true;
};
$("#guess-form").onsubmit = event => { event.preventDefault(); const text = $("#guess").value.trim(); if (text) attempt(text); };
$("#skip").onclick = () => attempt("", true);
$("#mute").onclick = () => { muted = !muted; syncVolume(false); };
$("#volume").oninput = () => { muted = false; volumeLevel = Math.max(0, Math.min(1, Number($("#volume").value) || 0)); syncVolume(true); };
syncVolume(false);
$("#share").onclick = async () => {
  const text = shareResult(dayLabel(challenge), round, challenge.shareUrl || new URL("daily", location.href).href);
  const btn = $("#share");
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Copy manually");
    await navigator.clipboard.writeText(text);
    $("#share-text").hidden = true;
    clearTimeout(copyResetTimer);
    btn.classList.add("copied");
    btn.textContent = "Copied!";
    copyResetTimer = setTimeout(() => {
      btn.classList.remove("copied");
      btn.textContent = "Copy result";
    }, 2200);
    notice("Result copied. Paste it wherever you like.");
  } catch (error) {
    $("#share-text").hidden = false;
    $("#share-text").value = text;
    $("#share-text").focus();
    $("#share-text").select();
    notice("Select and copy your result below.");
  }
};
addEventListener("storage", event => {
  if (event.key === "yeatle:volume") {
    try {
      const saved = JSON.parse(event.newValue);
      if (typeof saved === "number" && Number.isFinite(saved)) { volumeLevel = Math.max(0, Math.min(1, saved)); syncVolume(false); }
    } catch {}
  }
  if (challenge && event.key === storageKey) { stop(); round = readRound(); render(); }
});
addEventListener("yeatle:progress-synced", () => {
  if (!challenge) return;
  if (challenge.checked) { loadChallenge(); return; }
  stop(); round = readRound(); render();
});
addEventListener("yeatle:setting-changed", event => {
  if (event.detail?.key === "volume") {
    const v = Number(event.detail.value);
    if (Number.isFinite(v)) { volumeLevel = Math.max(0, Math.min(1, v)); syncVolume(false); }
  }
});
addEventListener("pageshow", event => { if (event.persisted) loadChallenge(); });
addEventListener("yeatle:banned", dispose);
document.addEventListener("visibilitychange", () => { if (document.hidden) { stop(); render(); } else expired(); });
addEventListener("pagehide", dispose);
const hasOpenModal = () => Boolean(document.querySelector(".yeatle-lb-overlay:not([hidden]), .yeatle-wrapped-overlay:not([hidden]), .yeatle-settings-overlay:not([hidden])"));
const isFormInput = target => /^(INPUT|SELECT|TEXTAREA)$/.test(target?.tagName || "");
addEventListener("keydown", event => {
  if (event.metaKey || event.ctrlKey || event.altKey || hasOpenModal() || isFormInput(event.target)) return;
  if (event.code === "Space") {
    if (/^(BUTTON|A)$/.test(event.target?.tagName || "")) return;
    event.preventDefault();
    play();
  } else if (event.key === "s" || event.key === "S") {
    if (ready && !busy && !loading && round?.status === "playing") {
      event.preventDefault();
      attempt("", true);
    }
  } else if (event.key === "Enter") {
    if (round?.status === "playing" && !$("#guess").disabled && !/^(BUTTON|A)$/.test(event.target?.tagName || "")) {
      event.preventDefault();
      $("#guess").focus();
    }
  }
});
addEventListener("keyup", event => {
  if (event.code === "Space" && !isFormInput(event.target) && !/^(BUTTON|A)$/.test(event.target?.tagName || "") && !hasOpenModal()) {
    event.preventDefault();
  }
});

setInterval(() => {
  if (document.hidden || !challenge || loading || expired()) return;
  const seconds = Math.max(0, Math.ceil((challenge.resetsAt - serverNow()) / 1000));
  $("#reset").textContent = `Next song in ${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s · 12am EST (6am CET/CEST)`;
}, 1000);
loadChallenge();
