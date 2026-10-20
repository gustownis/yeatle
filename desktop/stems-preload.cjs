const { contextBridge, ipcRenderer } = require("electron");

// The HQ stem download window gets only these few actions; everything is checked again in the main process.
contextBridge.exposeInMainWorld("yeatleDesktop", true);
contextBridge.exposeInMainWorld("yeatleStems", {
  state: () => ipcRenderer.invoke("stems:state"),
  refresh: () => ipcRenderer.invoke("stems:refresh"),
  download: ids => ipcRenderer.invoke("stems:download", Array.isArray(ids) ? ids.slice(0, 500).map(String) : []),
  cancel: id => ipcRenderer.invoke("stems:cancel", String(id)),
  replace: id => ipcRenderer.invoke("stems:replace", String(id)),
  openFolder: () => ipcRenderer.invoke("stems:open-folder"),
  onChange: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("stems:changed", listener);
    return () => ipcRenderer.removeListener("stems:changed", listener);
  }
});
