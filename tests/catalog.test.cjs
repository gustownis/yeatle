const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const fixtures = path.join(__dirname, "fixtures", "tracker");

// A server reading real tracker rows from tests/fixtures/tracker instead of Google Sheets.
async function trackerServer(t, files = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-catalog-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  fs.writeFileSync(path.join(folder, "config.json"), JSON.stringify({ port: 0, openBrowser: false, refreshMinutes: 0, tabs: [{ name: "Released", gid: "1617341558" }, { name: "Unreleased", gid: "1241081326" }] }));
  for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(folder, name), JSON.stringify(data));
  const child = spawn(process.execPath, [path.join(root, "server.js")], {
    env: { ...process.env, YEATLE_DATA_DIR: folder, YEATLE_PORT: "", YEATLE_DESKTOP: "1", YEATLE_TRACKER_FIXTURES: fixtures },
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });
  t.after(() => child.kill());
  const port = await new Promise((resolve, reject) => {
    child.on("message", message => message.type === "yeatle-ready" && resolve(message.port));
    child.once("exit", code => reject(new Error(`Server exited ${code}`)));
  });
  for (let i = 0; i < 100; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/api/songs`)).json();
    if (list.source === "sheet") return { list, folder };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("The fixture tracker was not read");
}

// The suggestion popup, with just enough DOM to read what it shows.
async function suggestionsFor(t, songs, text) {
  const { attachSongSuggestions } = await import(path.join(root, "build/assets/song-suggestions.mjs"));
  const box = { hidden: true, id: "s", children: [], replaceChildren(...items) { this.children = items; }, setAttribute() {}, scrollTop: 0, clientHeight: 300 };
  const input = { value: text, disabled: false, addEventListener() {}, setAttribute() {}, removeAttribute() {}, focus() {} };
  globalThis.document = { activeElement: input, createElement: () => ({ children: [], textContent: "", offsetTop: 0, offsetHeight: 20, append(...kids) { this.children.push(...kids); }, setAttribute() {}, addEventListener() {}, classList: { toggle() {} } }) };
  t.after(() => { delete globalThis.document; });
  attachSongSuggestions(input, box).setSongs(songs);
  return box.children.map(item => item.children[0].children.map(part => part.textContent));
}

test("Soup shows DC2 · 2020: released throwaways keep their recording era", async t => {
  const { list } = await trackerServer(t);
  const soup = list.songs.filter(song => song.title === "Soup");
  assert.equal(soup.length, 1, "the released and leaked Soup rows stay one song");
  assert.deepEqual([soup[0].era, soup[0].eraYear, soup[0].recordedIn], ["DC2", 2020, ""]);
  // When and where it came out stays separate from the era shown.
  assert.deepEqual([soup[0].releasedOn, soup[0].date, soup[0].year], ["Trëndi", "Jul 16, 2021", 2021]);
  // An album track still shows the project it came out on, with its recording era beside it.
  const busy = list.songs.find(song => song.title === "Gët Busy");
  assert.deepEqual([busy.era, busy.recordedIn, busy.eraYear], ["Up 2 Më", "Trëndi", 2021]);
  assert.deepEqual(await suggestionsFor(t, list.songs, "Soup"), [["Soup", "DC2 · 2020"]]);
  assert.deepEqual(await suggestionsFor(t, list.songs, "Gët B"), [["Gët Busy", "Up 2 Më · 2021"]]);
});

test("an older saved song list shows released throwaways under their recording era", async t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-catalog-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  fs.writeFileSync(path.join(folder, "config.json"), JSON.stringify({ port: 0, openBrowser: false, refreshMinutes: 0, tabs: [] }));
  fs.writeFileSync(path.join(folder, "songs-cache.json"), JSON.stringify({ updated: 5, eras: [{ name: "DC2", year: 2020, cover: "api/cover?era=DC2" }], songs: [
    { id: "soup", title: "Soup", display: "Soup", era: "Trëndi", recordedIn: "DC2", releasedOn: "Trëndi", eraYear: 2021, year: 2021, tab: "Released", type: "Hosted Throwaway", mode: "filter" },
    { id: "getbusy", title: "Gët Busy", display: "Gët Busy", era: "Up 2 Më", recordedIn: "Trëndi", releasedOn: "Up 2 Më", eraYear: 2021, year: 2021, tab: "Released", type: "Album Track", mode: "filter" }
  ] }));
  const child = spawn(process.execPath, [path.join(root, "server.js")], { env: { ...process.env, YEATLE_DATA_DIR: folder, YEATLE_PORT: "", YEATLE_DESKTOP: "1" }, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  t.after(() => child.kill());
  const port = await new Promise((resolve, reject) => {
    child.on("message", message => message.type === "yeatle-ready" && resolve(message.port));
    child.once("exit", code => reject(new Error(`Server exited ${code}`)));
  });
  const songs = (await (await fetch(`http://127.0.0.1:${port}/api/songs`)).json()).songs;
  const soup = songs.find(song => song.id === "soup"), busy = songs.find(song => song.id === "getbusy");
  assert.deepEqual([soup.era, soup.eraYear, soup.recordedIn, soup.releasedOn, soup.cover], ["DC2", 2020, "", "Trëndi", "api/cover?era=DC2"]);
  assert.deepEqual([busy.era, busy.recordedIn], ["Up 2 Më", "Trëndi"]);
});

test("one recording listed under two spellings becomes one song; separate versions stay apart", async t => {
  // A curator hid this leak; it must not be folded into the released song.
  const { list } = await trackerServer(t, { "hidden-songs.json": { hidden: [{ id: "cantstopthis", name: "Cant stop this", era: "Lyfë", key: "cantstopthis|lyfe" }] } });
  const named = text => list.songs.filter(song => song.title === text);
  // "The Coste" [V2]/[V5] leaks and the released "THE COSTËS" name each other and match in length.
  assert.equal(named("The Coste").length, 0);
  const [coste] = named("THE COSTËS");
  assert.deepEqual([coste.era, coste.recordedIn, coste.eraYear], ["LYFESTYLE", "LYFESTYLE [V2]", 2024]);
  assert.ok(coste.keys.includes("thecoste") && coste.keys.includes("thecostes"));
  assert.deepEqual(coste.formerIds, ["thecoste"], "progress saved under the old id can follow it");
  const { matchesSong } = await import(path.join(root, "build/assets/snippet-rules.mjs"));
  for (const guess of ["The Coste", "THE COSTËS", "the costes", "THE COSTES!", "costes"]) assert.ok(matchesSong(coste, guess), guess);
  assert.equal(matchesSong(coste, "The Cost"), false, "no prefix matches");
  assert.deepEqual(await suggestionsFor(t, list.songs, "The cos"), [["THE COSTËS", "LYFESTYLE · 2024"]]);
  // An ordinary spelling difference ("Tru 2 U" leaks of "Tru to U").
  assert.equal(named("Tru 2 U").length, 0);
  assert.equal(named("Tru to U").length, 1);
  // A genuinely different version: the 2:58/1:46 "nother league" leaks of the 1:17 "EveryTime".
  assert.equal(named("nother league").length, 1);
  assert.equal(named("EveryTime").length, 1);
  // Two releases of one song (an EP version of an earlier single) both stay playable.
  assert.equal(named("Brink!").length, 1);
  assert.equal(named("br!nk").length, 1);
  // The hidden leak stays hidden, and its released song keeps its own entry.
  assert.equal(named("Cant stop this").length, 0);
  assert.equal(named("Can't stop it").length, 1);
  assert.equal(named("Can't stop it")[0].formerIds, undefined);
});

test("Karaoke best scores and lyrics follow a song whose id changed when it was merged", async () => {
  const { carryFormerIds } = await import(path.join(root, "build/assets/karaoke.js"));
  const data = new Map(Object.entries({
    "yeatle-karaoke-best:thecoste:hard": "{\"score\":900,\"name\":\"M\"}",
    "yeatle-karaoke-best:thecostes:hard": "{\"score\":1200,\"name\":\"M\"}",
    "yeatle-karaoke-best:thecoste:easy": "{\"score\":400,\"name\":\"M\"}",
    "yeatle-karaoke-lrc:thecoste": "[00:01.00]line",
    "yeatle-karaoke-best:thecosteother:easy": "{\"score\":1}"
  }));
  const storage = { get length() { return data.size; }, key: i => [...data.keys()][i], getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
  assert.equal(carryFormerIds([{ id: "thecostes", formerIds: ["thecoste"] }], storage), 2);
  assert.equal(data.get("yeatle-karaoke-best:thecostes:hard"), "{\"score\":1200,\"name\":\"M\"}", "the current id keeps its own score");
  assert.equal(data.get("yeatle-karaoke-best:thecostes:easy"), "{\"score\":400,\"name\":\"M\"}");
  assert.equal(data.get("yeatle-karaoke-lrc:thecostes"), "[00:01.00]line");
  assert.equal(data.has("yeatle-karaoke-best:thecostes:other:easy"), false, "a different song with a longer id is untouched");
});
