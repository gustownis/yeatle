const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const REPO = "gustownis/yeatle";
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

function versionParts(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  if (!match) throw new Error("The release has an unsupported version number.");
  const parts = match.slice(1).map(Number);
  if (parts.some(value => !Number.isSafeInteger(value))) throw new Error("Invalid release version.");
  return parts;
}

function isNewer(next, current) {
  const a = versionParts(next), b = versionParts(current);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

async function checkRelease(currentVersion, fetchImpl = fetch) {
  const response = await fetchImpl(API_URL, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": `Yeatle/${currentVersion}`, "X-GitHub-Api-Version": "2022-11-28" },
    signal: AbortSignal.timeout(15000)
  });
  if (response.status === 404) return null;
  if (response.status === 403 || response.status === 429) throw new Error("GitHub is limiting update requests. Try again later.");
  if (!response.ok) throw new Error(`GitHub could not check updates (HTTP ${response.status}).`);
  const release = await response.json();
  if (release.draft || release.prerelease || !isNewer(release.tag_name, currentVersion)) return null;
  const version = versionParts(release.tag_name).join(".");
  const baseUrl = `https://github.com/${REPO}/releases/download/${encodeURIComponent(release.tag_name)}/`;
  return { version, baseUrl, url: `${RELEASES_URL}/tag/${encodeURIComponent(release.tag_name)}`, assets: Array.isArray(release.assets) ? release.assets : [] };
}

function installMode(platform, env, packaged) {
  if (!packaged) return "development";
  if (platform === "win32") return env.PORTABLE_EXECUTABLE_FILE ? "portable" : "nsis";
  if (platform === "linux") return env.APPIMAGE ? "appimage" : "deb";
  if (platform === "darwin") return "dmg";
  return "unsupported";
}

function assetName(version, platform, arch, mode) {
  versionParts(version);
  if (!["x64", "arm64"].includes(arch)) throw new Error("No update is available for this computer's architecture.");
  if (platform === "win32" && mode === "nsis") return `Yeatle-Setup-${version}-windows-${arch}.exe`;
  if (platform === "win32" && mode === "portable") return `Yeatle-${version}-windows-${arch}-portable.exe`;
  if (platform === "darwin") return `Yeatle-${version}-mac-${arch}.dmg`;
  if (platform === "linux") return `Yeatle-${version}-linux-${arch}.${mode === "appimage" ? "AppImage" : "deb"}`;
  throw new Error("Updates are not supported on this operating system.");
}

function selectAsset(release, platform, arch, mode) {
  const name = assetName(release.version, platform, arch, mode);
  const asset = release.assets.find(file => file.name === name);
  if (!asset || asset.state !== "uploaded" || !Number.isSafeInteger(asset.size) || asset.size < 1) {
    throw new Error("The update for this computer has not finished uploading. Try again later.");
  }
  const url = new URL(encodeURIComponent(name), release.baseUrl).href;
  if (asset.browser_download_url !== url) throw new Error("The update download is not from the Yeatle repository.");
  return { ...asset, url };
}

async function downloadAsset(asset, folder, onProgress = () => {}, fetchImpl = fetch) {
  if (path.basename(asset.name) !== asset.name || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || "")) {
    throw new Error("GitHub has not provided a valid checksum for this download. Try again later.");
  }
  fs.mkdirSync(folder, { recursive: true });
  const target = path.join(folder, asset.name), partial = `${target}.part`;
  let bytes = 0;
  const hash = crypto.createHash("sha256");
  try {
    const response = await fetchImpl(asset.url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`The download failed (HTTP ${response.status}).`);
    const meter = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > asset.size) return callback(new Error("The update download is larger than expected."));
      hash.update(chunk);
      onProgress(bytes / asset.size);
      callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(partial, { mode: 0o600 }));
    if (bytes !== asset.size || `sha256:${hash.digest("hex")}` !== asset.digest) {
      throw new Error("The update download was incomplete or failed its checksum. Try again.");
    }
    fs.renameSync(partial, target);
    return target;
  } catch (error) {
    try { fs.unlinkSync(partial); } catch (_) { /* no partial download remains */ }
    throw error;
  }
}

module.exports = { REPO, RELEASES_URL, API_URL, versionParts, isNewer, checkRelease, installMode, assetName, selectAsset, downloadAsset };
