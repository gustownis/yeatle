import { BASE_LENGTHS, matchesSong, restoreRound, shareResult } from "./snippet-rules.mjs?v=1.11.6";
import { attachSongSuggestions } from "./song-suggestions.mjs?v=1.11.6";

const $ = selector => document.querySelector(selector);
const suggestions = attachSongSuggestions($("#guess"), $("#song-suggestions"));
let challenge, round, storageKey, clockAt, serverAt, loading = false;
let ctx, master, clipGain, buffers, sources = [], audioLoad, abortAudio, playback = 0;
let ready = false, busy = false, playing = false, storageAvailable = true;
const notice = text => { $("#notice").textContent = text; };
const serverNow = () => serverAt + performance.now() - clockAt;

function stop() {
  playback++;
  for (const source of sources) { try { source.stop(); } catch {} source.disconnect(); }
  sources = [];
  clipGain?.disconnect();
  clipGain = null;
  playing = false;
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
  $("#clips").replaceChildren(...BASE_LENGTHS.map((length, index) => {
    const li = document.createElement("li");
    const attempt = round.attempts[index];
    li.className = `seg ${attempt?.kind || (!done && index === level() ? "now" : "")}`;
    li.textContent = `${length}s`;
    li.setAttribute("aria-label", `${length} seconds: ${attempt?.kind || (!done && index === level() ? "current" : "locked")}`);
    return li;
  }));
  $("#play").textContent = busy ? "Loading audio…" : playing ? "Stop" : done ? "Replay 15s" : `Play ${seconds}s`;
  $("#play").disabled = busy || loading;
  $("#guess-form").hidden = done;
  for (const id of ["#guess", "#submit", "#skip"]) $(id).disabled = !ready || busy || loading;
  if (done || !ready || busy || loading) suggestions.close();
  $("#skip").textContent = level() === BASE_LENGTHS.length - 1 ? "Give up" : "Skip";
  $("#guesses").replaceChildren(...round.attempts.map((attempt, index) => {
    const li = document.createElement("li");
    li.className = attempt.kind;
    li.textContent = `${BASE_LENGTHS[index]}s · ${attempt.kind === "skip" ? "Skipped" : attempt.kind === "right" ? "Correct" : attempt.text}`;
    return li;
  }));
  $("#result").hidden = !done;
  if (done) {
    $("#result-label").textContent = round.status === "won" ? "The song is" : "The song was";
    $("#answer").textContent = challenge.song.display || challenge.song.title;
    const solvedSeconds = BASE_LENGTHS[round.attempts.length - 1];
    $("#result-detail").textContent = [round.status === "won" ? `You found it in ${solvedSeconds} second${solvedSeconds === 1 ? "" : "s"}.` : "Tomorrow brings another song.", challenge.song.era, challenge.song.eraYear || challenge.song.year, challenge.song.tab, challenge.song.relatedRecording && `Related recording: ${challenge.song.relatedRecording}`].filter(Boolean).join(" · ");
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
    const volume = Number($("#volume").value) ** 2;
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
    playing = true;
    notice(storageAvailable ? "" : "Browser storage is unavailable. Keep this tab open to retain today's progress.");
  } catch (error) {
    if (challenge === current && error.name !== "AbortError") notice(`Couldn't play today's song. Tap Play to retry the same song; no attempt was used. ${error.message}`);
  } finally {
    if (challenge === current) { busy = false; render(); }
  }
}

function attempt(text, skip = false) {
  if (!challenge || !ready || busy || expired()) return;
  if (storageAvailable) round = readRound();
  if (round.status !== "playing") { render(); return; }
  const correct = !skip && matchesSong(challenge.song, text);
  stop();
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

async function loadChallenge() {
  if (loading) return;
  loading = true;
  dispose();
  $("#game").hidden = true;
  $("#retry").hidden = true;
  $("#share-text").hidden = true;
  notice("Loading today's challenge…");
  try {
    const response = await fetch("api/daily", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Daily challenge unavailable");
    challenge = body;
    clockAt = performance.now();
    serverAt = body.serverTime;
    storageKey = `yeatle:daily:${body.date}`;
    round = readRound();
    $("#day").textContent = `${body.date} · ${body.scope === "global" ? "Same song and clip for every Yeatle player" : "Local test · shared by this server's clients"}`;
    $("#game").hidden = false;
    notice(round.status === "playing" ? "Tap Play to load today's song." : "Today's result is saved. Share it or keep playing Snippets.");
    render();
    // Suggestions are optional; the pinned answer remains guessable after a tracker edit.
    suggestions.setSongs([body.song]);
    fetch("api/songs").then(r => r.json()).then(list => {
      if (challenge !== body) return;
      suggestions.setSongs([body.song, ...(list.songs || [])]);
    }).catch(() => {});
  } catch (error) { challenge = null; notice(error.message); $("#retry").hidden = false; }
  finally { loading = false; render(); }
}

$("#play").onclick = play;
$("#retry").onclick = loadChallenge;
$("#guess-form").onsubmit = event => { event.preventDefault(); const text = $("#guess").value.trim(); if (text) attempt(text); };
$("#skip").onclick = () => attempt("", true);
$("#volume").oninput = () => { if (master) master.gain.value = Number($("#volume").value) ** 2; };
$("#share").onclick = async () => {
  const text = shareResult(challenge.date, round, challenge.shareUrl || new URL("daily", location.href).href);
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
addEventListener("storage", event => { if (challenge && event.key === storageKey) { stop(); round = readRound(); render(); } });
addEventListener("yeatle:progress-synced", () => { if (challenge) { stop(); round = readRound(); render(); } });
document.addEventListener("visibilitychange", () => { if (document.hidden) { stop(); render(); } else expired(); });
addEventListener("pagehide", dispose);
setInterval(() => {
  if (!challenge || loading || expired()) return;
  const seconds = Math.max(0, Math.ceil((challenge.resetsAt - serverNow()) / 1000));
  $("#reset").textContent = `Next song in ${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s · midnight UTC`;
}, 1000);
loadChallenge();
