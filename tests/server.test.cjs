const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
function dataFolder(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-test-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}
function config(folder, changes = {}) {
  fs.writeFileSync(path.join(folder, "config.json"), JSON.stringify({ port: 0, openBrowser: false, refreshMinutes: 0, tabs: [], ...changes }));
  fs.mkdirSync(path.join(folder, "models"), { recursive: true });
  for (const stem of ["drums", "bass", "other", "vocals"]) {
    const fd = fs.openSync(path.join(folder, "models", `${stem}.fp16.onnx`), "w");
    fs.ftruncateSync(fd, 1000001); // Avoid network downloads during server tests.
    fs.closeSync(fd);
  }
}
async function launch(t, folder) {
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
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${logs}`)), 5000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.on("message", message => {
      if (message.type === "yeatle-ready") { clearTimeout(timer); resolve(message.port); }
    });
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${logs}`)); });
  });
  return { child, url: `http://127.0.0.1:${port}` };
}

test("desktop server serves compiled game, runtime, and external stems; admin defaults off", async t => {
  const folder = dataFolder(t);
  config(folder);
  const songs = path.join(folder, "Songs", "Test Song");
  fs.mkdirSync(songs, { recursive: true });
  for (const stem of ["drums", "bass", "other", "vocals"]) fs.writeFileSync(path.join(songs, `${stem}.mp3`), "test audio bytes");
  const { url } = await launch(t, folder);
  const home = await fetch(url);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /assets\/yeatle.js/);
  assert.equal(home.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(home.headers.get("cross-origin-embedder-policy"), "credentialless");
  const wasm = await fetch(`${url}/ort/ort-wasm-simd-threaded.jsep.wasm`, { headers: { Range: "bytes=0-3" } });
  assert.equal(wasm.status, 206);
  assert.deepEqual([...new Uint8Array(await wasm.arrayBuffer())], [0, 97, 115, 109]);
  const list = await (await fetch(`${url}/api/songs`)).json();
  assert.equal(list.songs.length, 1);
  assert.equal(list.songs[0].mode, "stems");
  const stem = await fetch(`${url}/Songs/Test%20Song/drums.mp3`, { headers: { Range: "bytes=0-3" } });
  assert.equal(stem.status, 206);
  assert.equal(await stem.text(), "test");
  assert.equal((await fetch(`${url}/admin`)).status, 404);
  assert.equal((await fetch(`${url}/Songs/..%2Fconfig.json`)).status, 403);
  assert.equal((await fetch(`${url}/..%2Fserver.js`)).status, 403);
  const missing = await fetch(`${url}/api/audio/does-not-exist`);
  assert.equal(missing.status, 404);
  assert.match((await missing.json()).error, /Refresh the game/);
});

test("saved song list is available when the tracker cannot provide rows", async t => {
  const folder = dataFolder(t);
  config(folder);
  fs.writeFileSync(path.join(folder, "songs-cache.json"), JSON.stringify({ updated: 123, eras: [], songs: [{ id: "cached-song", title: "Cached song", mode: "filter" }] }));
  const { url } = await launch(t, folder);
  const list = await (await fetch(`${url}/api/songs`)).json();
  assert.equal(list.source, "cache");
  assert.equal(list.songs[0].id, "cached-song");
  assert.equal(list.updated, 123);
});

test("invalid configuration exits with useful instructions", async t => {
  const folder = dataFolder(t);
  fs.writeFileSync(path.join(folder, "config.json"), "{broken JSON}");
  const child = spawn(process.execPath, [path.join(root, "server.js")], { env: { ...process.env, YEATLE_DATA_DIR: folder }, stdio: ["ignore", "pipe", "pipe"] });
  let error = "";
  child.stderr.on("data", chunk => { error += chunk; });
  const code = await new Promise(resolve => child.once("exit", resolve));
  assert.equal(code, 1);
  assert.match(error, /Check the JSON syntax/);
});

test("a failed model stream never becomes a cached model, and retry works", async t => {
  const folder = dataFolder(t);
  const script = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const body = script.slice(script.indexOf("function ensureModel(stem) {"), script.indexOf("async function serveModel"));
  let fail = true;
  const context = vm.createContext({
    fs, path, pipeline, MODELS_DIR: folder, MODEL_URL: "https://model.test/", modelDownloads: new Map(),
    console: { log() {}, warn() {} },
    request: async () => {
      const response = new Readable({ read() {
        this.push(Buffer.alloc(1000001));
        if (fail) this.destroy(new Error("connection interrupted"));
        else this.push(null);
      } });
      response.statusCode = 200;
      response.headers = { "content-length": "1000001" };
      return response;
    }
  });
  vm.runInContext(body, context);
  await assert.rejects(context.ensureModel("drums"), /connection interrupted/);
  assert.equal(fs.existsSync(path.join(folder, "drums.fp16.onnx")), false);
  assert.equal(fs.existsSync(path.join(folder, "drums.fp16.onnx.part")), false);
  fail = false;
  await new Promise(resolve => setImmediate(resolve));
  await context.ensureModel("drums");
  assert.equal(fs.statSync(path.join(folder, "drums.fp16.onnx")).size, 1000001);
});
