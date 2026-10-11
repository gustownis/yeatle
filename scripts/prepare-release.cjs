const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { assetName, versionParts } = require("../desktop/update-core.cjs");

function filesIn(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? filesIn(file) : entry.isFile() ? [file] : [];
  });
}

async function prepareRelease(version, input, output) {
  versionParts(version);
  const files = filesIn(input).filter(file => /\.(exe|dmg|zip|AppImage|deb)$/.test(file));
  const expected = [
    assetName(version, "win32", "x64", "nsis"), assetName(version, "win32", "x64", "portable"),
    ...["x64", "arm64"].flatMap(arch => [
      assetName(version, "darwin", arch, "dmg"), `Yeatle-${version}-mac-${arch}.zip`,
      assetName(version, "linux", arch, "appimage"), assetName(version, "linux", arch, "deb")
    ])
  ];
  const records = new Map();
  for (const name of expected) {
    const matches = files.filter(file => path.basename(file) === name);
    if (matches.length !== 1) throw new Error(`Expected exactly one release file: ${name}`);
    const sha256 = crypto.createHash("sha256"), sha512 = crypto.createHash("sha512");
    let size = 0;
    for await (const chunk of fs.createReadStream(matches[0])) { size += chunk.length; sha256.update(chunk); sha512.update(chunk); }
    if (!size) throw new Error(`Empty release file: ${name}`);
    records.set(name, { size, sha256: sha256.digest("hex"), sha512: sha512.digest("base64") });
  }
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "SHA256SUMS.txt"), [...records].map(([name, record]) => `${record.sha256}  ${name}`).join("\n") + "\n");
  const feeds = [
    ["latest.yml", assetName(version, "win32", "x64", "nsis")],
    ["latest-linux.yml", assetName(version, "linux", "x64", "appimage")],
    ["latest-linux-arm64.yml", assetName(version, "linux", "arm64", "appimage")]
  ];
  for (const [feed, name] of feeds) {
    const record = records.get(name);
    fs.writeFileSync(path.join(output, feed), `version: ${version}\nfiles:\n  - url: ${name}\n    sha512: ${record.sha512}\n    size: ${record.size}\npath: ${name}\nsha512: ${record.sha512}\nreleaseDate: '${new Date().toISOString()}'\n`);
  }
  return [...records.keys()];
}

if (require.main === module) {
  const [version, input, output] = process.argv.slice(2);
  if (!version || !input || !output) { console.error("Usage: npm run prepare:release -- VERSION DOWNLOADED_ARTIFACTS OUTPUT_FOLDER"); process.exitCode = 1; }
  else prepareRelease(version, path.resolve(input), path.resolve(output)).then(names => console.log(`Prepared checksums and updater feeds for ${names.length} installers.`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { prepareRelease };
