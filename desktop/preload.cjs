const { contextBridge, ipcRenderer } = require("electron");

// Identify app windows even when their local server is also opened in a browser.
contextBridge.exposeInMainWorld("yeatleDesktop", true);
contextBridge.exposeInMainWorld("yeatleOpenMicSettings", () => ipcRenderer.invoke("yeatle:open-mic-settings"));
contextBridge.exposeInMainWorld("yeatleDesktopApi", {
  getState: () => ipcRenderer.invoke("yeatle:desktop-state"),
  run: action => ipcRenderer.invoke("yeatle:desktop-action", String(action || "")),
  onState: listener => {
    if (typeof listener !== "function") return () => {};
    const handler = (_event, state) => listener(state);
    ipcRenderer.on("yeatle:desktop-state", handler);
    return () => ipcRenderer.removeListener("yeatle:desktop-state", handler);
  }
});
