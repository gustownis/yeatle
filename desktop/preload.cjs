const { contextBridge, ipcRenderer } = require("electron");

// Identify app windows even when their local server is also opened in a browser.
contextBridge.exposeInMainWorld("yeatleDesktop", true);
contextBridge.exposeInMainWorld("yeatleOpenMicSettings", () => ipcRenderer.invoke("yeatle:open-mic-settings"));
