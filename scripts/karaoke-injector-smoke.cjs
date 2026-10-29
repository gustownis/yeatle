// Ranked karaoke against the "Yeatle Karaoke Stem Injector" userscript, in a real browser
// against a LOCAL server only. Never point this at the public website.
//
//   YEATLE_INJECTOR_SCRIPT=<path to the userscript>
//   YEATLE_PLAYWRIGHT_MODULE=<path to playwright or playwright-core>
//   YEATLE_TEST_BROWSER=<Chrome or Edge executable> (optional)
//   node scripts/karaoke-injector-smoke.cjs
//
// Writes a short synthetic song, signs in a fresh account per scenario and sings it with
// Chrome's fake microphone device (a periodic beep). Scenarios:
//   control    no userscript: the run must be ranked
//   injector   the userscript as published, in the top page only (as its @match applies):
//              the game's clean audio frame must not hear it, and the run is unranked
//   adapted    the userscript also running inside frames: it does inject, and the
//              integrity and similarity checks must unrank and flag the run
// The browser's default autoplay policy is kept, so the clean frame's audio has to start
// from a real click. This is not a physical microphone test.
const { chromium } = require(process.env.YEATLE_PLAYWRIGHT_MODULE || "playwright-core");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".tmp", `karaoke-injector-smoke-${Date.now()}`);
const PORT = 3196;
const base = `http://127.0.0.1:${PORT}`;
const wait = ms => new Promise(r => setTimeout(r, ms));
const SCRIPT = process.env.YEATLE_INJECTOR_SCRIPT;
if (!SCRIPT || !fs.existsSync(SCRIPT)) { console.error("Set YEATLE_INJECTOR_SCRIPT to the userscript file."); process.exit(1); }
const injector = fs.readFileSync(SCRIPT, "utf8");

function wav(seconds, sample) {
  const rate = 22050, n = Math.round(seconds * rate), buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample(i / rate))) * 32767), 44 + i * 2);
  return buf;
}

// Twelve sung phrases of two notes each, with a syllable-like loudness pulse. The gaps are
// long enough (over 0.85 s) for the chart to rate each one as its own phrase.
const PHRASES = Array.from({ length: 12 }, (_, i) => [2 + i * 2.4, 3.4 + i * 2.4]);
const NOTES = [220, 247, 262, 294, 330, 294, 262, 247, 220, 196, 220, 262];
function writeSong(dir) {
  fs.mkdirSync(dir, { recursive: true });
  let phase = 0;
  const seconds = 33, rate = 22050;
  const samples = Array.from({ length: Math.round(seconds * rate) }, (_, i) => {
    const t = i / rate;
    const k = PHRASES.findIndex(([a, b]) => t >= a && t < b);
    if (k < 0) return 0;
    const f = t - PHRASES[k][0] < 0.7 ? NOTES[k] : NOTES[k] * 1.122;
    phase += 2 * Math.PI * f / rate;
    return 0.5 * (0.55 + 0.45 * Math.sin(2 * Math.PI * 5 * t)) * Math.sin(phase);
  });
  fs.writeFileSync(path.join(dir, "vocals.mp3"), wav(seconds, t => samples[Math.min(samples.length - 1, Math.round(t * rate))]));
  for (const stem of ["drums", "bass", "other"]) fs.writeFileSync(path.join(dir, `${stem}.mp3`), wav(seconds, () => (Math.random() - 0.5) * 0.004));
}

async function scenario(browser, name, mode) {
  const username = `${name}${Date.now() % 100000}`;
  const reg = await (await fetch(`${base}/api/account/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "pass1234" }) })).json();
  if (!reg.token) throw new Error(`register failed: ${JSON.stringify(reg)}`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ["microphone"] });
  await context.addInitScript(([account]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("yeatle:account", JSON.stringify(account));
    localStorage.setItem("yeatle-karaoke-settings", JSON.stringify({ micDelay: 0, audioDelay: 0, sensitivity: 60, players: [{ name: "Singer 1", deviceId: "" }] }));
  }, [{ token: reg.token, username: reg.account.username, dailyStreak: 0 }]);
  const page = await context.newPage();
  const errors = [];
  let submitted = null;
  page.on("pageerror", e => errors.push(String(e)));
  page.on("request", req => { if (req.url().endsWith("/api/account/karaoke/submit")) submitted = req.postDataJSON(); });
  await page.goto(`${base}/karaoke.html`);
  if (mode !== "control") {
    // Seed the userscript's own stem library with the song's vocal, as a cheater would upload it.
    await page.evaluate(async () => {
      // Its floating panel, minimized and out of the way, with its default injection settings.
      localStorage.setItem("yksi_settings_v2", JSON.stringify({ minimized: true, posX: 1000, posY: 740, lastStemId: "stem_test" }));
      const list = await (await fetch("api/songs")).json();
      const song = list.songs.find(s => s.mode === "stems");
      const data = await (await fetch(`Songs/${encodeURIComponent(song.folder)}/vocals.mp3`)).arrayBuffer();
      await new Promise((resolve, reject) => {
        const req = indexedDB.open("yeatle_stem_injector_db_v2", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("stems", { keyPath: "id" });
        req.onsuccess = () => { const tx = req.result.transaction("stems", "readwrite"); tx.objectStore("stems").put({ id: "stem_test", name: "vocal", data, offset: 0, pace: 1, detune: 0 }); tx.oncomplete = resolve; tx.onerror = reject; };
        req.onerror = reject;
      });
    });
    // As published, Tampermonkey runs it in the top page; "adapted" also runs it in frames.
    await context.addInitScript(mode === "injector" ? `if (window.top === window) {\n${injector}\n}` : injector);
    await page.reload();
  }
  await page.waitForSelector("#song-list .song");
  await page.click("#song-list .song");
  await page.click("#enable-mics").catch(() => {});
  await page.click("#start");
  await page.waitForSelector("#stage:not([hidden])", { timeout: 60000 });
  await page.waitForSelector("#results:not([hidden])", { timeout: 90000 });
  await page.waitForFunction(() => { const t = document.querySelector("#results-rank")?.textContent || ""; return t && !/Checking/.test(t); }, null, { timeout: 30000 });
  const result = await page.evaluate(() => ({
    rank: document.querySelector("#results-rank").textContent,
    score: Number(document.querySelector(".result-score").textContent.replace(/\D/g, "")),
    breakdown: [...document.querySelectorAll(".breakdown li")].map(li => `${li.className}:${li.querySelector("b").textContent}`).join(" "),
    injectorStatus: document.querySelector("#yksi-status")?.textContent || "",
    cleanFrame: Boolean(document.querySelector('iframe[title="audio"]'))
  }));
  await page.screenshot({ path: path.join(OUT, `${name}-results.png`) });
  await context.close();
  const { similarityVerdict } = await import(require("node:url").pathToFileURL(path.join(ROOT, "build/assets/karaoke-scoring.mjs")).href);
  const verdict = submitted ? similarityVerdict(submitted.phrases) : null;
  const similarity = verdict && { measured: verdict.measured, medianCorr: verdict.medianCorr, medianCents: verdict.medianCents, lagStd: verdict.lagStd && Math.round(verdict.lagStd) };
  return { name, username: reg.account.username, ...result, similarity, errors };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const stems = path.join(OUT, "songs");
  writeSong(path.join(stems, "Injector test"));
  const data = path.join(OUT, "data");
  fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, "config.json"), JSON.stringify({ tabs: [], refreshMinutes: 0, openBrowser: false, dailyAuthority: "" }));
  const server = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env, YEATLE_PORT: String(PORT), YEATLE_DATA_DIR: data, YEATLE_STEMS_DIR: stems }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  server.stdout.on("data", d => { log += d; });
  server.stderr.on("data", d => { log += d; });
  for (let i = 0; i < 100; i++) { try { const r = await fetch(`${base}/api/songs`); if (r.ok && (await r.json()).songs.length) break; } catch {} await wait(200); }
  const browser = await chromium.launch({ executablePath: process.env.YEATLE_TEST_BROWSER, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--mute-audio"] });
  const runs = [];
  try {
    for (const [name, mode] of [["control", "control"], ["injector", "injector"], ["adapted", "adapted"]]) runs.push(await scenario(browser, name, mode));
  } finally {
    await browser.close();
    server.kill();
    fs.writeFileSync(path.join(OUT, "server.log"), log);
  }
  const moderation = JSON.parse(fs.readFileSync(path.join(data, "leaderboard-bans.json"), "utf8"));
  const board = JSON.parse(fs.readFileSync(path.join(data, "leaderboard-users.json"), "utf8"));
  for (const r of runs) {
    r.flag = moderation.flags.find(f => f.username === r.username)?.reasons || null;
    r.rankedBest = Object.values(Object.values(board.users).find(u => u.username === r.username).ranked.karaoke)[0]?.score || 0;
  }
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(runs, null, 1));
  for (const r of runs) console.log(r.name.padEnd(9), String(r.score).padStart(6), "|", JSON.stringify(r.similarity), "|", r.breakdown, "|", r.rank, "|", r.injectorStatus, "|", JSON.stringify(r.flag));
  const by = Object.fromEntries(runs.map(r => [r.name, r]));
  assert.ok(runs.every(r => !r.errors.length), `no page errors: ${runs.flatMap(r => r.errors).join("; ")}`);
  assert.ok(runs.every(r => r.cleanFrame), "the clean audio frame was created");
  assert.match(by.control.rank, /^Ranked/);
  assert.ok(by.control.rankedBest > 0, "the control run is on the board");
  assert.doesNotMatch(by.injector.rank, /^Ranked/);
  assert.equal(by.injector.rankedBest, 0);
  assert.match(by.injector.flag.join(" "), /modified browser audio/);
  assert.doesNotMatch(by.injector.injectorStatus, /Injecting directly into Game AudioContext/, "the published script never reached the game's audio");
  assert.doesNotMatch(by.adapted.rank, /^Ranked/);
  assert.equal(by.adapted.rankedBest, 0);
  assert.match(by.adapted.flag.join(" "), /audio frame/);
  assert.match(by.adapted.flag.join(" "), /original vocal/, "the similarity check catches it too");
  console.log(JSON.stringify({ passed: true, output: OUT }));
})().catch(e => { console.error(JSON.stringify({ passed: false, output: OUT, failure: e.stack })); process.exit(1); });
