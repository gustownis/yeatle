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
  const cleanVersion = versionParts(version).join(".");
  const files = filesIn(input).filter(file => /\.(exe|dmg|zip|AppImage|deb)$/.test(file));
  const expected = [
    assetName(cleanVersion, "win32", "x64", "nsis"), assetName(cleanVersion, "win32", "x64", "portable"),
    ...["x64", "arm64"].flatMap(arch => [
      assetName(cleanVersion, "darwin", arch, "dmg"), `Yeatle-${cleanVersion}-mac-${arch}.zip`,
      assetName(cleanVersion, "linux", arch, "appimage"), assetName(cleanVersion, "linux", arch, "deb")
    ])
  ];
  const records = new Map();
  for (const name of expected) {
    // Linux packaging uses x86_64 for AppImages and amd64 for DEBs. Keep the
    // public downloads consistently named x64, as the app's selector expects.
    const builtName = name.replace("-linux-x64.AppImage", "-linux-x86_64.AppImage").replace("-linux-x64.deb", "-linux-amd64.deb");
    const matches = files.filter(file => [name, builtName].includes(path.basename(file)));
    if (matches.length !== 1) throw new Error(`Expected exactly one release file: ${name}`);
    const sha256 = crypto.createHash("sha256"), sha512 = crypto.createHash("sha512");
    let size = 0;
    for await (const chunk of fs.createReadStream(matches[0])) { size += chunk.length; sha256.update(chunk); sha512.update(chunk); }
    if (!size) throw new Error(`Empty release file: ${name}`);
    records.set(name, { file: matches[0], size, sha256: sha256.digest("hex"), sha512: sha512.digest("base64") });
  }
  fs.mkdirSync(output, { recursive: true });
  for (const [name, record] of records) {
    const destination = path.join(output, name);
    if (path.resolve(record.file) !== path.resolve(destination)) fs.copyFileSync(record.file, destination);
  }
  fs.writeFileSync(path.join(output, "SHA256SUMS.txt"), [...records].map(([name, record]) => `${record.sha256}  ${name}`).join("\n") + "\n");
  const feeds = [
    ["latest.yml", assetName(cleanVersion, "win32", "x64", "nsis")],
    ["latest-linux.yml", assetName(cleanVersion, "linux", "x64", "appimage")],
    ["latest-linux-arm64.yml", assetName(cleanVersion, "linux", "arm64", "appimage")]
  ];
  for (const [feed, name] of feeds) {
    const record = records.get(name);
    fs.writeFileSync(path.join(output, feed), `version: ${cleanVersion}\nfiles:\n  - url: ${name}\n    sha512: ${record.sha512}\n    size: ${record.size}\npath: ${name}\nsha512: ${record.sha512}\nreleaseDate: '${new Date().toISOString()}'\n`);
  }
  return [...records.keys()];
}

function replaceFileIfChanged(file, transform) {
  if (!fs.existsSync(file)) return false;
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after === before) return false;
  fs.writeFileSync(file, after);
  return true;
}

function bumpReleaseVersion(version, rootDir = path.resolve(__dirname, "..")) {
  const cleanVersion = versionParts(version).join(".");
  const shortVersion = cleanVersion.replace(/\.0$/, "");
  const updated = [];

  const track = (file, transform) => {
    if (replaceFileIfChanged(file, transform)) updated.push(path.relative(rootDir, file).replaceAll("\\", "/"));
  };

  track(path.join(rootDir, "package.json"), text =>
    text.replace(/^(\s*"version":\s*)"[^"]+"/m, `$1"${cleanVersion}"`)
  );

  track(path.join(rootDir, "package-lock.json"), text =>
    text
      .replace(/^(\{\s*"name":\s*"[^"]+",\s*"version":\s*)"[^"]+"/m, `$1"${cleanVersion}"`)
      .replace(/("packages":\s*\{\s*"":\s*\{\s*"name":\s*"[^"]+",\s*"version":\s*)"[^"]+"/m, `$1"${cleanVersion}"`)
  );

  const buildDir = path.join(rootDir, "build");
  if (fs.existsSync(buildDir)) {
    for (const entry of fs.readdirSync(buildDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".html")) {
        track(path.join(buildDir, entry.name), text => text.replace(/(\?v=)\d+\.\d+\.\d+/g, `$1${cleanVersion}`));
      }
    }
    const assetsDir = path.join(buildDir, "assets");
    if (fs.existsSync(assetsDir)) {
      for (const entry of fs.readdirSync(assetsDir, { withFileTypes: true })) {
        if (entry.isFile() && /\.(?:js|mjs|css)$/.test(entry.name)) {
          track(path.join(assetsDir, entry.name), text => text.replace(/(\?v=)\d+\.\d+\.\d+/g, `$1${cleanVersion}`));
        }
      }
    }
  }

  track(path.join(rootDir, "README.md"), text =>
    text
      .replace(/^(### Desktop downloads \(v)\d+\.\d+(?:\.\d+)?(\))$/m, `$1${shortVersion}$2`)
      .replace(/(releases\/download\/v)\d+\.\d+\.\d+(\/Yeatle(?:-Setup)?-)\d+\.\d+\.\d+(-)/g, `$1${cleanVersion}$2${cleanVersion}$3`)
      .replace(/(releases\/download\/v)\d+\.\d+\.\d+(\/SHA256SUMS\.txt)/g, `$1${cleanVersion}$2`)
  );

  track(path.join(rootDir, "docs", "setup.md"), text =>
    text.replace(/(Yeatle(?:-Setup)?-)\d+\.\d+\.\d+(-(?:windows-x64(?:-portable)?\.exe|linux-x64\.deb))/g, `$1${cleanVersion}$2`)
  );

  return { version: cleanVersion, shortVersion, updated };
}

if (require.main === module) {
  const [version, input, output] = process.argv.slice(2);
  if (!version || (input && !output)) {
    console.error("Usage:\n  npm run prepare:release -- VERSION\n  npm run prepare:release -- VERSION DOWNLOADED_ARTIFACTS OUTPUT_FOLDER");
    process.exitCode = 1;
  } else if (!input) {
    try {
      const res = bumpReleaseVersion(version);
      console.log(`Bumped version and ?v= asset strings to ${res.version} across ${res.updated.length} files.`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  } else {
    prepareRelease(version, path.resolve(input), path.resolve(output))
      .then(names => console.log(`Prepared ${names.length} installers, checksums, and updater feeds in ${output}.`))
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}

module.exports = { prepareRelease, bumpReleaseVersion };
