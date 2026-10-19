// Isolated, repeatable browser/desktop testing on Windows and Linux.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const desktop = process.argv.includes("--desktop");
const data = process.env.YEATLE_TEST_DATA_DIR
  ? path.resolve(process.env.YEATLE_TEST_DATA_DIR)
  : path.join(root, ".tmp", "test-1.11", desktop ? "desktop" : "browser");
fs.mkdirSync(data, { recursive: true });
const config = path.join(data, "config.json");
if (!fs.existsSync(config)) {
  const defaults = JSON.parse(fs.readFileSync(path.join(root, "config.example.json")));
  fs.writeFileSync(config, JSON.stringify({ ...defaults, port: 3193, desktopPort: 3194, dailyAuthority: "" }, null, 2));
}
const settings = JSON.parse(fs.readFileSync(config));
if (!Object.hasOwn(settings, "dailyAuthority")) {
  fs.writeFileSync(config, JSON.stringify({ ...settings, dailyAuthority: "" }, null, 2));
}
for (const name of ["era-covers.json", "hidden-songs.json", "song-edits.json", "song-renames.json", "song-splits.json", "songs-cache.json", "preview-cache.json"]) {
  if (!fs.existsSync(path.join(data, name)) && fs.existsSync(path.join(root, name))) fs.copyFileSync(path.join(root, name), path.join(data, name));
}
console.log(`Yeatle ${require("../package.json").version} · ${process.platform}/${process.arch} · Node ${process.versions.node}`);
console.log(`Test settings and reports: ${data}`);
console.log(`Mode: ${desktop ? "desktop (port 3194)" : "browser (http://127.0.0.1:3193)"}`);
console.log("Read test-1.11/README.md for Linux handoff and physical Android checks.");
const report = { version: require("../package.json").version, platform: process.platform, arch: process.arch, node: process.versions.node, mode: desktop ? "desktop" : "browser", startedAt: new Date().toISOString(), deviceChecks: "pending manual testing" };
fs.writeFileSync(path.join(data, "session.json"), JSON.stringify(report, null, 2));
if (process.argv.includes("--check")) process.exit(0);
let executable = process.execPath;
if (desktop) {
  try {
    executable = require("electron");
    if (!fs.existsSync(executable) || (process.platform === "win32") !== executable.endsWith(".exe")) throw new Error("different OS");
  } catch {
    console.error("Install desktop dependencies on this OS with npm ci, then run this command again.");
    process.exit(1);
  }
}
const child = spawn(executable, [desktop ? root : path.join(root, "server.js")], {
  cwd: root, stdio: "inherit", windowsHide: true,
  env: { ...process.env, YEATLE_DATA_DIR: data, YEATLE_TEST_PROFILE: desktop ? data : "",
    YEATLE_PORT: "3193", YEATLE_STEMS_DIR: process.env.YEATLE_STEMS_DIR || path.join(root, "build", "Songs") }
});
child.once("error", error => { console.error(error.message); process.exitCode = 1; });
child.once("exit", code => { process.exitCode = code || 0; });
process.on("SIGINT", () => child.kill());
process.on("SIGTERM", () => child.kill());
