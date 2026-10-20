// Optional browser UI regression. Use an isolated test:1.11 launcher with local audio.
const { chromium } = require(process.env.YEATLE_PLAYWRIGHT_MODULE || "playwright-core");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const origin = process.env.YEATLE_TEST_URL || "http://127.0.0.1:3193";
const output = path.resolve(__dirname, "..", ".tmp", `daily-ui-smoke-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const result = { version: require("../package.json").version, platform: process.platform, output, checks: {}, errors: [] };
let browser, page;
async function load(context, daily, songs) {
  await context.addInitScript(() => {
    window.uiAudit = { copied: "", shareCalls: 0 };
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => { uiAudit.shareCalls++; } });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => { uiAudit.copied = text; } } });
  });
  await context.route(`${origin}/api/songs`, route => route.fulfill({ json: { songs } }));
  const tab = await context.newPage();
  tab.on("pageerror", error => result.errors.push(error.message));
  await tab.goto(`${origin}/daily.html`);
  await tab.locator("#game").waitFor({ state: "visible" });
  await tab.locator("#play").click();
  await tab.waitForFunction(() => !document.querySelector("#guess").disabled);
  return tab;
}
(async () => {
  const daily = await (await fetch(`${origin}/api/daily`)).json();
  assert.ok(daily.song?.title);
  const songs = [{ title: "Liv Likë Dis", display: "Liv Likë Dis", era: "ADL [V2]", eraYear: 2026 },
    ...Array.from({ length: 45 }, (_, i) => ({ title: `Song ${String(i + 1).padStart(2, "0")}`, display: `Song ${String(i + 1).padStart(2, "0")}`, era: "Test era", year: 2025 }))];
  browser = await chromium.launch({ executablePath: process.env.YEATLE_TEST_BROWSER, headless: true, args: ["--mute-audio"] });
  result.browser = await browser.version();
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  page = await load(context, daily, songs);
  const input = page.locator("#guess"), list = page.locator("#song-suggestions");
  assert.equal(await input.getAttribute("list"), null);
  await input.fill("liv lik");
  await list.waitFor({ state: "visible" });
  assert.equal(await list.locator(".suggestion-title").textContent(), "Liv Likë Dis");
  assert.equal(await list.locator(".suggestion-meta").textContent(), "ADL [V2] · 2026");
  assert.equal(await input.getAttribute("aria-expanded"), "true");
  await page.screenshot({ path: path.join(output, "daily-desktop.png") });
  await list.getByRole("option").click();
  assert.equal(await input.inputValue(), "Liv Likë Dis");
  assert.equal(await list.isVisible(), false);
  assert.equal(await page.locator("#guesses li").count(), 0);
  await input.fill("song");
  assert.equal(await list.getByRole("option").count(), 40);
  await input.press("ArrowDown");
  assert.equal(await list.locator('[aria-selected="true"] .suggestion-title').textContent(), "Song 02");
  await input.press("ArrowUp");
  await input.press("Enter");
  assert.equal(await input.inputValue(), "Song 01");
  assert.equal(await list.isVisible(), false);
  assert.equal(await page.locator("#guesses li").count(), 0);
  await input.fill("song");
  for (let i = 0; i < 25; i++) await input.press("ArrowDown");
  assert.ok(await list.evaluate(el => el.scrollTop > 0));
  await input.press("Escape");
  assert.equal(await input.getAttribute("aria-expanded"), "false");
  await input.fill("liv lik");
  await page.locator("h1").click();
  assert.equal(await list.isVisible(), false);
  await input.fill("no matching title qzx");
  assert.equal(await list.isVisible(), false);
  result.checks.autocomplete = { mouse: true, keyboard: true, metadata: true, limit: 40, scroll: true, escapeBlurAndNoMatch: true, selectionUsesNoAttempt: true };
  result.checks.layout = await page.evaluate(() => ({ width: document.querySelector(".daily-shell").getBoundingClientRect().width,
    logo: document.querySelector(".logo").getBoundingClientRect().width, play: getComputedStyle(document.querySelector("#play")).backgroundColor,
    clip: getComputedStyle(document.querySelector("#clips .now")).backgroundColor }));
  assert.equal(result.checks.layout.width, 640);
  assert.equal(result.checks.layout.logo, 360);
  assert.equal(result.checks.layout.play, "rgb(137, 1, 185)");
  assert.equal(result.checks.layout.clip, "rgb(137, 1, 185)");
  result.checks.portraitLogos = [];
  for (const [width, height] of [[360, 844], [390, 844], [768, 1024], [820, 1180]]) {
    await page.setViewportSize({ width, height });
    await input.fill("liv lik");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const logo = await page.locator(".logo").evaluate(el => el.getBoundingClientRect().width);
    assert.ok(logo <= 240 && logo >= 200);
    result.checks.portraitLogos.push({ mode: "Daily", width, height, logo });
    await page.screenshot({ path: path.join(output, `daily-${width}.png`) });
  }
  result.checks.narrow = true;
  const modes = await context.newPage();
  for (const [width, height] of [[390, 844], [768, 1024]]) {
    await modes.setViewportSize({ width, height });
    for (const mode of ["stems", "snippet"]) {
      await modes.goto(`${origin}/?mode=${mode}`);
      await modes.locator(".logo").waitFor();
      const logo = await modes.locator(".logo").evaluate(el => el.getBoundingClientRect().width);
      assert.ok(logo <= 240 && logo >= 200, `${mode} portrait logo: ${logo}`);
      assert.ok(await modes.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      result.checks.portraitLogos.push({ mode, width, height, logo });
    }
    await modes.goto(`${origin}/karaoke.html`);
    await modes.locator(".top .logo").waitFor();
    assert.equal(await modes.locator(".top .logo").evaluate(el => el.getBoundingClientRect().height), 30);
  }
  await modes.setViewportSize({ width: 1280, height: 950 });
  await modes.goto(`${origin}/?mode=snippet`);
  await modes.locator(".logo").waitFor();
  assert.equal(await modes.locator(".logo").evaluate(el => el.getBoundingClientRect().width), 360);
  await modes.close();
  await input.fill(daily.song.title);
  await input.press("Escape");
  await page.locator("#submit").click();
  await page.locator("#result").waitFor({ state: "visible" });
  assert.equal(await page.locator("#share").textContent(), "Copy result");
  await page.locator("#share").click();
  const copied = await page.evaluate(() => uiAudit.copied);
  assert.ok(copied.startsWith(`Yeatle Daily ${daily.date}\n0.1s · 1/6\n🟩⬜⬜⬜⬜⬜\n`));
  assert.ok(copied.endsWith((daily.shareUrl || `${origin}/daily`).replace(/\/daily\.html(?=$|[?#])/, "/daily")));
  assert.ok(!copied.toLowerCase().includes(daily.song.title.toLowerCase()));
  assert.equal(await page.evaluate(() => uiAudit.shareCalls), 0);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } }));
  await page.locator("#share").click();
  const fallback = await page.locator("#share-text").evaluate(el => ({ value: el.value, start: el.selectionStart, end: el.selectionEnd, hidden: el.hidden }));
  assert.deepEqual(fallback, { value: copied, start: 0, end: copied.length, hidden: false });
  result.checks.copyOnlyAndSelectedFallback = true;
  await page.reload();
  await page.locator("#result").waitFor({ state: "visible" });
  assert.equal(await list.isVisible(), false);
  result.checks.savedResult = true;
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const touchPage = await load(touch, daily, songs);
  await touchPage.locator("#guess").fill("liv lik");
  await touchPage.getByRole("option", { name: /Liv Likë Dis/ }).tap();
  assert.equal(await touchPage.locator("#guess").inputValue(), "Liv Likë Dis");
  assert.equal(await touchPage.locator("#song-suggestions").isVisible(), false);
  assert.equal(await touchPage.locator("#guesses li").count(), 0);
  result.checks.emulatedTouchSelection = true;
  assert.deepEqual(result.errors, []);
  result.passed = true;
})().catch(async error => {
  result.passed = false;
  result.failure = error.stack;
  process.exitCode = 1;
  await page?.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
}).finally(async () => {
  await browser?.close();
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: result.passed, output, failure: result.failure }));
});
