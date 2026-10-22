const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const runtime = require("./fixtures/catalog-runtime.cjs");
const { isGuessingEligible } = require("../catalog-policy.cjs");
const root = path.resolve(__dirname, "..");
const sourceKey = song => `${song.source.kind}:${song.source.id}`;

async function setup(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-exclusions-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  fs.writeFileSync(path.join(folder, "config.json"), JSON.stringify({ tabs: [], port: 0, openBrowser: false, refreshMinutes: 0, dailyAuthority: "" }));
  const catalog = runtime(folder);
  const load = async name => {
    const reader = runtime(folder, path.join(__dirname, "fixtures/non-yeat-tracker", name));
    return [...await reader.loadTab({ name: "Released", gid: "1617341558" }), ...await reader.loadTab({ name: "Unreleased", gid: "1241081326" })];
  };
  return { folder, catalog, excluded: await load("excluded"), retained: await load("retained") };
}

test("all 60 requested tracker rows stay excluded even if currently unavailable recordings become playable", async t => {
  const { catalog, excluded } = await setup(t);
  assert.equal(excluded.length, 60);
  for (const row of excluded) {
    // Fresh audio hosts must not bypass the version policy. Unversioned ???
    // records remain scoped to their Firemane / Houston, Texas aliases.
    for (const source of [row.source, { kind: "pillows", id: "f".repeat(32) }]) {
      catalog.setSongs(catalog.buildSongList([{ ...row, source }], []), "test");
      const list = JSON.parse(catalog.songListJson());
      assert.equal(list.songs.length, 0, `${row.tab}: ${row.title} ${row.trackerVersion}`);
      assert.equal(list.retiredSongs.length, 1);
      assert.equal(sourceKey(catalog.index().get(list.retiredSongs[0].id)), sourceKey({ source }));
    }
  }
  for (const [title, aliases] of [["Summrs - ???", ["Houston"]], ["Summrs - ???", ["Different song"]], ["Izaya Tiji - ???", ["Different song"]]]) {
    catalog.setSongs(catalog.buildSongList([{ ...excluded[0], title, aliases, tab: "Unreleased", trackerVersion: "", source: { kind: "pillows", id: "0".repeat(32) } }], []), "test");
    assert.equal(JSON.parse(catalog.songListJson()).songs.length, 1, "unrelated untitled recordings are not excluded");
  }
  for (const [title, trackerVersion] of [["Lil Uzi Vert - Hehe", "V2"], ["Drake - 2 Many Freaks", "V3"]]) {
    catalog.setSongs(catalog.buildSongList([{ ...excluded[0], title, aliases: [], tab: "Unreleased", trackerVersion, source: { kind: "pillows", id: "0".repeat(32) } }], []), "test");
    assert.equal(JSON.parse(catalog.songListJson()).songs.length, 0, "an individual version within an excluded range remains excluded");
  }
});

test("mixed titles retain Yeat versions and never project an excluded recording into any playable pool", async t => {
  const { catalog, excluded, retained } = await setup(t);
  assert.equal(retained.length, 27);
  const blocked = new Set(excluded.map(sourceKey));
  catalog.setSongs(catalog.buildSongList([...excluded, ...retained], []), "test");
  const list = JSON.parse(catalog.songListJson());
  const sources = [...catalog.index().values()].flatMap(song => song.sourceVariants || [song]);
  for (const row of retained) assert.ok(sources.some(song => sourceKey(song) === sourceKey(row) && isGuessingEligible(song)), row.title);
  const { songsForPool } = await import(pathToFileURL(path.join(root, "build/assets/song-pools.mjs")));
  for (const pool of ["all", "released", "unreleased", "stems"]) {
    const songs = songsForPool([...list.songs, ...list.retiredSongs], pool);
    for (const song of songs) {
      const selected = catalog.index().get(song.audioId || song.id);
      assert.equal(blocked.has(sourceKey(selected)), false, `${pool}: ${song.display}`);
    }
  }
  for (const id of ["weilandbirthday", "kencarsonpullup", "summrsdopesickk", "kankannotdasame"]) {
    const song = catalog.index().get(id);
    assert.equal(song.trackerVersion, "V2");
    assert.match(song.display, /feat\. Yeat/i);
  }
  assert.equal(catalog.index().get("izayatijicopmystyle").trackerVersion, "V1");
  assert.equal(catalog.index().get("youngstonerlifeandyoungthugeaters").trackerVersion, "V1");
  assert.equal(catalog.index().get("youngstonerlifeandyoungthugeaters").poolVariants.released.trackerVersion, "V1");
  assert.equal(list.songs.find(song => song.id === "weilandhaveyouever").poolVariants.released, undefined);
  const { validateCatalog } = require("../desktop/stem-downloads.cjs");
  const files = ["drums", "bass", "other", "vocals"].map(stem => ({ name: `${stem}.mp3`, size: 20000, sha256: "a".repeat(64) }));
  assert.equal(validateCatalog({ songs: list.retiredSongs.map(song => ({ ...song, folder: song.id, files })) }).songs.length, 0);
});

test("legacy cached demos switch to full eligible audio while original audio ids and saved practice rounds remain restorable", async t => {
  const { catalog, excluded, retained } = await setup(t);
  const ids = ["kankannotdasame", "weilandbirthday", "kencarsonpullup", "summrsdopesickk", "youngstonerlifeandyoungthugeaters"];
  const songs = catalog.buildSongList([...excluded, ...retained], []);
  const cached = ids.map(id => {
    const song = songs.find(song => song.id === id);
    const variants = song.sourceVariants.map(({ trackerVersion, guessingEligible, ...variant }) => ({ ...variant, guessingEligible: true }));
    const bad = variants.find(variant => excluded.some(row => sourceKey(row) === sourceKey(variant)));
    const apple = { ...variants.find(variant => !excluded.some(row => sourceKey(row) === sourceKey(variant))), source: { kind: "apple", id: "12345" }, audioId: `${id}@preview`, tab: "Released" };
    return { ...song, ...bad, sourceVariants: [apple, ...variants], poolVariants: { [bad.tab.toLowerCase()]: bad } };
  });
  const saved = { songId: cached[0].id, song: { ...cached[0] }, clipAt: 7.125, attempts: [{ kind: "skip" }] };
  catalog.setSongs(cached, "cache");
  for (const old of cached) {
    const song = catalog.index().get(old.id);
    assert.equal(song.source.kind, "pillows", "a full eligible recording still outranks a streaming preview");
    assert.notEqual(sourceKey(song), sourceKey(old));
    assert.equal(sourceKey(catalog.index().get(old.audioId)), sourceKey(old));
    assert.equal(isGuessingEligible(catalog.index().get(old.audioId)), false);
  }
  const { restorePracticeSong } = await import(pathToFileURL(path.join(root, "build/assets/song-pools.mjs")));
  const list = JSON.parse(catalog.songListJson());
  assert.equal(restorePracticeSong(saved, list.songs).audioId, saved.song.audioId);
  assert.deepEqual(saved.attempts, [{ kind: "skip" }]);
  assert.equal(saved.clipAt, 7.125);
});

test("an installed excluded recording cannot enter the stems pool, and a pinned Daily keeps its original audio and clip", async t => {
  const { folder, catalog, excluded } = await setup(t);
  const row = excluded.find(row => row.title === "Weiland - Love Drug");
  const pack = { folder: "Love Drug", title: "Love Drug", features: [], producers: [], aliases: [], info: {} };
  const [song] = catalog.buildSongList([row], [pack]);
  catalog.setSongs([song], "test");
  const list = JSON.parse(catalog.songListJson());
  assert.equal(list.songs.length, 0);
  assert.equal(list.retiredSongs[0].mode, "stems");
  assert.deepEqual({ ...catalog.index().get(song.id).fallback }, { ...row.source });
  const date = new Date().toISOString().slice(0, 10);
  const pinned = { id: `v1:${date}:${song.id}`, song, seed: 23, clipAt: 7.125 };
  const original = JSON.stringify({ [date]: pinned });
  fs.writeFileSync(path.join(folder, "daily-challenges.json"), original);
  const restarted = runtime(folder);
  restarted.setSongs([song], "cache");
  const daily = JSON.parse((await restarted.request("/api/daily")).body);
  assert.equal(daily.id, pinned.id);
  assert.equal(daily.song.id, song.id);
  assert.equal(daily.clipAt, 7.125);
  assert.equal(fs.readFileSync(path.join(folder, "daily-challenges.json"), "utf8"), original);
});
