const SAME_ORIGIN_PERMISSIONS = new Set(["clipboard-sanitized-write", "screen-wake-lock"]);

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
    if (SAME_ORIGIN_PERMISSIONS.has(permission)) {
      callback(fromGameRequest(details));
      return;
    }
    const types = details?.mediaTypes;
    callback(permission === "media" && Array.isArray(types) && types.length > 0 &&
      types.every(type => type === "audio") && fromGameRequest(details));
  });
  session.setPermissionCheckHandler((_contents, permission, origin, details) => {
    const allowedOrigin = fromGame(origin) ||
      (details?.requestingUrl === "about:blank" && fromGame(details?.securityOrigin || details?.embeddingOrigin));
    if (!allowedOrigin) return false;
    if (SAME_ORIGIN_PERMISSIONS.has(permission)) return true;
    return permission === "media" && details?.mediaType === "audio";
  });
}

module.exports = { installMicrophonePermissions };
