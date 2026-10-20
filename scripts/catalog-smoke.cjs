// Browser integration for the post-1.11.3 catalog and canonical routes.
// Uses disposable profiles and one local song as synthetic playback for every
// metadata fixture. This tests the game logic, not the identity of the audio.
const { chromium } = require(process.env.YEATLE_PLAYWRIGHT_MODULE || "playwright-core");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), { fork } = require("node:child_process");
const root = path.resolve(__dirname, ".."), out = path.join(root, ".tmp", `catalog-smoke-${Date.now()}`);
const data = path.join(out, "data"); fs.mkdirSync(data, { recursive: true });
const fixture = process.env.YEATLE_TEST_STEMS || path.join(root, "build/Songs/Lyfe stealer");
for (const folder of ["Addicited", "Now LS", "Cant See"]) fs.cpSync(fixture, path.join(data, "Songs", folder), { recursive: true });
fs.writeFileSync(path.join(data, "config.json"), JSON.stringify({ tabs: [], refreshMinutes: 0, openBrowser: false, dailyAuthority: "" }));
const plain = (id, title, extra = {}) => ({ id, title, display: title, features: [], keys: [title], era: "4L", eraYear: 2021, tab: "Unreleased", mode: "filter", source: { kind: "url", id: "https://example.test/fixture.mp3" }, ...extra });
const cantLs = plain("cantsee@edit-40e9276af71a", "Cant see", { era: "LYFESTYLE [V2]", eraYear: 2024, source: { kind: "pillows", id: "f0fd44d52cec82b3006ee68200dd4342" } });
const cantAlive = plain("cantsee@edit-826ed631203a", "Cant See", { era: "Alivë", source: { kind: "pillows", id: "dcbb2d15f736cda5bee6758e8ce26ca5" } });
const cantMisbound = { ...cantAlive, mode: "stems", folder: "Cant See", source: { kind: "stems", folder: "Cant See" }, fallback: cantAlive.source };
const songs = [
  plain("addicited", "Addicited", { mode: "stems", folder: "Addicited", source: { kind: "stems", folder: "Addicited" } }),
  plain("addicted", "addicted", { era: "LYFESTYLE [V2]" }),
  plain("whatchusaid", "Whatchu said", { display: "Whatchu said (feat. UnoTheActivist)", features: ["feat. UnoTheActivist"], keys: ["whatchusaid", "watchusaid", "whatusaid"] }),
  plain("now", "Now", { display: "Now (feat. LUH GEEKY)", features: ["feat. LUH GEEKY"], era: "AftërLyfe", eraYear: 2023, tab: "Released" }),
  plain("now@lyfestyle", "Now", { era: "LYFESTYLE [V2]" }),
  plain("nowls", "Now LS", { mode: "stems", folder: "Now LS", source: { kind: "stems", folder: "Now LS" } }),
  plain("kankanamgc63", "Kankan - AMG C63", { type: "Production", tab: "Released" }),
  plain("genuinefeature", "Other artist - Vocal feature", { display: "Other artist - Vocal feature (feat. Yeat)", features: ["feat. Yeat"], type: "Feature", tab: "Released" }),
  plain("yungkayofleek", "Yung Kayo - fleek'", { era: "Hold Ön" }),
  plain("yungkayofleek@2alive", "Yung Kayo - fleek", { features: ["feat. Yeat"] }),
  plain("yungkayoyeet", "Yung Kayo - YEET", { features: ["feat. Yeat"], display: "Yung Kayo - YEET (feat. Yeat)", keys: ["yungkayoyeet", "yeet", "fleek"] }),
  plain("kankanzaza", "Kankan - Zaza", { features: ["feat. GOONIE"] }),
  plain("gooniezaza", "GOONIE - Zaza", { features: ["feat. YEAT & Kankan"] }),
  cantLs,
  { ...cantMisbound, sourceVariants: [cantAlive, cantMisbound], poolVariants: { unreleased: cantMisbound, stems: cantMisbound } },
  plain("popout", "Popout", { source: { kind: "pillows", id: "097bbbef1c6c196877f2815f57cb2706" } })
];
fs.writeFileSync(path.join(data, "songs-cache.json"), JSON.stringify({ format: 3, songs, eras: [] }));
const backend = fork(path.join(root, "server.js"), [], { silent: true, env: { ...process.env, YEATLE_DATA_DIR: data, YEATLE_PORT: "0", YEATLE_DESKTOP: "1" } });
for (const stream of [backend.stdout, backend.stderr]) stream.on("data", b => fs.appendFileSync(path.join(out, "server.log"), b));
let browser;
const result = { platform: process.platform, output: out, checks: {}, errors: [] };
(async () => {
  const port = await new Promise((resolve, reject) => { backend.on("message", m => m.type === "yeatle-ready" && resolve(m.port)); backend.once("error", reject); });
  const origin = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({ executablePath: process.env.YEATLE_TEST_BROWSER, headless: true, args: ["--mute-audio"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.route("**/api/audio/**", route => route.fulfill({ contentType: "audio/mpeg", body: fs.readFileSync(path.join(fixture, "vocals.mp3")) }));
  const page = await context.newPage(); page.on("pageerror", e => result.errors.push(e.message));
  for (const name of ["daily", "karaoke"]) {
    for (const suffix of ["", ".html", "/", ".html/"]) {
      await page.goto(`${origin}/${name}${suffix}?probe=one%20two#section`);
      assert.equal(new URL(page.url()).pathname, `/${name}`);
      assert.equal(new URL(page.url()).search, "?probe=one%20two");
      assert.equal(new URL(page.url()).hash, "#section");
      await page.reload(); assert.equal(new URL(page.url()).pathname, `/${name}`);
      assert.equal(await page.locator('script[src*="assets/"]').count() > 0, true);
    }
  }
  await page.goto(`${origin}/daily`); await page.goto(`${origin}/karaoke`); await page.goBack();
  assert.equal(new URL(page.url()).pathname, "/daily");
  await page.goForward(); assert.equal(new URL(page.url()).pathname, "/karaoke");
  result.checks.routesQueriesFragmentsRefreshHistory = true;
  async function round(id, level = 0, mode = "snippet", savedSong = null, restoredId = id) {
    await page.goto(origin);
    await page.evaluate(({ id, level, mode, savedSong }) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem("yeatle:lightStems", "true");
      localStorage.setItem(`yeatle:round:${mode === "snippet" ? "snippet:base" : mode}`, JSON.stringify({ songId: id, ...(savedSong ? { song: savedSong } : {}), level, attempts: Array.from({ length: level }, () => ({ kind: "skip" })), status: "playing", clipAt: 6.5 }));
    }, { id, level, mode, savedSong });
    await page.goto(`${origin}/?mode=${mode}`);
    await page.getByRole("textbox", { name: "Your guess" }).waitFor();
    await page.waitForFunction(id => Object.entries(localStorage).some(([k, v]) => k.includes("round:") && JSON.parse(v)?.songId === id), restoredId);
  }
  for (const id of ["addicited", "addicted"]) for (const level of [1, 2, 3]) {
    await round(id, level);
    await page.getByRole("textbox", { name: "Your guess" }).fill("ADDICTED!");
    await page.getByRole("button", { name: "Guess", exact: true }).click();
    await page.locator(".result.won").waitFor();
  }
  result.checks.addictedEarlyClipsAndBothIds = true;
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("yeatle:completed:snippet:base")).sort()), ["addicited", "addicted"], "completion follows the verified recording without changing stats");
  await round("whatchusaid", 1);
  await page.getByRole("textbox", { name: "Your guess" }).fill("Watchu Said? (ft. UnoTheActivist)");
  await page.getByRole("button", { name: "Guess", exact: true }).click();
  await page.locator(".result.won").waitFor();
  await round("whatchusaid", 5);
  const input = page.getByRole("textbox", { name: "Your guess" }); await input.fill("watchu");
  await page.locator('.suggestions [role="option"]').first().click();
  assert.equal(await page.locator(".guesses li").count(), 5, "selecting a suggestion uses no attempt");
  await page.getByRole("button", { name: "Guess", exact: true }).click();
  await page.locator(".result.won").waitFor();
  result.checks.watchuTypedAndSelected = true;
  await round("nowls"); await page.getByRole("textbox", { name: "Your guess" }).fill("Now");
  await page.getByRole("button", { name: "Guess", exact: true }).click();
  assert.equal(await page.locator(".guesses .wrong").count(), 1);
  await page.reload(); assert.equal(await page.locator(".guesses .wrong").count(), 1);
  await page.getByRole("textbox", { name: "Your guess" }).fill("Now LS");
  await page.getByRole("button", { name: "Guess", exact: true }).click(); await page.locator(".result.won").waitFor();
  result.checks.nowDistinctAndSavedRound = true;
  await round("kankanamgc63", 1, "stems");
  await page.getByRole("textbox", { name: "Your guess" }).fill("AMG");
  assert.equal(await page.locator('.suggestions [role="option"]').count(), 0, "a retired round is restorable without suggesting it for new rounds");
  await page.getByRole("textbox", { name: "Your guess" }).fill("Kankan - AMG C63");
  await page.getByRole("button", { name: "Guess", exact: true }).click(); await page.locator(".result.won").waitFor();
  result.checks.retiredRoundPreserved = true;
  await round("popout", 3, "stems");
  assert.match(await page.locator(".song-info").textContent(), /KillBunk/);
  await page.getByRole("textbox", { name: "Your guess" }).fill("Pop Out");
  await page.getByRole("button", { name: "Guess", exact: true }).click(); await page.locator(".result.won").waitFor();
  assert.match(await page.locator(".result").textContent(), /open verse.*KillBunk/s);
  result.checks.popoutLabels = true;
  await round(cantAlive.id, 2, "stems", cantMisbound, cantLs.id);
  assert.equal(await page.locator(".guesses li").count(), 2);
  await page.getByRole("textbox", { name: "Your guess" }).fill("Cant See (Alivë)");
  await page.getByRole("button", { name: "Guess", exact: true }).click();
  assert.equal(await page.locator(".guesses .wrong").count(), 1);
  assert.match(await page.locator(".song-info").textContent(), /LYFESTYLE \[V2\]/);
  await page.reload();
  assert.equal(await page.locator(".guesses .wrong").count(), 1);
  await page.getByRole("textbox", { name: "Your guess" }).fill("cant see");
  const cantSuggestions = page.locator('.suggestions [role="option"]');
  assert.equal(await cantSuggestions.count(), 2);
  await cantSuggestions.filter({ hasText: "LS V2" }).click();
  await page.getByRole("button", { name: "Guess", exact: true }).click();
  await page.locator(".result.won").waitFor();
  assert.match(await page.locator(".result").textContent(), /Cant see \(LS V2\)/);
  result.checks.cantSeeBindingLabelsAndSavedRound = true;
  await round("yungkayoyeet");
  await page.getByRole("textbox", { name: "Your guess" }).fill("fleek");
  assert.equal(await page.locator('.suggestions [role="option"]').count(), 1, "the verified title alias may find YEET, but neither Fleek recording is suggested");
  assert.match(await page.locator('.suggestions [role="option"]').textContent(), /YEET \(feat\. Yeat\)/);
  await page.getByRole("textbox", { name: "Your guess" }).fill("yeet");
  assert.equal(await page.locator('.suggestions [role="option"]').count(), 1);
  await page.locator('.suggestions [role="option"]').click();
  await page.getByRole("button", { name: "Guess", exact: true }).click();
  await page.locator(".result.won").waitFor();
  await round("gooniezaza");
  await page.getByRole("textbox", { name: "Your guess" }).fill("zaza");
  assert.equal(await page.locator('.suggestions [role="option"]').count(), 1);
  assert.match(await page.locator('.suggestions [role="option"]').textContent(), /GOONIE/);
  result.checks.fleekAndSoloZazaExcluded = true;
  await round("addicited"); await page.getByRole("textbox", { name: "Your guess" }).fill("addic");
  assert.equal(await page.locator('.suggestions [role="option"]').count(), 1, "verified equivalent recordings have one suggestion");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(out, "portrait.png") });
  result.checks.portraitAndDeduplication = true;
  assert.deepEqual(result.errors, []);
  result.passed = true;
})().catch(error => { result.passed = false; result.failure = error.stack; process.exitCode = 1; }).finally(async () => {
  await browser?.close(); backend.kill();
  fs.writeFileSync(path.join(out, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
});
