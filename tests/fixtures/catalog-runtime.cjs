// Exercise the real parser, catalog and HTTP handler without opening a socket.
// This also makes the catalog rules testable in restricted/offline workspaces.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { Writable } = require("node:stream");

module.exports = function catalogRuntime(folder, fixtures = path.join(__dirname, "tracker")) {
  const root = path.resolve(__dirname, "../..");
  const file = path.join(root, "server.js");
  const source = fs.readFileSync(file, "utf8");
  const end = source.indexOf("// a dropped connection to a song host");
  let handler;
  const baseRequire = createRequire(file);
  const requireForTest = name => name === "http" ? { ...baseRequire(name), createServer(callback) { handler = callback; return {}; } } : baseRequire(name);
  const context = vm.createContext({
    require: requireForTest, __dirname: root, module: { exports: {} }, Buffer, URL,
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, setInterval, clearInterval,
    process: { env: { ...process.env, YEATLE_DATA_DIR: folder, YEATLE_TRACKER_FIXTURES: fixtures, YEATLE_PORT: "0" }, platform: process.platform, execPath: process.execPath, exit(code) { throw new Error(`Server exited ${code}`); } }
  });
  vm.runInContext(source.slice(0, end) + "\nmodule.exports = { buildSongList, loadTab, setSongs, publicSong, songListJson, upgradeCachedSongs, index: () => SONG_INDEX, years: ERA_YEARS };", context, { filename: file });
  return { ...context.module.exports, async request(url, method = "GET", headers = {}) {
    const chunks = [], result = { headers: {}, status: 200 };
    const res = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
    res.setHeader = (key, value) => { result.headers[key.toLowerCase()] = value; };
    res.writeHead = (status, values = {}) => { result.status = status; res.headersSent = true; for (const [key, value] of Object.entries(values)) res.setHeader(key, value); return res; };
    const done = new Promise((resolve, reject) => { res.once("finish", resolve); res.once("error", reject); });
    await handler({ url, method, headers }, res);
    await done;
    return { ...result, body: Buffer.concat(chunks) };
  } };
};
