const { app, BrowserWindow, Menu, dialog, shell, ipcMain, net } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { menuTemplate } = require("./menu.cjs");
const { createUpdateController } = require("./updates.cjs");
const { installMicrophonePermissions } = require("./permissions.cjs");
const { createStemDownloader, stemsHostUrl } = require("./stem-downloads.cjs");
const { loadWindowPage } = require("./window-load.cjs");
app.setName("Yeatle");
// Match the installed shortcut so Windows uses Yeatle's taskbar identity.
if (process.platform === "win32") app.setAppUserModelId("io.github.gustownis.yeatle");
// The 1.11 test launcher uses a separate profile, including browser storage.
if (process.env.YEATLE_TEST_PROFILE) app.setPath("userData", path.resolve(process.env.YEATLE_TEST_PROFILE));

const PROJECT_DIR = path.join(__dirname, "..");
const STEMS_URL = "https://mega.nz/folder/Kkh3WIyQ#xnMG5aidP0AGWQas0bur4g";
// Where "Download from server" gets HQ stems: config.json "stemsHost", separate from Daily's server.
const DEFAULT_STEMS_HOST = "https://playyeatle.duckdns.org";
let stemsHost = DEFAULT_STEMS_HOST;
let stemsWindow;
let stemDownloader;
let serverProcess;
let gameWindow;
let adminWindow;
let updates;
let checkedOnLaunch = false;
let serverUrl;
let quitting = false;
let starting = false;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (gameWindow) {
      if (gameWindow.isMinimized()) gameWindow.restore();
      gameWindow.show();
      gameWindow.focus();
    }
  });
  app.whenReady().then(startGame).catch(failStartup);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && !starting) {
      if (serverUrl && serverProcess) createWindow();
      else startGame().catch(failStartup);
    }
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("before-quit", () => {
    quitting = true;
    // unfinished downloads are removed; nothing half-downloaded is left behind
    if (stemDownloader) stemDownloader.cancelAll().catch(() => {});
    if (serverProcess) serverProcess.kill();
  });
}

function failStartup(error) {
  if (quitting) return;
  dialog.showErrorBox("Yeatle could not start", `${error.message}\n\nRestart Yeatle. If this keeps happening, check config.json in your Yeatle data folder.`);
  app.quit();
}

async function startGame() {
  starting = true;
  try {
    const dataDir = app.getPath("userData");
    fs.mkdirSync(songsDir(), { recursive: true });
    // Seed defaults once, so updates never overwrite the player's settings.
    const defaults = ["era-covers.json", "hidden-songs.json", "song-edits.json", "song-renames.json", "song-splits.json"];
    for (const file of defaults) {
      const target = path.join(dataDir, file);
      if (!fs.existsSync(target)) fs.copyFileSync(path.join(PROJECT_DIR, file), target);
    }
    const configFile = path.join(dataDir, "config.json");
    if (!fs.existsSync(configFile)) fs.copyFileSync(path.join(PROJECT_DIR, "config.example.json"), configFile);
    // Make the local login available without replacing an existing password.
    const adminFile = path.join(dataDir, "admin.json");
    if (!fs.existsSync(adminFile)) fs.writeFileSync(adminFile, JSON.stringify({ password: "garlic" }), { mode: 0o600 });
    // A stable origin preserves the game's browser storage between launches.
    const settings = JSON.parse(fs.readFileSync(configFile, "utf8"));
    const desktopPort = settings.desktopPort ?? 3094;
    const host = stemsHostUrl(process.env.YEATLE_STEMS_HOST || settings.stemsHost || DEFAULT_STEMS_HOST);
    if (!host) throw new Error('Set "stemsHost" in config.json to an https:// address.');
    stemsHost = host;
    if (!Number.isInteger(desktopPort) || desktopPort < 1 || desktopPort > 65535) {
      throw new Error('Set "desktopPort" in config.json to a number from 1 to 65535.');
    }

    const logFile = path.join(dataDir, "desktop.log");
    // Keep a bounded previous log instead of letting it grow indefinitely.
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 2 * 1024 * 1024) {
      fs.copyFileSync(logFile, path.join(dataDir, "desktop.previous.log"));
      fs.writeFileSync(logFile, "");
    }
    let recentOutput = "";
    const child = spawn(process.execPath, [path.join(PROJECT_DIR, "server.js")], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", YEATLE_DESKTOP: "1", YEATLE_PORT: String(desktopPort), YEATLE_DATA_DIR: dataDir },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true
    });
    serverProcess = child;
    for (const output of [child.stdout, child.stderr]) output.on("data", chunk => {
      recentOutput = (recentOutput + chunk.toString()).slice(-4000);
      try { fs.appendFileSync(logFile, chunk); } catch (_) { /* logging is optional */ }
    });
    const port = await new Promise((resolve, reject) => {
      let ready = false;
      const timer = setTimeout(() => { child.kill(); reject(new Error("The local game server did not start within 20 seconds.")); }, 20000);
      child.on("message", message => {
        if (ready || message?.type !== "yeatle-ready" || !Number.isInteger(message.port) || message.port < 1 || message.port > 65535) return;
        ready = true;
        clearTimeout(timer);
        resolve(message.port);
      });
      child.on("error", error => { clearTimeout(timer); reject(error); });
      child.on("exit", code => {
        clearTimeout(timer);
        serverProcess = null;
        serverUrl = null;
        if (!ready) reject(new Error(recentOutput.trim() || `The local server stopped (exit code ${code}).`));
        else if (!quitting) failStartup(new Error("The local game server stopped. Restart Yeatle to continue."));
      });
    });
    serverUrl = `http://127.0.0.1:${port}`;
    updates ||= createUpdateController({ app, dialog, shell, getWindow: () => gameWindow, onStatus: refreshMenu });
    createWindow();
  } finally { starting = false; }
}

function createWindow() {
  gameWindow = new BrowserWindow({
    title: "Yeatle", width: 1280, height: 860, minWidth: 640, minHeight: 480,
    backgroundColor: "#000000", icon: path.join(PROJECT_DIR, "build", "favicon.png"), show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  const window = gameWindow;
  window.once("ready-to-show", () => { if (!window.isDestroyed()) window.show(); });
  window.on("closed", () => { if (gameWindow === window) gameWindow = null; });
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== serverUrl) { event.preventDefault(); openExternal(url); }
  });
  window.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: "deny" }; });
  // Only karaoke mode's microphone is allowed, and only for the game's own pages.
  installMicrophonePermissions(window.webContents.session, serverUrl);
  window.webContents.on("did-fail-load", (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3 && !quitting) failStartup(new Error(`The game window could not load: ${description}`));
  });
  refreshMenu();
  window.webContents.once("did-finish-load", () => {
    if (checkedOnLaunch) return;
    checkedOnLaunch = true;
    const timer = setTimeout(() => { if (!quitting) updates.check(false).catch(console.warn); }, 10000);
    timer.unref();
  });
  loadWindowPage(window, serverUrl, failStartup);
}

function refreshMenu() {
  if (!serverUrl || !updates) return;
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate({
    platform: process.platform,
    openBrowser: () => shell.openExternal(serverUrl).catch(failStartup),
    openSongs: () => shell.openPath(songsDir()),
    openSettings: () => shell.openPath(app.getPath("userData")),
    openAdmin,
    openGuide: () => openExternal("https://github.com/gustownis/yeatle#readme"),
    openStemsMega: () => openExternal(STEMS_URL),
    openStemsServer,
    checkUpdates: () => updates.check(true).catch(console.warn),
    updateStatus: updates.status,
    updating: updates.busy
  })));
  // setApplicationMenu also reapplies the menu to existing Windows/Linux
  // windows. The launch-time update check must not restore it in utilities.
  for (const window of [adminWindow, stemsWindow]) {
    if (window && !window.isDestroyed()) {
      window.setMenu(null);
      window.setMenuBarVisibility(false);
    }
  }
}

function openAdmin() {
  if (adminWindow && !adminWindow.isDestroyed()) { adminWindow.show(); adminWindow.focus(); return; }
  const window = new BrowserWindow({
    title: "Yeatle Admin", width: 1100, height: 800, backgroundColor: "#000000", show: false,
    icon: path.join(PROJECT_DIR, "build", "favicon.png"),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  adminWindow = window;
  window.setMenu(null);
  window.once("ready-to-show", () => { if (!window.isDestroyed()) window.show(); });
  window.on("closed", () => { if (adminWindow === window) adminWindow = null; });
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== serverUrl) { event.preventDefault(); openExternal(url); }
  });
  window.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: "deny" }; });
  loadWindowPage(window, `${serverUrl}/admin`, error => dialog.showErrorBox("Admin panel could not open", error.message));
}

// The game's Songs folder: the desktop data folder's "Songs", or YEATLE_STEMS_DIR when set.
function songsDir() {
  return process.env.YEATLE_STEMS_DIR ? path.resolve(process.env.YEATLE_STEMS_DIR) : path.join(app.getPath("userData"), "Songs");
}

/* ---------- HQ stems from the server ---------- */

async function localSongs() {
  const res = await fetch(`${serverUrl}/api/songs`);
  const data = await res.json();
  return new Map((data.songs || []).map(song => [song.id, { mode: song.mode, folder: song.folder }]));
}

// Asks the local game server to look at the Songs folder again.
function rescanServer() {
  return new Promise(resolve => {
    const child = serverProcess;
    if (!child || !child.connected) { resolve(null); return; }
    const id = Date.now() + Math.random();
    const done = message => { clearTimeout(timer); child.off("message", onMessage); resolve(message); };
    const onMessage = message => { if (message?.type === "stems-rescanned" && message.id === id) done(message); };
    const timer = setTimeout(() => done(null), 30000);
    child.on("message", onMessage);
    child.send({ type: "rescan-stems", id });
  });
}

function getStemDownloader() {
  if (!stemDownloader) {
    stemDownloader = createStemDownloader({
      songsDir: songsDir(), host: stemsHost,
      fetch: (url, options) => net.fetch(url, options),
      localSongs, rescan: rescanServer,
      onChange: state => { if (stemsWindow && !stemsWindow.isDestroyed()) stemsWindow.webContents.send("stems:changed", state); }
    });
    stemDownloader.cleanupStale();
  }
  return stemDownloader;
}

// Only the picker window, showing the game's own page, may use these.
function fromStemsWindow(event) {
  if (!stemsWindow || stemsWindow.isDestroyed() || event.sender !== stemsWindow.webContents) return false;
  try { return new URL(event.senderFrame.url).origin === serverUrl; } catch (_) { return false; }
}
const validId = id => typeof id === "string" && id.length > 0 && id.length <= 160;
ipcMain.handle("stems:state", event => (fromStemsWindow(event) ? getStemDownloader().snapshot() : null));
ipcMain.handle("stems:refresh", event => (fromStemsWindow(event) ? getStemDownloader().loadCatalog() : null));
ipcMain.handle("stems:download", (event, ids) => {
  if (!fromStemsWindow(event) || !Array.isArray(ids)) return null;
  return getStemDownloader().download(ids.filter(validId).slice(0, 500));
});
ipcMain.handle("stems:cancel", (event, id) => (fromStemsWindow(event) && validId(id) ? getStemDownloader().cancel(id) : null));
ipcMain.handle("stems:replace", (event, id) => (fromStemsWindow(event) && validId(id) ? getStemDownloader().replace(id) : null));
ipcMain.handle("stems:open-folder", event => { if (fromStemsWindow(event)) shell.openPath(songsDir()); return null; });

function openStemsServer() {
  if (stemsWindow && !stemsWindow.isDestroyed()) { stemsWindow.show(); stemsWindow.focus(); return; }
  const window = new BrowserWindow({
    title: "Download HQ stems", width: 980, height: 760, minWidth: 520, minHeight: 480, autoHideMenuBar: true,
    backgroundColor: "#000000", show: false, icon: path.join(PROJECT_DIR, "build", "favicon.png"),
    webPreferences: { preload: path.join(__dirname, "stems-preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  stemsWindow = window;
  window.setMenu(null);
  window.setMenuBarVisibility(false);
  window.once("ready-to-show", () => { if (!window.isDestroyed()) window.show(); });
  window.on("close", event => {
    if (quitting || !stemDownloader || !stemDownloader.busy) return;
    const choice = dialog.showMessageBoxSync(window, {
      type: "question", buttons: ["Keep downloading", "Cancel downloads and close"], defaultId: 0, cancelId: 0,
      message: "Songs are still downloading.", detail: "Closing cancels them. Songs that already finished stay installed."
    });
    if (choice === 0) event.preventDefault();
    else stemDownloader.cancelAll().catch(() => {});
  });
  window.on("closed", () => { if (stemsWindow === window) stemsWindow = null; });
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== serverUrl) { event.preventDefault(); openExternal(url); }
  });
  window.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: "deny" }; });
  loadWindowPage(window, `${serverUrl}/stems-download.html`, error => dialog.showErrorBox("Download window could not open", error.message));
}

function openExternal(url) {
  try { if (new URL(url).protocol === "https:") shell.openExternal(url).catch(() => {}); } catch (_) { /* ignore invalid links */ }
}
