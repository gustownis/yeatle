const fs = require("node:fs");
const path = require("node:path");
const { checkRelease, installMode, selectAsset, downloadAsset, RELEASES_URL } = require("./update-core.cjs");

function createUpdateController({ app, dialog, shell, getWindow, onStatus = () => {} }) {
  let busy = false;
  let status = "Check for Updates";
  let readyUpdater;
  let updateVersion;
  const mode = installMode(process.platform, process.env, app.isPackaged);
  const setStatus = text => { status = text; onStatus(); };
  const message = options => {
    const window = getWindow();
    return window && !window.isDestroyed() ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
  };

  async function installReady() {
    const { response } = await message({ type: "info", title: "Yeatle update ready", message: `Yeatle ${updateVersion} is ready to install.`, detail: "Yeatle will close, apply the update, and restart. Your settings, songs, and progress are kept.", buttons: ["Install and Restart", "Later"], defaultId: 0, cancelId: 1 });
    if (response === 0) readyUpdater.quitAndInstall(true, true);
  }

  async function nativeUpdate(release, asset) {
    if (mode === "appimage") fs.accessSync(path.dirname(process.env.APPIMAGE), fs.constants.W_OK);
    const { NsisUpdater, AppImageUpdater } = require("electron-updater");
    const Type = mode === "nsis" ? NsisUpdater : AppImageUpdater;
    const updater = new Type({ provider: "generic", url: release.baseUrl });
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    // Full downloads also work when an older release has no blockmap.
    updater.disableDifferentialDownload = true;
    updater.disableWebInstaller = true;
    if (mode === "nsis") updater.installDirectory = path.dirname(process.execPath);
    updater.logger = { info() {}, warn() {}, debug() {}, error(error) { console.warn("Yeatle updater:", error); } };
    updater.on("error", error => {
      // Download/check failures also reject the awaited promise. Install failures
      // happen after the user chooses restart, so report those separately.
      if (readyUpdater === updater) {
        readyUpdater = null;
        setStatus("Check for Updates");
        message({ type: "error", title: "Update could not install", message: error.message, detail: "Your current installation is still available. Try again or download the installer from the release page." }).catch(() => {});
      }
    });
    updater.on("download-progress", progress => {
      const window = getWindow();
      if (window && !window.isDestroyed()) window.setProgressBar(progress.percent / 100);
      setStatus(`Downloading Update (${Math.round(progress.percent)}%)`);
    });
    const result = await updater.checkForUpdates();
    if (!result || result.updateInfo.version !== release.version || result.updateInfo.files?.length !== 1 ||
        result.updateInfo.files[0].url !== asset.name || result.updateInfo.files[0].size !== asset.size ||
        !/^[A-Za-z0-9+/]{86}==$/.test(result.updateInfo.files[0].sha512 || "")) {
      throw new Error("The update information does not match the published release. Try again later.");
    }
    await updater.downloadUpdate();
    readyUpdater = updater;
    updateVersion = release.version;
    setStatus(`Install Yeatle ${release.version} and Restart`);
    await installReady();
  }

  async function installerDownload(release, asset) {
    const target = await downloadAsset(asset, path.join(app.getPath("userData"), "updates"), progress => {
      const window = getWindow();
      if (window && !window.isDestroyed()) window.setProgressBar(progress);
      setStatus(`Downloading Update (${Math.round(progress * 100)}%)`);
    });
    const portable = mode === "portable";
    const detail = portable
      ? "Close Yeatle, then replace your old portable app with this downloaded file. Your settings and progress are kept."
      : mode === "dmg"
        ? "The installer will open. Quit Yeatle and drag the new app into Applications, replacing the old copy. Your settings and progress are kept."
        : "The package installer will open. Quit Yeatle, finish installation, and reopen the app. Your settings and progress are kept.";
    const { response } = await message({ type: "info", title: "Yeatle update downloaded", message: `Yeatle ${release.version} has downloaded and passed its checksum.`, detail, buttons: [portable ? "Show Download" : "Open Installer", "Later"], defaultId: 0, cancelId: 1 });
    if (response === 0) {
      if (portable) shell.showItemInFolder(target);
      else {
        const error = await shell.openPath(target);
        if (error) { shell.showItemInFolder(target); throw new Error("The installer could not open automatically. Open the downloaded file from the folder shown."); }
      }
    }
  }

  async function check(manual = true) {
    if (busy) return;
    if (readyUpdater) return installReady();
    if (mode === "development") {
      if (manual) await message({ type: "info", title: "Development copy", message: "Install updates from a packaged Yeatle app.", detail: "For this development/browser copy, download the new ZIP or update your Git checkout. Your files will not be replaced automatically." });
      return;
    }
    busy = true;
    setStatus("Checking for Updates...");
    try {
      const release = await checkRelease(app.getVersion());
      if (!release) {
        if (manual) await message({ type: "info", title: "Yeatle is up to date", message: `You are running Yeatle ${app.getVersion()}.`, detail: "No newer regular release is available." });
        return;
      }
      const asset = selectAsset(release, process.platform, process.arch, mode);
      const automatic = mode === "nsis" || mode === "appimage";
      const { response } = await message({ type: "info", title: "Yeatle update available", message: `Yeatle ${release.version} is available.`, detail: `You are running ${app.getVersion()}. ${automatic ? "Download the update now, then choose when to install and restart." : "Download the update inside Yeatle, then finish installation using the downloaded file."}`, buttons: ["Download Update", "Release Notes", "Later"], defaultId: 0, cancelId: 2 });
      if (response === 1) await shell.openExternal(release.url);
      if (response === 0) {
        setStatus("Downloading Update...");
        if (automatic) await nativeUpdate(release, asset);
        else await installerDownload(release, asset);
      }
    } catch (error) {
      console.warn("Yeatle update check:", error.message);
      if (manual || status.startsWith("Downloading")) await message({ type: "error", title: "Yeatle update unavailable", message: error.message, detail: "You can keep playing and try again later.", buttons: ["OK", "Open Downloads"], cancelId: 0 }).then(({ response }) => { if (response === 1) return shell.openExternal(RELEASES_URL); });
    } finally {
      busy = false;
      if (!readyUpdater) setStatus("Check for Updates");
      const window = getWindow();
      if (window && !window.isDestroyed()) window.setProgressBar(-1);
    }
  }

  return { check, get status() { return status; }, get busy() { return busy; } };
}

module.exports = { createUpdateController };
