function menuTemplate({ platform, openBrowser, openSongs, openSettings, openAdmin, openGuide, openStems, checkUpdates, updateStatus, updating }) {
  return [
    ...(platform === "darwin" ? [{ role: "appMenu" }] : []),
    { label: "Game", submenu: [
      { label: "Open in Browser", click: openBrowser },
      { label: "Open Songs Folder", click: openSongs },
      { label: "Open Settings and Logs Folder", click: openSettings },
      { type: "separator" }, { role: "quit" }
    ] },
    { label: "View", submenu: [
      { role: "reload" }, { role: "forceReload" }, { type: "separator" },
      { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
      { type: "separator" }, { role: "togglefullscreen" }
    ] },
    { label: "Developer", submenu: [
      { label: "Toggle Developer Tools", role: "toggleDevTools" },
      { label: "Open Admin Panel", click: openAdmin }
    ] },
    { label: "Help", submenu: [
      { label: updateStatus, enabled: !updating, click: checkUpdates },
      { type: "separator" },
      { label: "Setup Guide", click: openGuide },
      { label: "Optional HQ Stems", click: openStems }
    ] }
  ];
}

module.exports = { menuTemplate };
