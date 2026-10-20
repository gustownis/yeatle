// Optional Linux/browser QA against a running isolated test:1.11 launcher.
// Requires playwright-core, a Chromium executable, and a playable local Daily.
const { chromium } = require(process.env.YEATLE_PLAYWRIGHT_MODULE || "playwright-core");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { fork } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const origin = process.env.YEATLE_TEST_URL || "http://127.0.0.1:3193";
const output = path.join(root, ".tmp", `daily-browser-smoke-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const result = { version: require("../package.json").version, platform: process.platform, node: process.versions.node, origin, output, checks: {} };
const children = [];
let browser, page;
const errors = [];
const watchdog = setTimeout(() => { for (const child of children) child.kill(); browser?.close(); process.exitCode = 1; }, 180000);
async function client(name, songs, authority = origin) {
  const data = path.join(output, name);
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, "config.json"), JSON.stringify({ tabs: [], refreshMinutes: 0, openBrowser: false, dailyAuthority: authority }));
  fs.writeFileSync(path.join(data, "songs-cache.json"), JSON.stringify({ songs, eras: [] }));
  const child = fork(path.join(root, "server.js"), [], { silent: true, env: { ...process.env, YEATLE_DATA_DIR: data, YEATLE_STEMS_DIR: "", YEATLE_PORT: "0", YEATLE_DESKTOP: "1" } });
  children.push(child);
  for (const stream of [child.stdout, child.stderr]) stream.on("data", bytes => fs.appendFileSync(path.join(data, "server.log"), bytes));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Client ${name} did not start`)), 10000);
    child.on("message", message => { if (message.type === "yeatle-ready") { clearTimeout(timer); resolve(`http://127.0.0.1:${message.port}`); } });
    child.once("error", reject);
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Client ${name} exited ${code}`)); });
  });
}
const dailyKey = date => `yeatle:daily:${date}`;
async function dailyPage(page, url = origin) {
  await page.goto(`${url}/daily.html`);
  await page.locator("#game").waitFor({ state: "visible" });
}
async function play(page, length) {
  const before = await page.evaluate(() => audit.starts.length);
  await page.locator("#play").click();
  await page.waitForFunction(n => audit.starts.length > n, before);
  await page.waitForFunction(() => !document.querySelector("#play").disabled);
  if (length) {
    const starts = await page.evaluate(n => audit.starts.slice(n), before);
    assert.ok(starts.every(start => start.duration === length));
  }
}
(async () => {
  const daily = await (await fetch(`${origin}/api/daily`)).json();
  assert.ok(daily.song?.id, JSON.stringify(daily));
  result.checks.challenge = { id: daily.id, date: daily.date, clipAt: daily.clipAt, resetsAt: daily.resetsAt };
  browser = await chromium.launch({ executablePath: process.env.YEATLE_TEST_BROWSER, headless: true, args: ["--mute-audio"] });
  result.browser = await browser.version();
  const context = await browser.newContext({ viewport: { width: 1100, height: 950 } });
  await context.addInitScript(() => {
    window.audit = { starts: [], mediaPlays: [], copied: "", shared: "", persisted: false };
    const mediaPlay = HTMLMediaElement.prototype.play;
    const mediaPause = HTMLMediaElement.prototype.pause;
    const activeMedia = new WeakMap();
    HTMLMediaElement.prototype.play = function() {
      const record = { src: this.src, from: this.currentTime, to: null };
      audit.mediaPlays.push(record);
      activeMedia.set(this, record);
      return mediaPlay.apply(this, arguments);
    };
    HTMLMediaElement.prototype.pause = function() {
      const record = activeMedia.get(this);
      if (record) { record.to = this.currentTime; activeMedia.delete(this); }
      return mediaPause.apply(this, arguments);
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(when, offset, duration) { audit.starts.push({ when, offset, duration, decoded: this.buffer.duration }); return start.apply(this, arguments); };
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => { audit.copied = text; } } });
    addEventListener("pageshow", event => { audit.persisted = event.persisted; });
    if (location.origin !== "null") localStorage.setItem("yeatle:lightStems", "true");
  });
  page = await context.newPage();
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${origin}/?mode=snippet`);
  await page.locator(".track .seg").first().waitFor();
  assert.equal(await page.getByLabel("Difficulty").inputValue(), "base");
  assert.deepEqual(await page.locator(".track .seg").allTextContents(), ["0.1s", "0.5s", "1s", "3s", "7s", "15s"]);
  await page.getByLabel("Which songs").selectOption("stems");
  await page.waitForFunction(() => !document.querySelector("button.play").disabled);
  console.log("Base pool change ready");
  result.checks.baseMediaPlayback = [];
  for (let i = 0; i < 6; i++) {
    const before = await page.evaluate(() => audit.mediaPlays.length);
    if (i === 0) await page.locator("button.play").click();
    else await page.getByRole("button", { name: /^Skip,/ }).click();
    await page.waitForFunction(n => audit.mediaPlays.length >= n + 4 && audit.mediaPlays.slice(n).every(record => record.to !== null), before);
    await page.waitForFunction(() => !document.querySelector("button.play").textContent.includes("Stop"));
    const spans = await page.evaluate(n => audit.mediaPlays.slice(n).map(record => record.to - record.from), before);
    const expected = [.1, .5, 1, 3, 7, 15][i];
    assert.equal(spans.length, 4);
    assert.ok(spans.every(span => span >= expected - .08 && span < expected + .35), JSON.stringify({ expected, spans }));
    result.checks.baseMediaPlayback.push({ expected, spans });
  }
  await page.getByRole("button", { name: "Give up", exact: true }).click();
  await page.locator(".result").waitFor();
  const baseStats = await page.evaluate(() => JSON.parse(localStorage.getItem("yeatle:stats:snippet:base")));
  assert.equal(baseStats.songsAttempted, 1);
  await page.getByLabel("Difficulty").selectOption("easy");
  await page.reload();
  assert.equal(await page.getByLabel("Difficulty").inputValue(), "easy");
  await page.getByLabel("Difficulty").selectOption("base");
  await page.getByRole("button", { name: "Try another song", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("button.play").disabled);
  await page.getByLabel("Your guess", { exact: true }).fill(daily.song.title);
  await page.getByRole("button", { name: "Guess", exact: true }).click();
  await page.locator(".result.won").waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("yeatle:stats:snippet:base")).correctlyGuessed), 1);
  const stats = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => /stats|completed/.test(key))));
  result.checks.basePlaybackAndSeparateStats = true;
  console.log("Base lengths, playback and saved difficulty passed");
  await page.getByRole("tab", { name: "Daily", exact: true }).click();
  await page.locator("#game").waitFor({ state: "visible" });
  // Fail audio once, then load the same pinned song without consuming an attempt.
  const audioPattern = /\/(Songs\/|api\/daily\/audio)/;
  const failAudio = route => route.fulfill({ status: 503, body: "Fixture audio unavailable" });
  await page.route(audioPattern, failAudio);
  await page.locator("#play").click();
  await page.waitForFunction(() => document.querySelector("#notice").textContent.includes("no attempt was used"));
  assert.equal(await page.locator("#guesses li").count(), 0);
  await page.unroute(audioPattern, failAudio);
  for (let repeat = 0; repeat < 3; repeat++) { await play(page, .1); await page.waitForFunction(() => document.querySelector("#play").textContent === "Play 0.1s"); }
  assert.ok((await page.evaluate(() => audit.starts)).every(s => s.offset === daily.clipAt));
  await page.locator("#guess").fill("definitely wrong");
  await page.locator("#submit").click();
  await page.reload();
  await page.waitForFunction(() => document.querySelector("#play").textContent === "Play 0.5s");
  await play(page, .5);
  await page.locator("#skip").click();
  await page.locator("#guess").fill(daily.song.title);
  await page.locator("#submit").click();
  await page.locator("#result").waitFor({ state: "visible" });
  await page.locator("#share").click();
  let share = await page.evaluate(() => audit.copied);
  assert.match(share, /1s · 3\/6\n🟥⬛🟩⬜⬜⬜/);
  assert.ok(!share.toLowerCase().includes(daily.song.title.toLowerCase()));
  // Copy directly even when native sharing exists; denied clipboard stays selectable.
  await page.evaluate(() => Object.defineProperty(navigator, "share", { configurable: true, value: async () => { audit.shared = "unexpected native share"; } }));
  await page.locator("#share").click();
  assert.equal(await page.evaluate(() => audit.shared), "");
  assert.equal(await page.evaluate(() => audit.copied), share);
  assert.equal(await page.locator("#share").textContent(), "Copy result");
  assert.equal(await page.locator("#share-text").isVisible(), false);
  await page.evaluate(() => { Object.defineProperty(navigator, "share", { configurable: true, value: undefined }); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } }); });
  await page.locator("#share").click();
  assert.equal(await page.locator("#share-text").inputValue(), share);
  result.checks.share = share;
  await page.reload();
  await page.locator("#result").waitFor({ state: "visible" });
  assert.deepEqual(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => /stats|completed/.test(key)))), stats);
  result.checks.savedAttemptsResultsAndPracticeIsolation = true;
  console.log("Daily retries, repeated playback, persistence and sharing passed");
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, `daily-${width}.png`) });
  }
  await page.setViewportSize({ width: 1100, height: 950 });
  await page.screenshot({ path: path.join(output, "daily-desktop.png") });
  await page.locator('a.tab[href="./karaoke"]').click();
  await page.locator("#song-list button").first().waitFor();
  await page.getByRole("tab", { name: "Daily", exact: true }).click();
  await page.locator("#result").waitFor({ state: "visible" });
  result.checks.navigation = true;
  // Browser back must leave a usable Daily, including when restored from BFCache.
  await play(page, 15);
  await page.locator('a.tab[href="./?mode=snippet"]').click();
  await page.locator(".track .seg").first().waitFor();
  await page.goBack();
  await page.locator("#result").waitFor({ state: "visible" });
  await play(page, 15);
  result.checks.backNavigation = { persisted: await page.evaluate(() => audit.persisted) };
  // Second tab sees the same result; a storage event updates a live first tab.
  const second = await context.newPage();
  await dailyPage(second);
  await second.locator("#result").waitFor({ state: "visible" });
  await second.evaluate(key => localStorage.removeItem(key), dailyKey(daily.date));
  await page.waitForFunction(() => document.querySelector("#result").hidden);
  await second.close();
  // Lose at all six lengths, including a persisted finished loss.
  await page.reload();
  await play(page, .1);
  await page.evaluate(() => { for (let i = 0; i < 6; i++) document.querySelector("#skip").click(); });
  assert.equal(await page.locator("#result-label").textContent(), "The song was");
  await page.reload();
  await page.locator("#result").waitFor({ state: "visible" });
  result.checks.lossAndCrossTab = true;
  // Real local authority and independent proxy servers with different libraries.
  const audioHashes = await Promise.all(daily.audio.map(async audio => crypto.createHash("sha256").update(Buffer.from(await (await fetch(new URL(audio, origin))).arrayBuffer())).digest("hex")));
  result.checks.authorityClients = [];
  for (const [index, songs] of [[], [{ id: "unrelated", title: "Other local song", display: "Other local song", mode: "filter", keys: ["unrelated"], source: { kind: "search" } }]].entries()) {
    const url = await client(`client-${index}`, songs);
    const body = await (await fetch(`${url}/api/daily`)).json();
    for (const key of ["id", "date", "seed", "clipAt", "resetsAt", "song"]) assert.deepEqual(body[key], daily[key]);
    const hashes = await Promise.all(body.audio.map(async audio => crypto.createHash("sha256").update(Buffer.from(await (await fetch(new URL(audio, url))).arrayBuffer())).digest("hex")));
    assert.deepEqual(hashes, audioHashes);
    await dailyPage(page, url);
    await play(page, .1);
    assert.ok((await page.evaluate(() => audit.starts)).every(s => s.offset === daily.clipAt));
    result.checks.authorityClients.push({ url, librarySize: songs.length, id: body.id, clipAt: body.clipAt, resetsAt: body.resetsAt, audioHashes: hashes });
  }
  // The single-file route uses real existing audio as a local full-file fixture.
  const fullHost = await client("full-authority", [{ ...daily.song, mode: "filter", folder: null,
    source: { kind: "url", id: new URL(daily.audio[0], origin).href } }], "");
  const fullDaily = await (await fetch(`${fullHost}/api/daily`)).json();
  assert.equal(fullDaily.audio.length, 1);
  const fullClient = await client("full-client", [], fullHost);
  const proxied = await (await fetch(`${fullClient}/api/daily`)).json();
  assert.equal(proxied.id, fullDaily.id);
  assert.equal(proxied.clipAt, fullDaily.clipAt);
  const fullBytes = Buffer.from(await (await fetch(new URL(fullDaily.audio[0], fullHost))).arrayBuffer());
  const proxyBytes = Buffer.from(await (await fetch(new URL(proxied.audio[0], fullClient))).arrayBuffer());
  assert.deepEqual(proxyBytes, fullBytes);
  await dailyPage(page, fullClient);
  await play(page, .1);
  assert.equal(await page.evaluate(() => audit.starts.length), 1);
  result.checks.singleFileAuthorityPlayback = true;
  const unavailable = await client("unavailable", [{ id: "local", source: { kind: "search" } }], "http://127.0.0.1:1");
  await page.goto(`${unavailable}/daily.html`);
  await page.locator("#retry").waitFor({ state: "visible" });
  assert.match(await page.locator("#notice").textContent(), /no alternate song was selected/);
  assert.equal(await page.locator("#game").isVisible(), false);
  assert.equal(fs.existsSync(path.join(output, "unavailable/daily-challenges.json")), false);
  result.checks.unavailableAuthorityHasNoFallback = true;
  // Leave while a compressed file is still downloading, then use browser Back.
  await page.goto(`${origin}/daily.html`);
  await page.locator("#game").waitFor({ state: "visible" });
  let releaseAudio;
  const hold = new Promise(resolve => { releaseAudio = resolve; });
  let requested;
  const requestedAudio = new Promise(resolve => { requested = resolve; });
  const holdAudio = async route => { requested(); await hold; await route.abort().catch(() => {}); };
  await page.route(audioPattern, holdAudio);
  await page.locator("#play").click();
  await requestedAudio;
  await page.locator('a.tab[href="./karaoke"]').click();
  await page.locator("#song-list button").first().waitFor();
  releaseAudio();
  await page.unroute(audioPattern, holdAudio);
  await page.goBack();
  await page.locator("#game").waitFor({ state: "visible" });
  await play(page, 15);
  result.checks.navigateDuringDownload = { persisted: await page.evaluate(() => audit.persisted) };
  // Inject only fixture HTTP clock responses; never change the PC or pinned store.
  const nextDate = new Date(daily.resetsAt).toISOString().slice(0, 10);
  let clockRequests = 0;
  const clockResponse = route => {
    const next = clockRequests++ > 0;
    return route.fulfill({ json: { ...daily, id: next ? `fixture:${nextDate}` : `fixture:${daily.date}`, date: next ? nextDate : daily.date,
      serverTime: next ? daily.resetsAt : daily.resetsAt - 500, resetsAt: daily.resetsAt + (next ? 86400000 : 0) } });
  };
  await page.route(`${origin}/api/daily`, clockResponse);
  await dailyPage(page);
  await page.waitForFunction(date => document.querySelector("#day").textContent.includes(date), nextDate);
  assert.equal(await page.locator("#guesses li").count(), 0);
  assert.equal(await page.locator("#play").textContent(), "Play 0.1s");
  assert.ok(clockRequests >= 2);
  await page.unroute(`${origin}/api/daily`, clockResponse);
  result.checks.openTabRolloverWithFixtureClock = true;
  result.checks.errors = errors;
  assert.deepEqual(errors, []);
  result.passed = true;
})().catch(async error => {
  result.passed = false; result.failure = error.stack; process.exitCode = 1;
  if (page && !page.isClosed()) {
    result.diagnostics = await page.evaluate(() => ({ url: location.href, text: document.body.innerText, audit })).catch(() => null);
    await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
  }
})
  .finally(async () => { await browser?.close(); for (const child of children) child.kill(); clearTimeout(watchdog); fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ passed: result.passed, failure: result.failure, output })); });
