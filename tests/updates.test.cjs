const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { checkRelease, isNewer, installMode, assetName, selectAsset, downloadAsset, API_URL } = require("../desktop/update-core.cjs");
const { menuTemplate } = require("../desktop/menu.cjs");
const { prepareRelease } = require("../scripts/prepare-release.cjs");

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

test("Developer menu owns developer tools and admin; Help exposes updates", () => {
  let opened = false;
  const menus = menuTemplate({ platform: "win32", openAdmin: () => { opened = true; }, updateStatus: "Check for Updates", updating: false });
  assert.deepEqual(menus.map(item => item.label), ["Game", "View", "Developer", "Help"]);
  assert.equal(menus.find(item => item.label === "View").submenu.some(item => item.role === "toggleDevTools"), false);
  const developer = menus.find(item => item.label === "Developer");
  assert.equal(developer.submenu[0].role, "toggleDevTools");
  developer.submenu[1].click();
  assert.equal(opened, true);
  assert.equal(menus.find(item => item.label === "Help").submenu[0].label, "Check for Updates");
});
