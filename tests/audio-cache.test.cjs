const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { createAudioCache } = require("../audio-cache.cjs");

const AUDIO = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(997, 7)]);

function cacheDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-audio-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "audio-cache");
}

function hostResponse(bytes, { status = 200, headers = {} } = {}) {
  const stream = Readable.from([bytes]);
  stream.statusCode = status;
  stream.headers = { "content-type": "audio/mpeg", "content-length": String(bytes.length), ...headers };
  return stream;
}

async function serving(t, cache, key) {
  const server = http.createServer(async (req, res) => {
    const entry = cache.lookup(key);
    if (!entry || !await cache.serve(req, res, entry)) { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}/`;
}

test("a cached song answers full, partial, suffix and impossible byte ranges", async t => {
  const cache = createAudioCache({ dir: cacheDir(t) });
  await cache.fill("song", async () => hostResponse(AUDIO));
  const url = await serving(t, cache, "song");

  const full = await fetch(url);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("accept-ranges"), "bytes");
  assert.equal(full.headers.get("cache-control"), "private, max-age=3600");
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), AUDIO);

  const part = await fetch(url, { headers: { Range: "bytes=10-19" } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), "bytes 10-19/1000");
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), AUDIO.subarray(10, 20));

  const open = await fetch(url, { headers: { Range: "bytes=990-" } });
  assert.equal(open.headers.get("content-range"), "bytes 990-999/1000");
  const suffix = await fetch(url, { headers: { Range: "bytes=-5" } });
  assert.equal(suffix.headers.get("content-range"), "bytes 995-999/1000");
  await Promise.all([open.arrayBuffer(), suffix.arrayBuffer()]);

  const beyond = await fetch(url, { headers: { Range: "bytes=1000-" } });
  assert.equal(beyond.status, 416);
  assert.equal(beyond.headers.get("content-range"), "bytes */1000");

  const head = await fetch(url, { method: "HEAD" });
  assert.equal(head.headers.get("content-length"), "1000");
  assert.equal(await head.text(), "");
});

test("simultaneous plays download a song once", async t => {
  const cache = createAudioCache({ dir: cacheDir(t) });
  let opened = 0;
  const open = async () => { opened++; return hostResponse(AUDIO); };
  await Promise.all([cache.fill("song", open), cache.fill("song", open), cache.fill("song", open)]);
  assert.equal(opened, 1);
  await cache.fill("song", open);
  assert.equal(opened, 1, "a kept song isn't fetched again");
});

test("failed, truncated and web-page answers are never kept, and aren't retried at once", async t => {
  let clock = 1000;
  const cache = createAudioCache({ dir: cacheDir(t), now: () => clock, retryMs: 500 });
  const answers = {
    missing: hostResponse(AUDIO, { status: 404 }),
    page: hostResponse(AUDIO, { headers: { "content-type": "text/html" } }),
    short: hostResponse(AUDIO, { headers: { "content-length": "5000" } })
  };
  for (const [key, answer] of Object.entries(answers)) {
    await cache.fill(key, async () => answer);
    assert.equal(cache.lookup(key), null, key);
  }
  assert.equal(cache.size, 0);
  let opened = 0;
  const open = async () => { opened++; return hostResponse(AUDIO); };
  await cache.fill("missing", open);
  assert.equal(opened, 0, "a failed song waits before trying again");
  clock += 501;
  await cache.fill("missing", open);
  assert.equal(opened, 1);
  assert.ok(cache.lookup("missing"));
});

test("the cache stays inside its limits and drops the song unused longest", async t => {
  let clock = 1000;
  const cache = createAudioCache({ dir: cacheDir(t), maxBytes: 2500, maxFileBytes: 1500, ttlMs: 5000, now: () => clock });
  for (const key of ["a", "b"]) await cache.fill(key, async () => hostResponse(AUDIO));
  assert.ok(cache.lookup("a"), "a is now the most recently used");
  await cache.fill("c", async () => hostResponse(AUDIO));
  assert.equal(cache.retainedBytes, 2000);
  assert.equal(cache.lookup("b"), null);
  assert.ok(cache.lookup("a") && cache.lookup("c"));

  await cache.fill("huge", async () => hostResponse(Buffer.alloc(2000)));
  assert.equal(cache.lookup("huge"), null, "a file over the size limit isn't kept");

  clock += 5001;
  assert.equal(cache.lookup("a"), null, "copies expire");
});

test("a copy deleted from disk falls back to the song host", async t => {
  const dir = cacheDir(t);
  const cache = createAudioCache({ dir });
  await cache.fill("song", async () => hostResponse(AUDIO));
  const entry = cache.lookup("song");
  fs.rmSync(entry.file);
  assert.equal(await cache.serve({ headers: {}, method: "GET" }, {}, entry), false);
  assert.equal(cache.lookup("song"), null);
  assert.equal(cache.retainedBytes, 0);
});
