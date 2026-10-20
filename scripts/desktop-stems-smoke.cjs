// HQ stem downloads in the actual desktop app (run with Electron).
//
// Starts a local "host" server that offers three copies of an existing playable stem
// song (names with spaces and accents), opens Help > Optional HQ Stems > Download from
// server… from the real menu, picks two songs in the picker, downloads them into an
// empty, disposable profile, cancels the third, and plays a downloaded song in Karaoke
// (No mic) and Stems.
//
//   ./node_modules/.bin/electron scripts/desktop-stems-smoke.cjs
//
// YEATLE_TEST_STEMS: a folder with drums/bass/other/vocals.mp3 (default build/Songs/Lyfe stealer)
// YEATLE_TEST_APP_ROOT: a packaged app's resources/app.asar (or unpacked app) to test instead
const { app, dialog, Menu, BrowserWindow, shell } = require("electron");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const target = process.env.YEATLE_TEST_APP_ROOT || root;
const stems = process.env.YEATLE_TEST_STEMS || path.join(root, "build/Songs/Lyfe stealer");
const output = path.join(root, ".tmp", `desktop-stems-smoke-${Date.now()}`);
const NAMES = ["Spacëy tëst song", "Second test sóng", "Third test song"];
fs.mkdirSync(output, { recursive: true });
app.setPath("userData", path.join(output, "profile"));
app.commandLine.appendSwitch("disable-background-timer-throttling");
const result = { platform: process.platform, versions: { electron: process.versions.electron, node: process.versions.node }, target, output, checks: {} };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let game, picker, hostServer, done = false;

async function until(win, code, label, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await win.webContents.executeJavaScript(`Boolean(${code})`, true)) return;
    await wait(100);
  }
  throw new Error(`${label} timed out`);
}
const run = (win, code) => win.webContents.executeJavaScript(code, true);

async function finish(error) {
  if (done) return;
  done = true;
  result.passed = !error;
  if (error) result.failure = error.stack;
  hostServer?.kill();
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: result.passed, output, failure: result.failure }));
  process.exitCode = error ? 1 : 0;
  app.once("will-quit", event => { event.preventDefault(); app.exit(error ? 1 : 0); });
  app.quit();
}
dialog.showErrorBox = (title, detail) => finish(new Error(`${title}: ${detail}`));
dialog.showMessageBoxSync = () => 1;
shell.openPath = async dir => { result.checks.openedFolder = dir; return ""; };

async function freePort() {
  const reserve = http.createServer();
  await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  return port;
}

app.on("browser-window-created", (_event, created) => {
  created.show = () => {};
  created.webContents.setAudioMuted(true);
  created.webContents.setBackgroundThrottling(false);
  if (!game) { game = created; created.webContents.once("did-finish-load", () => runGame().catch(finish)); }
  else if (!picker) picker = created;
});

async function runGame() {
  await until(game, 'document.querySelectorAll("[role=tab]").length === 4', "game tabs");
  const origin = new URL(game.webContents.getURL()).origin;
  const songsDir = path.join(app.getPath("userData"), "Songs");
  assert.deepEqual(fs.readdirSync(songsDir), [], "the profile starts with no songs");

  // the real menu entries
  const help = Menu.getApplicationMenu().items.find(item => item.label === "Help");
  const hq = help.submenu.items.find(item => item.label === "Optional HQ Stems");
  result.checks.menu = hq.submenu.items.map(item => item.label);
  assert.deepEqual(result.checks.menu, ["Download from MEGA", "Download from server…"]);
  hq.submenu.items[1].click();
  await until({ webContents: { executeJavaScript: async () => Boolean(picker) } }, "true", "picker window");
  await new Promise(resolve => (picker.webContents.isLoading() ? picker.webContents.once("did-finish-load", resolve) : resolve()));
  await until(picker, 'document.querySelectorAll(".dl-row").length === 3', "catalog rows");

  // sandboxed page with only the narrow bridge
  result.checks.sandbox = await run(picker, '({ require: typeof require, process: typeof process, bridge: Object.keys(window.yeatleStems).sort(), selected: document.querySelectorAll(".dl-row input:checked").length, status: document.querySelector("#status").textContent })');
  assert.equal(result.checks.sandbox.require, "undefined");
  assert.equal(result.checks.sandbox.process, "undefined");
  assert.deepEqual(result.checks.sandbox.bridge, ["cancel", "download", "onChange", "openFolder", "refresh", "replace", "state"]);
  assert.equal(result.checks.sandbox.selected, 0, "nothing is selected at first");
  assert.equal(await run(picker, 'document.querySelector("#get-picked").disabled'), true);
  fs.writeFileSync(path.join(output, "picker-start.png"), (await picker.webContents.capturePage()).toPNG());

  // search, then pick two songs and download the selection
  await run(picker, 'document.querySelector("#search").value = "spacey"; document.querySelector("#search").dispatchEvent(new Event("input"))');
  result.checks.search = await run(picker, '[...document.querySelectorAll(".dl-row b")].map(b => b.textContent)');
  assert.deepEqual(result.checks.search, ["Spacëy tëst song"]);
  await run(picker, 'document.querySelector("#search").value = ""; document.querySelector("#search").dispatchEvent(new Event("input"))');
  for (const name of NAMES.slice(0, 2)) await run(picker, `[...document.querySelectorAll(".dl-row")].find(r => r.querySelector("b").textContent === ${JSON.stringify(name)}).querySelector("input").click()`);
  result.checks.pickedLabel = await run(picker, 'document.querySelector("#picked").textContent');
  assert.match(result.checks.pickedLabel, /^2 selected · /);
  await run(picker, 'document.querySelector("#get-picked").click()');
  await until(picker, '[...document.querySelectorAll(".dl-row")].filter(r => r.querySelector(".tag.ok")).length === 2', "two songs installed", 60000);
  fs.writeFileSync(path.join(output, "picker-done.png"), (await picker.webContents.capturePage()).toPNG());

  // cancel the third straight away (through the same bridge calls as its Download and Cancel buttons;
  // local downloads finish too fast to click Cancel in time)
  result.checks.cancelled = await run(picker, `(async () => {
    const id = (await yeatleStems.state()).catalog.songs.find(s => s.folder === ${JSON.stringify(NAMES[2])}).id;
    yeatleStems.download([id]);
    await yeatleStems.cancel(id);
    for (let i = 0; i < 100; i++) { const item = (await yeatleStems.state()).items[id]; if (item.status !== "downloading" && item.status !== "queued") return item.status; await new Promise(r => setTimeout(r, 50)); }
    return "stuck";
  })()`);
  assert.equal(result.checks.cancelled, "cancelled");
  await until(picker, `[...document.querySelectorAll(".dl-row")].find(r => r.querySelector("b").textContent === ${JSON.stringify(NAMES[2])}).textContent.includes("Retry")`, "third shows Retry");

  const installed = fs.readdirSync(songsDir).filter(n => !n.startsWith(".")).sort();
  result.checks.installedFolders = installed;
  assert.deepEqual(installed, NAMES.slice(0, 2).sort(), "only the two chosen songs were downloaded");
  assert.deepEqual(fs.existsSync(path.join(songsDir, ".yeatle-downloads")) ? fs.readdirSync(path.join(songsDir, ".yeatle-downloads")) : [], []);
  for (const name of installed) for (const f of ["drums.mp3", "bass.mp3", "other.mp3", "vocals.mp3", "lyrics.lrc"]) {
    assert.ok(fs.readFileSync(path.join(songsDir, name, f)).equals(fs.readFileSync(path.join(output, "host-songs", name, f))), `${name}/${f}`);
  }

  // the game sees them without a restart
  const songs = await run(game, `(async () => (await (await fetch(${JSON.stringify(origin + "/api/songs")})).json()).songs.map(s => ({ display: s.display, mode: s.mode, folder: s.folder })))()`);
  result.checks.gameSongs = songs;
  for (const name of NAMES.slice(0, 2)) assert.ok(songs.some(s => s.folder === name && s.mode === "stems"), `${name} in the game`);
  assert.ok(!songs.some(s => s.folder === NAMES[2]));

  // Stems: the game's own page decodes every stem of a downloaded song
  result.checks.stemsDecode = await run(game, `(async () => {
    const ctx = new OfflineAudioContext(2, 1, 44100), out = {};
    for (const f of ["drums", "bass", "other", "vocals"]) {
      const res = await fetch("Songs/" + encodeURIComponent(${JSON.stringify(NAMES[0])}) + "/" + f + ".mp3");
      out[f] = res.ok ? (await ctx.decodeAudioData(await res.arrayBuffer())).duration : res.status;
    }
    return out;
  })()`);
  assert.ok(Object.values(result.checks.stemsDecode).every(d => d > 10), JSON.stringify(result.checks.stemsDecode));

  // Karaoke: the downloaded song loads and plays (No mic)
  const arrived = new Promise(resolve => game.webContents.once("did-finish-load", resolve));
  await run(game, 'localStorage.setItem("yeatle-karaoke-settings", JSON.stringify({ audioDelay: 0, players: [{ name: "Test", deviceId: "none" }] })); [...document.querySelectorAll("[role=tab]")].find(tab => tab.textContent === "Karaoke").click()');
  await arrived;
  await until(game, 'document.querySelector("#song-list button")', "karaoke list");
  await run(game, `document.querySelector("#search").value = ${JSON.stringify(NAMES[1])}; document.querySelector("#search").dispatchEvent(new Event("input"))`);
  await until(game, 'document.querySelectorAll("#song-list button").length === 1', "karaoke search");
  await run(game, 'document.querySelector("#song-list button").click()');
  await until(game, '!document.querySelector("#start").disabled', "karaoke pick");
  await run(game, 'document.querySelector("#start").click()');
  await until(game, '!document.querySelector("#stage").hidden', "karaoke loads the downloaded stems", 60000);
  await until(game, 'parseFloat(document.querySelector("#progress").style.width) > 0', "karaoke plays", 20000);
  result.checks.karaoke = await run(game, '({ title: document.querySelector("#stage-title").textContent, progress: document.querySelector("#progress").style.width })');
  await run(game, 'document.querySelector("#pause-btn").click(); document.querySelector("#quit").click()');

  // closing the picker while idle just closes it
  picker.close();
  await wait(300);
  assert.ok(picker.isDestroyed());
  finish();
}

app.whenReady().then(async () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(target, "package.json")));
  app.getVersion = () => metadata.version;
  result.version = metadata.version;
  const hash = bytes => require("node:crypto").createHash("sha256").update(bytes.toString().replaceAll("\r\n", "\n")).digest("hex");
  for (const file of ["server.js", "stem-catalog.cjs", "desktop/main.cjs", "desktop/menu.cjs", "desktop/stem-downloads.cjs", "desktop/stems-preload.cjs", "build/stems-download.html", "build/assets/stems-download.js", "build/assets/stems-download.css"]) {
    assert.equal(hash(fs.readFileSync(path.join(target, file))), hash(fs.readFileSync(path.join(root, file))), file);
  }
  result.checks.packagedFilesMatch = true;
  // the "host": an ordinary Yeatle server offering three stem songs
  const hostSongs = path.join(output, "host-songs"), hostData = path.join(output, "host-data");
  for (const name of NAMES) {
    fs.mkdirSync(path.join(hostSongs, name), { recursive: true });
    for (const f of ["drums.mp3", "bass.mp3", "other.mp3", "vocals.mp3"]) fs.copyFileSync(path.join(stems, f), path.join(hostSongs, name, f));
    fs.writeFileSync(path.join(hostSongs, name, "lyrics.lrc"), `[00:00.00]${name}\n[00:05.00]Second line\n`);
  }
  fs.mkdirSync(hostData, { recursive: true });
  const hostPort = await freePort();
  fs.writeFileSync(path.join(hostData, "config.json"), JSON.stringify({ stemDownloads: true, refreshMinutes: 0, tabs: [], openBrowser: false, dailyAuthority: "" }));
  hostServer = spawn(process.execPath, [path.join(target, "server.js")], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", YEATLE_PORT: String(hostPort), YEATLE_DATA_DIR: hostData, YEATLE_STEMS_DIR: hostSongs },
    stdio: "ignore"
  });
  const host = `http://127.0.0.1:${hostPort}`;
  for (let i = 0; ; i++) {
    try { const c = await (await fetch(`${host}/api/stems/catalog`)).json(); if (c.songs && c.songs.length === 3 && !c.pending) break; } catch { /* starting */ }
    if (i > 300) throw new Error("host server didn't start");
    await wait(100);
  }
  const data = app.getPath("userData");
  fs.mkdirSync(path.join(data, "Songs"), { recursive: true });
  fs.writeFileSync(path.join(data, "config.json"), JSON.stringify({ desktopPort: await freePort(), refreshMinutes: 0, tabs: [], openBrowser: false, dailyAuthority: "", stemsHost: host }));
  require(path.join(target, "desktop/main.cjs"));
}).catch(finish);
setTimeout(() => finish(new Error("Desktop stems smoke watchdog")), 150000).unref();
