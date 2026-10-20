const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const runtime = require("./fixtures/catalog-runtime.cjs");
const { creditFor, isGuessingEligible } = require("../catalog-policy.cjs");
const { validateCatalog } = require("../desktop/stem-downloads.cjs");
const root = path.join(__dirname, "..");
const plain = value => JSON.parse(JSON.stringify(value));

function setup(t, files = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-policy-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  fs.writeFileSync(path.join(folder, "config.json"), JSON.stringify({ port: 0, openBrowser: false, refreshMinutes: 0, tabs: [], dailyAuthority: "" }));
  for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(folder, name), JSON.stringify(data));
  return { folder, catalog: runtime(folder) };
}

test("vocal features remain eligible and producer-only credits never enter a normal pool", async () => {
  const { inSongPool } = await import(pathToFileURL(path.join(root, "build/assets/song-pools.mjs")));
  for (const song of [
    { title: "Kankan - AMG C63", features: [], type: "Production" },
    { title: "Different artist - Different title", features: [], type: "Production" }
  ]) {
    const entry = { ...song, ...creditFor(song), mode: "stems", folder: "installed", tab: "Released" };
    assert.equal(entry.artistRole, "producer-only");
    for (const pool of ["all", "released", "unreleased", "stems"]) assert.equal(inSongPool(entry, pool), false);
  }
  const feature = { title: "Other artist - Song", features: ["feat. Yeat"], type: "Feature" };
  assert.deepEqual(creditFor(feature), { artist: "Other artist", artistRole: "featured", guessingEligible: true });
  assert.equal(isGuessingEligible(feature), true);
  assert.equal(isGuessingEligible({ title: "Missing credits" }), true);
  assert.equal(creditFor({ title: "Missing credits" }).artistRole, "unknown");
});

test("retired producer-only records remain available only for existing rounds", t => {
  const { catalog } = setup(t);
  const song = { id: "production", title: "Other artist - Production", features: [], keys: ["production"], tab: "Released", type: "Production", mode: "filter", source: { kind: "pillows", id: "unchanged" } };
  catalog.setSongs([song], "test");
  const list = JSON.parse(catalog.songListJson());
  assert.equal(list.songs.length, 0);
  assert.equal(list.retiredSongs[0].id, "production");
  assert.equal(list.retiredSongs[0].guessingEligible, false);
  assert.equal(catalog.index().get("production").source.id, "unchanged");
});

test("the real tracker parser retains features and credits before applying selection eligibility", async t => {
  const { folder } = setup(t);
  const fixtures = path.join(folder, "tracker");
  fs.mkdirSync(fixtures);
  fs.writeFileSync(path.join(fixtures, "123.csv"), `Name,Type,Link(s),Rec. Era,Track Length\nOther artist - Vocal song (feat. Yeat),Feature,https://pillows.su/f/${"a".repeat(32)},4L,2:00\nOther artist - Instrumental,Production,https://pillows.su/f/${"b".repeat(32)},4L,2:00\n`);
  const catalog = runtime(folder, fixtures);
  const rows = await catalog.loadTab({ name: "Released", gid: "123" });
  assert.equal(rows.length, 2, "neither record is discarded by parsing");
  catalog.setSongs(catalog.buildSongList(rows, []), "test");
  const list = JSON.parse(catalog.songListJson());
  assert.equal(list.songs.length, 1);
  assert.equal(list.songs[0].artistRole, "featured");
  assert.equal(list.retiredSongs.length, 1);
  assert.equal(list.retiredSongs[0].artistRole, "producer-only");
});

test("an installed pack cannot erase the matched track's production-only credit", t => {
  const { catalog } = setup(t);
  const rows = [{ title: "Other artist - Instrumental", features: [], producers: ["Yeat"], aliases: [], era: "4L", tab: "Released", type: "Production", source: { kind: "pillows", id: "original" } },
    { title: "Other artist - Instrumental", features: [], producers: ["Yeat"], aliases: [], era: "4L", tab: "Unreleased", type: "OG File", source: { kind: "pillows", id: "original" } }];
  const songs = catalog.buildSongList(rows, [{ folder: "Instrumental", title: "Instrumental", features: [], producers: [], aliases: [], info: { album: "4L" } }]);
  catalog.setSongs(songs, "test");
  const list = JSON.parse(catalog.songListJson());
  assert.equal(list.songs.length, 0);
  assert.equal(list.retiredSongs.length, 1);
  assert.equal(list.retiredSongs[0].mode, "stems");
  assert.equal(catalog.index().get(list.retiredSongs[0].id).folder, "Instrumental");
});

test("eligibility corrections preserve a pinned Daily song, audio route and clip across a restart", async t => {
  const date = new Date().toISOString().slice(0, 10);
  const song = { id: "pinned-production", title: "Pinned production", features: [], keys: ["pinnedproduction"], source: { kind: "pillows", id: "original-audio" }, mode: "filter", type: "Production", tab: "Released" };
  const saved = { [date]: { id: `v1:${date}:${song.id}`, song, seed: 23, clipAt: 7.125 } };
  const { catalog, folder } = setup(t, { "daily-challenges.json": saved,
    "config.json": { tabs: [], port: 0, openBrowser: false, refreshMinutes: 0, dailyAuthority: "", dailyPublicUrl: "https://example.test/daily.html?campaign=1#result" } });
  catalog.setSongs([song], "test");
  const first = JSON.parse((await catalog.request("/api/daily")).body);
  assert.equal(first.id, saved[date].id);
  assert.equal(first.clipAt, 7.125);
  assert.equal(first.song.id, song.id);
  assert.equal(first.shareUrl, "https://example.test/daily?campaign=1#result");
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder, "config.json"))).dailyPublicUrl, "https://example.test/daily.html?campaign=1#result", "canonical response leaves other host settings and the saved file intact");
  const restarted = runtime(folder);
  restarted.setSongs([{ ...song, id: "different", title: "Different" }], "test");
  const second = JSON.parse((await restarted.request("/api/daily")).body);
  assert.deepEqual([second.id, second.clipAt, second.audio, second.resetsAt], [first.id, first.clipAt, first.audio, first.resetsAt]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder, "daily-challenges.json"), "utf8"))[date].song.source.id, "original-audio");
});

test("the download catalog preserves credits and release status and excludes producer-only entries", () => {
  const files = ["drums", "bass", "other", "vocals"].map(stem => ({ name: `${stem}.mp3`, size: 20000, sha256: "a".repeat(64) }));
  const result = validateCatalog({ songs: [
    { id: "feature", folder: "Feature", display: "Other artist - Feature", title: "Feature", artist: "Other artist", artistRole: "featured", tab: "Unreleased", files },
    { id: "production", folder: "Production", artistRole: "producer-only", files },
    { id: "solo", folder: "Solo", artistRole: "non-vocal", files }
  ] });
  assert.equal(result.songs.length, 1);
  assert.equal(result.songs[0].artist, "Other artist");
  assert.equal(result.songs[0].artistRole, "featured");
  assert.equal(result.songs[0].tab, "Unreleased");
  assert.equal(result.skipped, 2);
});

test("a merged title preserves source-specific pools, metadata, stems and stable audio mappings", async t => {
  const { catalog } = setup(t);
  const released = await catalog.loadTab({ name: "Released", gid: "1617341558" });
  const unreleased = await catalog.loadTab({ name: "Unreleased", gid: "1241081326" });
  const songs = catalog.buildSongList([...released, ...unreleased], []);
  const coste = songs.find(song => song.id === "thecostes");
  assert.ok(coste, "the 1.11.3 canonical id is retained");
  assert.equal(coste.poolVariants.released.tab, "Released");
  assert.equal(coste.poolVariants.unreleased.tab, "Unreleased");
  assert.equal(coste.poolVariants.released.source.kind, "apple");
  assert.equal(coste.poolVariants.unreleased.source.kind, "pillows");
  assert.notEqual(coste.poolVariants.released.audioId, coste.poolVariants.unreleased.audioId);
  assert.equal(coste.audioId, coste.poolVariants.unreleased.audioId, "All songs shares the cache identity of the actual selected source");
  assert.equal(coste.sourceVariants.length, 3, "both leaks and the release keep their individual source metadata");
  catalog.setSongs(songs, "test");
  for (const variant of coste.sourceVariants) assert.equal(catalog.index().get(variant.audioId).source.id, variant.source.id);
  const { songsForPool } = await import(pathToFileURL(path.join(root, "build/assets/song-pools.mjs")));
  const releasedPool = songsForPool([plain(catalog.publicSong(coste))], "released");
  assert.equal(releasedPool[0].id, "thecostes");
  assert.equal(releasedPool[0].era, "LYFESTYLE");
  assert.equal(releasedPool[0].audioId, coste.poolVariants.released.audioId);
  assert.equal(JSON.stringify(catalog.publicSong(coste)).includes('"source"'), false, "private source hosts are stripped from every public variant");

  const withStems = catalog.buildSongList([...released, ...unreleased], [{ folder: "THE COSTËS", title: "THE COSTËS", features: [], producers: [], aliases: [], info: {} }]);
  const installed = withStems.find(song => song.id === "thecostes");
  assert.equal(installed.poolVariants.stems.folder, "THE COSTËS");
  assert.equal(installed.audioId, installed.poolVariants.stems.audioId);
  assert.equal(installed.poolVariants.released.mode, "stems");
  assert.equal(installed.poolVariants.unreleased.mode, "filter", "installed released stems never make a leaked source eligible as released");
});

test("an old mixed-source cache keeps its audio while awaiting verified filter provenance", t => {
  const { catalog } = setup(t);
  const source = { kind: "pillows", id: "saved-audio" };
  const [song] = catalog.upgradeCachedSongs({ format: 2, songs: [{ id: "old", title: "Old", tab: "Released", source, mode: "filter", mergedFrom: [{ tab: "Released" }, { tab: "Unreleased" }] }] });
  assert.equal(song.id, "old");
  assert.equal(song.source.id, "saved-audio");
  assert.equal(song.tab, "Unknown");
  assert.deepEqual(plain(song.poolVariants), {});
});

test("Now LS metadata is corrected without changing ids, audio or the released Now", async t => {
  const { catalog } = setup(t);
  const released = { id: "now", title: "Now", display: "Now (feat. LUH GEEKY)", keys: ["now"], features: ["feat. LUH GEEKY"], era: "AftërLyfe", eraYear: 2023, tab: "Released", mode: "filter", source: { kind: "pillows", id: "released" } };
  const stems = { id: "nowls", title: "Now LS", display: "Now LS", keys: ["nowls"], features: [], era: "", eraYear: null, tab: "Released", mode: "stems", folder: "Now LS", source: { kind: "stems", folder: "Now LS" } };
  const leak = { id: "now@lyfestyle", title: "Now", display: "Now", keys: ["now"], features: [], era: "LYFESTYLE [V2]", eraYear: 2024, tab: "Unreleased", mode: "filter", source: { kind: "pillows", id: "leak" } };
  catalog.setSongs([released, stems, leak], "test");
  const songs = JSON.parse(catalog.songListJson()).songs;
  const ls = songs.find(song => song.id === "nowls");
  assert.deepEqual([ls.display, ls.era, ls.eraYear, ls.tab, ls.folder], ["Now LS", "LYFESTYLE [V2]", 2024, "Unreleased", "Now LS"]);
  assert.equal(catalog.index().get("nowls").source.folder, "Now LS");
  assert.equal(catalog.index().get("now@lyfestyle").source.id, "leak");
  assert.equal(songs.find(song => song.id === "now").era, "AftërLyfe");
  const { matchesSong } = await import(pathToFileURL(path.join(root, "build/assets/snippet-rules.mjs")));
  assert.equal(matchesSong(ls, "Now"), false);
  assert.equal(matchesSong(songs.find(song => song.id === "now@lyfestyle"), "Now LS"), true);
});

test("maintained aliases accept guest spelling variants without accepting unrelated versions", async () => {
  const { matchesSong, shareResult } = await import(pathToFileURL(path.join(root, "build/assets/snippet-rules.mjs")));
  const song = { title: "Whatchu said", display: "Whatchu said (feat. UnoTheActivist)", keys: ["whatchusaid", "watchusaid", "whatusaid"], features: ["feat. UnoTheActivist"] };
  for (const guess of ["Watchu Said? (feat. UnoTheActivist)", "WATCHU SAID (ft. UnoTheActivist)", "Whatchu said", "What u said"]) assert.equal(matchesSong(song, guess), true, guess);
  for (const guess of ["Watchu", "Watchu said (feat. Someone Else)", "Whatchu said live", "Expensive Taste"]) assert.equal(matchesSong(song, guess), false, guess);
  assert.equal(matchesSong({ title: "Now LS", keys: ["nowls"] }, "Now"), false);
  assert.equal(matchesSong({ title: "Now", keys: ["now"] }, "Now LS"), false);
  const share = shareResult("2026-10-20", { status: "won", attempts: [{ kind: "right", text: "answer" }] }, "https://example.test/daily.html?x=1#result");
  assert.ok(share.endsWith("https://example.test/daily?x=1#result"));
});

test("verified pack identities accept either spelling, retain ids and prefer playable stems", async t => {
  const { catalog } = setup(t);
  catalog.setSongs([
    { id: "addicited", title: "Addicited", display: "Addicited", keys: ["addicited"], folder: "Addicited", mode: "stems", source: { kind: "stems", folder: "Addicited" }, tab: "Released" },
    { id: "addicted", title: "addicted", display: "addicted", keys: ["addicted"], mode: "filter", source: { kind: "pillows", id: "original" }, tab: "Unreleased", era: "LYFESTYLE [V2]" }
  ], "test");
  const songs = JSON.parse(catalog.songListJson()).songs;
  const { songsForPool } = await import(pathToFileURL(path.join(root, "build/assets/song-pools.mjs")));
  const { matchesSong } = await import(pathToFileURL(path.join(root, "build/assets/snippet-rules.mjs")));
  for (const pool of ["all", "unreleased", "stems"]) {
    const selected = songsForPool(songs, pool);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].folder, "Addicited");
    assert.equal(selected[0].display, "Addicted");
  }
  assert.equal(songsForPool(songs, "released").length, 0);
  for (const song of songs) for (const guess of ["Addicted", "addicited", "ADDICTED!"]) assert.ok(matchesSong(song, guess));
  for (const id of ["addicited", "addicted"]) assert.equal(catalog.index().get(id).id, id);
  const pinned = catalog.publicSong({ id: "addicited", title: "Addicited", keys: ["addicited"], folder: "Addicited", mode: "stems" });
  assert.ok(matchesSong(pinned, "Addicted"));
});

test("open-verse labels use verified sources and keep the completed feature separate", t => {
  const { catalog } = setup(t);
  catalog.setSongs([
    { id: "popout", title: "Popout", keys: ["popout"], tab: "Unreleased", era: "4L", source: { kind: "pillows", id: "097bbbef1c6c196877f2815f57cb2706" }, mode: "filter" },
    { id: "unrelated", title: "Popout", keys: ["popout"], tab: "Unreleased", era: "4L", source: { kind: "pillows", id: "88f5af0d1ed10114a11a12ad41641e12" }, mode: "filter" },
    { id: "killbunkpopout", title: "KillBunk - Pop Out", features: ["feat. Yeat"], keys: ["killbunkpopout"], type: "Feature", tab: "Released", source: { kind: "apple", id: "release" }, mode: "filter" }
  ], "test");
  const songs = JSON.parse(catalog.songListJson()).songs;
  assert.equal(songs[0].display, "Popout (open verse)");
  assert.equal(songs[0].relatedRecording, "KillBunk — Pop Out (feat. Yeat)");
  assert.equal(songs[1].recordingVersion, undefined);
  assert.equal(songs[2].artistRole, "featured");
  assert.equal(songs[2].tab, "Released");
});

const cantSee = (id, era, source) => ({ id, title: "Cant See", display: "Cant See", features: [], producers: [], aliases: [], keys: ["cantsee"], era, eraYear: era === "Alivë" ? 2021 : 2024, tab: "Unreleased", mode: "filter", source: { kind: "pillows", id: source }, folder: null });
const aliveSource = "dcbb2d15f736cda5bee6758e8ce26ca5", lsSource = "f0fd44d52cec82b3006ee68200dd4342";

test("Cant See stems bind to the verified LS V2 source rather than the first same-title song", async t => {
  const { catalog } = setup(t);
  const rows = [cantSee("", "Alivë", aliveSource), cantSee("", "LYFESTYLE [V2]", lsSource)];
  catalog.setSongs(catalog.buildSongList(rows, [{ folder: "Cant See", title: "Cant See", features: [], producers: [], aliases: [], info: {} }]), "test");
  const songs = JSON.parse(catalog.songListJson()).songs;
  const ls = songs.find(song => song.era === "LYFESTYLE [V2]"), alive = songs.find(song => song.era === "Alivë");
  assert.equal(ls.display, "Cant see (LS V2)");
  assert.equal(ls.folder, "Cant See");
  assert.equal(ls.mode, "stems");
  assert.equal(catalog.index().get(ls.id).fallback.id, lsSource);
  assert.equal(alive.display, "Cant See (Alivë)");
  assert.equal(alive.mode, "filter");
  assert.equal(catalog.index().get(alive.id).source.id, aliveSource);
  const { songsForPool } = await import(pathToFileURL(path.join(root, "build/assets/song-pools.mjs")));
  assert.deepEqual(songsForPool(songs, "stems").map(song => song.id), [ls.id]);
  assert.equal(songsForPool(songs, "unreleased").length, 2);
  const { matchesSong } = await import(pathToFileURL(path.join(root, "build/assets/snippet-rules.mjs")));
  for (const song of [ls, alive]) assert.equal(matchesSong(song, "Cant See"), true);
  assert.equal(matchesSong(ls, "Cant See (Alivë)"), false);
  assert.equal(matchesSong(alive, "Cant See (LS V2)"), false);
  assert.equal(matchesSong(ls, ls.display), true);
  assert.equal(matchesSong(alive, alive.display), true);
});

test("a cached Cant See misbinding restores both recordings without changing pinned Daily audio", async t => {
  const alive = cantSee("cantsee@edit-826ed631203a", "Alivë", aliveSource), ls = cantSee("cantsee@edit-40e9276af71a", "LYFESTYLE [V2]", lsSource);
  alive.cover = "alive-cover";
  ls.cover = "ls-cover";
  const stem = { ...alive, source: { kind: "stems", folder: "Cant See" }, fallback: alive.source, mode: "stems", folder: "Cant See", audioId: "old-stem-audio" };
  const old = { ...stem, poolVariants: { unreleased: stem, stems: stem }, sourceVariants: [alive, stem] };
  const date = new Date().toISOString().slice(0, 10);
  const pinned = { [date]: { id: `v1:${date}:${alive.id}`, song: old, seed: 23, clipAt: 6.5 } };
  const { catalog, folder } = setup(t, { "daily-challenges.json": pinned });
  const before = JSON.parse((await catalog.request("/api/daily")).body);
  catalog.setSongs([ls, old], "cache");
  const songs = JSON.parse(catalog.songListJson()).songs;
  assert.equal(songs.find(song => song.id === alive.id).mode, "filter");
  assert.equal(catalog.index().get(alive.id).source.id, aliveSource);
  assert.equal(songs.find(song => song.id === ls.id).mode, "stems");
  assert.equal(catalog.index().get(ls.id).fallback.id, lsSource);
  assert.equal(catalog.index().get(ls.id).cover, "ls-cover", "the unrelated Alivë cover is not copied to LS V2");
  const after = JSON.parse((await catalog.request("/api/daily")).body);
  assert.deepEqual([after.id, after.audio, after.clipAt, after.resetsAt], [before.id, before.audio, before.clipAt, before.resetsAt]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, "daily-challenges.json"))), pinned);
  const { restorePracticeSong } = await import(pathToFileURL(path.join(root, "build/assets/song-pools.mjs")));
  assert.equal(restorePracticeSong({ songId: alive.id, song: stem }, songs).id, ls.id, "a saved HQ round follows the same playable pack to its correct recording");
  assert.equal(restorePracticeSong({ songId: alive.id }, songs).id, alive.id, "an older round with no source snapshot retains its original id");
  const released = { ...ls, id: "different", audioId: "release", keys: ["updated"] };
  assert.equal(restorePracticeSong({ songId: released.id, song: { ...released, audioId: "saved-leak" } }, [released]).audioId, "saved-leak");
  catalog.setSongs([ls, stem], "older-cache");
  assert.equal(catalog.index().get(alive.id).source.id, aliveSource);
  assert.equal(catalog.index().get(alive.id).audioId, undefined, "an older cache cannot reuse the moved pack's audio identity for the Alivë recording");
  assert.equal(catalog.index().get(ls.id).fallback.id, lsSource);
});

test("only YEET with Yeat and Zaza with Yeat remain eligible among these versions", async t => {
  const { catalog } = setup(t);
  const feature = { features: ["feat. Yeat"], type: "Feature", mode: "filter", tab: "Released" };
  catalog.setSongs([
    { ...feature, id: "yungkayofleek", title: "Yung Kayo - fleek'", era: "Hold Ön", features: [], type: "Demo", tab: "Unreleased" },
    { ...feature, id: "yungkayofleek@2alive", title: "Yung Kayo - fleek", era: "2 Alivë", tab: "Unreleased" },
    { ...feature, id: "yungkayoyeet", title: "Yung Kayo - YEET" },
    { ...feature, id: "kankanzaza", title: "Kankan - Zaza", features: ["feat. GOONIE"] },
    { ...feature, id: "gooniezaza", title: "GOONIE - Zaza", features: ["feat. YEAT & Kankan"] }
  ], "test");
  const list = JSON.parse(catalog.songListJson());
  assert.deepEqual(list.songs.map(song => song.id), ["yungkayoyeet", "gooniezaza"]);
  assert.equal(list.retiredSongs.length, 3);
  const { songsForPool } = await import(pathToFileURL(path.join(root, "build/assets/song-pools.mjs")));
  for (const pool of ["all", "released", "unreleased", "stems"]) assert.equal(songsForPool(list.retiredSongs, pool).length, 0);
  assert.equal(isGuessingEligible({ artistRole: "non-vocal" }), false);
});

test("legacy and trailing slash routes redirect with queries before any audio or catalog work", async t => {
  const { catalog } = setup(t);
  for (const name of ["daily", "karaoke"]) {
    for (const suffix of [".html", "/", ".html/"]) {
      for (const method of ["GET", "HEAD"]) {
        const response = await catalog.request(`/${name}${suffix}?x=one%20two&x=2`, method);
        assert.equal(response.status, 308);
        assert.equal(response.headers.location, `/${name}?x=one%20two&x=2`);
      }
    }
  }
  for (const name of ["daily", "karaoke"]) {
    const direct = await catalog.request(`/${name}?x=1`);
    assert.equal(direct.status, 200);
    assert.match(direct.body.toString(), /<title>Yeatle/);
    assert.equal((await catalog.request(`/${name}`, "HEAD")).body.length, 0);
    assert.equal((await catalog.request(`/${name}/assets/yeatle.js`)).status, 404);
  }
  for (const asset of ["/assets/yeatle.js", "/assets/karaoke.js", "/assets/daily.mjs", "/assets/song-pools.mjs", "/favicon.png"]) {
    assert.equal((await catalog.request(asset)).status, 200, asset);
  }
});
