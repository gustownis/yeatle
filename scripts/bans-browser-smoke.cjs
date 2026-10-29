// Banned screen, leaderboard button and admin panels in a real browser, against a local
// server with its own data folder.
//
//   YEATLE_PLAYWRIGHT_MODULE=<path to playwright or playwright-core>
//   YEATLE_TEST_BROWSER=<Chrome or Edge executable> (Chrome/Edge play the H.264 video)
//   node scripts/bans-browser-smoke.cjs
//
// Checks, at desktop (1280x800) and phone (390x844) sizes:
// - a banned device sees the banned screen on Stems/Snippets, Daily and Karaoke, with the
//   looping video playing, the configured jobs link, no horizontal scrolling, its synced
//   progress cleared and its settings kept, and the page closes without any dialog
// - the 🏆 Leaderboard button still opens the leaderboard for everyone else
// - the admin panel's Banned users, Filtered usernames and Song test search panels work
const { chromium } = require(process.env.YEATLE_PLAYWRIGHT_MODULE || "playwright-core");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".tmp", `bans-browser-smoke-${Date.now()}`);
const PORT = 3197;
const base = `http://127.0.0.1:${PORT}`;
const JOBS = "https://www.indeed.com/q-game-tester-jobs.html";
const wait = ms => new Promise(r => setTimeout(r, ms));
const SIZES = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844, isMobile: true, hasTouch: true } };

function wav(seconds) {
  const rate = 8000, n = seconds * rate, buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  return buf;
}

const post = (url, body, headers = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

async function bannedScreen(browser, device, size, page_) {
  const context = await browser.newContext({ viewport: SIZES[size], isMobile: SIZES[size].isMobile, hasTouch: SIZES[size].hasTouch });
  await context.addInitScript(([id]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("yeatle:device", id);
    localStorage.setItem("yeatle:completed", JSON.stringify(["a"]));
    localStorage.setItem("yeatle:daily:2026-10-27", JSON.stringify({ status: "lost", attempts: [] }));
    localStorage.setItem("yeatle-karaoke-best:a:easy", JSON.stringify({ score: 5, name: "x" }));
    localStorage.setItem("yeatle-karaoke-settings", JSON.stringify({ difficulty: "hard" }));
  }, [device]);
  const page = await context.newPage();
  const dialogs = [], errors = [];
  page.on("dialog", d => { dialogs.push(d.type()); d.dismiss(); });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`${base}${page_}`);
  await page.waitForSelector(".yeatle-banned", { timeout: 20000 });
  await wait(1500);
  const state = await page.evaluate(() => {
    const v = document.querySelector(".yeatle-banned video"), a = document.querySelector(".yeatle-banned-link");
    return {
      loop: v.loop, muted: v.muted, autoplay: v.autoplay, playsInline: v.playsInline, playing: !v.paused && v.currentTime > 0, error: v.error && v.error.code,
      href: a.href, target: a.target, rel: a.rel, title: document.querySelector("#yeatle-banned-title").textContent,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      keys: Object.keys(localStorage).sort(),
      lbVisible: Boolean(document.querySelector(".yeatle-lb-btn")?.offsetParent && getComputedStyle(document.querySelector(".yeatle-lb-btn")).visibility !== "hidden")
    };
  });
  await page.click(".yeatle-banned-sound");
  state.unmuted = await page.evaluate(() => !document.querySelector(".yeatle-banned video").muted);
  await page.screenshot({ path: path.join(OUT, `banned-${size}-${page_.replace(/\W/g, "") || "index"}.png`) });
  await page.close({ runBeforeUnload: true });
  await wait(300);
  state.closed = page.isClosed();
  state.dialogs = dialogs;
  state.errors = errors;
  await context.close();
  return state;
}

async function leaderboardButton(browser, size) {
  const context = await browser.newContext({ viewport: SIZES[size], isMobile: SIZES[size].isMobile, hasTouch: SIZES[size].hasTouch });
  const page = await context.newPage();
  const results = {};
  for (const page_ of ["/daily", "/karaoke"]) {
    await page.goto(`${base}${page_}`);
    await page.waitForSelector(".yeatle-lb-btn", { timeout: 20000 });
    await page.click(".yeatle-lb-btn");
    await page.waitForSelector(".yeatle-lb-overlay:not([hidden])");
    results[page_] = { opened: true, banned: Boolean(await page.$(".yeatle-banned")), overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) };
    await page.screenshot({ path: path.join(OUT, `leaderboard-${size}${page_.replace("/", "-")}.png`) });
  }
  await context.close();
  return results;
}

async function adminPanel(browser, size, hashes) {
  const context = await browser.newContext({ viewport: SIZES[size], isMobile: SIZES[size].isMobile, hasTouch: SIZES[size].hasTouch });
  const page = await context.newPage();
  const dialogs = [];
  page.on("dialog", d => { dialogs.push(d.message()); d.dismiss(); });
  await page.goto(`${base}/admin`);
  await page.fill('input[type=password]', "letmein");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=Banned users");
  await page.click("button:has-text('Banned users')");
  await page.waitForSelector(".ban-row");
  const listed = await page.textContent(".test-search:has(.ban-list)");
  await page.click("button:has-text('Add user')");
  await page.fill('input[aria-label="Username to ban"]', "nobody-here");
  await page.click(".ban-form button:has-text('Ban')");
  await page.click("button:has-text('Yes, ban nobody-here')");
  await page.waitForFunction(() => /No account is called/.test(document.querySelector(".test-search:has(.ban-list) .error[aria-live]")?.textContent || ""));
  await page.fill('input[aria-label="Username to ban"]', "cheater");
  await page.click(".ban-form button:has-text('Ban')");
  await page.click("button:has-text('Yes, ban cheater')");
  await page.waitForFunction(() => /already banned/.test(document.querySelector(".test-search:has(.ban-list) .error[aria-live]")?.textContent || ""));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.screenshot({ path: path.join(OUT, `admin-bans-${size}.png`), fullPage: true });
  await page.click("button:has-text('Filtered usernames')");
  await page.waitForSelector(".filter-add input[aria-label='Filtered username']");
  await page.click("button:has-text('Song test search')");
  await page.fill('input[aria-label="Find a song to play in the game"]', "smoke");
  await page.waitForSelector(".test-result");
  const html = await page.content();
  await context.close();
  return { listed, overflow, dialogs, leaks: hashes.filter(h => html.includes(h)) };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const stems = path.join(OUT, "songs", "Smoke song");
  fs.mkdirSync(stems, { recursive: true });
  for (const stem of ["drums", "bass", "other", "vocals"]) fs.writeFileSync(path.join(stems, `${stem}.mp3`), wav(4));
  const data = path.join(OUT, "data");
  fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, "config.json"), JSON.stringify({ tabs: [], refreshMinutes: 0, openBrowser: false, dailyAuthority: "", bannedJobsUrl: JOBS }));
  fs.writeFileSync(path.join(data, "admin.json"), JSON.stringify({ password: "letmein" }));
  const server = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env, YEATLE_PORT: String(PORT), YEATLE_DATA_DIR: data, YEATLE_STEMS_DIR: path.dirname(stems) }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  server.stdout.on("data", d => { log += d; });
  server.stderr.on("data", d => { log += d; });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/songs`)).ok) break; } catch {} await wait(200); }

  const device = "ab".repeat(16);
  await post(`${base}/api/account/register`, { username: "cheater", password: "pass1234" }, { "X-Yeatle-Device": device });
  const login = await post(`${base}/api/admin/login`, { password: "letmein" });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await post(`${base}/api/admin/bans`, { username: "cheater", reason: "smoke test" }, { Cookie: cookie })).status, 200);
  const hashes = [...new Set(fs.readFileSync(path.join(data, "leaderboard-bans.json"), "utf8").match(/[a-f0-9]{32}/g))]
    .filter(h => !JSON.parse(fs.readFileSync(path.join(data, "leaderboard-bans.json"), "utf8")).bans[h]);

  const browser = await chromium.launch({ executablePath: process.env.YEATLE_TEST_BROWSER, args: ["--mute-audio"] });
  const report = { banned: {}, leaderboard: {}, admin: {} };
  try {
    for (const size of Object.keys(SIZES)) {
      for (const page_ of ["/", "/daily", "/karaoke"]) report.banned[`${size} ${page_}`] = await bannedScreen(browser, device, size, page_);
      report.leaderboard[size] = await leaderboardButton(browser, size);
      report.admin[size] = await adminPanel(browser, size, hashes);
    }
  } finally {
    await browser.close();
    server.kill();
    fs.writeFileSync(path.join(OUT, "server.log"), log);
  }
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
  for (const [where, s] of Object.entries(report.banned)) {
    console.log(where.padEnd(18), JSON.stringify({ playing: s.playing, loop: s.loop, href: s.href, overflow: s.overflow, dialogs: s.dialogs, closed: s.closed, keys: s.keys.length }));
    assert.ok(s.playing && s.loop && s.muted && s.autoplay && s.playsInline && !s.error, `${where}: the video loops and plays`);
    assert.equal(s.href, JOBS);
    assert.equal(s.target, "_blank");
    assert.equal(s.rel, "noopener noreferrer");
    assert.equal(s.overflow, false, `${where}: no horizontal scrolling`);
    assert.equal(s.unmuted, true, "the sound button unmutes");
    assert.deepEqual(s.dialogs, [], `${where}: closing shows no dialog`);
    assert.equal(s.closed, true);
    const synced = k => k === "yeatle:account" || k === "yeatle:prestige" || k.startsWith("yeatle:completed") || k.startsWith("yeatle:stats") || k.startsWith("yeatle:daily:") || k.startsWith("yeatle-karaoke-best:");
    assert.deepEqual(s.keys.filter(synced), [], `${where}: synced progress is cleared`);
    assert.ok(s.keys.includes("yeatle-karaoke-settings") && s.keys.includes("yeatle:device"), `${where}: settings and the device id are kept`);
    assert.equal(s.lbVisible, false, `${where}: account features are hidden`);
    assert.deepEqual(s.errors, []);
  }
  for (const [size, pages] of Object.entries(report.leaderboard)) {
    console.log("leaderboard", size, JSON.stringify(pages));
    for (const r of Object.values(pages)) { assert.ok(r.opened && !r.banned); assert.equal(r.overflow, false); }
  }
  for (const [size, a] of Object.entries(report.admin)) {
    console.log("admin", size, JSON.stringify({ overflow: a.overflow, dialogs: a.dialogs, leaks: a.leaks }));
    assert.match(a.listed, /cheater/);
    assert.match(a.listed, /smoke test/);
    assert.equal(a.overflow, false, `admin ${size}: no horizontal scrolling`);
    assert.deepEqual(a.dialogs, []);
    assert.deepEqual(a.leaks, [], "the admin page shows no address or device hashes");
  }
  console.log(JSON.stringify({ passed: true, output: OUT }));
})().catch(e => { console.error(JSON.stringify({ passed: false, output: OUT, failure: e.stack })); process.exit(1); });
