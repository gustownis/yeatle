const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const runtime = require("./fixtures/catalog-runtime.cjs");
const { creditFor, isGuessingEligible, applyCatalogMetadata, reconcileCatalogEligibility } = require("../catalog-policy.cjs");
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
  const { matchesSong, matchesVersion } = await import(pathToFileURL(path.join(root, "build/assets/snippet-rules.mjs")));
  for (const song of [ls, alive]) assert.equal(matchesSong(song, "Cant See"), true);
  assert.equal(matchesSong(ls, "Cant See (Alivë)"), false);
  assert.equal(matchesSong(alive, "Cant See (LS V2)"), false);
  assert.equal(matchesVersion(ls, "Cant See (Alivë)"), true);
  assert.equal(matchesVersion(alive, "Cant See (LS V2)"), true);
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

test("verified premasters and matching unreleased OG files replace 30s Apple previews", async t => {
  const { catalog } = setup(t);
  const rows = [
    { title: "Yung Kayo - YEET", features: ["feat. Yeat"], aliases: [], era: "2 Alivë", tab: "Released", type: "Feature", length: "2:37", source: { kind: "apple", id: "1606768032" } },
    { title: "Rackz got më", features: ["feat. Gunna"], aliases: [], era: "2 Alivë", tab: "Released", type: "Album Track", length: "3:01", source: { kind: "apple", id: "1609701863" } },
    { title: "Rackz got më", features: [], aliases: [], era: "2 Alivë", tab: "Unreleased", type: "Demo", length: "1:36", source: { kind: "pillows", id: "demo-v1" } },
    { title: "Rackz got më", features: ["feat. Gunna"], aliases: [], era: "2 Alivë", tab: "Unreleased", type: "OG File", availability: "OG File", length: "3:01", version: "V3", source: { kind: "pillows", id: "og-v3" } },
    { title: "Morë", features: [], aliases: [], era: "2093", tab: "Released", type: "Album Track", length: "2:45", source: { kind: "apple", id: "more-apple" } },
    { title: "Morë", features: [], aliases: [], era: "2093", tab: "Unreleased", type: "OG", availability: "OG File", length: "2:21", version: "V1", source: { kind: "pillows", id: "more-v1" } },
    { title: "Diff Two", features: [], aliases: [], era: "2093", tab: "Released", type: "Album Track", length: "2:00", source: { kind: "apple", id: "diff2-apple" } },
    { title: "Diff Two", features: [], aliases: [], era: "2093", tab: "Unreleased", type: "Master", availability: "Master", length: "2:02", source: { kind: "pillows", id: "diff2-pillows" } },
    { title: "Diff One", features: [], aliases: [], era: "2093", tab: "Released", type: "Album Track", length: "2:40", source: { kind: "apple", id: "diff1-apple" } },
    { title: "Diff One", features: [], aliases: [], era: "2093", tab: "Unreleased", type: "OG File", availability: "OG File", length: "2:39", source: { kind: "pillows", id: "diff1-pillows" } }
  ];
  const songs = catalog.buildSongList(rows, []);
  catalog.setSongs(songs, "test");
  const list = JSON.parse(catalog.songListJson()).songs;

  const yeet = list.find(s => s.id === "yungkayoyeet");
  assert.equal(yeet.preview, false, "Yung Kayo - YEET has preview: false");
  assert.equal(catalog.index().get("yungkayoyeet").premaster.id, "d752a7e8092a4f412d000a8635ba8a4c");

  const rackz = list.find(s => s.id === "rackzgotme");
  const rawRackz = catalog.index().get("rackzgotme");
  assert.equal(rawRackz.poolVariants.released.premaster.id, "og-v3", "Rackz got më released pool variant uses matching V3 OG File premaster");
  assert.equal(rawRackz.poolVariants.released.preview, false, "Rackz got më released pool variant has preview: false");
  assert.equal(rackz.poolVariants.released.preview, false, "publicSong released variant has preview: false");

  const more = list.find(s => s.id === "more");
  const rawMore = catalog.index().get("more");
  assert.equal(rawMore.poolVariants.released.premaster.id, "a8eef8321168da3c326bcc81a7efbecb", "Morë released variant uses verified master file");
  assert.notEqual(rawMore.poolVariants.released.premaster.id, "more-v1", "Morë released variant does not use 2:21 More V1 (diff > 2)");
  assert.equal(rawMore.poolVariants.released.preview, false);
  assert.equal(more.poolVariants.released.preview, false);

  const diffTwo = list.find(s => s.id === "difftwo");
  const rawDiffTwo = catalog.index().get("difftwo");
  assert.equal(rawDiffTwo.poolVariants.released.premaster, undefined, "2-second difference is not less than 2 seconds");
  assert.equal(rawDiffTwo.poolVariants.released.preview, true);

  const diffOne = list.find(s => s.id === "diffone");
  const rawDiffOne = catalog.index().get("diffone");
  assert.equal(rawDiffOne.poolVariants.released.premaster.id, "diff1-pillows", "1-second difference is less than 2 seconds");
  assert.equal(rawDiffOne.poolVariants.released.preview, false);

  // Verified master rows in premasters (Dangerous Summer and Lyfestyle)
  const mfu = catalog.index().get("mfu") || { id: "mfu", tab: "Released", source: { kind: "apple", id: "1830347053" } };
  const appliedMfu = applyCatalogMetadata(mfu);
  assert.equal(appliedMfu.premaster.id, "fd4d5d9e9c54ddca73873d344404a652", "M.F.U. uses verified MixedByTheBest master file");
  assert.equal(appliedMfu.preview, false);

  const ohidid = catalog.index().get("ohidid") || { id: "ohidid", tab: "Released", source: { kind: "apple", id: "1830346718" } };
  const appliedOhIdid = applyCatalogMetadata(ohidid);
  assert.equal(appliedOhIdid.premaster.id, "bea6d61c02fd8c9be4a86c52db6e52a5", "OH I DID uses verified MixedByTheBest master file");
  assert.equal(appliedOhIdid.preview, false);

  const flytroop = catalog.index().get("flytroop") || { id: "flytroop", tab: "Released", source: { kind: "apple", id: "1774384698" } };
  const appliedFlytroop = applyCatalogMetadata(flytroop);
  assert.equal(appliedFlytroop.premaster.id, "2c8f2012ccbc92eebbb2262c7aae1b70", "FLYTROOP uses verified Lyfestyle master file");
  assert.equal(appliedFlytroop.preview, false);

  // Alter-ego and imprint features (Luh Geeky, Kranky Kranky, Lyfestyle Corporation) match matching OG files
  const nowRel = { id: "now", tab: "Released", length: "4:32", features: ["feat. LUH GEEKY"], source: { kind: "apple", id: "apple-now" } };
  const nowUnrel = { id: "now", tab: "Unreleased", length: "4:32", type: "OG File", features: ["feat. Luh geekum"], source: { kind: "pillows", id: "now-og" } };
  const appliedNow = applyCatalogMetadata(nowRel, [nowRel, nowUnrel]);
  assert.equal(appliedNow.premaster?.id, "now-og", "Now matches unreleased OG file across Luh Geeky / Luh geekum personas");
  assert.equal(appliedNow.preview, false);

  // Lyfë master files
  const cantStopIt = catalog.index().get("cantstopit") || { id: "cantstopit", tab: "Released", source: { kind: "apple", id: "1643750399" } };
  const appliedCantStop = applyCatalogMetadata(cantStopIt);
  assert.equal(appliedCantStop.premaster.id, "28c6e3dc8714823fbd6878980b0e93f3", "Can't stop it uses verified Cant stop this master file");
  assert.equal(appliedCantStop.preview, false);

  const killinEm = catalog.index().get("killinem") || { id: "killinem", tab: "Released", source: { kind: "apple", id: "1643750872" } };
  const appliedKillin = applyCatalogMetadata(killinEm);
  assert.equal(appliedKillin.premaster.id, "317f444a8456cc9690d14a5dc2d744c0", "Killin ëm uses verified master file");
  assert.equal(appliedKillin.preview, false);

  const holy1 = catalog.index().get("holy1") || { id: "holy1", tab: "Released", source: { kind: "apple", id: "1643750684" } };
  const appliedHoly1 = applyCatalogMetadata(holy1);
  assert.equal(appliedHoly1.premaster.id, "0bd480ae941bb860b08bb5a2eaec3bef", "Holy 1 uses verified master file");
  assert.equal(appliedHoly1.preview, false);

  // 2093 master files
  const track2093 = catalog.index().get("2093") || { id: "2093", tab: "Released", source: { kind: "apple", id: "1731044701" } };
  const applied2093 = applyCatalogMetadata(track2093);
  assert.equal(applied2093.premaster.id, "cef5790536b466a9eebfaf3ac240b40b", "2093 uses verified master file");
  assert.equal(applied2093.preview, false);

  const familia = catalog.index().get("familia") || { id: "familia", tab: "Released", source: { kind: "apple", id: "1731044703" } };
  const appliedFamilia = applyCatalogMetadata(familia);
  assert.equal(appliedFamilia.premaster.id, "5691c2dfd14511c98f06dbae0bfa7130", "Familia uses verified master file");
  assert.equal(appliedFamilia.preview, false);

  const ifWeBeingReal = catalog.index().get("ifwebeingreal") || { id: "ifwebeingreal", tab: "Released", source: { kind: "apple", id: "1731057886" } };
  const appliedIfWeBeingReal = applyCatalogMetadata(ifWeBeingReal);
  assert.equal(appliedIfWeBeingReal.premaster.id, "1b039bca290e9d7b5f990c576ca68f80", "If We Being Rëal uses verified master file");
  assert.equal(appliedIfWeBeingReal.preview, false);

  const nothingChange = catalog.index().get("nothingchange") || { id: "nothingchange", tab: "Released", source: { kind: "apple", id: "1731057859" } };
  const appliedNothingChange = applyCatalogMetadata(nothingChange);
  assert.equal(appliedNothingChange.premaster.id, "b4aef006c64b8980b0ab69e61101dbbd", "Nothing Changë uses verified master file");
  assert.equal(appliedNothingChange.preview, false);

  const riotAndSetItOff = catalog.index().get("riotandsetitoff") || { id: "riotandsetitoff", tab: "Released", source: { kind: "apple", id: "1731057870" } };
  const appliedRiot = applyCatalogMetadata(riotAndSetItOff);
  assert.equal(appliedRiot.premaster.id, "b2eb9a0bbc549fa924c182ce2f9dff84", "Riot & Set it off uses verified master file");
  assert.equal(appliedRiot.preview, false);

  const moreTrack = catalog.index().get("more") || { id: "more", tab: "Released", source: { kind: "apple", id: "1731044410" } };
  const appliedMore = applyCatalogMetadata(moreTrack);
  assert.equal(appliedMore.premaster.id, "a8eef8321168da3c326bcc81a7efbecb", "Morë uses verified master file");
  assert.equal(appliedMore.preview, false);

  const powerTrip = catalog.index().get("powertrip@edit-59016e656922") || catalog.index().get("powertrip") || { id: "powertrip", tab: "Released", source: { kind: "apple", id: "1731044408" } };
  const appliedPowerTrip = applyCatalogMetadata(powerTrip);
  assert.equal(appliedPowerTrip.premaster.id, "5d87c60977a56cc385f7622eb9e55f61", "Power Trip uses verified master file");
  assert.equal(appliedPowerTrip.preview, false);
});

test("redundant unreleased Morë V1 is excluded while released Morë remains eligible", () => {
  const moreRel = {
    id: "more", title: "Morë", tab: "Released", length: "2:45", type: "Album Track",
    source: { kind: "apple", id: "1731044410" }, features: []
  };
  const moreV1 = {
    id: "more", title: "Morë", trackerVersion: "V1", tab: "Unreleased", length: "2:21", type: "OG",
    source: { kind: "pillows", id: "c518828171b688ef8746aaee07d57313" }, features: []
  };
  assert.equal(isGuessingEligible(moreRel), true);
  assert.equal(isGuessingEligible(applyCatalogMetadata(moreV1)), false);

  const merged = {
    ...moreV1,
    sourceVariants: [moreRel, moreV1],
    poolVariants: { released: moreRel, unreleased: moreV1 }
  };
  const SOURCE_RANK = { stems: 0, pillows: 1, drive: 1, exofile: 1, exoshare: 1, pixeldrain: 1, imgur: 1, url: 1, apple: 2, search: 3 };
  const reconciled = reconcileCatalogEligibility(applyCatalogMetadata(merged), SOURCE_RANK);
  assert.equal(reconciled.tab, "Released");
  assert.equal(reconciled.source.id, "1731044410");
  assert.equal(reconciled.poolVariants.unreleased, undefined, "excluded unreleased V1 does not project into unreleased pool");
  assert.equal(reconciled.poolVariants.released.source.id, "1731044410");
});
