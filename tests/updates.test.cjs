const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { checkRelease, isNewer, installMode, assetName, selectAsset, downloadAsset, API_URL } = require("../desktop/update-core.cjs");
const { menuTemplate } = require("../desktop/menu.cjs");
const { prepareRelease, bumpReleaseVersion } = require("../scripts/prepare-release.cjs");

function folder(t) {
  const result = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-update-test-"));
  t.after(() => fs.rmSync(result, { recursive: true, force: true }));
  return result;
}

test("only newer regular releases prompt updates, with numeric version ordering", async () => {
  assert.equal(isNewer("v1.10.0", "1.9.9"), true);
  assert.equal(isNewer("v1.9.0", "1.9.1"), false);
  assert.throws(() => isNewer("1.9.2-beta.1", "1.9.1"));
  let data = { tag_name: "v1.9.2", assets: [], draft: false, prerelease: false };
  const fetchImpl = async (url, options) => { assert.equal(url, API_URL); assert.ok(options.signal); return { ok: true, json: async () => data }; };
  const release = await checkRelease("1.9.1", fetchImpl);
  assert.equal(release.version, "1.9.2");
  assert.equal(release.baseUrl, "https://github.com/gustownis/yeatle/releases/download/v1.9.2/");
  data = { ...data, prerelease: true };
  assert.equal(await checkRelease("1.9.1", fetchImpl), null);
  data = { ...data, prerelease: false, draft: true };
  assert.equal(await checkRelease("1.9.1", fetchImpl), null);
  data = { ...data, draft: false, tag_name: "v1.9.1" };
  assert.equal(await checkRelease("1.9.1", fetchImpl), null);
  assert.equal(await checkRelease("1.9.1", async () => ({ status: 404 })), null);
  await assert.rejects(checkRelease("1.9.1", async () => ({ status: 403 })), /limiting update requests/);
  await assert.rejects(checkRelease("1.9.1", async () => { throw new Error("offline"); }), /offline/);
});

test("updater selects exact OS, architecture, and package files from the correct repository", () => {
  assert.equal(installMode("win32", {}, true), "nsis");
  assert.equal(installMode("win32", { PORTABLE_EXECUTABLE_FILE: "app.exe" }, true), "portable");
  assert.equal(installMode("linux", { APPIMAGE: "/app.AppImage" }, true), "appimage");
  assert.equal(installMode("linux", {}, true), "deb");
  assert.equal(installMode("darwin", {}, true), "dmg");
  assert.equal(installMode("win32", {}, false), "development");
  for (const [platform, arch, mode] of [["win32", "x64", "nsis"], ["win32", "x64", "portable"], ["darwin", "x64", "dmg"], ["darwin", "arm64", "dmg"], ["linux", "arm64", "appimage"], ["linux", "x64", "deb"]]) {
    const name = assetName("1.9.2", platform, arch, mode);
    const baseUrl = "https://github.com/gustownis/yeatle/releases/download/v1.9.2/";
    const asset = { name, size: 123, state: "uploaded", browser_download_url: baseUrl + name };
    const release = { version: "1.9.2", baseUrl, assets: [asset] };
    assert.equal(selectAsset(release, platform, arch, mode).name, name);
    assert.throws(() => selectAsset({ ...release, assets: [{ ...asset, browser_download_url: "https://other.example/update.exe" }] }, platform, arch, mode), /not from the Yeatle/);
    assert.throws(() => selectAsset({ ...release, assets: [] }, platform, arch, mode), /not finished uploading/);
  }
});

test("built-in downloads reject corrupt and truncated files, remove partials, and allow retry", async t => {
  const output = folder(t);
  const bytes = Buffer.from("verified update bytes");
  const asset = { name: "update.dmg", size: bytes.length, digest: `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`, url: "https://github.com/gustownis/yeatle/releases/download/v1.9.2/update.dmg" };
  let progress = 0;
  const target = await downloadAsset(asset, output, value => { progress = value; }, async () => new Response(bytes));
  assert.deepEqual(fs.readFileSync(target), bytes);
  assert.equal(progress, 1);
  for (const wrong of [Buffer.from("wrong update content"), bytes.subarray(0, 5)]) {
    await assert.rejects(downloadAsset(asset, output, () => {}, async () => new Response(wrong)), /incomplete|checksum|larger/);
    assert.equal(fs.existsSync(`${target}.part`), false);
    assert.deepEqual(fs.readFileSync(target), bytes);
  }
  await assert.rejects(downloadAsset({ ...asset, digest: null }, output), /checksum/);
  await assert.rejects(downloadAsset({ ...asset, name: "../outside.dmg" }, output), /checksum/);
  assert.equal(await downloadAsset(asset, output, () => {}, async () => new Response(bytes)), target);
});

test("release preparation creates matching SHA-512 feeds for Windows and both Linux architectures", async t => {
  const input = folder(t), output = folder(t);
  const names = [assetName("1.9.2", "win32", "x64", "nsis"), assetName("1.9.2", "win32", "x64", "portable")];
  for (const arch of ["x64", "arm64"]) names.push(assetName("1.9.2", "darwin", arch, "dmg"), `Yeatle-1.9.2-mac-${arch}.zip`, assetName("1.9.2", "linux", arch, "appimage"), assetName("1.9.2", "linux", arch, "deb"));
  for (const name of names) {
    const builtName = name.replace("-linux-x64.AppImage", "-linux-x86_64.AppImage").replace("-linux-x64.deb", "-linux-amd64.deb");
    fs.writeFileSync(path.join(input, builtName), name);
  }
  assert.equal((await prepareRelease("1.9.2", input, output)).length, 10);
  for (const name of names) assert.equal(fs.readFileSync(path.join(output, name), "utf8"), name);
  assert.equal(fs.readFileSync(path.join(output, "SHA256SUMS.txt"), "utf8").trim().split("\n").length, 10);
  for (const [feed, name] of [["latest.yml", names[0]], ["latest-linux.yml", assetName("1.9.2", "linux", "x64", "appimage")], ["latest-linux-arm64.yml", assetName("1.9.2", "linux", "arm64", "appimage")]]) {
    const text = fs.readFileSync(path.join(output, feed), "utf8");
    assert.ok(text.includes(`url: ${name}`));
    assert.ok(text.includes(crypto.createHash("sha512").update(name).digest("base64")));
  }
  fs.unlinkSync(path.join(input, names[0]));
  await assert.rejects(prepareRelease("1.9.2", input, output), /Expected exactly one/);
});

test("Game menu owns mic settings without Developer tools or admin; Help exposes updates", () => {
  let micOpened = false;
  const menus = menuTemplate({ platform: "win32", openMicSettings: () => { micOpened = true; }, updateStatus: "Check for Updates", updating: false });
  assert.deepEqual(menus.map(item => item.label), ["Game", "View", "Help"]);
  assert.equal(menus.some(item => item.label === "Developer"), false);
  assert.equal(menus.find(item => item.label === "View").submenu.some(item => item.role === "toggleDevTools"), false);
  const game = menus.find(item => item.label === "Game");
  const mic = game.submenu.find(item => item.label === "Microphone Settings");
  assert.ok(mic);
  mic.click();
  assert.equal(micOpened, true);
  assert.equal(menus.find(item => item.label === "Help").submenu[0].label, "Check for Updates");
});

test("installers are built with the names installed apps' updaters look for", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  // scripts/builder.cjs sets YEATLE_VERSION; it must be the full three-part version.
  assert.match(fs.readFileSync(path.join(__dirname, "..", "scripts", "builder.cjs"), "utf8"), /YEATLE_VERSION: version\b/);
  const name = (template, arch, ext) => template.replace("${env.YEATLE_VERSION}", pkg.version).replace("${version}", pkg.version).replace("${arch}", arch).replace("${ext}", ext);
  const b = pkg.build;
  assert.equal(name(b.nsis.artifactName, "x64", "exe"), assetName(pkg.version, "win32", "x64", "nsis"));
  assert.equal(name(b.portable.artifactName, "x64", "exe"), assetName(pkg.version, "win32", "x64", "portable"));
  for (const arch of ["x64", "arm64"]) {
    assert.equal(name(b.mac.artifactName, arch, "dmg"), assetName(pkg.version, "darwin", arch, "dmg"));
    assert.equal(name(b.linux.artifactName, arch, "AppImage"), assetName(pkg.version, "linux", arch, "appimage"));
    assert.equal(name(b.linux.artifactName, arch, "deb"), assetName(pkg.version, "linux", arch, "deb"));
  }
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  const root = path.join(__dirname, "..");
  const listDir = dir => fs.readdirSync(path.join(root, dir)).filter(name => name.endsWith(".cjs")).map(name => `${dir}/${name}`);
  const packagedSources = ["server.js", ...listDir("server"), ...listDir("desktop")];
  const isPackaged = rel => {
    const posix = rel.split(path.sep).join("/");
    return b.files.includes(posix) || b.files.some(entry => entry.endsWith("/**/*") && posix.startsWith(entry.slice(0, -4)));
  };
  const { wrap } = require("node:module");
  const vm = require("node:vm");
  for (const source of [...packagedSources, ...listDir("scripts")]) {
    const code = fs.readFileSync(path.join(root, source), "utf8");
    new vm.Script(wrap(code.replace(/^#![^\n]*\n/, "")), { filename: source });
    if (!packagedSources.includes(source)) continue;
    assert.ok(isPackaged(source), `${source} is missing from package.json build.files`);
    for (const [, target] of code.matchAll(/require\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g)) {
      const resolved = path.relative(root, path.resolve(root, path.dirname(source), target)).split(path.sep).join("/");
      assert.ok(fs.existsSync(path.join(root, resolved)), `${source} requires missing ${resolved}`);
      assert.ok(isPackaged(resolved), `${source} requires ${resolved}, which is missing from package.json build.files`);
    }
  }
  for (const file of ["era-covers.json", "hidden-songs.json", "song-edits.json", "song-renames.json", "song-splits.json"]) {
    assert.ok(fs.existsSync(path.join(root, "data", file)), `missing data/${file}`);
    assert.ok(isPackaged(`data/${file}`), `data/${file} is missing from package.json build.files`);
  }
});


test("bumpReleaseVersion updates package files, build ?v= cache-busting strings, and download links in one step", t => {
  const dir = folder(t);
  fs.mkdirSync(path.join(dir, "build", "assets"), { recursive: true });
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), '{\n  "name": "yeatle-desktop",\n  "version": "1.14.1"\n}\n');
  fs.writeFileSync(path.join(dir, "package-lock.json"), '{\n  "name": "yeatle-desktop",\n  "version": "1.14.1",\n  "packages": {\n    "": {\n      "name": "yeatle-desktop",\n      "version": "1.14.1"\n    }\n  }\n}\n');
  fs.writeFileSync(path.join(dir, "build", "index.html"), '<link rel="modulepreload" href="./assets/navigation.mjs?v=1.10.3"><script type="module" src="./assets/yeatle.js?v=1.14.1"></script>');
  fs.writeFileSync(path.join(dir, "build", "assets", "yeatle.js"), 'import "./navigation.mjs?v=1.10.3"; const w = "separator.worker.js?v=1.14.1";');
  fs.writeFileSync(path.join(dir, "README.md"), "### Desktop downloads (v1.14.1)\nhttps://github.com/gustownis/yeatle/releases/download/v1.14.1/Yeatle-Setup-1.14.1-windows-x64.exe\nhttps://github.com/gustownis/yeatle/releases/download/v1.14.1/SHA256SUMS.txt\n");
  fs.writeFileSync(path.join(dir, "docs", "setup.md"), "download `Yeatle-Setup-1.14.1-windows-x64.exe` or `Yeatle-1.14.1-linux-x64.deb`\n");

  const res = bumpReleaseVersion("v1.14.2", dir);
  assert.equal(res.version, "1.14.2");
  assert.equal(res.shortVersion, "1.14.2");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version, "1.14.2");
  const lock = JSON.parse(fs.readFileSync(path.join(dir, "package-lock.json"), "utf8"));
  assert.equal(lock.version, "1.14.2");
  assert.equal(lock.packages[""].version, "1.14.2");
  assert.equal(fs.readFileSync(path.join(dir, "build", "index.html"), "utf8"), '<link rel="modulepreload" href="./assets/navigation.mjs?v=1.14.2"><script type="module" src="./assets/yeatle.js?v=1.14.2"></script>');
  assert.equal(fs.readFileSync(path.join(dir, "build", "assets", "yeatle.js"), "utf8"), 'import "./navigation.mjs?v=1.14.2"; const w = "separator.worker.js?v=1.14.2";');
  assert.match(fs.readFileSync(path.join(dir, "README.md"), "utf8"), /### Desktop downloads \(v1\.14\.2\)/);
  assert.match(fs.readFileSync(path.join(dir, "README.md"), "utf8"), /v1\.14\.2\/Yeatle-Setup-1\.14\.2-windows-x64\.exe/);
  assert.match(fs.readFileSync(path.join(dir, "docs", "setup.md"), "utf8"), /Yeatle-1\.14\.2-linux-x64\.deb/);
});

test("createUpdateController throttles progress/status updates and invokes onBeforeInstall before quitAndInstall", async t => {
  const { createUpdateController } = require("../desktop/updates.cjs");
  const dir = folder(t);
  const prevEnv = process.env.PORTABLE_EXECUTABLE_FILE;
  const prevFetch = globalThis.fetch;
  process.env.PORTABLE_EXECUTABLE_FILE = "Yeatle.exe";

  const barUpdates = [];
  const statuses = [];
  const win = { isDestroyed: () => false, setProgressBar: v => barUpdates.push(v) };
  try {
    const name = assetName("9.9.9", process.platform, process.arch, "portable");
    const payload = Buffer.alloc(1000, 65);
    const digest = `sha256:${crypto.createHash("sha256").update(payload).digest("hex")}`;
    const releaseUrl = "https://github.com/gustownis/yeatle/releases/download/v9.9.9/";
    globalThis.fetch = async url => {
      if (String(url).includes("/releases/latest")) {
        return {
          ok: true, status: 200,
          json: async () => ({
            tag_name: "v9.9.9", draft: false, prerelease: false,
            html_url: "https://github.com/gustownis/yeatle/releases/tag/v9.9.9",
            assets: [{ name, size: payload.length, state: "uploaded", digest, browser_download_url: releaseUrl + name }]
          })
        };
      }
      // 25 small 4% chunks inside <10ms: should throttle status to 5% steps instead of 25 rebuilds
      const stream = new ReadableStream({
        start(c) {
          for (let i = 0; i < 25; i++) c.enqueue(payload.subarray(i * 40, (i + 1) * 40));
          c.close();
        }
      });
      return new Response(stream, { status: 200 });
    };
    let ctrl;
    ctrl = createUpdateController({
      app: { isPackaged: true, getVersion: () => "1.14.3", getPath: () => dir },
      dialog: { showMessageBox: async () => ({ response: 0 }) },
      shell: { openExternal: async () => {}, showItemInFolder() {}, openPath: async () => "" },
      getWindow: () => win,
      onStatus: () => statuses.push(ctrl.status)
    });
    await ctrl.check(true);
    const downloadStatuses = statuses.filter(s => s.startsWith("Downloading Update ("));
    assert.ok(downloadStatuses.length >= 2 && downloadStatuses.length <= 21, `throttled from 25 chunks to ${downloadStatuses.length}`);
    assert.equal(barUpdates.at(-1), -1, "progress bar resets to -1 in finally");
    assert.equal(ctrl.status, "Check for Updates");
  } finally {
    if (prevEnv === undefined) delete process.env.PORTABLE_EXECUTABLE_FILE;
    else process.env.PORTABLE_EXECUTABLE_FILE = prevEnv;
    globalThis.fetch = prevFetch;
  }

  // Verify onBeforeInstall hook runs before quitAndInstall in updates.cjs
  const updatesSrc = fs.readFileSync(path.join(__dirname, "..", "desktop", "updates.cjs"), "utf8");
  assert.match(updatesSrc, /await onBeforeInstall\(\)\.catch\(\(\) => \{\}\);\s*target\.quitAndInstall\(true, true\);/);
});
