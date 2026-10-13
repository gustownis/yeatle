const path = require("node:path");
const fs = require("node:fs/promises");
const { gzip } = require("node:zlib");
const { promisify } = require("node:util");
const compress = promisify(gzip);

const gzipBuffer = bytes => compress(bytes, { level: 6 });

function createCompressedCache({ maxBytes = 32 * 1024 * 1024, maxFileBytes = 32 * 1024 * 1024, maxEntries = 32 } = {}) {
  const entries = new Map();
  let retained = 0;
  function remove(file) {
    const entry = entries.get(file);
    if (entry) { retained -= entry.bytes || 0; entries.delete(file); }
  }
  return {
    async get(file, stat) {
      if (stat.size > maxFileBytes) return null;
      const key = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
      let entry = entries.get(file);
      if (entry?.key === key) {
        entries.delete(file); entries.set(file, entry);
        return entry.pending;
      }
      remove(file);
      entry = { key, bytes: 0 };
      entry.pending = fs.readFile(file).then(gzipBuffer).then(body => {
        if (entries.get(file) === entry) {
          entry.bytes = body.length; retained += body.length;
          while (entries.size > maxEntries || retained > maxBytes) remove(entries.keys().next().value);
        }
        return body;
      }).catch(error => { if (entries.get(file) === entry) remove(file); throw error; });
      entries.set(file, entry);
      return entry.pending;
    },
    get retainedBytes() { return retained; },
    get size() { return entries.size; }
  };
}

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

module.exports = { staticCacheHeaders, isNotModified, rangeAllowed, createCompressedCache, gzipBuffer };
