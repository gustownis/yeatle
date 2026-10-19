// Run with Electron, using a disposable profile and an existing local stem song.
// YEATLE_TEST_APP_ROOT may point to a packaged app.asar instead of this checkout.
const { app, dialog, Menu, shell } = require("electron");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
for (const stream of [process.stdout, process.stderr]) stream.on("error", error => {
  if (error.code !== "EPIPE") throw error;
});

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
shell.openExternal = async url => { result.checks.openInBrowserUrl = url; };

app.on("browser-window-created", (_event, created) => {
  if (window) return;
  window = created;
  if (process.env.YEATLE_SMOKE_SHOW !== "1") window.show = () => {};
  window.webContents.setAudioMuted(true);
  window.webContents.setBackgroundThrottling(false);
  const debug = window.webContents.debugger;
  debug.attach("1.3");
  debug.sendCommand("Page.enable").then(() => debug.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.smoke = { errors: [], starts: [], countdown: [], microphoneRequests: 0, layout: { frames: 0, maxX: 0, maxY: 0 } };
    const sampleLayout = () => {
      if (document.querySelector('#stage')?.hidden === false) {
        const layout = smoke.layout, root = document.documentElement;
        layout.frames++;
        layout.maxX = Math.max(layout.maxX, root.scrollWidth - innerWidth);
        layout.maxY = Math.max(layout.maxY, root.scrollHeight - innerHeight);
      }
      requestAnimationFrame(sampleLayout);
    };
    requestAnimationFrame(sampleLayout);
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = constraints => {
      smoke.microphoneRequests++;
      return getUserMedia(constraints);
    };
    // Electron's permission handler reports granted by default. Simulate a
    // first browser visit for the selector check; getUserMedia remains native.
    const queryPermission = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = descriptor => descriptor.name === 'microphone'
      ? Promise.resolve({ state: 'prompt' }) : queryPermission(descriptor);
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
      if (!localStorage.getItem('yeatle-smoke-seeded')) {
        localStorage.setItem('yeatle-smoke-seeded', 'true');
        localStorage.setItem('yeatle-karaoke-settings', JSON.stringify({ audioDelay: 0, players: [{ name: 'Test singer', deviceId: '' }] }));
      }
      const countdown = document.querySelector('#countdown');
      if (countdown) new MutationObserver(() => smoke.countdown.push(countdown.textContent)).observe(countdown, { childList: true });
    });
  ` })).catch(finish);
  window.webContents.once("did-finish-load", () => runWindow().catch(finish));
});

async function runWindow() {
  await until('document.querySelectorAll("[role=tab]").length === 4', "game tabs");
  result.checks.game = await evaluate('({ title: document.title, runtime: document.documentElement.dataset.navigationRuntime, desktop: globalThis.yeatleDesktop })');
  assert.equal(result.checks.game.desktop, true);
  assert.equal(result.checks.game.runtime, "desktop");
  const origin = new URL(window.webContents.getURL()).origin;
  const arrived = new Promise(resolve => window.webContents.once("did-finish-load", resolve));
  await evaluate('[...document.querySelectorAll("[role=tab]")].find(tab => tab.textContent === "Karaoke").click()');
  await arrived;
  await until('document.querySelector("#song-list button")', "local song list");
  assert.equal(await evaluate('smoke.microphoneRequests'), 0);
  assert.equal(await evaluate('document.querySelector("#players select").disabled'), false);
  await evaluate('document.querySelector("#players select").value="none"; document.querySelector("#players select").dispatchEvent(new Event("change"))');
  await until('JSON.parse(localStorage.getItem("yeatle-karaoke-settings")).players[0].deviceId === "none"', "No mic saved before permission");
  assert.equal(await evaluate('smoke.microphoneRequests'), 0);
  window.webContents.reload();
  await until('document.querySelector("#players select")?.value === "none"', "saved No mic preference");
  result.checks.noMicBeforePermissionAndSavedSetting = true;
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
  assert.ok(result.checks.playback.layout.frames > 0);
  assert.ok(result.checks.playback.layout.maxX <= 1 && result.checks.playback.layout.maxY <= 1, JSON.stringify(result.checks.playback.layout));
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
  // Exercise Daily through the actual preload/window, using an explicit local authority.
  const stats = await evaluate('JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([key]) => /stats|completed/.test(key))))');
  await evaluate('[...document.querySelectorAll("[role=tab]")].find(tab => tab.textContent === "Daily").click()');
  await until('document.querySelector("#game") && !document.querySelector("#game").hidden', "desktop Daily");
  const daily = await evaluate('(async () => (await fetch("api/daily")).json())()');
  assert.equal(daily.scope, "local");
  assert.equal(await evaluate('globalThis.yeatleDesktop'), true);
  await evaluate('document.querySelector("#play").click()');
  await until('!document.querySelector("#skip").disabled', "desktop Daily audio");
  await until('document.querySelector("#play").textContent === "Play 0.1s"', "desktop Daily short clip");
  const sources = await evaluate('smoke.starts');
  assert.equal(sources.length, 4);
  assert.ok(sources.every(source => source.offset === daily.clipAt));
  await evaluate(`document.querySelector("#guess").focus();document.querySelector("#guess").value=${JSON.stringify(daily.song.title.slice(0, 3))};document.querySelector("#guess").dispatchEvent(new Event("input"))`);
  await until('!document.querySelector("#song-suggestions").hidden', "desktop Daily suggestions");
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#clips .now")).backgroundColor'), "rgb(137, 1, 185)");
  await evaluate('document.querySelector("#song-suggestions .suggestion-item").click()');
  assert.equal(await evaluate('document.querySelectorAll("#guesses li").length'), 0);
  assert.equal(await evaluate('document.querySelector("#song-suggestions").hidden'), true);
  result.checks.dailySuggestions = true;
  await evaluate('document.querySelector("#guess").value="wrong";document.querySelector("#guess-form").requestSubmit();document.querySelector("#skip").click()');
  window.webContents.reload();
  await until('document.querySelector("#play")?.textContent === "Play 1s"', "desktop Daily unfinished reload");
  await evaluate('document.querySelector("#play").click()');
  await until('!document.querySelector("#skip").disabled', "desktop Daily reload audio");
  await evaluate(`document.querySelector("#guess").value=${JSON.stringify(daily.song.title)};document.querySelector("#guess-form").requestSubmit()`);
  await until('!document.querySelector("#result").hidden', "desktop Daily win");
  assert.equal(await evaluate('JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([key]) => /stats|completed/.test(key))))'), stats);
  window.webContents.reload();
  await until('document.querySelector("#result") && !document.querySelector("#result").hidden', "desktop Daily saved result");
  await evaluate('document.querySelector("#play").click()');
  await until('document.querySelector("#play").textContent === "Stop"', "desktop Daily replay");
  if (process.env.YEATLE_SMOKE_SHOW === "1") {
    window.webContents.setBackgroundThrottling(true);
    window.hide();
    await wait(250);
    window.show();
    await until('document.querySelector("#play").textContent === "Replay 15s"', "Daily stops in background");
    result.checks.dailyBackgroundStop = true;
    window.webContents.setBackgroundThrottling(false);
    await evaluate('document.querySelector("#play").click()');
    await until('document.querySelector("#play").textContent === "Stop"', "Daily replays after foreground");
  }
  result.checks.daily = { id: daily.id, clipAt: daily.clipAt, savedAttempts: true, savedResult: true, separateStats: true };
  const gameMenu = Menu.getApplicationMenu().items.find(item => item.label === "Game");
  gameMenu.submenu.items.find(item => item.label === "Open in Browser").click();
  assert.equal(result.checks.openInBrowserUrl, origin);
  result.checks.errors = await evaluate('smoke.errors');
  assert.deepEqual(result.checks.errors, []);
  finish();
}

app.whenReady().then(async () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(target, "package.json")));
  app.getVersion = () => metadata.version;
  result.version = metadata.version;
  const files = ["desktop/main.cjs", "desktop/preload.cjs", "server.js", "daily-challenge.cjs", "daily-authority.cjs", "build/daily.html", "build/assets/daily.mjs", "build/assets/daily.css", "build/assets/song-suggestions.mjs", "build/assets/snippet-rules.mjs", "build/index.html", "build/karaoke.html", "build/assets/karaoke.js", "build/assets/karaoke.css", "build/assets/navigation-runtime.js", "build/assets/navigation.mjs", "build/assets/navigation.css", "build/assets/yeatle.js"];
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
  fs.writeFileSync(path.join(data, "config.json"), JSON.stringify({ desktopPort: port, refreshMinutes: 0, tabs: [], openBrowser: false, dailyAuthority: "" }));
  require(path.join(target, "desktop/main.cjs"));
}).catch(finish);
setTimeout(() => finish(new Error("Desktop smoke watchdog")), 100000).unref();
