const path = require("node:path");
const fs = require("node:fs/promises");
const { gzip, brotliCompress, constants: zlibConstants } = require("node:zlib");
const { promisify } = require("node:util");
const compress = promisify(gzip);
const compressBrotli = promisify(brotliCompress);

const gzipBuffer = bytes => compress(bytes, { level: 6 });
// Quality 5 costs about the same time as gzip level 6 and is clearly smaller:
// about 27% less for the ONNX runtime and 18% less for the song list.
const brotliBuffer = bytes => compressBrotli(bytes, { params: {
  [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
  [zlibConstants.BROTLI_PARAM_SIZE_HINT]: bytes.length
} });
const encodeBuffer = (bytes, encoding) => encoding === "br" ? brotliBuffer(bytes) : gzipBuffer(bytes);

// Picks the response encoding for an Accept-Encoding header: Brotli when the
// client lists it, otherwise gzip (also for a bare wildcard), otherwise none.
function acceptedEncoding(value = "") {
  const offered = new Map();
  for (const item of String(value).split(",")) {
    const [name, ...parameters] = item.trim().split(";");
    const quality = parameters.find(parameter => /^\s*q\s*=/i.test(parameter));
    if (name.trim()) offered.set(name.trim().toLowerCase(), quality === undefined || Number(quality.split("=")[1]) > 0);
  }
  if (offered.get("br")) return "br";
  if (offered.has("gzip") ? offered.get("gzip") : offered.get("*")) return "gzip";
  return null;
}

function createCompressedCache({ maxBytes = 32 * 1024 * 1024, maxFileBytes = 32 * 1024 * 1024, maxEntries = 64 } = {}) {
  const entries = new Map();
  let retained = 0;
  function remove(id) {
    const entry = entries.get(id);
    if (entry) { retained -= entry.bytes || 0; entries.delete(id); }
  }
  return {
    async get(file, stat, encoding = "gzip") {
      if (stat.size > maxFileBytes) return null;
      const id = `${encoding}:${file}`;
      const key = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
      let entry = entries.get(id);
      if (entry?.key === key) {
        entries.delete(id); entries.set(id, entry);
        return entry.pending;
      }
      remove(id);
      entry = { key, bytes: 0 };
      entry.pending = fs.readFile(file).then(bytes => encodeBuffer(bytes, encoding)).then(body => {
        if (entries.get(id) === entry) {
          entry.bytes = body.length; retained += body.length;
          while (entries.size > maxEntries || retained > maxBytes) remove(entries.keys().next().value);
        }
        return body;
      }).catch(error => { if (entries.get(id) === entry) remove(id); throw error; });
      entries.set(id, entry);
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

module.exports = { staticCacheHeaders, isNotModified, rangeAllowed, createCompressedCache, gzipBuffer, brotliBuffer, encodeBuffer, acceptedEncoding };
