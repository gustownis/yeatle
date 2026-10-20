// Electron rejects loadURL when a later navigation replaces it. Its
// did-fail-load event already treats ERR_ABORTED as a normal cancellation;
// use the same rule for the returned promise and for windows being closed.
async function loadWindowPage(window, url, onError) {
  try {
    await window.loadURL(url);
  } catch (error) {
    if (window.isDestroyed() || error.code === "ERR_ABORTED" || error.errno === -3) return;
    onError(error);
  }
}

module.exports = { loadWindowPage };
