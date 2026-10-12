const path = require("node:path");

function staticCacheHeaders(file, stat, version) {
  // Revalidation avoids stale code without retransferring unchanged WASM and
  // scripts. Including the app version also distinguishes installed ASARs.
  const etag = `W/"${version}-${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  return {
    "ETag": etag,
    "Last-Modified": new Date(stat.mtimeMs).toUTCString(),
    "Cache-Control": /\.(html|js|mjs|css|json|wasm)$/i.test(path.extname(file)) ? "no-cache" : "public, max-age=3600"
  };
}

function isNotModified(headers, etag, mtimeMs) {
  if (headers["if-none-match"] !== undefined) {
    const normal = value => value.trim().replace(/^W\//, "");
    return String(headers["if-none-match"]).split(",").some(value => value.trim() === "*" || normal(value) === normal(etag));
  }
  const modifiedSince = Date.parse(headers["if-modified-since"] || "");
  return Number.isFinite(modifiedSince) && Math.floor(mtimeMs / 1000) * 1000 <= modifiedSince;
}

function rangeAllowed(headers, mtimeMs) {
  const value = headers["if-range"];
  if (!value) return true;
  // Our metadata validators are weak; If-Range requires a strong ETag.
  if (/^(W\/)?"/.test(value)) return false;
  const date = Date.parse(value);
  return Number.isFinite(date) && Math.floor(mtimeMs / 1000) * 1000 <= date;
}

module.exports = { staticCacheHeaders, isNotModified, rangeAllowed };
