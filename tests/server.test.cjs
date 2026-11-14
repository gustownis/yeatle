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
async function launch(t, folder, env = {}) {
  const child = spawn(process.execPath, [path.join(root, "server.js")], {
    env: { ...process.env, YEATLE_DATA_DIR: folder, YEATLE_PORT: "", YEATLE_DESKTOP: "1", ...env },
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

test("clean game pages preserve legacy URLs, queries and relative resources", async t => {
  const folder = dataFolder(t);
  config(folder);
  const { url } = await launch(t, folder);
  for (const page of ["daily", "karaoke"]) {
    const direct = await fetch(`${url}/${page}?mode=test`);
    assert.equal(direct.status, 200);
    assert.match(direct.headers.get("content-type"), /^text\/html/);
    assert.match(await direct.text(), /Yeatle/);
    const head = await fetch(`${url}/${page}`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    for (const suffix of [".html", "/", ".html/"]) {
      const old = await fetch(`${url}/${page}${suffix}?x=one%20two&x=3`, { redirect: "manual" });
      assert.equal(old.status, 308);
      assert.equal(old.headers.get("location"), `/${page}?x=one%20two&x=3`);
      const followed = await fetch(`${url}/${page}${suffix}?x=one%20two&x=3`);
      assert.equal(followed.url, `${url}/${page}?x=one%20two&x=3`);
      assert.equal(followed.status, 200);
    }
    const fakeAsset = await fetch(`${url}/${page}/assets/yeatle.js`);
    assert.equal(fakeAsset.status, 404, "only the exact page is routed; nested assets do not become HTML");
  }
  for (const asset of ["/assets/yeatle.js", "/assets/karaoke.js", "/assets/daily.mjs", "/favicon.png", "/api/songs"]) {
    assert.equal((await fetch(`${url}${asset}`)).status, 200, asset);
  }
});

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
  assert.equal(home.headers.get("cache-control"), "no-cache");
  const code = await fetch(`${url}/assets/yeatle.js`, { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(code.headers.get("content-encoding"), "gzip");
  assert.equal(code.headers.get("vary"), "Accept-Encoding");
  assert.equal(await code.text(), fs.readFileSync(path.join(root, "build/assets/yeatle.js"), "utf8"));
  const brotli = await fetch(`${url}/assets/yeatle.js`, { headers: { "Accept-Encoding": "gzip, deflate, br" } });
  assert.equal(brotli.headers.get("content-encoding"), "br");
  assert.ok(Number(brotli.headers.get("content-length")) < Number(code.headers.get("content-length")), "Brotli is the smaller variant");
  assert.equal(await brotli.text(), fs.readFileSync(path.join(root, "build/assets/yeatle.js"), "utf8"));
  const identity = await fetch(`${url}/assets/yeatle.js`, { headers: { "Accept-Encoding": "gzip;q=0, *;q=1" } });
  assert.equal(identity.headers.get("content-encoding"), null);
  const codeRange = await fetch(`${url}/assets/yeatle.js`, { headers: { "Accept-Encoding": "gzip", Range: "bytes=0-3" } });
  assert.equal(codeRange.status, 206);
  assert.equal(codeRange.headers.get("content-encoding"), null);
  assert.equal((await codeRange.arrayBuffer()).byteLength, 4);
  const head = await fetch(`${url}/assets/yeatle.js`, { method: "HEAD", headers: { "Accept-Encoding": "gzip" } });
  assert.equal(head.headers.get("content-encoding"), "gzip");
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const freshHome = await fetch(url, { headers: { "If-None-Match": home.headers.get("etag") } });
  assert.equal(freshHome.status, 304);
  assert.equal(await freshHome.text(), "");
  assert.equal(freshHome.headers.get("cross-origin-embedder-policy"), "credentialless");
  const module = await fetch(`${url}/assets/performance.mjs?v=1.9.3`);
  assert.equal(module.status, 200);
  const repeatModule = await fetch(`${url}/assets/performance.mjs?v=1.9.3`, { headers: { "If-None-Match": module.headers.get("etag") } });
  assert.equal(repeatModule.status, 304);
  const wasm = await fetch(`${url}/ort/ort-wasm-simd-threaded.jsep.wasm`, { headers: { Range: "bytes=0-3" } });
  assert.equal(wasm.status, 206);
  assert.deepEqual([...new Uint8Array(await wasm.arrayBuffer())], [0, 97, 115, 109]);
  assert.equal(wasm.headers.get("cache-control"), "no-cache");
  const repeatWasm = await fetch(`${url}/ort/ort-wasm-simd-threaded.jsep.wasm`, { headers: { "If-None-Match": wasm.headers.get("etag") } });
  assert.equal(repeatWasm.status, 304);
  assert.equal((await repeatWasm.arrayBuffer()).byteLength, 0);
  const outdatedWasm = await fetch(`${url}/ort/ort-wasm-simd-threaded.jsep.wasm`, { headers: { Range: "bytes=0-3", "If-None-Match": 'W/"old-release"' } });
  assert.equal(outdatedWasm.status, 206);
  const list = await (await fetch(`${url}/api/songs`)).json();
  assert.equal(list.liveControl, false);
  assert.equal((await fetch(`${url}/api/active-song/events`)).status, 404);
  assert.equal(list.songs.length, 1);
  assert.equal(list.songs[0].mode, "stems");
  const stem = await fetch(`${url}/Songs/Test%20Song/drums.mp3`, { headers: { Range: "bytes=0-3" } });
  assert.equal(stem.status, 206);
  assert.equal(await stem.text(), "test");
  const staleRange = await fetch(`${url}/Songs/Test%20Song/drums.mp3`, { headers: { Range: "bytes=0-3", "If-Range": "Sat, 01 Jan 2000 00:00:00 GMT" } });
  assert.equal(staleRange.status, 200);
  assert.equal(await staleRange.text(), "test audio bytes");
  assert.equal((await fetch(`${url}/admin`)).status, 404);
  assert.equal((await fetch(`${url}/Songs/..%2Fconfig.json`)).status, 403);
  assert.equal((await fetch(`${url}/..%2Fserver.js`)).status, 403);
  const missing = await fetch(`${url}/api/audio/does-not-exist`);
  assert.equal(missing.status, 404);
  assert.match((await missing.json()).error, /Refresh the game/);
});

test("Windows stem filenames are detected and served on case-sensitive filesystems", async t => {
  const folder = dataFolder(t);
  config(folder);
  const songs = path.join(folder, "Songs", "Mixed case");
  fs.mkdirSync(songs, { recursive: true });
  for (const name of ["Drums.mp3", "BASS.MP3", "oThEr.mp3", "Vocals.mp3"]) {
    fs.writeFileSync(path.join(songs, name), name.toLowerCase());
  }
  if (process.platform !== "win32") {
    const linked = path.join(folder, "other-audio.mp3");
    fs.writeFileSync(linked, "other.mp3");
    fs.unlinkSync(path.join(songs, "oThEr.mp3"));
    fs.symlinkSync(linked, path.join(songs, "oThEr.mp3"));
  }
  const incomplete = path.join(folder, "Songs", "Incomplete");
  fs.mkdirSync(incomplete, { recursive: true });
  for (const stem of ["drums", "bass", "other"]) fs.writeFileSync(path.join(incomplete, `${stem}.mp3`), "audio");
  fs.mkdirSync(path.join(incomplete, "Vocals.mp3"));
  const { url } = await launch(t, folder);
  const list = await (await fetch(`${url}/api/songs?refresh=1`)).json();
  assert.equal(list.songs.length, 1);
  assert.equal(list.songs[0].folder, "Mixed case");
  assert.equal(list.songs[0].mode, "stems");
  for (const stem of ["drums", "bass", "other", "vocals"]) {
    const audio = await fetch(`${url}/Songs/Mixed%20case/${stem}.mp3`);
    assert.equal(audio.status, 200);
    assert.equal(await audio.text(), `${stem}.mp3`);
    const range = await fetch(`${url}/Songs/Mixed%20case/${stem}.mp3`, { headers: { Range: "bytes=0-2" } });
    assert.equal(range.status, 206);
    assert.equal(await range.text(), stem.slice(0, 3));
  }
  assert.equal((await fetch(`${url}/Songs/Mixed%20case/missing.mp3`)).status, 404);
  assert.equal((await fetch(`${url}/Songs/..%2Fconfig.json`)).status, 403);
});

test("saved song list is available when the tracker cannot provide rows", async t => {
  const folder = dataFolder(t);
  config(folder);
  for (const stem of ["drums", "bass", "other", "vocals"]) fs.unlinkSync(path.join(folder, "models", `${stem}.fp16.onnx`));
  fs.rmdirSync(path.join(folder, "models"));
  fs.writeFileSync(path.join(folder, "songs-cache.json"), JSON.stringify({ updated: 123, eras: [], songs: [{ id: "cached-song", title: "Cached song", mode: "filter" }] }));
  const { url } = await launch(t, folder);
  const list = await (await fetch(`${url}/api/songs`)).json();
  assert.equal(list.source, "cache");
  assert.equal(list.songs[0].id, "cached-song");
  assert.equal(list.updated, 123);
  assert.equal(fs.existsSync(path.join(folder, "models")), false);
  assert.equal((await (await fetch(`${url}/api/separator-revision`)).json()).revision, null);
});

test("capitalized stems retain HEAD, cache validation, suffix ranges, and range errors", async t => {
  const folder = dataFolder(t); config(folder);
  const name = "Tëst #1 + 100%";
  const songs = path.join(folder, "Songs", name);
  fs.mkdirSync(songs, { recursive: true });
  for (const stem of ["Drums", "Bass", "Other", "Vocals"]) fs.writeFileSync(path.join(songs, `${stem}.MP3`), "0123456789");
  const { url } = await launch(t, folder);
  const audioUrl = `${url}/Songs/${encodeURIComponent(name)}/drums.mp3`;
  const first = await fetch(audioUrl);
  assert.equal(first.status, 200);
  const etag = first.headers.get("etag");
  assert.ok(etag);
  const head = await fetch(audioUrl, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-type"), "audio/mpeg");
  assert.equal(head.headers.get("content-length"), "10");
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal((await fetch(audioUrl, { headers: { "If-None-Match": etag } })).status, 304);
  const suffix = await fetch(audioUrl, { headers: { Range: "bytes=-3" } });
  assert.equal(suffix.status, 206);
  assert.equal(await suffix.text(), "789");
  const outside = await fetch(audioUrl, { headers: { Range: "bytes=20-30" } });
  assert.equal(outside.status, 416);
  assert.equal(outside.headers.get("content-range"), "bytes */10");
  fs.writeFileSync(path.join(songs, "Drums.MP3"), "updated audio");
  const updated = await fetch(audioUrl, { headers: { "If-None-Match": etag } });
  assert.equal(updated.status, 200);
  assert.equal(await updated.text(), "updated audio");
  assert.notEqual(updated.headers.get("etag"), etag);
});

test("refresh detects completed stem packs and removes packs whose audio was deleted", async t => {
  const folder = dataFolder(t); config(folder);
  // An empty saved tracker response must not mask newly added local audio.
  fs.writeFileSync(path.join(folder, "songs-cache.json"), JSON.stringify({ songs: [], eras: [] }));
  const songs = path.join(folder, "Songs", "Completion test");
  fs.mkdirSync(songs, { recursive: true });
  for (const stem of ["Drums", "Bass", "Other"]) fs.writeFileSync(path.join(songs, `${stem}.mp3`), "audio");
  const { url } = await launch(t, folder);
  const list = async () => (await (await fetch(`${url}/api/songs?refresh=1`)).json()).songs;
  assert.equal((await list()).length, 0);
  fs.writeFileSync(path.join(songs, "Vocals.mp3"), "audio");
  assert.equal((await list()).length, 1);
  fs.unlinkSync(path.join(songs, "Bass.mp3"));
  assert.equal((await list()).length, 0);
});

function packFolder(folder, name) {
  const songs = path.join(folder, "Songs", name);
  fs.mkdirSync(songs, { recursive: true });
  for (const stem of ["Drums", "Bass", "Other", "Vocals"]) fs.writeFileSync(path.join(songs, `${stem}.mp3`), "audio");
}

test("anonymous refreshes of a public server are limited, and admins are not", async t => {
  const folder = dataFolder(t); config(folder);
  fs.writeFileSync(path.join(folder, "admin.json"), JSON.stringify({ password: "letmein" }));
  fs.writeFileSync(path.join(folder, "songs-cache.json"), JSON.stringify({ songs: [], eras: [] }));
  packFolder(folder, "First");
  const { url } = await launch(t, folder, { YEATLE_DESKTOP: "" });
  const count = async (headers = {}) => (await (await fetch(`${url}/api/songs?refresh=1`, { headers })).json()).songs.length;
  assert.equal(await count(), 1, "the first refresh runs");
  packFolder(folder, "Second");
  assert.equal(await count(), 1, "another within the cooldown serves the current list without a rebuild");
  const login = await fetch(`${url}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "letmein" }) });
  assert.equal(login.status, 200);
  assert.equal(await count({ Cookie: login.headers.get("set-cookie").split(";")[0] }), 2, "a signed-in admin can always refresh");
});

test("the song list revalidates, per encoding, and any change to its contents changes the tag", async t => {
  const folder = dataFolder(t); config(folder);
  fs.writeFileSync(path.join(folder, "songs-cache.json"), JSON.stringify({ songs: [], eras: [] }));
  for (const name of ["First", "Second"]) packFolder(folder, name);
  const { url } = await launch(t, folder);
  const plain = await fetch(`${url}/api/songs`, { headers: { "Accept-Encoding": "identity" } });
  const etag = plain.headers.get("etag");
  assert.match(etag, /^"\d+-2-[a-f0-9]{16}"$/);
  assert.equal(plain.headers.get("cache-control"), "no-cache", "stored by the browser, always revalidated");
  assert.equal((await plain.json()).songs.length, 2);

  const same = await fetch(`${url}/api/songs`, { headers: { "Accept-Encoding": "identity", "If-None-Match": etag } });
  assert.equal(same.status, 304);
  assert.equal(same.headers.get("etag"), etag);
  assert.equal(await same.text(), "");

  const zipped = await fetch(`${url}/api/songs`, { headers: { "Accept-Encoding": "gzip" } });
  assert.notEqual(zipped.headers.get("etag"), etag, "compressed and plain bodies have different tags");
  const brotliList = await fetch(`${url}/api/songs`, { headers: { "Accept-Encoding": "gzip, br" } });
  assert.equal(brotliList.headers.get("content-encoding"), "br");
  assert.notEqual(brotliList.headers.get("etag"), zipped.headers.get("etag"), "each encoding has its own tag");
  assert.deepEqual(await brotliList.json(), await zipped.json());
  assert.equal((await fetch(`${url}/api/songs`, { headers: { "Accept-Encoding": "identity", "If-None-Match": '"stale"' } })).status, 200);
  assert.equal((await fetch(`${url}/api/songs`, { headers: { "Accept-Encoding": "identity", "If-Modified-Since": new Date().toUTCString() } })).status, 200, "only the tag can answer 304");

  // Same sync time and the same catalog length: only the list's contents differ.
  fs.writeFileSync(path.join(folder, "joke-photos.json"), JSON.stringify({ photos: [{ song: "first", image: "first.jpg" }] }));
  const edited = await fetch(`${url}/api/songs`, { headers: { "Accept-Encoding": "identity", "If-None-Match": etag } });
  assert.equal(edited.status, 200);
  assert.notEqual(edited.headers.get("etag"), etag);
  assert.match(edited.headers.get("etag"), /^"\d+-2-/);
});

test("broken stems and directory symlinks do not turn incomplete folders into HQ songs",{ skip: process.platform === "win32" }, async t => {
  const folder = dataFolder(t); config(folder);
  for (const name of ["Broken", "Directory"]) {
    const songs = path.join(folder, "Songs", name);
    fs.mkdirSync(songs, { recursive: true });
    for (const stem of ["Drums", "Bass", "Other"]) fs.writeFileSync(path.join(songs, `${stem}.mp3`), "audio");
    fs.symlinkSync(name === "Broken" ? path.join(folder, "missing.mp3") : folder, path.join(songs, "Vocals.mp3"));
  }
  const { url } = await launch(t, folder);
  assert.equal((await (await fetch(`${url}/api/songs?refresh=1`)).json()).songs.length, 0);
  for (const name of ["Broken", "Directory"]) assert.equal((await fetch(`${url}/Songs/${name}/vocals.mp3`)).status, 404);
});

test("model cache validators and content fingerprints invalidate after a model is replaced", async t => {
  const folder = dataFolder(t); config(folder);
  const { url } = await launch(t, folder);
  const model = await fetch(`${url}/models/drums.fp16.onnx`, { method: "HEAD" });
  const etag = model.headers.get("etag"), hash = model.headers.get("x-yeatle-model-hash");
  assert.ok(etag && hash);assert.equal(model.headers.get("cache-control"), "no-cache");
  const notModified = await fetch(`${url}/models/drums.fp16.onnx`, { headers: { "If-None-Match": etag } });
  assert.equal(notModified.status,304);
  const before = (await (await fetch(`${url}/api/separator-revision`)).json()).revision;
  fs.writeFileSync(path.join(folder,"models/drums.fp16.onnx"),Buffer.alloc(1000002,1));
  const after = await fetch(`${url}/models/drums.fp16.onnx`,{method:"HEAD",headers:{"If-None-Match":etag}});
  assert.equal(after.status,200);assert.notEqual(after.headers.get("x-yeatle-model-hash"),hash);
  assert.notEqual((await (await fetch(`${url}/api/separator-revision`)).json()).revision,before);
});

test("admin accepts garlic, hashes the password, and rejects anonymous edits", async t => {
  const folder = dataFolder(t);
  config(folder);
  fs.writeFileSync(path.join(folder, "admin.json"), JSON.stringify({ password: "garlic" }));
  const { url } = await launch(t, folder);
  const admin = await fetch(`${url}/admin`);
  assert.equal(admin.status, 200);
  assert.match(await admin.text(), /Password/);
  assert.equal((await fetch(`${url}/api/admin/songs`)).status, 401);
  const wrong = await fetch(`${url}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "wrong" }) });
  assert.equal(wrong.status, 401);
  const login = await fetch(`${url}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "garlic" }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(`${url}/api/admin/songs`, { headers: { Cookie: cookie } })).status, 200);
  const saved = JSON.parse(fs.readFileSync(path.join(folder, "admin.json"), "utf8"));
  assert.equal(saved.password, undefined);
  assert.ok(saved.salt && saved.hash);
});

test("prepared song lists immediately reflect admin changes and edited photo files", async t => {
  const folder = dataFolder(t);
  config(folder);
  fs.writeFileSync(path.join(folder, "admin.json"), JSON.stringify({ password: "garlic" }));
  fs.writeFileSync(path.join(folder, "songs-cache.json"), JSON.stringify({ updated: 123, eras: [], songs: [{ id: "one", title: "One", display: "One", era: "Test", mode: "filter", source: { kind: "url", id: "https://audio.test/one" } }] }));
  const { url } = await launch(t, folder);
  const list = async () => (await fetch(`${url}/api/songs`)).json();
  const first = await list();
  const compressed = await fetch(`${url}/api/songs`, { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(compressed.headers.get("content-encoding"), "gzip");
  assert.equal(compressed.headers.get("vary"), "Accept-Encoding");
  assert.deepEqual(await compressed.json(), first);
  assert.equal(first.songs[0].source, undefined);
  assert.deepEqual(await list(), first);
  fs.writeFileSync(path.join(folder, "joke-photos.json"), JSON.stringify({ photos: [{ song: "one", image: "first.jpg" }] }));
  assert.equal((await list()).songs[0].joke.image, "Images/jokes/first.jpg");
  fs.writeFileSync(path.join(folder, "joke-photos.json"), JSON.stringify({ photos: [{ song: "one", image: "second.jpg" }] }));
  assert.equal((await list()).songs[0].joke.image, "Images/jokes/second.jpg");
  const login = await fetch(`${url}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "garlic" }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const edit = async (route, body) => {
    const response = await fetch(`${url}/api/admin/${route}`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
  };
  await edit("rename", { id: "one", name: "Renamed" });
  assert.equal((await list()).songs[0].display, "Renamed");
  await edit("hide", { ids: ["one"], hidden: true });
  assert.equal((await list()).songs.length, 0);
  await edit("hide", { ids: ["one"], hidden: false });
  assert.equal((await list()).songs.length, 1);
});

test("admin shares catalog eligibility, avoids duplicate hides and keeps excluded recordings out of live control", async t => {
  const folder = dataFolder(t);
  config(folder, { liveControl: true });
  fs.writeFileSync(path.join(folder, "admin.json"), JSON.stringify({ password: "garlic" }));
  const plain = { features: [], keys: [], era: "Test", tab: "Unreleased", mode: "filter", type: "Demo" };
  const demo = { ...plain, id: "weilandbirthday", title: "Weiland - birthday", display: "Weiland - birthday", trackerVersion: "V1", source: { kind: "pillows", id: "482dd988e5b609fca34f489356a23c1f" }, audioId: "birthday-demo", trackerKey: "a".repeat(64) };
  const feature = { ...demo, display: "Weiland - birthday (feat. Yeat)", trackerVersion: "V2", features: ["feat. Yeat"], source: { kind: "pillows", id: "c8ee797edae9dae84b767181709c6c73" }, audioId: "birthday-feature", trackerKey: "b".repeat(64) };
  const songs = [
    { ...plain, id: "love-drug", title: "Weiland - Love Drug", display: "Weiland - Love Drug", tab: "Released", source: { kind: "apple", id: "1539817367" } },
    { ...plain, id: "panic-solo", title: "Lil Uzi Vert - Panic", display: "Lil Uzi Vert - Panic", trackerVersion: "V1", source: { kind: "pillows", id: "c85173c3e46c688edf081f5f73d7cf2f" } },
    { ...demo, sourceVariants: [demo, feature], poolVariants: { unreleased: demo }, mergedFrom: [demo, feature].map(song => ({ trackerKey: song.trackerKey, title: song.title, era: song.era, tab: song.tab })) },
    { ...plain, id: "one", title: "One", display: "One", source: { kind: "url", id: "https://audio.test/one" } }
  ];
  fs.writeFileSync(path.join(folder, "songs-cache.json"), JSON.stringify({ format: 3, updated: 123, songs, eras: [] }));
  fs.writeFileSync(path.join(folder, "hidden-songs.json"), JSON.stringify({ hidden: [{ id: "panic-solo", name: "Lil Uzi Vert - Panic" }] }));
  const { url } = await launch(t, folder);
  const login = await fetch(`${url}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "garlic" }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const headers = { Cookie: cookie, "Content-Type": "application/json" };
  const post = async (route, body, status = 200) => {
    const response = await fetch(`${url}/api/admin/${route}`, { method: "POST", headers, body: JSON.stringify(body) });
    assert.equal(response.status, status);
    return response.json();
  };
  const admin = await (await fetch(`${url}/api/admin/songs`, { headers })).json();
  const excluded = admin.songs.find(song => song.id === "love-drug");
  assert.equal(excluded.guessingEligible, false);
  assert.equal(excluded.hidden, false, "manual visibility stays separate from the recording policy");
  assert.equal(excluded.exclusionReason, "Excluded by catalog rules");
  const mixed = admin.songs.find(song => song.id === "weilandbirthday");
  assert.equal(mixed.guessingEligible, true);
  assert.equal(mixed.excludedRows, 1);
  assert.deepEqual(mixed.rows.map(row => [row.trackerVersion, row.guessingEligible]), [["V1", false], ["V2", true]]);
  const hidden = await post("hide", { ids: ["love-drug", "one"], hidden: true });
  assert.equal(hidden.songs.find(song => song.id === "love-drug").hidden, false);
  assert.equal(hidden.songs.find(song => song.id === "one").hidden, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, "hidden-songs.json"))).hidden.map(song => song.id).sort(), ["one", "panic-solo"]);
  await post("activate", { id: "love-drug" }, 404);
  await post("activate", { id: "one" }, 404);
  await post("activate", { id: "weilandbirthday" });
  const cleared = await post("hide", { ids: ["panic-solo"], hidden: false });
  const panic = cleared.songs.find(song => song.id === "panic-solo");
  assert.equal(panic.hidden, false);
  assert.equal(panic.guessingEligible, false, "clearing a duplicate manual hide never restores excluded audio");
  await post("activate", { id: "panic-solo" }, 404);
  await post("hide", { ids: ["weilandbirthday"], hidden: true });
  await post("activate", { id: "weilandbirthday" }, 404);
  await post("hide", { ids: ["weilandbirthday"], hidden: false });
  const playable = await (await fetch(`${url}/api/songs`)).json();
  assert.deepEqual(playable.songs.map(song => song.id), ["weilandbirthday"]);
  assert.equal(playable.songs[0].audioId, "birthday-feature");
  assert.equal(playable.retiredSongs.length, 2);
});

test("live song stream sends the current sequence and authenticated admin changes", async t => {
  const folder = dataFolder(t); config(folder);
  fs.writeFileSync(path.join(folder, "admin.json"), JSON.stringify({ password: "garlic" }));
  fs.writeFileSync(path.join(folder, "songs-cache.json"), JSON.stringify({ updated: 123, eras: [], songs: [{ id: "one", title: "One", mode: "filter" }] }));
  const { url } = await launch(t, folder);
  const response = await fetch(`${url}/api/active-song/events`);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  assert.equal(response.headers.get("content-encoding"), null);
  const reader = response.body.getReader(); t.after(async () => { try { await reader.cancel(); } catch (_) { /* the child server may already be stopped */ } });
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /"seq":0/);
  const epoch = JSON.parse(first.split("data: ")[1]).epoch;
  assert.equal(typeof epoch, "string"); assert.ok(epoch.length > 0);
  const login = await fetch(`${url}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "garlic" }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const selected = await fetch(`${url}/api/admin/activate`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ id: "one" }) });
  assert.equal(selected.status, 200);
  const changed = new TextDecoder().decode((await reader.read()).value);
  assert.match(changed, /"id":"one"/); assert.match(changed, /"seq":1/);
  assert.equal(JSON.parse(changed.split("data: ")[1]).epoch, epoch);
});

test("simultaneous audio-link lookups share work and retry after failures", async () => {
  const script = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const body = script.slice(script.indexOf("async function resolveSource("), script.indexOf("function detectAudioType("));
  let calls = 0, fail = true;
  const context = vm.createContext({ resolvedCache: new Map(), resolvingSources: new Map(), resolveImgur: async () => {
    calls++;
    await new Promise(resolve => setImmediate(resolve));
    if (fail) throw new Error("unavailable");
    return "https://audio.test/found";
  } });
  vm.runInContext(body, context);
  const source = { kind: "imgur", id: "one" };
  const failed = await Promise.allSettled([context.resolveSource({}, source), context.resolveSource({}, source)]);
  assert.equal(calls, 1);
  assert.ok(failed.every(result => result.status === "rejected"));
  fail = false;
  assert.deepEqual(await Promise.all([context.resolveSource({}, source), context.resolveSource({}, source)]), ["https://audio.test/found", "https://audio.test/found"]);
  assert.equal(calls, 2);
  assert.equal(await context.resolveSource({}, source), "https://audio.test/found");
  assert.equal(calls, 2);
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

test("admin song rename keeps formerIds and variant audioIds resolvable", async t => {
  const folder = dataFolder(t);
  config(folder, { dailyAuthority: "" });
  fs.writeFileSync(path.join(folder, "admin.json"), JSON.stringify({ password: "garlic" }));
  fs.writeFileSync(path.join(folder, "songs-cache.json"), JSON.stringify({
    updated: 123,
    eras: [],
    songs: [{
      id: "one",
      title: "One",
      display: "One",
      era: "Alivë",
      mode: "filter",
      formerIds: ["legacy-one"],
      source: { kind: "url", id: "https://audio.test/one" },
      sourceVariants: [{
        label: "Alt",
        mode: "stems",
        audioId: "variant-one",
        stems: { vocals: { kind: "url", id: "https://audio.test/one-vocals" } }
      }]
    }]
  }));
  const { url } = await launch(t, folder);

  const checkAudioVariant = async label => {
    const res = await fetch(`${url}/api/audio/variant-one`);
    const body = await res.json();
    assert.equal(res.status, 404, label);
    assert.match(body.error, /No full audio file is available/, `${label}: variant audioId should remain indexed`);
  };
  const checkFormerIdRound = async label => {
    const res = await fetch(`${url}/api/account/round/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidates: ["legacy-one"], difficulty: "base", pool: "all" })
    });
    const body = await res.json();
    assert.equal(res.status, 200, `${label}: formerId should resolve in SONG_INDEX (${JSON.stringify(body)})`);
    assert.match(body.roundId, /^[a-f0-9]{32}$/);
  };

  await checkAudioVariant("before rename");
  await checkFormerIdRound("before rename");

  const login = await fetch(`${url}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "garlic" })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];

  const rename = await fetch(`${url}/api/admin/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ id: "one", name: "Renamed One" })
  });
  assert.equal(rename.status, 200);

  await checkAudioVariant("after rename");
  await checkFormerIdRound("after rename");
});

test("coverForEra resolves exact, loose/diacritic, and bracketed era names with first-entry precedence", () => {
  const script = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const looseDef = script.slice(script.indexOf("function looseEraKey("), script.indexOf("// RFC 4180 CSV"));
  const coverDef = script.slice(script.indexOf('// "LYFESTYLE [V1]"'), script.indexOf("const SPLITS_FILE"));
  const covers = JSON.parse(fs.readFileSync(path.join(root, "era-covers.json"), "utf8")).covers;

  const makeLookup = map => {
    const context = vm.createContext({ ERA_COVERS: map });
    vm.runInContext(`${looseDef}\n${coverDef}`, context);
    return context.coverForEra;
  };

  const coverForEra = makeLookup({ ...covers, "Blank Era": "" });
  assert.equal(coverForEra("2093"), covers["2093"]);
  assert.equal(coverForEra("Alivë"), covers["Alivë"]);
  assert.equal(coverForEra("Up 2 Më [V3]"), covers["Up 2 Më [V3]"]);

  assert.equal(coverForEra("LYFESTYLE [V1]"), covers["Lyfëstyle [V1]"]);
  assert.equal(coverForEra("Up 2 Me [V3]"), covers["Up 2 Më [V3]"]);
  assert.equal(coverForEra("trëndi"), covers["Trendi"]);
  assert.equal(coverForEra("Hold On"), covers["Hold Ön"]);

  assert.equal(coverForEra("Up 2 Me"), covers["Up 2 Më [V1]"]);
  assert.equal(coverForEra("Up 2 Më"), covers["Up 2 Më [V1]"]);
  assert.equal(coverForEra("Up 2 Më [V2]"), covers["Up 2 Më [V1]"]);
  assert.equal(coverForEra("ADL (Deluxe)"), covers["ADL [V2]"]);
  assert.equal(coverForEra("ADL"), covers["ADL [V2]"]);
  assert.equal(coverForEra("LYFESTYLE"), covers["Lyfëstyle [V1]"]);

  for (const missing of ["", null, undefined, "Blank Era", "Unknown Era", "toString"]) {
    assert.equal(coverForEra(missing), "", String(missing));
  }

  const orderedLookup = makeLookup({
    "Blank [V1]": "",
    "Blank": "https://example.test/blank.jpg",
    "Test [V1]": "https://example.test/v1.jpg",
    "Test [V2]": "https://example.test/v2.jpg",
    "Test [v2]": "https://example.test/v2-dup.jpg"
  });
  assert.equal(orderedLookup("Test"), "https://example.test/v1.jpg");
  assert.equal(orderedLookup("test (deluxe)"), "https://example.test/v1.jpg");
  assert.equal(orderedLookup("Test [v2]"), "https://example.test/v2-dup.jpg");
  assert.equal(orderedLookup("test [v2]"), "https://example.test/v2.jpg");
  assert.equal(orderedLookup("Blank [V1]"), "https://example.test/blank.jpg");
});

test("attachJokes memoizes joke-photos.json by stat stamp and invalidates on edit, malformed JSON, or deletion", t => {
  const folder = dataFolder(t);
  fs.writeFileSync(path.join(folder, "config.json"), JSON.stringify({ port: 0, openBrowser: false, refreshMinutes: 0, tabs: [], dailyAuthority: "" }));
  const file = path.join(root, "server.js");
  const source = fs.readFileSync(file, "utf8");
  const end = source.indexOf("// a dropped connection to a song host");
  const jokesFile = path.join(folder, "joke-photos.json");
  let jokeReads = 0;
  let jokeStats = 0;
  const wrappedFs = {
    ...fs,
    readFileSync(target, ...rest) {
      if (path.resolve(String(target)) === path.resolve(jokesFile)) jokeReads += 1;
      return fs.readFileSync(target, ...rest);
    },
    statSync(target, ...rest) {
      if (path.resolve(String(target)) === path.resolve(jokesFile)) jokeStats += 1;
      return fs.statSync(target, ...rest);
    }
  };
  const { createRequire } = require("node:module");
  const baseRequire = createRequire(file);
  const requireForTest = name => (name === "fs" || name === "node:fs")
    ? wrappedFs
    : (name === "http" || name === "node:http")
      ? { ...baseRequire(name), createServer() { return {}; } }
      : baseRequire(name);
  const context = vm.createContext({
    require: requireForTest,
    __dirname: root,
    module: { exports: {} },
    Buffer,
    URL,
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    process: {
      env: { ...process.env, YEATLE_DATA_DIR: folder, YEATLE_TRACKER_FIXTURES: path.join(__dirname, "fixtures", "tracker"), YEATLE_PORT: "0" },
      platform: process.platform,
      execPath: process.execPath,
      exit(code) { throw new Error(`Server exited ${code}`); }
    }
  });
  vm.runInContext(source.slice(0, end) + "\nmodule.exports = { attachJokes, songListJson, setSongs };", context, { filename: file });
  const { attachJokes, songListJson, setSongs } = context.module.exports;

  const sampleSongs = [
    { id: "id-bell", display: "Bell", title: "Bell" },
    { id: "id-bettr", display: "Bëttr 0ff", title: "Bettr 0ff (Original)" },
    { id: "id-title-only", display: "Shown Alias", title: "Strips" },
    { id: "id-precedence-title-first", display: "Overlap Display", title: "Overlap Display" },
    { id: "id-precedence-id-first", display: "Reverse Overlap", title: "Reverse Overlap" },
    { id: "id-plain", display: "Plain Song", title: "Plain Song" }
  ];

  // Missing joke-photos.json skips readFileSync and returns songs unchanged.
  assert.deepEqual(attachJokes(sampleSongs), sampleSongs);
  assert.equal(jokeReads, 0);

  // Valid joke-photos.json: verify matching, URL encoding, defaults, and array-order precedence.
  const initialJokes = {
    photos: [
      null,
      { song: "", image: "ignored.webp" },
      { song: "missing-image" },
      { song: "id-bell", image: "bell folder/yeat bell.webp", caption: "Dong!", showOnLoss: true },
      { song: "Bettr 0ff", image: "https://example.test/bettr.webp", caption: "Green", showOnLoss: false },
      { song: "$trips", image: "strips.jpg" },
      { song: "Overlap Display", image: "first-by-title.webp", caption: "Title Won First" },
      { song: "id-precedence-title-first", image: "second-by-id.webp", caption: "Should Lose" },
      { song: "id-precedence-id-first", image: "first-by-id.webp", caption: "Id Won First" },
      { song: "Reverse Overlap", image: "second-by-title.webp", caption: "Should Lose" }
    ]
  };
  fs.writeFileSync(jokesFile, JSON.stringify(initialJokes));

  const attached1 = attachJokes(sampleSongs);
  const attached2 = attachJokes(sampleSongs);
  assert.equal(jokeReads, 1, "unchanged joke-photos.json is read once across repeated attachJokes calls");
  assert.deepEqual(attached2, attached1);
  assert.notEqual(
    attached1.find(s => s.id === "id-bell").joke,
    attached2.find(s => s.id === "id-bell").joke,
    "returned joke objects are cloned per song so callers cannot mutate cached entries"
  );

  assert.deepEqual({ ...attached1.find(s => s.id === "id-bell").joke }, {
    image: "Images/jokes/bell%20folder/yeat%20bell.webp",
    caption: "Dong!",
    showOnLoss: true
  });
  assert.deepEqual({ ...attached1.find(s => s.id === "id-bettr").joke }, {
    image: "https://example.test/bettr.webp",
    caption: "Green",
    showOnLoss: false
  });
  assert.deepEqual({ ...attached1.find(s => s.id === "id-title-only").joke }, {
    image: "Images/jokes/strips.jpg",
    caption: "",
    showOnLoss: false
  });
  assert.equal(attached1.find(s => s.id === "id-precedence-title-first").joke.caption, "Title Won First");
  assert.equal(attached1.find(s => s.id === "id-precedence-id-first").joke.caption, "Id Won First");
  assert.equal("joke" in attached1.find(s => s.id === "id-plain"), false);

  // songListJson() stats joke-photos.json once per call and reuses the memoized jokes index.
  const statsBeforeSongList = jokeStats;
  setSongs([{ id: "id-bell", title: "Bell", display: "Bell", era: "2093", tab: "Released", mode: "filter", source: { kind: "url", url: "https://example.test/1.mp3" } }], "test");
  const list1 = JSON.parse(songListJson());
  assert.equal(list1.songs.length, 1);
  assert.equal(list1.songs[0].joke.caption, "Dong!");
  assert.equal(jokeStats - statsBeforeSongList, 1, "songListJson stats joke-photos.json only once per call");
  assert.equal(jokeReads, 1, "songListJson rebuild reuses already-memoized jokes index");

  // Rebuilding the catalog still reuses jokesCache without re-reading joke-photos.json.
  setSongs([
    { id: "id-bell", title: "Bell", display: "Bell", era: "2093", tab: "Released", mode: "filter", source: { kind: "url", url: "https://example.test/1.mp3" } },
    { id: "id-plain", title: "Plain Song", display: "Plain Song", era: "2093", tab: "Released", mode: "filter", source: { kind: "url", url: "https://example.test/2.mp3" } }
  ], "test");
  const statsBeforeRebuild = jokeStats;
  const list2 = JSON.parse(songListJson());
  assert.equal(list2.songs.length, 2);
  assert.equal(jokeStats - statsBeforeRebuild, 1);
  assert.equal(jokeReads, 1);

  // Editing joke-photos.json invalidates immediately on the next call.
  fs.writeFileSync(jokesFile, JSON.stringify({
    photos: [{ song: "id-plain", image: "updated.png", caption: "Updated Now!", showOnLoss: true }]
  }));
  const updated = attachJokes(sampleSongs);
  assert.equal(jokeReads, 2);
  assert.equal("joke" in updated.find(s => s.id === "id-bell"), false);
  assert.deepEqual({ ...updated.find(s => s.id === "id-plain").joke }, {
    image: "Images/jokes/updated.png",
    caption: "Updated Now!",
    showOnLoss: true
  });

  // Malformed JSON falls back cleanly without throwing and caches for the same stat stamp.
  fs.writeFileSync(jokesFile, "{not valid json!!!");
  const malformed1 = attachJokes(sampleSongs);
  const malformed2 = attachJokes(sampleSongs);
  assert.equal(jokeReads, 3);
  assert.deepEqual(malformed1, sampleSongs);
  assert.deepEqual(malformed2, sampleSongs);

  // Deleting joke-photos.json immediately drops joke attachments without calling readFileSync.
  fs.unlinkSync(jokesFile);
  const afterDelete = attachJokes(sampleSongs);
  assert.equal(jokeReads, 3, "deleted joke-photos.json does not call readFileSync");
  assert.deepEqual(afterDelete, sampleSongs);
});

test("serveModel and separatorRevision reuse pre-fetched stat while preserving headers and digest behavior", async t => {
  const folder = dataFolder(t);
  config(folder, { dailyAuthority: "" });
  const crypto = require("node:crypto");
  const { Writable } = require("node:stream");
  const { createRequire } = require("node:module");
  const drumsFile = path.join(folder, "models", "drums.fp16.onnx");
  const drumsBytes = Buffer.alloc(1000003, 7);
  fs.writeFileSync(drumsFile, drumsBytes);
  const expectedDrumsHash = crypto.createHash("sha256").update(drumsBytes).digest("hex");

  const file = path.join(root, "server.js");
  const source = fs.readFileSync(file, "utf8");
  const end = source.indexOf("// a dropped connection to a song host");
  const statCalls = new Map();
  let handler;
  const wrappedFs = {
    ...fs,
    statSync(target, ...rest) {
      const resolved = path.resolve(String(target));
      if (resolved.endsWith(".fp16.onnx")) statCalls.set(resolved, (statCalls.get(resolved) || 0) + 1);
      return fs.statSync(target, ...rest);
    }
  };
  const baseRequire = createRequire(file);
  const requireForTest = name => (name === "fs" || name === "node:fs")
    ? wrappedFs
    : (name === "http" || name === "node:http")
      ? { ...baseRequire(name), createServer(cb) { handler = cb; return { listen() {}, close() {} }; } }
      : baseRequire(name);

  const context = vm.createContext({
    require: requireForTest,
    __dirname: root,
    module: { exports: {} },
    Buffer,
    URL,
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    process: {
      env: { ...process.env, YEATLE_DATA_DIR: folder, YEATLE_TRACKER_FIXTURES: path.join(__dirname, "fixtures", "tracker"), YEATLE_PORT: "0" },
      platform: process.platform,
      execPath: process.execPath,
      exit(code) { throw new Error(`Server exited ${code}`); }
    }
  });
  vm.runInContext(source.slice(0, end) + "\nmodule.exports = { modelDigest, separatorRevision };", context, { filename: file });
  const { modelDigest, separatorRevision } = context.module.exports;

  const request = async (url, method = "GET", headers = {}) => {
    const chunks = [];
    const result = { headers: {}, status: 200 };
    const res = new Writable({ write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); } });
    res.setHeader = (key, value) => { result.headers[key.toLowerCase()] = value; };
    res.writeHead = (status, values = {}) => {
      result.status = status;
      res.headersSent = true;
      for (const [k, v] of Object.entries(values)) res.setHeader(k, v);
      return res;
    };
    const done = new Promise((resolve, reject) => { res.once("finish", resolve); res.once("error", reject); });
    await handler({ url, method, headers }, res);
    await done;
    return { ...result, body: Buffer.concat(chunks) };
  };

  statCalls.clear();
  const head = await request("/models/drums.fp16.onnx", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.headers["cross-origin-opener-policy"], "same-origin");
  assert.equal(head.headers["cross-origin-embedder-policy"], "credentialless");
  assert.equal(head.headers["cache-control"], "no-cache");
  assert.equal(head.headers["content-type"], "application/octet-stream");
  assert.equal(head.headers["content-length"], drumsBytes.length);
  assert.equal(head.headers["x-yeatle-model-hash"], expectedDrumsHash);
  assert.ok(head.headers.etag);
  assert.equal(head.body.length, 0);
  assert.equal(statCalls.get(path.resolve(drumsFile)), 2, "serveModel should not add a duplicate statSync inside modelDigest");

  const get = await request("/models/drums.fp16.onnx", "GET");
  assert.equal(get.status, 200);
  assert.equal(get.headers["x-yeatle-model-hash"], expectedDrumsHash);
  assert.equal(get.headers.etag, head.headers.etag);
  assert.equal(get.headers["content-length"], drumsBytes.length);
  assert.equal(Buffer.compare(get.body, drumsBytes), 0);

  const notModified = await request("/models/drums.fp16.onnx", "GET", { "if-none-match": head.headers.etag });
  assert.equal(notModified.status, 304);
  assert.equal(notModified.headers["x-yeatle-model-hash"], expectedDrumsHash);
  assert.equal(notModified.body.length, 0);

  const missingStem = await request("/models/unknown.fp16.onnx", "GET");
  assert.equal(missingStem.status, 404);

  statCalls.clear();
  const rev = await separatorRevision();
  assert.match(rev, new RegExp(`^drums:${expectedDrumsHash}\\|bass:[a-f0-9]{64}\\|other:[a-f0-9]{64}\\|vocals:[a-f0-9]{64}$`));
  for (const stem of ["drums", "bass", "other", "vocals"]) {
    assert.equal(statCalls.get(path.resolve(folder, "models", `${stem}.fp16.onnx`)), 1, `separatorRevision should stat ${stem} once`);
  }

  // Standalone modelDigest(stem) without a pre-fetched stat still stats once and returns the digest.
  statCalls.clear();
  assert.equal(await modelDigest("drums"), expectedDrumsHash);
  assert.equal(statCalls.get(path.resolve(drumsFile)), 1);
});

test("admin activate, hide, and rename resolve canonical songs via SONG_INDEX without matching formerIds or variant audioIds", async t => {
  const folder = dataFolder(t);
  config(folder, { dailyAuthority: "", liveControl: true });
  fs.writeFileSync(path.join(folder, "admin.json"), JSON.stringify({ password: "garlic" }));
  fs.writeFileSync(path.join(folder, "songs-cache.json"), JSON.stringify({
    updated: 123,
    eras: [],
    songs: [{
      id: "song-one",
      title: "Song One",
      display: "Song One",
      era: "Alivë",
      tab: "Released",
      mode: "filter",
      formerIds: ["legacy-one"],
      source: { kind: "url", id: "https://audio.test/one" },
      sourceVariants: [{
        label: "Alt",
        mode: "stems",
        audioId: "variant-one",
        stems: { vocals: { kind: "url", id: "https://audio.test/one-vocals" } }
      }]
    }]
  }));
  const { url } = await launch(t, folder);

  const login = await fetch(`${url}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "garlic" })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const postJson = (endpoint, payload) => fetch(`${url}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(payload)
  });

  // formerIds, variant audioIds, and unknown IDs must not match in SONG_INDEX for admin mutations.
  for (const badId of ["legacy-one", "variant-one", "missing-id"]) {
    const actBad = await postJson("/api/admin/activate", { id: badId });
    assert.equal(actBad.status, 404, `activate should reject ${badId}`);
    const renameBad = await postJson("/api/admin/rename", { id: badId, name: "Nope" });
    assert.equal(renameBad.status, 404, `rename should reject ${badId}`);
  }
  const hideBad = await postJson("/api/admin/hide", { ids: ["legacy-one", "variant-one", "missing-id"], hidden: true });
  assert.equal(hideBad.status, 200);
  const hideBadBody = await hideBad.json();
  assert.equal(hideBadBody.songs[0].hidden, false);
  assert.equal(hideBadBody.stale.length, 0);

  // Canonical ID activates cleanly.
  const act1 = await postJson("/api/admin/activate", { id: "song-one" });
  assert.equal(act1.status, 200);
  assert.deepEqual(await act1.json(), { ok: true, seq: 1 });

  // Rename rebuilds SONG_INDEX; activate and hide still resolve the updated song.
  const renameRes = await postJson("/api/admin/rename", { id: "song-one", name: "Renamed Song One" });
  assert.equal(renameRes.status, 200);
  const renameBody = await renameRes.json();
  assert.equal(renameBody.songs[0].display, "Renamed Song One");

  const act2 = await postJson("/api/admin/activate", { id: "song-one" });
  assert.equal(act2.status, 200);
  assert.deepEqual(await act2.json(), { ok: true, seq: 2 });

  // Hide prevents activate (404), and unhide restores it (200).
  const hideRes = await postJson("/api/admin/hide", { ids: ["song-one"], hidden: true });
  assert.equal(hideRes.status, 200);
  assert.equal((await hideRes.json()).songs[0].hidden, true);
  assert.equal((await postJson("/api/admin/activate", { id: "song-one" })).status, 404);

  const unhideRes = await postJson("/api/admin/hide", { ids: ["song-one"], hidden: false });
  assert.equal(unhideRes.status, 200);
  assert.equal((await unhideRes.json()).songs[0].hidden, false);
  const act3 = await postJson("/api/admin/activate", { id: "song-one" });
  assert.equal(act3.status, 200);
  assert.deepEqual(await act3.json(), { ok: true, seq: 3 });
});

test("malformed request URLs, null-byte paths, invalid audio IDs, and bad admin JSON return 400 instead of 500 or hanging", async t => {
  const net = require("node:net");
  const folder = dataFolder(t);
  config(folder, { dailyAuthority: "", liveControl: true });
  fs.writeFileSync(path.join(folder, "admin.json"), JSON.stringify({ password: "garlic" }));
  const { url } = await launch(t, folder);
  const { port } = new URL(url);

  // NUL bytes in static/stems URLs must return 400 rather than throwing ERR_INVALID_ARG_VALUE (500).
  for (const badPath of ["/%00", "/Songs/%00/drums.mp3"]) {
    const res = await fetch(`${url}${badPath}`);
    assert.equal(res.status, 400, badPath);
  }

  // Malformed percent encoding in /api/audio/:id must return 400 rather than throwing URIError (500).
  const badAudio = await fetch(`${url}/api/audio/%E0%A4%A`);
  assert.equal(badAudio.status, 400);

  // Invalid JSON or non-object JSON in admin endpoints must return 400 instead of crashing with 500.
  for (const body of ["{broken", "null", "[]"]) {
    const res = await fetch(`${url}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    });
    assert.equal(res.status, 400, `admin login body ${body}`);
  }

  // Invalid WHATWG URL request-targets passed by http parser must get a 400 response instead of hanging.
  const rawResponse = await new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: "127.0.0.1", port }, () => {
      sock.write("GET http://bad:99999/ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
    });
    let data = "";
    const timer = setTimeout(() => { sock.destroy(); reject(new Error(`Timed out waiting for 400 response; got: ${data}`)); }, 2000);
    sock.setEncoding("utf8");
    sock.on("data", chunk => { data += chunk; });
    sock.on("end", () => { clearTimeout(timer); resolve(data); });
    sock.on("error", err => { clearTimeout(timer); reject(err); });
  });
  assert.match(rawResponse, /^HTTP\/1\.1 400 /);
});
