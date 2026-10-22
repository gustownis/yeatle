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

test("broken stems and directory symlinks do not turn incomplete folders into HQ songs", { skip: process.platform === "win32" }, async t => {
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
