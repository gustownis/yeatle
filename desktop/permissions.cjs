// Electron checks permissions before asking for them. Both paths must reject video.
function installMicrophonePermissions(session, serverUrl) {
  const fromGame = url => {
    try { return new URL(url).origin === new URL(serverUrl).origin; }
    catch { return false; }
  };
  const fromGameRequest = details =>
    fromGame(details?.requestingUrl) ||
    (details?.requestingUrl === "about:blank" && fromGame(details?.securityOrigin));
  session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const types = details?.mediaTypes;
    callback(permission === "media" && Array.isArray(types) && types.length > 0 &&
      types.every(type => type === "audio") && fromGameRequest(details));
  });
  session.setPermissionCheckHandler((_contents, permission, origin, details) =>
    permission === "media" && details?.mediaType === "audio" &&
    (fromGame(origin) || (details?.requestingUrl === "about:blank" && fromGame(details?.securityOrigin || details?.embeddingOrigin))));
}

module.exports = { installMicrophonePermissions };
