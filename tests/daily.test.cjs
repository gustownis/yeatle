const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fork } = require("node:child_process");
const { createDailyChallenges } = require("../daily-challenge.cjs");
const { createDailyAuthority } = require("../daily-authority.cjs");
const rules = import("../build/assets/snippet-rules.mjs");
const root = path.resolve(__dirname, "..");
function folder(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-daily-"));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  return dir;
}
const pool = ["alpha", "beta", "gamma"].map(id => ({ id, title: id, display: id, mode: "filter", source: { kind: "search" }, keys: [id] }));

test("daily choice survives reordered/changed libraries and restarts, and changes UTC dates", t => {
  const file = path.join(folder(t), "daily-challenges.json");
  const now = Date.parse("2026-10-19T23:59:59.999Z");
  const get = createDailyChallenges(file);
  const first = get(pool, now);
  assert.equal(first.date, "2026-10-19");
  assert.equal(first.resetsAt, now + 1);
  assert.deepEqual(get([...pool].reverse(), now), first);
  assert.deepEqual(createDailyChallenges(file)([{ ...pool[0], title: "Renamed" }], now), first);
  assert.deepEqual(get([], now), first);
  const next = get(pool, now + 1);
  assert.equal(next.date, "2026-10-20");
  assert.notEqual(next.id, first.id);
  assert.equal(next.resetsAt, first.resetsAt + 86400000);
});

test("daily selection is deterministic across equivalent servers and keeps only 32 dates", t => {
  const dir = folder(t);
  const get = createDailyChallenges(path.join(dir, "a.json"));
  const other = createDailyChallenges(path.join(dir, "b.json"));
  const start = Date.parse("2026-09-01T00:00:00Z");
  assert.deepEqual(get(pool, start), other([...pool].reverse(), start));
  for (let day = 0; day < 40; day++) get(pool, start + day * 86400000);
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(dir, "a.json")))).length, 32);
});

test("empty and broken stores never create a replacement daily challenge", t => {
  const dir = folder(t);
  const file = path.join(dir, "daily.json");
  assert.equal(createDailyChallenges(file)([]), null);
  assert.equal(fs.existsSync(file), false);
  fs.writeFileSync(file, "{broken");
  assert.throws(() => createDailyChallenges(file), /Restore its saved daily choices/);
  assert.throws(() => createDailyChallenges(path.join(dir, "missing", "daily.json"))(pool), /ENOENT/);
});

test("Base has six increasing clips and normalized aliases", async () => {
  const { BASE_LENGTHS, matchesSong } = await rules;
  assert.deepEqual(BASE_LENGTHS, [.1, .5, 1, 3, 7, 15]);
  assert.equal(matchesSong({ title: "Bëttr 0ff", keys: ["betteroff"] }, "Bettr 0ff"), true);
  assert.equal(matchesSong({ title: "Bëttr 0ff", keys: ["betteroff"] }, "Better Off"), true);
  assert.equal(matchesSong({ title: "$trips" }, "Strips"), true);
  assert.equal(matchesSong({ title: "x" }, "   "), false);
  assert.equal(matchesSong({ title: "Flawless", features: ["feat. Lil Uzi Vert"] }, "feat. Lil Uzi Vert"), false);
  assert.equal(matchesSong({ title: "Flawless", keys: ["flawlessfeatliluzivert"] }, "Flawless (feat. Lil Uzi Vert)"), true);
});

test("daily restores only valid current rounds and shares six spoiler-free squares", async () => {
  const { restoreRound, shareResult } = await rules;
  const id = "v1:2026-10-19:secret";
  const attempts = [{ kind: "wrong", text: "x" }, { kind: "skip", text: "" }, { kind: "right", text: "Secret song" }];
  const saved = { id, attempts, status: "won" };
  assert.deepEqual(restoreRound(saved, id), saved);
  for (const invalid of [null, { ...saved, id: "yesterday" }, { ...saved, attempts: [] }, { ...saved, status: "playing" }, { id, status: "lost", attempts: [] }, { id, status: "playing", attempts: Array(6).fill({ kind: "skip", text: "" }) }]) {
    assert.deepEqual(restoreRound(invalid, id), { id, attempts: [], status: "playing" });
  }
  const shared = shareResult("2026-10-19", saved, "https://example.test/daily.html");
  assert.match(shared, /1s · 3\/6\n🟥⬛🟩⬜⬜⬜/);
  assert.doesNotMatch(shared, /Secret song|secret/);
  assert.match(shareResult("2026-10-19", { status: "lost", attempts: Array(6).fill({ kind: "skip", text: "" }) }, "url"), /X\/6\n⬛⬛⬛⬛⬛⬛/);
});

async function server(t, dir, clockOffset = 0) {
  const execArgv = [];
  if (clockOffset) {
    const clock = path.join(dir, "fixture-clock.cjs");
    fs.writeFileSync(clock, `const realNow = Date.now; Date.now = () => realNow() + ${clockOffset};`);
    execArgv.push("--require", clock);
  }
  const child = fork(path.join(root, "server.js"), [], { silent: true, execArgv, env: { ...process.env, YEATLE_DATA_DIR: dir, YEATLE_STEMS_DIR: "", YEATLE_DESKTOP: "1", YEATLE_PORT: "0" } });
  let logs = "";
  child.stdout.on("data", b => { logs += b; });
  child.stderr.on("data", b => { logs += b; });
  t.after(async () => { if (child.exitCode === null && !child.signalCode) { const exit = new Promise(r => child.once("exit", r)); child.kill(); await exit; } });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(logs)), 5000);
    child.on("message", m => { if (m.type === "yeatle-ready") { clearTimeout(timeout); resolve(`http://127.0.0.1:${m.port}`); } });
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.once("exit", () => { clearTimeout(timeout); reject(new Error(logs)); });
  });
}

test("daily API pins local stems, excludes hidden songs, strips sources, and ignores client date/filter", async t => {
  const dir = folder(t);
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ tabs: [], refreshMinutes: 0, openBrowser: false, dailyAuthority: "" }));
  for (const title of ["Test song", "Hidden song"]) {
    const song = path.join(dir, "Songs", title);
    fs.mkdirSync(song, { recursive: true });
    for (const stem of ["drums", "bass", "other", "vocals"]) fs.writeFileSync(path.join(song, `${stem}.mp3`), "audio bytes");
  }
  fs.writeFileSync(path.join(dir, "hidden-songs.json"), JSON.stringify({ hidden: [{ id: "hiddensong" }] }));
  const url = await server(t, dir);
  const response = await fetch(`${url}/api/daily?date=2000-01-01&pool=unreleased`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const daily = await response.json();
  assert.equal(daily.date, new Date().toISOString().slice(0, 10));
  assert.equal(daily.song.id, "testsong");
  assert.equal(daily.song.source, undefined);
  assert.equal(daily.audio.length, 4);
  for (const audio of daily.audio) assert.equal(await (await fetch(`${url}/${audio}`)).text(), "audio bytes");
  const again = await (await fetch(`${url}/api/daily`)).json();
  assert.equal(again.id, daily.id);
  assert.equal(again.seed, daily.seed);
  assert.equal((await fetch(`${url}/api/daily`, { method: "POST" })).status, 405);
  assert.equal((await fetch(`${url}/daily.html`)).status, 200);
});

test("daily API returns an actionable empty-library response", async t => {
  const dir = folder(t);
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ tabs: [], refreshMinutes: 0, openBrowser: false, dailyAuthority: "" }));
  const url = await server(t, dir);
  const response = await fetch(`${url}/api/daily`);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Sync the tracker or add a local stem pack/);
});

test("different local libraries and clocks receive the same authoritative song, clip, reset, and audio", async t => {
  const hostDir = folder(t);
  fs.writeFileSync(path.join(hostDir, "config.json"), JSON.stringify({ tabs: [], refreshMinutes: 0, openBrowser: false, dailyAuthority: "" }));
  const stems = path.join(hostDir, "Songs", "Global song");
  fs.mkdirSync(stems, { recursive: true });
  for (const stem of ["drums", "bass", "other", "vocals"]) fs.writeFileSync(path.join(stems, `${stem}.mp3`), "global audio bytes");
  const host = await server(t, hostDir);
  const canonical = await (await fetch(`${host}/api/daily`)).json();
  for (const [localSongs, clockOffset] of [[[], -86400000], [pool, 86400000]]) {
    const dir = folder(t);
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ tabs: [], refreshMinutes: 0, openBrowser: false, dailyAuthority: host }));
    fs.writeFileSync(path.join(dir, "songs-cache.json"), JSON.stringify({ songs: localSongs, eras: [] }));
    const client = await server(t, dir, clockOffset);
    const daily = await (await fetch(`${client}/api/daily`)).json();
    assert.equal(daily.scope, "global");
    assert.equal(daily.id, canonical.id);
    assert.equal(daily.date, canonical.date);
    assert.equal(daily.seed, canonical.seed);
    assert.equal(daily.resetsAt, canonical.resetsAt);
    assert.equal(daily.clipAt, canonical.clipAt);
    assert.ok(daily.clipAt >= 5 && daily.clipAt <= 10);
    assert.equal(daily.song.title, canonical.song.title);
    assert.equal(daily.shareUrl, `${host}/daily`);
    for (const audio of daily.audio) assert.equal(await (await fetch(`${client}/${audio}`)).text(), "global audio bytes");
    assert.equal(fs.existsSync(path.join(dir, "daily-challenges.json")), false);
    assert.equal((await fetch(`${client}/api/daily/audio/0?challenge=yesterday`)).status, 409);
  }
});

test("authority failures never select a local substitute and invalid host responses are rejected", async t => {
  const dir = folder(t);
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ tabs: [], refreshMinutes: 0, openBrowser: false, dailyAuthority: "http://127.0.0.1:1" }));
  fs.writeFileSync(path.join(dir, "songs-cache.json"), JSON.stringify({ songs: pool, eras: [] }));
  const client = await server(t, dir);
  const response = await fetch(`${client}/api/daily`);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /no alternate song was selected/);
  assert.equal(fs.existsSync(path.join(dir, "daily-challenges.json")), false);
  await assert.rejects(createDailyAuthority("https://example.test", async () => ({})).get(), /valid 1.11 challenge/);
  assert.throws(() => createDailyAuthority("file:///private", async () => ({})), /http/);
});

test("the Daily only picks songs from dailyFromEra onwards, and falls back to every era if it isn't listed", async t => {
  const song = (id, era) => ({ id, title: id, display: id, era, mode: "filter", length: "2:30", source: { kind: "url", id: `https://audio.invalid/${id}` } });
  const catalog = {
    format: 3, updated: 1,
    eras: ["Hold Ön", "Alivë", "2 Alivë", "2093"].map((name, i) => ({ name, aliases: [], start: `${2019 + i}-01-01`, end: `${2019 + i}-12-31` })),
    songs: [...Array.from({ length: 60 }, (_, i) => song(`oldsong${i}`, "Hold Ön")), song("alivesong", "Alivë"), song("futuresong", "2093")]
  };
  const daily = async config => {
    const dir = folder(t);
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ tabs: [], refreshMinutes: 0, openBrowser: false, dailyAuthority: "", ...config }));
    fs.writeFileSync(path.join(dir, "songs-cache.json"), JSON.stringify(catalog));
    return (await (await fetch(`${await server(t, dir)}/api/daily`)).json()).song.id;
  };
  assert.ok(["alivesong", "futuresong"].includes(await daily({})), "Alive (Alivë) and later by default; 60 older songs are never picked");
  assert.equal(await daily({ dailyFromEra: "2093" }), "futuresong");
  assert.ok(/^(oldsong\d+|alivesong|futuresong)$/.test(await daily({ dailyFromEra: "Not an era" })), "an unknown era leaves the Daily working");
});

test("an admin can replace a day's Daily with a different song, never a replaced one", t => {
  const file = path.join(folder(t), "daily-challenges.json");
  const now = Date.parse("2026-10-30T15:00:00Z");
  const get = createDailyChallenges(file);
  assert.throws(() => get.replace("2026-10-30", pool), /No Daily has been picked/);
  const first = get(pool, now);
  const { replaced, entry } = get.replace("2026-10-30", pool);
  assert.equal(replaced.id, first.song.id);
  assert.notEqual(entry.song.id, first.song.id);
  assert.notEqual(entry.id, first.id, "a new id gives every player a fresh round");
  const reopened = createDailyChallenges(file)(pool, now);
  assert.equal(reopened.id, entry.id, "the replacement survives a restart");
  const third = get.replace("2026-10-30", pool).entry;
  assert.ok(![first.song.id, entry.song.id].includes(third.song.id), "neither replaced song comes back");
  assert.throws(() => get.replace("2026-10-30", pool), /No other song/);
  assert.equal(get(pool, now).id, third.id);
});

test("replacing today's Daily from the admin panel moves accounts to the new song's result", async t => {
  const dir = folder(t);
  const today = new Date().toISOString().slice(0, 10);
  const song = (id, era) => ({ id, title: id, display: id, era, keys: [id], mode: "filter", length: "2:30", source: { kind: "url", id: `https://audio.invalid/${id}` } });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ tabs: [], refreshMinutes: 0, openBrowser: false, dailyAuthority: "" }));
  fs.writeFileSync(path.join(dir, "admin.json"), JSON.stringify({ password: "letmein" }));
  fs.writeFileSync(path.join(dir, "songs-cache.json"), JSON.stringify({
    format: 3, updated: 1,
    eras: ["Hold Ön", "Alivë", "2093"].map((name, i) => ({ name, aliases: [], start: `${2019 + i}-01-01`, end: `${2019 + i}-12-31` })),
    songs: [song("oldsong", "Hold Ön"), song("alivesong", "Alivë"), song("futuresong", "2093")]
  }));
  // Today's Daily was picked before the era rule existed.
  fs.writeFileSync(path.join(dir, "daily-challenges.json"), JSON.stringify({ [today]: { song: song("oldsong", "Hold Ön"), seed: 5, clipAt: 6, id: `v1:${today}:oldsong` } }));
  const url = await server(t, dir);
  const post = (pathname, body, headers = {}) => fetch(`${url}${pathname}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

  const reg = await (await post("/api/account/register", { username: "mat", password: "yeatfan1" })).json();
  const sync = round => post("/api/account/sync", { progress: { daily: { [today]: round } } }, { Authorization: `Bearer ${reg.token}` }).then(r => r.json());
  const lostOld = { id: `v1:${today}:oldsong`, attempts: Array(6).fill({ kind: "skip", text: "" }), status: "lost" };
  assert.equal((await sync(lostOld)).account.progress.daily[today].status, "lost");

  assert.equal((await post("/api/admin/daily-replace", {})).status, 401, "admins only");
  const cookie = (await post("/api/admin/login", { password: "letmein" })).headers.get("set-cookie").split(";")[0];
  const res = await post("/api/admin/daily-replace", {}, { Cookie: cookie });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.replaced, "oldsong");
  assert.ok(["Alivë", "2093"].includes(body.newEra));
  assert.ok(!JSON.stringify(body).includes("alivesong") && !JSON.stringify(body).includes("futuresong"), "the admin isn't told the new answer");

  const daily = await (await fetch(`${url}/api/daily`)).json();
  assert.notEqual(daily.id, lostOld.id);
  const wonNew = { id: daily.id, attempts: [{ kind: "right", text: daily.song.title }], status: "won" };
  const after = (await sync(wonNew)).account;
  assert.equal(after.progress.daily[today].id, daily.id, "the new song's result replaces the old one");
  assert.equal(after.progress.daily[today].status, "won");
  assert.equal((await sync(lostOld)).account.progress.daily[today].status, "won", "a stale device can't put the old result back");
});
