// Karaoke White people mode in a real browser with a controlled (synthetic) microphone.
//
//   YEATLE_PLAYWRIGHT_MODULE=<path to playwright or playwright-core> node scripts/karaoke-skip-smoke.cjs
//
// Writes a short synthetic song (a sung 220 Hz tone at 2-4 s, 5-7 s and 8-10 s; WAV data,
// which browsers decode whatever the file is called) with a line-timed lyrics.lrc whose
// second line contains a skipped word. The "mic" is a 220 Hz tone in the page's own
// AudioContext that follows the song clock, going silent in each scenario's window.
// This is not a physical microphone test.
const { chromium } = require(process.env.YEATLE_PLAYWRIGHT_MODULE || "playwright-core");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".tmp", `karaoke-skip-smoke-${Date.now()}`);
const PORT = 3195;

function wav(seconds, sample) {
  const rate = 22050, n = Math.round(seconds * rate), buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample(i / rate))) * 32767), 44 + i * 2);
  return buf;
}
function writeSong(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const sung = t => (t >= 2 && t < 4) || (t >= 5 && t < 7) || (t >= 8 && t < 10);
  fs.writeFileSync(path.join(dir, "vocals.mp3"), wav(12, t => (sung(t) ? 0.5 * Math.sin(2 * Math.PI * 220 * t) : 0)));
  for (const stem of ["drums", "bass", "other"]) fs.writeFileSync(path.join(dir, `${stem}.mp3`), wav(12, () => (Math.random() - 0.5) * 0.004));
  fs.writeFileSync(path.join(dir, "lyrics.lrc"), "[00:02.00]first line right here\n[00:05.00]run it nigga up\n[00:08.00]last line right here\n[00:11.00]\n");
}
const base = `http://127.0.0.1:${PORT}`;
fs.mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));

const fakeMic = `
(() => {
  const PHRASES = [[2, 4], [5, 7], [8, 10]];
  window.__mic = { silent: [], delay: 0, zero: null, calls: 0 };
  const md = navigator.mediaDevices || (navigator.mediaDevices = {});
  md.getUserMedia = async () => { __mic.calls++; return { getTracks: () => [{ stop() {} }] }; };
  md.enumerateDevices = async () => [];
  if (navigator.permissions) navigator.permissions.query = async () => ({ state: "prompt" });
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0) {
    if (this.buffer && this.buffer.duration > 5) __mic.zero = when - offset;
    return start.apply(this, arguments);
  };
  AudioContext.prototype.createMediaStreamSource = function () {
    const ctx = this, osc = ctx.createOscillator(), gate = ctx.createGain(), delay = ctx.createDelay(1);
    osc.frequency.value = 220; gate.gain.value = 0; delay.delayTime.value = __mic.delay;
    osc.connect(gate); gate.connect(delay); osc.start();
    const loop = () => {
      requestAnimationFrame(loop);
      if (__mic.zero == null) return;
      const t = ctx.currentTime - __mic.zero;
      const on = PHRASES.some(([a, b]) => t >= a && t < b) && !__mic.silent.some(([a, b]) => t >= a && t < b);
      gate.gain.setTargetAtTime(on ? 0.35 : 0, ctx.currentTime, 0.003);
    };
    loop();
    return delay;
  };
})();`;

async function scenario(browser, name, { white, silent, micDelay = 0, shift = 0, marks = null, restart = false }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(fakeMic);
  const settings = { whiteMode: false, micDelay, audioDelay: 0, sensitivity: 50, players: [{ name: "Tester", deviceId: "" }] };
  await context.addInitScript(([s, shiftValue, m]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("yeatle-karaoke-settings", JSON.stringify(s));
    if (shiftValue) localStorage.setItem("yeatle-karaoke-shift:skiptest", JSON.stringify(shiftValue));
    if (m) localStorage.setItem("yeatle-karaoke-skips:skiptest", JSON.stringify(m));
  }, [settings, shift, marks]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`${base}/karaoke.html`);
  await page.waitForSelector("#song-list .song");
  await page.fill("#search", "Skïp");
  await page.click("#song-list .song");
  // the toggle works before any microphone permission
  if (white) await page.check("#white-mode");
  const before = await page.evaluate(() => ({ calls: __mic.calls, info: document.querySelector(".skip-info")?.textContent || "", checked: document.querySelector("#white-mode").checked }));
  await page.evaluate(([s, d]) => { __mic.silent = s; __mic.delay = d; }, [silent, micDelay / 1000]);
  await page.click("#start");
  await page.waitForSelector("#stage:not([hidden])", { timeout: 30000 });
  const label = await page.textContent("#stage-diff");
  await page.waitForFunction(() => __mic.zero != null && document.querySelector("#lane"));
  await wait(6400 + 3000 - 0); // count-in (3 s) + into the skipped phrase
  await page.screenshot({ path: path.join(OUT, `${name}-lane.png`) });
  const lyric = await page.evaluate(() => document.querySelector("#lyric-now").innerHTML);
  if (restart) {
    await page.keyboard.press("Escape");
    await page.click("#restart");
    await page.waitForFunction(() => document.querySelector("#countdown").textContent !== "");
  }
  await page.waitForSelector("#results:not([hidden])", { timeout: 40000 });
  const results = await page.evaluate(() => ({
    sub: document.querySelector("#results-sub").textContent,
    score: Number(document.querySelector(".result-score").textContent.replace(/\D/g, "")),
    stats: [...document.querySelectorAll(".result-stats span")].map(s => s.textContent),
    breakdown: Object.fromEntries([...document.querySelectorAll(".breakdown li")].map(li => [li.className, Number(li.querySelector("b").textContent)])),
    keys: Object.keys(localStorage).filter(k => k.startsWith("yeatle-karaoke-best")).map(k => [k, localStorage.getItem(k)])
  }));
  await page.screenshot({ path: path.join(OUT, `${name}-results.png`) });
  await context.close();
  return { name, white, silent, micDelay, shift, before, label, lyric, ...results, errors };
}

(async () => {
  const stems = path.join(OUT, "songs");
  writeSong(path.join(stems, "Skïp tëst"));
  fs.mkdirSync(path.join(OUT, "data"), { recursive: true });
  fs.writeFileSync(path.join(OUT, "data", "config.json"), JSON.stringify({ tabs: [], refreshMinutes: 0, openBrowser: false, dailyAuthority: "" }));
  const server = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, YEATLE_PORT: String(PORT), YEATLE_DATA_DIR: path.join(OUT, "data"), YEATLE_STEMS_DIR: stems },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let log = "";
  server.stdout.on("data", d => { log += d; });
  server.stderr.on("data", d => { log += d; });
  for (let i = 0; i < 100; i++) { try { const r = await fetch(`${base}/api/songs`); if (r.ok) break; } catch {} await wait(200); }
  const browser = await chromium.launch({ executablePath: process.env.YEATLE_TEST_BROWSER, args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
  const runs = [];
  try {
    runs.push(await scenario(browser, "normal-perfect", { white: false, silent: [] }));
    runs.push(await scenario(browser, "normal-silent-word", { white: false, silent: [[5.9, 6.5]] }));
    runs.push(await scenario(browser, "white-silent-word", { white: true, silent: [[5.9, 6.5]] }));
    runs.push(await scenario(browser, "white-silent-ordinary", { white: true, silent: [[8.9, 9.5]] }));
    runs.push(await scenario(browser, "normal-silent-ordinary", { white: false, silent: [[8.9, 9.5]] }));
    runs.push(await scenario(browser, "white-mic-delay-150", { white: true, silent: [[5.9, 6.5]], micDelay: 150 }));
    runs.push(await scenario(browser, "white-lyric-shift-0.5", { white: true, silent: [[5.4, 6.0]], shift: 0.5 }));
    runs.push(await scenario(browser, "white-own-mark-only", { white: true, silent: [[8.9, 9.5]], marks: { auto: false, marks: [{ t: 8.9, len: 0.6 }] } }));
    runs.push(await scenario(browser, "white-restart", { white: true, silent: [[5.9, 6.5]], restart: true }));
  } finally {
    await browser.close();
    server.kill();
    fs.writeFileSync(path.join(OUT, "server.log"), log);
  }
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(runs, null, 1));
  for (const r of runs) console.log(r.name.padEnd(24), String(r.score).padStart(6), JSON.stringify(r.breakdown), "|", r.label, "|", r.sub);
  const by = Object.fromEntries(runs.map(r => [r.name, r]));
  const assert = require("node:assert/strict");
  assert.ok(runs.every(r => r.before.calls === 0 && !r.errors.length), "no mic request before Sing, no page errors");
  assert.ok(by["normal-silent-word"].score < by["normal-perfect"].score, "normal mode counts silence at the word");
  for (const name of ["white-silent-word", "white-mic-delay-150", "white-lyric-shift-0.5", "white-own-mark-only", "white-restart"]) {
    assert.ok(by[name].score >= by["normal-perfect"].score * 0.98, `${name} forgives the skipped word`);
    assert.match(by[name].sub, /White people mode/);
  }
  assert.ok(by["white-silent-ordinary"].score < by["normal-perfect"].score * 0.95, "ordinary misses still count");
  assert.ok(Math.abs(by["white-silent-ordinary"].score - by["normal-silent-ordinary"].score) < by["normal-perfect"].score * 0.03, "and cost about the same as in normal mode");
  assert.ok(by["white-silent-word"].keys.some(([k]) => k.endsWith(":medium:wpm")), "separate best score");
  console.log(JSON.stringify({ passed: true, output: OUT }));
})().catch(e => { console.error(JSON.stringify({ passed: false, output: OUT, failure: e.stack })); process.exit(1); });
