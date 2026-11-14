import { BASE_LENGTHS, matchesSong, matchesVersion, restoreRound, shareResult } from "./snippet-rules.mjs?v=1.13.10";
import { attachSongSuggestions } from "./song-suggestions.mjs?v=1.13.10";
import { dailyRounds } from "./leaderboard.mjs?v=1.13.10";

const $ = selector => document.querySelector(selector);
const suggestions = attachSongSuggestions($("#guess"), $("#song-suggestions"));
let challenge, round, storageKey, clockAt, serverAt, loading = false;
let ctx, master, clipGain, buffers, sources = [], audioLoad, abortAudio, playback = 0;
let ready = false, busy = false, playing = false, storageAvailable = true;
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
  buffers = null;
  ready = false;
  busy = false;
  if (ctx) ctx.close().catch(() => {});
  ctx = master = null;
}
function readRound() {
  try { return restoreRound(JSON.parse(localStorage.getItem(storageKey)), challenge.id); }
  catch { storageAvailable = false; return restoreRound(null, challenge.id); }
}
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(round)); }
  catch { storageAvailable = false; notice("Browser storage is unavailable. Keep this tab open to retain today's progress."); }
}
function level() { return Math.min(round.attempts.length, BASE_LENGTHS.length - 1); }
function render() {
  if (!challenge) return;
  const done = round.status !== "playing";
  const seconds = done ? BASE_LENGTHS.at(-1) : BASE_LENGTHS[level()];
  $("#clip-label").textContent = done ? round.status === "won" ? "You got it" : "Not this time" : `${seconds} second${seconds === 1 ? "" : "s"}`;
  $("#attempt").textContent = done ? "Come back tomorrow" : `Clip ${level() + 1} of ${BASE_LENGTHS.length}`;
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
  for (const id of ["#guess", "#submit", "#skip"]) $(id).disabled = !ready || busy || loading;
  if (done || !ready || busy || loading) suggestions.close();
  $("#skip").textContent = level() === BASE_LENGTHS.length - 1 ? "Give up" : "Skip";
  const guessItems = [];
  for (let index = 0; index < BASE_LENGTHS.length; index++) {
    for (const c of (round.close || []).filter(item => item.level === index)) {
      const li = document.createElement("li");
      li.className = "close";
      li.textContent = `${BASE_LENGTHS[index]}s · Different version · ${c.text}`;
      guessItems.push(li);
    }
    const attempt = round.attempts[index];
    if (attempt) {
      const li = document.createElement("li");
      li.className = attempt.kind;
      li.textContent = `${BASE_LENGTHS[index]}s · ${attempt.kind === "skip" ? "Skipped" : attempt.kind === "right" ? "Correct" : attempt.text}`;
      guessItems.push(li);
    }
  }
  $("#guesses").replaceChildren(...guessItems);
  $("#result").hidden = !done;
  if (done) {
    $("#result-label").textContent = round.status === "won" ? "The song is" : "The song was";
    $("#answer").textContent = challenge.song.display || challenge.song.title;
    const solvedSeconds = BASE_LENGTHS[round.attempts.length - 1];
    $("#result-detail").textContent = [round.status === "won" ? `You found it in ${solvedSeconds} second${solvedSeconds === 1 ? "" : "s"}.` : "Tomorrow brings another song.", challenge.song.eraDisplay || challenge.song.era, challenge.song.eraYear || challenge.song.year, challenge.song.tab, challenge.song.relatedRecording && `Related recording: ${challenge.song.relatedRecording}`].filter(Boolean).join(" · ");
  }
}

async function loadAudio() {
  if (buffers) return;
  if (audioLoad) return audioLoad;
  const current = challenge;
  const controller = new AbortController();
  abortAudio = controller;
  const context = ctx;
  audioLoad = (async () => {
    const urls = current.audio;
    const decoded = [];
    // Sequential decoding avoids four simultaneous compressed/decoded copies on phones.
    for (const url of urls) {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Audio host returned ${response.status}`);
      decoded.push(await context.decodeAudioData(await response.arrayBuffer()));
      if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
    }
    if (Math.min(...decoded.map(b => b.duration)) < current.clipAt + BASE_LENGTHS.at(-1)) throw new Error("Today's audio is too short for the shared clip");
    if (challenge !== current || controller.signal.aborted) return;
    buffers = decoded;
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
  mediaPlaybackSession();
  try {
    if (!ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    // Resume during the tap gesture, before waiting for the network (Android).
    busy = true;
    render();
    await ctx.resume();
    notice(ready ? "" : "Preparing today's audio. Your attempts start when it is ready.");
    await loadAudio();
    if (challenge !== current || document.hidden || !buffers || expired()) return;
    stop();
    const token = playback;
    const offset = challenge.clipAt;
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
    sources = buffers.map(buffer => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(clipGain);
      source.start(when, offset, length);
      return source;
    });
    sources[0].onended = () => { if (playback === token) { stop(); render(); } };
    playStartAt = when;
    playDuration = length;
    playing = true;
    updatePlayhead();
    notice(storageAvailable ? "" : "Browser storage is unavailable. Keep this tab open to retain today's progress.");
  } catch (error) {
    if (challenge === current && error.name !== "AbortError") notice(`Couldn't play today's song. Tap Play to retry the same song; no attempt was used. ${error.message}`);
  } finally {
    if (challenge === current) { busy = false; render(); }
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
}

async function checkedAttempt(text, skip) {
  const current = challenge;
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
  } catch (error) {
    if (challenge === current) notice(`${error.message} No attempt was used.`);
  } finally {
    if (challenge === current) { busy = false; render(); }
  }
}

function attempt(text, skip = false) {
  if (!challenge || !ready || busy || expired()) return;
  if (challenge.checked) { if (round.status === "playing") checkedAttempt(text, skip); return; }
  if (storageAvailable) round = readRound();
  if (round.status !== "playing") { render(); return; }
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
    return;
  }
  round.attempts.push({ kind: correct ? "right" : skip ? "skip" : "wrong", text: skip ? "" : text });
  round.status = correct ? "won" : round.attempts.length === BASE_LENGTHS.length ? "lost" : "playing";
  save();
  $("#guess").value = "";
  suggestions.close();
  render();
}
function expired() {
  if (challenge && serverNow() >= challenge.resetsAt) { loadChallenge(); return true; }
  return false;
}

// The Daily changes at 00:00 UTC, which is still the evening before in the Americas. Show the
// player's own calendar date at the moment this Daily started, so it never reads as tomorrow.
// (Saved rounds and the server keep using the UTC date.)
function dayLabel(daily) {
  const d = new Date(daily.resetsAt - 86400000);
  if (Number.isNaN(d.getTime())) return daily.date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function loadChallenge() {
  if (loading) return;
  loading = true;
  dispose();
  $("#game").hidden = true;
  $("#retry").hidden = true;
  $("#share-text").hidden = true;
  notice("Loading today's challenge…");
  const songsPromise = fetch("api/songs").then(r => r.json()).catch(() => null);
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
    notice(round.status === "playing" ? "Tap Play to load today's song." : "Today's result is saved. Share it or keep playing Snippets.");
    render();
    // Suggestions are optional; the pinned answer remains guessable after a tracker edit.
    // A checked Daily has no song to add: it would give the answer away.
    const pinned = body.checked ? [] : [body.song];
    suggestions.setSongs(pinned);
    songsPromise.then(list => {
      if (!list || challenge !== body) return;
      suggestions.setSongs([...pinned, ...(list.songs || [])]);
    });
  } catch (error) { challenge = null; notice(error.message); $("#retry").hidden = false; }
  finally { loading = false; render(); }
}

$("#play").onclick = play;
$("#retry").onclick = loadChallenge;
$("#guess-form").onsubmit = event => { event.preventDefault(); const text = $("#guess").value.trim(); if (text) attempt(text); };
$("#skip").onclick = () => attempt("", true);
$("#mute").onclick = () => { muted = !muted; syncVolume(false); };
$("#volume").oninput = () => { muted = false; volumeLevel = Math.max(0, Math.min(1, Number($("#volume").value) || 0)); syncVolume(true); };
syncVolume(false);
$("#share").onclick = async () => {
  const text = shareResult(dayLabel(challenge), round, challenge.shareUrl || new URL("daily", location.href).href);
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Copy manually");
    await navigator.clipboard.writeText(text);
    $("#share-text").hidden = true;
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
addEventListener("yeatle:progress-synced", () => { if (challenge && !challenge.checked) { stop(); round = readRound(); render(); } });
document.addEventListener("visibilitychange", () => { if (document.hidden) { stop(); render(); } else expired(); });
addEventListener("pagehide", dispose);
setInterval(() => {
  if (!challenge || loading || expired()) return;
  const seconds = Math.max(0, Math.ceil((challenge.resetsAt - serverNow()) / 1000));
  $("#reset").textContent = `Next song in ${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s · midnight UTC`;
}, 1000);
loadChallenge();
