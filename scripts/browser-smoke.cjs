// Optional standalone-browser check. Requires playwright-core and real MP3 stems.
const { chromium } = require(process.env.YEATLE_PLAYWRIGHT_MODULE || "playwright-core");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { fork } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const output = path.join(root, ".tmp", `browser-smoke-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const data = path.join(output, "data");
const song = path.join(data, "Songs/Lyfe stealer");
fs.mkdirSync(song, { recursive: true });
fs.cpSync(process.env.YEATLE_TEST_STEMS || path.join(root, "build/Songs/Lyfe stealer"), song, { recursive: true });
fs.writeFileSync(path.join(song, "lyrics.lrc"), "[00:00.00]Browser playback test\n[00:05.00]Local timing test\n");
fs.writeFileSync(path.join(data, "config.json"), JSON.stringify({ port: 0, tabs: [], refreshMinutes: 0, openBrowser: false }));
const result = { executable: process.env.YEATLE_TEST_BROWSER, output, checks: {} };
const backend = fork(path.join(root, "server.js"), [], {
  silent: true, env: { ...process.env, YEATLE_DATA_DIR: data, YEATLE_PORT: "0", YEATLE_DESKTOP: "1" }
});
for (const stream of [backend.stdout, backend.stderr]) stream.on("data", bytes => fs.appendFileSync(path.join(output, "server.log"), bytes));
let browser;
const watchdog = setTimeout(() => { backend.kill(); browser?.close(); process.exitCode = 1; }, 100000);
(async () => {
  const port = await new Promise((resolve, reject) => {
    backend.on("message", message => { if (message.type === "yeatle-ready") resolve(message.port); });
    backend.once("error", reject);
    backend.once("exit", code => reject(new Error(`Server exited ${code}`)));
  });
  browser = await chromium.launch({ executablePath: process.env.YEATLE_TEST_BROWSER, headless: true, args: ["--mute-audio"] });
  result.browser = await browser.version();
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8, configurable: true });
    window.browserAudit = { starts: 0, cross: 0, countdown: [], layout: { frames: 0, maxX: 0, maxY: 0 } };
    const sampleLayout = () => {
      if (document.querySelector('#stage')?.hidden === false) {
        const layout = browserAudit.layout, root = document.documentElement;
        layout.frames++;
        layout.maxX = Math.max(layout.maxX, root.scrollWidth - innerWidth);
        layout.maxY = Math.max(layout.maxY, root.scrollHeight - innerHeight);
      }
      requestAnimationFrame(sampleLayout);
    };
    requestAnimationFrame(sampleLayout);
    const start = document.startViewTransition?.bind(document);
    if (start) document.startViewTransition = (...args) => { browserAudit.starts++; return start(...args); };
    addEventListener("pagereveal", event => { if (event.viewTransition) browserAudit.cross++; });
    if (location.origin !== "null" && !localStorage.getItem("yeatle-smoke-seeded")) {
      localStorage.setItem("yeatle-smoke-seeded", "true");
      localStorage.setItem("yeatle:lightStems", "true");
      localStorage.setItem("yeatle-karaoke-settings", JSON.stringify({ audioDelay: 0, players: [{ name: "Test singer", deviceId: "none" }] }));
    }
    addEventListener("DOMContentLoaded", () => {
      const countdown = document.querySelector("#countdown");
      if (countdown) new MutationObserver(() => browserAudit.countdown.push(countdown.textContent)).observe(countdown, { childList: true });
    });
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByRole("tab", { name: "Snippets", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent === "Snippets");
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('[role="tab"]');
    for (let i = 0; i < 20; i++) tabs[i % 2].click();
  });
  result.checks.game = await page.evaluate(() => ({
    desktop: globalThis.yeatleDesktop === true, runtime: document.documentElement.dataset.navigationRuntime,
    selected: document.querySelector('[role="tab"][aria-selected="true"]').textContent, ...browserAudit
  }));
  assert.equal(result.checks.game.runtime, "browser");
  assert.equal(result.checks.game.desktop, false);
  assert.equal(result.checks.game.selected, "Snippets");
  assert.equal(result.checks.game.starts, 0);
  await page.getByRole("tab", { name: "Karaoke", exact: true }).click();
  await page.locator("#song-list button").first().waitFor();
  result.checks.karaoke = await page.evaluate(() => ({ runtime: document.documentElement.dataset.navigationRuntime, ...browserAudit }));
  assert.equal(result.checks.karaoke.runtime, "browser");
  assert.equal(result.checks.karaoke.cross, 0);
  await page.locator(".audio-settings summary").click();
  await page.waitForFunction(() => document.querySelector(".audio-settings").open);
  await page.locator("#volume").evaluate(input => { input.value = "35"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.locator("#song-list button").first().click();
  await page.locator("#start").click();
  await page.locator("#stage").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForFunction(() => browserAudit.countdown.includes("Go!") && document.querySelector("#countdown").textContent === "");
  result.checks.playback = await page.evaluate(() => ({ countdown: browserAudit.countdown, layout: browserAudit.layout, progress: document.querySelector("#progress").style.width }));
  assert.deepEqual(result.checks.playback.countdown, ["3", "2", "1", "Go!", ""]);
  assert.ok(parseFloat(result.checks.playback.progress) > 0);
  assert.ok(result.checks.playback.layout.frames > 0);
  assert.ok(result.checks.playback.layout.maxX <= 1 && result.checks.playback.layout.maxY <= 1, JSON.stringify(result.checks.playback.layout));
  await page.screenshot({ path: path.join(output, "karaoke-playing.png") });
  await page.locator("#pause-btn").click();
  await page.locator("#pause").waitFor({ state: "visible" });
  await page.locator("#quit").click();
  await page.locator('[data-mode="stems"]').click();
  await page.getByRole("tab", { name: "Karaoke", exact: true }).click();
  await page.locator("#song-list button").first().waitFor();
  assert.equal(await page.locator("#volume").inputValue(), "35");
  result.checks.preferencesPersist = true;
  await page.setViewportSize({ width: 390, height: 844 });
  result.checks.narrow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(result.checks.narrow.scroll <= result.checks.narrow.width);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() => document.documentElement.dataset.interfaceMotion === "reduced");
  result.checks.reducedMotion = true;
  result.checks.errors = errors;
  assert.deepEqual(errors, []);
  result.passed = true;
})().catch(error => { result.passed = false; result.failure = error.stack; process.exitCode = 1; })
  .finally(async () => {
    await browser?.close();
    backend.kill();
    clearTimeout(watchdog);
    fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  });
