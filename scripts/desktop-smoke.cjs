// Run with Electron, using a disposable profile and an existing local stem song.
// YEATLE_TEST_APP_ROOT may point to a packaged app.asar instead of this checkout.
const { app, dialog } = require("electron");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const target = process.env.YEATLE_TEST_APP_ROOT || root;
const stems = process.env.YEATLE_TEST_STEMS || path.join(root, "build/Songs/Lyfe stealer");
const output = path.join(root, ".tmp", `desktop-smoke-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
app.setPath("userData", path.join(output, "profile"));
app.commandLine.appendSwitch("use-fake-device-for-media-stream");
app.commandLine.appendSwitch("disable-background-timer-throttling");
const result = { platform: process.platform, versions: process.versions, target, output, checks: {} };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let window, done = false;
const evaluate = code => window.webContents.executeJavaScript(code, true);
async function until(code, label, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(`Boolean(${code})`)) return;
    await wait(75);
  }
  throw new Error(`${label} timed out`);
}
async function finish(error) {
  if (done) return;
  done = true;
  result.passed = !error;
  if (error) {
    result.failure = error.stack;
    if (window && !window.isDestroyed()) {
      try { result.diagnostics = await evaluate('({ visibility: document.visibilityState, countdown: document.querySelector("#countdown")?.textContent, loading: document.querySelector("#load-text")?.textContent, stageHidden: document.querySelector("#stage")?.hidden, audit: window.smoke, audio: window.smokeContext && { state: smokeContext.state, time: smokeContext.currentTime } })'); }
      catch (diagnosticError) { result.diagnosticError = diagnosticError.message; }
    }
  }
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: result.passed, output, failure: result.failure }));
  process.exitCode = error ? 1 : 0;
  if (error) app.once("will-quit", event => { event.preventDefault(); app.exit(1); });
  app.quit();
}
dialog.showErrorBox = (title, detail) => finish(new Error(`${title}: ${detail}`));

app.on("browser-window-created", (_event, created) => {
  if (window) return;
  window = created;
  window.show = () => {};
  window.webContents.setAudioMuted(true);
  window.webContents.setBackgroundThrottling(false);
  const debug = window.webContents.debugger;
  debug.attach("1.3");
  debug.sendCommand("Page.enable").then(() => debug.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.smoke = { errors: [], starts: [], countdown: [] };
    addEventListener('error', event => smoke.errors.push(event.message));
    addEventListener('unhandledrejection', event => smoke.errors.push(String(event.reason)));
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(when, offset) {
      window.smokeContext = this.context;
      const samples = this.buffer.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < samples.length; i += 128) peak = Math.max(peak, Math.abs(samples[i]));
      smoke.starts.push({ lead: when - this.context.currentTime, offset, duration: this.buffer.duration, peak });
      return start.apply(this, arguments);
    };
    addEventListener('DOMContentLoaded', () => {
      localStorage.setItem('yeatle:lightStems', 'true');
      localStorage.setItem('yeatle-karaoke-settings', JSON.stringify({ audioDelay: 0, players: [{ name: 'Test singer', deviceId: 'none' }] }));
      const countdown = document.querySelector('#countdown');
      if (countdown) new MutationObserver(() => smoke.countdown.push(countdown.textContent)).observe(countdown, { childList: true });
    });
  ` })).catch(finish);
  window.webContents.once("did-finish-load", () => runWindow().catch(finish));
});

async function runWindow() {
  await until('document.querySelectorAll("[role=tab]").length === 3', "game tabs");
  result.checks.game = await evaluate('({ title: document.title, runtime: document.documentElement.dataset.navigationRuntime, desktop: globalThis.yeatleDesktop })');
  assert.equal(result.checks.game.desktop, true);
  assert.equal(result.checks.game.runtime, "desktop");
  const origin = new URL(window.webContents.getURL()).origin;
  const arrived = new Promise(resolve => window.webContents.once("did-finish-load", resolve));
  await evaluate('[...document.querySelectorAll("[role=tab]")].find(tab => tab.textContent === "Karaoke").click()');
  await arrived;
  await until('document.querySelector("#song-list button")', "local song list");
  result.checks.permissions = await evaluate(`(async () => {
    const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
    const microphone = audio.getAudioTracks().length;
    audio.getTracks().forEach(track => track.stop());
    let camera;
    try { const video = await navigator.mediaDevices.getUserMedia({ video: true }); video.getTracks().forEach(track => track.stop()); camera = 'allowed'; }
    catch (error) { camera = error.name; }
    return { microphone, camera };
  })()`);
  assert.equal(result.checks.permissions.microphone, 1);
  assert.equal(result.checks.permissions.camera, "NotAllowedError");
  result.checks.songs = await evaluate(`(async () => (await (await fetch(${JSON.stringify(origin + "/api/songs")})).json()).songs)()`);
  assert.ok(result.checks.songs.some(song => song.folder === "Lyfe stealer" && song.mode === "stems"));
  await evaluate('document.querySelector("#song-list button").click()');
  await until('!document.querySelector("#start").disabled', "song selection");
  await evaluate('document.querySelector("#start").click()');
  await until('!document.querySelector("#stage").hidden', "decoded audio and vocal analysis", 60000);
  // Hidden compositors can skip brief labels under load. Browser checks assert
  // each label; here also verify the scheduled delay and advancing audio clock.
  await until('document.querySelector("#countdown").textContent === "" && parseFloat(document.querySelector("#progress").style.width) > 0', "count-in completion", 20000);
  result.checks.playback = await evaluate('({ ...smoke, progress: document.querySelector("#progress").style.width })');
  assert.equal(result.checks.playback.countdown[0], "3");
  assert.equal(result.checks.playback.countdown.at(-1), "");
  assert.equal(result.checks.playback.starts.length, 2);
  assert.ok(result.checks.playback.starts.every(source => source.lead > 3 && source.peak > 0 && source.duration > 30));
  assert.ok(parseFloat(result.checks.playback.progress) > 0);
  assert.deepEqual(result.checks.playback.errors, []);
  fs.writeFileSync(path.join(output, "karaoke-playing.png"), (await window.webContents.capturePage()).toPNG());
  await evaluate('document.querySelector("#pause-btn").click()');
  await until('!document.querySelector("#pause").hidden', "pause");
  await wait(250);
  const paused = await evaluate('document.querySelector("#progress").style.width');
  await wait(500);
  assert.equal(await evaluate('document.querySelector("#progress").style.width'), paused);
  await evaluate('document.querySelector("#resume").click()');
  await until(`document.querySelector("#progress").style.width !== ${JSON.stringify(paused)}`, "resume");
  for (let cycle = 0; cycle < 5; cycle++) {
    await evaluate('document.querySelector("#pause-btn").click(); document.querySelector("#restart").click()');
    await until('document.querySelector("#countdown").textContent === "3"', "restart count-in");
    await wait(100);
  }
  result.checks.restartCycles = 5;
  await evaluate('document.querySelector("#pause-btn").click(); document.querySelector("#quit").click()');
  await until('!document.querySelector("#setup").hidden', "return to song selection");
  assert.equal(await evaluate('document.querySelector("#countdown").textContent'), "");
  result.checks.pauseResumeQuit = true;
  result.checks.errors = await evaluate('smoke.errors');
  assert.deepEqual(result.checks.errors, []);
  finish();
}

app.whenReady().then(async () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(target, "package.json")));
  app.getVersion = () => metadata.version;
  result.version = metadata.version;
  const files = ["desktop/main.cjs", "desktop/preload.cjs", "server.js", "build/index.html", "build/karaoke.html", "build/assets/karaoke.js", "build/assets/navigation-runtime.js", "build/assets/navigation.mjs", "build/assets/navigation.css", "build/assets/yeatle.js"];
  const hash = bytes => crypto.createHash("sha256").update(bytes.toString().replaceAll("\r\n", "\n")).digest("hex");
  for (const file of files) assert.equal(hash(fs.readFileSync(path.join(target, file))), hash(fs.readFileSync(path.join(root, file))), file);
  result.checks.packagedFilesMatch = true;
  const data = app.getPath("userData");
  const song = path.join(data, "Songs/Lyfe stealer");
  fs.mkdirSync(song, { recursive: true });
  fs.cpSync(stems, song, { recursive: true });
  fs.writeFileSync(path.join(song, "lyrics.lrc"), "[00:00.00]Playback test\n[00:05.00]Local timing test\n");
  const reserve = http.createServer();
  await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  fs.writeFileSync(path.join(data, "config.json"), JSON.stringify({ desktopPort: port, refreshMinutes: 0, tabs: [], openBrowser: false }));
  require(path.join(target, "desktop/main.cjs"));
}).catch(finish);
setTimeout(() => finish(new Error("Desktop smoke watchdog")), 100000).unref();
