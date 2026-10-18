const { contextBridge } = require("electron");

// Identify app windows even when their local server is also opened in a browser.
contextBridge.exposeInMainWorld("yeatleDesktop", true);
