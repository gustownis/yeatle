// A download the browser abandons halfway must close its file on the server. Otherwise every
// phone that leaves the page mid-download keeps a file handle open until the server runs out.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
// Counting a process's open files needs /proc (Linux).
const hasProc = fs.existsSync(`/proc/${process.pid}/fd`);

async function launch(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-test-"));
  fs.writeFileSync(path.join(folder, "config.json"), JSON.stringify({ port: 0, openBrowser: false, refreshMinutes: 0, tabs: [] }));
  fs.mkdirSync(path.join(folder, "models"), { recursive: true });
  for (const stem of ["drums", "bass", "other", "vocals"]) {
    const fd = fs.openSync(path.join(folder, "models", `${stem}.fp16.onnx`), "w");
    fs.ftruncateSync(fd, 4000001); // large enough not to fit in one socket write
    fs.closeSync(fd);
  }
  const child = spawn(process.execPath, [path.join(root, "server.js")], {
    env: { ...process.env, YEATLE_DATA_DIR: folder, YEATLE_PORT: "", YEATLE_DESKTOP: "1" },
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });
  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk; });
  child.stderr.on("data", chunk => { logs += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise(resolve => child.once("exit", resolve));
      child.kill();
      await stopped;
    }
    fs.rmSync(folder, { recursive: true, force: true });
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${logs}`)), 5000);
    child.on("message", message => { if (message.type === "yeatle-ready") { clearTimeout(timer); resolve(message.port); } });
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${logs}`)); });
  });
  return { child, port };
}

// Starts a download, reads the first bytes and hangs up.
function abandon(port, urlPath, headers = {}) {
  return new Promise(resolve => {
    const req = http.get({ host: "127.0.0.1", port, path: urlPath, headers }, res => {
      res.on("error", () => {});
      res.once("data", () => { req.destroy(); resolve(res.statusCode); });
      res.once("end", () => resolve(res.statusCode));
    });
    req.on("error", () => resolve(0));
  });
}

function openFiles(pid, name) {
  let count = 0;
  for (const fd of fs.readdirSync(`/proc/${pid}/fd`)) {
    try { if (fs.readlinkSync(`/proc/${pid}/fd/${fd}`).endsWith(name)) count++; } catch { /* closed meanwhile */ }
  }
  return count;
}

async function settle(pid, name) {
  for (let i = 0; i < 40 && openFiles(pid, name) > 0; i++) await new Promise(r => setTimeout(r, 50));
  return openFiles(pid, name);
}

test("abandoned downloads close their files", { skip: !hasProc && "needs /proc to count open files" }, async t => {
  const { child, port } = await launch(t);
  const cases = [
    ["a static file", "/assets/banned.mp4", {}, "banned.mp4"],
    ["a byte range of a static file", "/assets/banned.mp4", { range: "bytes=0-" }, "banned.mp4"],
    ["a song splitter model", "/models/drums.fp16.onnx", {}, "drums.fp16.onnx"]
  ];
  for (const [label, urlPath, headers, name] of cases) {
    for (let i = 0; i < 5; i++) {
      const status = await abandon(port, urlPath, headers);
      assert.ok(status === 200 || status === 206, `${label}: HTTP ${status}`);
    }
    assert.equal(await settle(child.pid, name), 0, `${label} left files open`);
  }
});
