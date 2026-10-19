// Optional renderer check: run with this OS's Electron and real local MP3 stems.
const { app, BrowserWindow } = require("electron");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
// A Windows GUI launch can outlive its terminal's output pipe. Keep writing the
// JSON report instead of letting a closed diagnostic stream open a fatal dialog.
for (const stream of [process.stdout, process.stderr]) stream.on("error", error => {
  if (error.code !== "EPIPE") throw error;
});
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".tmp", `daily-smoke-${Date.now()}`);
const data = path.join(output, "data");
const song = path.join(data, "Songs", "Lyfe stealer");
fs.mkdirSync(song, { recursive: true });
fs.cpSync(process.env.YEATLE_TEST_STEMS || path.join(root, "build", "Songs", "Lyfe stealer"), song, { recursive: true });
fs.writeFileSync(path.join(data, "config.json"), JSON.stringify({ tabs: [], refreshMinutes: 0, openBrowser: false, dailyAuthority: "" }));
app.setPath("userData", path.join(output, "profile"));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-background-timer-throttling");
const result = { version: require("../package.json").version, platform: process.platform, versions: process.versions, checks: {}, output };
let window, backend, finished = false;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = code => window.webContents.executeJavaScript(code, true);
async function until(code, label, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await evaluate(`Boolean(${code})`)) return; await wait(75); }
  throw new Error(`${label} timed out: ${await evaluate('document.querySelector("#notice")?.textContent')}`);
}
async function screenshot(name) { fs.writeFileSync(path.join(output, name), (await window.webContents.capturePage()).toPNG()); }
async function finish(error) {
  if (finished) return;
  finished = true;
  result.passed = !error;
  if (error) result.failure = error.stack;
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: result.passed, failure: result.failure, output }));
  backend?.kill();
  app.exit(error ? 1 : 0);
}
setTimeout(() => finish(new Error("Daily renderer check timed out")), 120000).unref();
app.whenReady().then(async () => {
  console.log("Daily check: starting fixture server");
  backend = fork(path.join(root, "server.js"), [], { silent: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", YEATLE_DATA_DIR: data, YEATLE_STEMS_DIR: "", YEATLE_PORT: "0", YEATLE_DESKTOP: "1" } });
  for (const stream of [backend.stdout, backend.stderr]) stream.on("data", bytes => fs.appendFileSync(path.join(output, "server.log"), bytes));
  const port = await new Promise((resolve, reject) => { backend.on("message", m => { if (m.type === "yeatle-ready") resolve(m.port); }); backend.once("error", reject); backend.once("exit", code => reject(new Error(`Server exited ${code}`))); });
  const origin = `http://127.0.0.1:${port}`;
  console.log("Daily check: opening renderer");
  window = new BrowserWindow({ show: process.env.YEATLE_SMOKE_SHOW === "1", width: 1000, height: 1000, webPreferences: { backgroundThrottling: false } });
  window.webContents.setAudioMuted(true);
  await window.loadURL("about:blank");
  const debug = window.webContents.debugger;
  debug.attach("1.3");
  await debug.sendCommand("Page.enable");
  console.log("Daily check: renderer ready");
  await debug.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.audit = { starts: [], errors: [], copied: '' };
    addEventListener('error', e => audit.errors.push(e.message));
    addEventListener('unhandledrejection', e => audit.errors.push(String(e.reason)));
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(when, offset, duration) {
      audit.starts.push({ when, offset, duration, decodedDuration: this.buffer.duration });
      return start.apply(this, arguments);
    };
    Object.defineProperty(navigator, 'share', { value: undefined });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { audit.copied = text; } } });
    addEventListener('DOMContentLoaded', () => localStorage.setItem('yeatle:lightStems', 'true'));
  ` });
  await window.loadURL(`${origin}/?mode=snippet`);
  console.log("Daily check: loaded snippets");
  await until('document.querySelector(".track .seg")', "Base snippets");
  result.checks.base = await evaluate('({ value: document.querySelector("select[aria-label=Difficulty]").value, options: [...document.querySelector("select[aria-label=Difficulty]").options].map(o => o.text), lengths: [...document.querySelectorAll(".track .seg")].map(el => el.textContent), tabs: [...document.querySelectorAll("[role=tab]")].map(el => el.textContent) })');
  assert.equal(result.checks.base.value, "base");
  assert.deepEqual(result.checks.base.lengths, ["0.1s", "0.5s", "1s", "3s", "7s", "15s"]);
  assert.equal(result.checks.base.options[0], "Base");
  assert.ok(result.checks.base.tabs.includes("Daily"));
  await evaluate('localStorage.setItem("yeatle:difficulty", JSON.stringify("hard"))');
  await window.loadURL(`${origin}/?mode=snippet`);
  await until('document.querySelector("select[aria-label=Difficulty]")?.value === "hard"', "saved difficulty");
  result.checks.existingDifficulty = true;
  await window.loadURL(`${origin}/daily.html`);
  await until('!document.querySelector("#game").hidden', "Daily screen");
  const daily = await evaluate('(async()=>await(await fetch("api/daily")).json())()');
  await screenshot("daily-desktop.png");
  await evaluate('document.querySelector("#play").click()');
  await until('audit.starts.length === 4', "four decoded stems");
  await until('document.querySelector("#play").textContent === "Play 0.1s"', "short clip completion");
  result.checks.audio = await evaluate('audit.starts');
  assert.ok(result.checks.audio.every(source => source.duration === .1 && source.offset === result.checks.audio[0].offset && source.decodedDuration > 15));
  assert.equal(result.checks.audio[0].offset, daily.clipAt);
  await evaluate('document.querySelector("#guess").value="definitely wrong";document.querySelector("#guess-form").requestSubmit()');
  await until('document.querySelector("#play").textContent === "Play 0.5s"', "wrong guess advances");
  await window.loadURL(`${origin}/daily.html`);
  await until('document.querySelector("#play").textContent === "Play 0.5s"', "reload restores unfinished round");
  await evaluate('document.querySelector("#play").click()');
  await until('!document.querySelector("#skip").disabled', "audio restored");
  await evaluate('document.querySelector("#skip").click()');
  await until('document.querySelector("#play").textContent === "Play 1s"', "skip advances");
  await evaluate(`document.querySelector("#guess").value=${JSON.stringify(daily.song.title)};document.querySelector("#guess-form").requestSubmit()`);
  await until('!document.querySelector("#result").hidden', "correct answer");
  assert.equal(await evaluate('document.querySelector("#result-label").textContent'), "The song is");
  await evaluate('document.querySelector("#share").click()');
  await until('audit.copied', "copy result");
  const share = await evaluate('audit.copied');
  assert.match(share, /1s · 3\/6\n🟥⬛🟩⬜⬜⬜/);
  assert.ok(!share.includes(daily.song.title));
  result.checks.share = share;
  await window.loadURL(`${origin}/daily.html`);
  await until('!document.querySelector("#result").hidden', "saved result");
  result.checks.persistence = true;
  await debug.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  result.checks.narrow = await evaluate('({ width: innerWidth, content: document.documentElement.scrollWidth })');
  assert.equal(result.checks.narrow.content, result.checks.narrow.width);
  await screenshot("daily-390.png");
  // Clear only this disposable test profile's daily result, then exercise loss.
  await evaluate(`localStorage.removeItem(${JSON.stringify(`yeatle:daily:${daily.date}`)})`);
  await window.loadURL(`${origin}/daily.html`);
  await until('!document.querySelector("#game").hidden', "fresh test round");
  await evaluate('document.querySelector("#play").click()');
  await until('!document.querySelector("#skip").disabled', "loss round audio");
  await evaluate('for(let i=0;i<6;i++)document.querySelector("#skip").click()');
  assert.equal(await evaluate('document.querySelector("#result-label").textContent'), "The song was");
  result.checks.loss = true;
  result.checks.errors = await evaluate('audit.errors');
  assert.deepEqual(result.checks.errors, []);
  await finish();
}).catch(finish);
