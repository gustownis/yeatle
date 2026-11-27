const { app, BrowserWindow, Menu, dialog, shell, ipcMain, net, systemPreferences, nativeTheme } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { menuTemplate } = require("./menu.cjs");
const { createUpdateController } = require("./updates.cjs");
const { installMicrophonePermissions } = require("./permissions.cjs");
const { createStemDownloader, stemsHostUrl } = require("./stem-downloads.cjs");
const { loadWindowPage } = require("./window-load.cjs");
app.setName("Yeatle");
nativeTheme.themeSource = "dark";
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
let updates;
let checkedOnLaunch = false;
let serverUrl;
let quitting = false;
let starting = false;
let quitCleanupDone = false;
let stoppedChild = null;
let stopServerPromise = null;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (gameWindow && !gameWindow.isDestroyed()) {
      if (gameWindow.isMinimized()) gameWindow.restore();
      gameWindow.show();
      gameWindow.focus();
    } else if (!starting && !quitting && serverUrl && serverProcess) {
      createWindow();
    }
  });
  app.whenReady().then(startGame).catch(failStartup);
  app.on("activate", () => {
    if ((!gameWindow || gameWindow.isDestroyed()) && !starting && !quitting) {
      if (serverUrl && serverProcess) createWindow();
      else if (BrowserWindow.getAllWindows().length === 0) startGame().catch(failStartup);
    }
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("before-quit", event => {
    quitting = true;
    // unfinished downloads are removed; nothing half-downloaded is left behind
    const needsCleanup = Boolean(stemDownloader?.busy || serverProcess);
    if (needsCleanup && !quitCleanupDone) {
      event.preventDefault();
      quitCleanupDone = true;
      Promise.race([
        Promise.allSettled([
          stemDownloader?.busy ? stemDownloader.cancelAll() : null,
          serverProcess ? stopServer(serverProcess) : null
        ]),
        new Promise(resolve => setTimeout(resolve, 2500))
      ]).finally(() => {
        app.quit();
      });
      return;
    }
    if (serverProcess) stopServer(serverProcess);
  });
}

// Asks first, so the server can save progress; kill() alone gives it no chance on Windows.
function stopServer(child) {
  if (!child) return Promise.resolve();
  if (stoppedChild === child && stopServerPromise) return stopServerPromise;
  stoppedChild = child;
  stopServerPromise = new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    let done = false;
    let killTimer = null;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(fallback);
      clearTimeout(killTimer);
      child.off("exit", finish);
      resolve();
    };
    const fallback = setTimeout(() => {
      try { child.kill(); } catch {}
      killTimer = setTimeout(finish, 300);
      killTimer.unref?.();
    }, 2000);
    fallback.unref?.();
    child.once("exit", finish);
    try { child.send({ type: "shutdown" }); }
    catch (_) {
      clearTimeout(fallback);
      try { child.kill(); } catch {}
      killTimer = setTimeout(finish, 300);
      killTimer.unref?.();
    }
  });
  return stopServerPromise;
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
      if (!fs.existsSync(target)) fs.copyFileSync(path.join(PROJECT_DIR, "data", file), target);
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
    try {
      if (fs.existsSync(logFile) && fs.statSync(logFile).size > 2 * 1024 * 1024) {
        fs.copyFileSync(logFile, path.join(dataDir, "desktop.previous.log"));
        fs.writeFileSync(logFile, "");
      }
    } catch (_) { /* log rotation is optional */ }
    const logStream = fs.createWriteStream(logFile, { flags: "a" });
    logStream.on("error", () => {});
    let recentOutput = "";
    const child = spawn(process.execPath, [path.join(PROJECT_DIR, "server.js")], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", YEATLE_DESKTOP: "1", YEATLE_PORT: String(desktopPort), YEATLE_DATA_DIR: dataDir },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true
    });
    serverProcess = child;
    stoppedChild = null;
    stopServerPromise = null;
    for (const output of [child.stdout, child.stderr]) output.on("data", chunk => {
      recentOutput = (recentOutput + chunk.toString()).slice(-4000);
      if (!logStream.destroyed && logStream.writable) logStream.write(chunk);
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
      child.on("error", error => { clearTimeout(timer); logStream.end(); reject(error); });
      child.on("exit", code => {
        clearTimeout(timer);
        logStream.end();
        if (serverProcess === child) {
          serverProcess = null;
          serverUrl = null;
        }
        if (!ready) reject(new Error(recentOutput.trim() || `The local server stopped (exit code ${code}).`));
        else if (!quitting) failStartup(new Error("The local game server stopped. Restart Yeatle to continue."));
      });
    });
    if (quitting) { stopServer(child); return; }
    serverUrl = `http://127.0.0.1:${port}`;
    updates ||= createUpdateController({
      app,
      dialog,
      shell,
      getWindow: () => gameWindow,
      onStatus: () => { refreshMenu(); pushDesktopState(); },
      onBeforeInstall: () => (serverProcess ? stopServer(serverProcess) : Promise.resolve())
    });
    createWindow();
  } finally { starting = false; }
}

function isSameServerOrigin(url) {
  try { return new URL(url).origin === serverUrl; } catch { return false; }
}

function guardNavigation(window) {
  const check = (event, url) => {
    if (!isSameServerOrigin(url)) { event.preventDefault(); openExternal(url); }
  };
  window.webContents.on("will-navigate", check);
  window.webContents.on("will-redirect", check);
}

function createWindow() {
  gameWindow = new BrowserWindow({
    title: "Yeatle", width: 1280, height: 860, minWidth: 640, minHeight: 480,
    backgroundColor: "#000000", icon: path.join(PROJECT_DIR, "build", "favicon.png"), show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  const window = gameWindow;
  if (process.platform !== "darwin") {
    window.setMenu(null);
    window.setMenuBarVisibility(false);
    window.webContents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      if (input.key === "F11") {
        event.preventDefault();
        window.setFullScreen(!window.isFullScreen());
        return;
      }
      if (input.key === "F12" || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === "i")) {
        event.preventDefault();
        return;
      }
      if (input.key === "F5") {
        event.preventDefault();
        window.webContents.reload();
        return;
      }
      if (!input.control || input.alt || input.meta) return;
      const key = input.key.toLowerCase();
      if (key === "r") {
        event.preventDefault();
        if (input.shift) window.webContents.reloadIgnoringCache();
        else window.webContents.reload();
      } else if (key === "=" || key === "+") {
        event.preventDefault();
        window.webContents.setZoomLevel(Math.min(3, window.webContents.getZoomLevel() + 0.5));
        pushDesktopState();
      } else if (key === "-") {
        event.preventDefault();
        window.webContents.setZoomLevel(Math.max(-3, window.webContents.getZoomLevel() - 0.5));
        pushDesktopState();
      } else if (key === "0") {
        event.preventDefault();
        window.webContents.setZoomLevel(0);
        pushDesktopState();
      }
    });
  }
  window.once("ready-to-show", () => { if (!window.isDestroyed()) window.show(); });
  window.on("closed", () => { if (gameWindow === window) gameWindow = null; });
  window.on("enter-full-screen", pushDesktopState);
  window.on("leave-full-screen", pushDesktopState);
  guardNavigation(window);
  window.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: "deny" }; });
  // Only karaoke mode's microphone is allowed, and only for the game's own pages.
  installMicrophonePermissions(window.webContents.session, serverUrl);
  window.webContents.on("did-fail-load", (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3 && !quitting) failStartup(new Error(`The game window could not load: ${description}`));
  });
  refreshMenu();
  window.webContents.once("did-finish-load", () => {
    pushDesktopState();
    if (checkedOnLaunch) return;
    checkedOnLaunch = true;
    const timer = setTimeout(() => { if (!quitting) updates.check(false).catch(console.warn); }, 10000);
    timer.unref();
  });
  loadWindowPage(window, serverUrl, failStartup);
}

function refreshMenu() {
  if (!serverUrl || !updates) return;
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate({
      platform: process.platform,
      openBrowser: () => shell.openExternal(serverUrl).catch(err => dialog.showErrorBox("Could not open browser", err.message)),
      openSongs: () => shell.openPath(songsDir()),
      openSettings: () => shell.openPath(app.getPath("userData")),
      openMicSettings: () => openMicSettings(),
      openGuide: () => openExternal("https://github.com/gustownis/yeatle#readme"),
      openStemsMega: () => openExternal(STEMS_URL),
      openStemsServer,
      checkUpdates: () => updates.check(true).catch(console.warn),
      updateStatus: updates.status,
      updating: updates.busy
    })));
  } else {
    Menu.setApplicationMenu(null);
    if (typeof gameWindow !== "undefined" && gameWindow && !gameWindow.isDestroyed()) {
      gameWindow.setMenu(null);
      gameWindow.setMenuBarVisibility(false);
    }
  }
  // setApplicationMenu also reapplies the menu to existing Windows/Linux
  // windows. The launch-time update check must not restore it in utilities.
  for (const window of [stemsWindow]) {
    if (window && !window.isDestroyed()) {
      window.setMenu(null);
      window.setMenuBarVisibility(false);
    }
  }
}

function openMicSettings() {
  if (gameWindow && !gameWindow.isDestroyed() && serverUrl) {
    installMicrophonePermissions(gameWindow.webContents.session, serverUrl);
  }
  if (process.platform === "win32") {
    shell.openExternal("ms-settings:privacy-microphone").catch(() => {});
  } else if (process.platform === "darwin") {
    systemPreferences?.askForMediaAccess?.("microphone")?.catch?.(() => {});
    shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone").catch(() => {});
  } else {
    dialog.showMessageBox(gameWindow && !gameWindow.isDestroyed() ? gameWindow : undefined, {
      type: "info",
      title: "Microphone Settings",
      message: "Check your system sound input settings to make sure a microphone is connected and unmuted, then click Turn on mics in Karaoke."
    }).catch(() => {});
  }
}

function fromGameWindow(event) {
  if (!gameWindow || gameWindow.isDestroyed() || event.sender !== gameWindow.webContents) return false;
  return isSameServerOrigin(event.senderFrame?.url);
}

function desktopStateSnapshot() {
  const status = updates?.status || "Check for Updates";
  return {
    version: app.getVersion(),
    platform: process.platform,
    updateStatus: status,
    updating: Boolean(updates?.busy),
    updateReady: status.startsWith("Install Yeatle"),
    zoomFactor: gameWindow && !gameWindow.isDestroyed() ? Number(gameWindow.webContents.getZoomFactor().toFixed(2)) : 1,
    isFullScreen: Boolean(gameWindow && !gameWindow.isDestroyed() && gameWindow.isFullScreen())
  };
}

function pushDesktopState() {
  if (gameWindow && !gameWindow.isDestroyed()) {
    try { gameWindow.webContents.send("yeatle:desktop-state", desktopStateSnapshot()); } catch {}
  }
}

ipcMain.handle("yeatle:open-mic-settings", event => {
  if (!fromGameWindow(event)) return false;
  openMicSettings();
  return true;
});

ipcMain.handle("yeatle:desktop-state", event => (fromGameWindow(event) ? desktopStateSnapshot() : null));

ipcMain.handle("yeatle:desktop-action", (event, action) => {
  if (!fromGameWindow(event)) return null;
  switch (String(action || "")) {
    case "check-updates": updates?.check(true).catch(console.warn); break;
    case "open-stems-server": openStemsServer(); break;
    case "open-stems-mega": openExternal(STEMS_URL); break;
    case "open-songs": shell.openPath(songsDir()); break;
    case "open-data": shell.openPath(app.getPath("userData")); break;
    case "open-browser":
      if (serverUrl) shell.openExternal(serverUrl).catch(err => dialog.showErrorBox("Could not open browser", err.message));
      break;
    case "open-mic-settings": openMicSettings(); break;
    case "zoom-in":
      gameWindow.webContents.setZoomLevel(Math.min(3, gameWindow.webContents.getZoomLevel() + 0.5));
      pushDesktopState();
      break;
    case "zoom-out":
      gameWindow.webContents.setZoomLevel(Math.max(-3, gameWindow.webContents.getZoomLevel() - 0.5));
      pushDesktopState();
      break;
    case "zoom-reset":
      gameWindow.webContents.setZoomLevel(0);
      pushDesktopState();
      break;
    case "toggle-fullscreen":
      gameWindow.setFullScreen(!gameWindow.isFullScreen());
      break;
    case "reload": gameWindow.webContents.reload(); break;
    case "force-reload": gameWindow.webContents.reloadIgnoringCache(); break;
    case "open-guide": openExternal("https://github.com/gustownis/yeatle#readme"); break;
    default: return null;
  }
  return desktopStateSnapshot();
});

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
    const done = message => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
      resolve(message);
    };
    const onMessage = message => { if (message?.type === "stems-rescanned" && message.id === id) done(message); };
    const onExit = () => done(null);
    const timer = setTimeout(() => done(null), 30000);
    child.on("message", onMessage);
    child.once("exit", onExit);
    try { child.send({ type: "rescan-stems", id }); }
    catch { done(null); }
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
  guardNavigation(window);
  window.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: "deny" }; });
  loadWindowPage(window, `${serverUrl}/stems-download.html`, error => {
    if (!window.isDestroyed()) window.destroy();
    if (!quitting) dialog.showErrorBox("Download window could not open", error.message);
  });
}

function openExternal(url) {
  try { if (new URL(url).protocol === "https:") shell.openExternal(url).catch(() => {}); } catch (_) { /* ignore invalid links */ }
}
