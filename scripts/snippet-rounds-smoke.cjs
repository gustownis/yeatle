// Checks server-picked Snippets rounds in a real browser against a local server only.
// Requires ffmpeg on PATH (to make short test stems) and Playwright with Chromium; set
// YEATLE_PLAYWRIGHT_MODULE / YEATLE_TEST_BROWSER like scripts/browser-smoke.cjs if needed.
// Run: node scripts/snippet-rounds-smoke.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fork, execFileSync } = require("node:child_process");
const { chromium } = require(process.env.YEATLE_PLAYWRIGHT_MODULE || "playwright");

const root = path.resolve(__dirname, "..");
const TITLES = ["Flawless", "Talk", "Gettin Old", "Sorry Bout That"];
const data = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-rounds-smoke-"));
const result = { checks: {} };
let backend, browser;

function makeStems() {
  TITLES.forEach((title, i) => {
    const dir = path.join(data, "Songs", title);
    fs.mkdirSync(dir, { recursive: true });
    ["drums", "bass", "other", "vocals"].forEach((stem, j) => {
      execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `sine=frequency=${220 + i * 60 + j * 15}:duration=40`, "-q:a", "9", path.join(dir, `${stem}.mp3`)]);
    });
  });
}

function startServer() {
  fs.writeFileSync(path.join(data, "config.json"), JSON.stringify({ tabs: [], refreshMinutes: 0, openBrowser: false, dailyAuthority: "" }));
  fs.writeFileSync(path.join(data, "admin.json"), JSON.stringify({ password: "smoke" }));
  backend = fork(path.join(root, "server.js"), [], { silent: true, env: { ...process.env, YEATLE_DATA_DIR: data, YEATLE_PORT: "0", YEATLE_DESKTOP: "1" } });
  return new Promise((resolve, reject) => {
    backend.on("message", m => m.type === "yeatle-ready" && resolve(m.port));
    backend.once("exit", code => reject(new Error(`server exited (${code})`)));
  });
}

(async () => {
  makeStems();
  const base = `http://127.0.0.1:${await startServer()}`;
  browser = await chromium.launch({ executablePath: process.env.YEATLE_TEST_BROWSER, args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  // Everything the page received during the round, except the song list it always gets.
  const seen = [];
  page.on("response", async res => {
    const url = res.url();
    seen.push(url);
    if (/\/api\//.test(url) && !/\/api\/(songs|audio)/.test(url)) seen.push(await res.text().catch(() => ""));
  });

  await page.goto(`${base}/`);
  await page.click(".yeatle-lb-btn");
  await page.fill(".yeatle-lb-auth-form input[type=text]", "smoketester");
  await page.fill(".yeatle-lb-auth-form input[type=password]", "pass1234");
  await page.click("text=Create account");
  await page.waitForSelector("text=Change username");
  await page.keyboard.press("Escape");

  const started = page.waitForResponse(res => res.url().includes("/api/account/round/start"));
  await page.getByRole("tab", { name: "Snippets", exact: true }).click();
  const start = await (await started).json();
  assert.deepEqual(Object.keys(start).sort(), ["ranked", "roundId", "scope", "stems", "tries"]);
  await page.waitForResponse(res => res.url().includes(`/api/audio/round-${start.roundId}`));
  result.checks.audioByRound = true;

  const before = { seen: seen.join("\n"), storage: await page.evaluate(() => JSON.stringify(localStorage)), dom: await page.evaluate(() => document.body.innerText) };

  // Guess every title in turn, slowly enough to be human, until the round ends.
  const input = page.getByPlaceholder("Type a song name");
  let finish;
  for (const title of TITLES) {
    await page.waitForTimeout(2200);
    const acted = page.waitForResponse(res => res.url().includes("/api/account/round/act"));
    await input.fill(title);
    await input.press("Escape");
    await input.press("Enter");
    finish = await (await acted).json();
    if (finish.status !== "playing") break;
  }
  assert.equal(finish.status, "won");
  const answer = finish.song.display;
  result.checks.answer = answer;
  const leak = new RegExp(answer.replace(/[^a-z0-9]/gi, ".?"), "i");
  assert.ok(!leak.test(before.seen), "no response before the end named the song");
  // yeatle:song-list is the whole catalog the page keeps for suggestions; it names every song.
  const stored = Object.entries(JSON.parse(before.storage)).filter(([k, v]) => k !== "yeatle:song-list" && leak.test(v)).map(([k, v]) => `${k}=${v.slice(0, 300)}`);
  assert.deepEqual(stored, [], "nothing saved on the device named the song");
  assert.ok(!leak.test(before.dom), "the page didn't show the song");
  await page.waitForFunction(name => document.body.innerText.includes(name), answer);
  result.checks.revealedAfterWin = true;

  await page.waitForTimeout(1500);
  const board = await page.evaluate(() => fetch("api/leaderboard", { headers: { Authorization: `Bearer ${JSON.parse(localStorage.getItem("yeatle:account")).token}` } }).then(r => r.json()));
  // Four test songs are fewer than a ranked round needs (100), so this win doesn't rank;
  // tests/snippet-rounds.test.cjs covers ranked wins.
  assert.equal(start.ranked, false);
  assert.equal(board.boards.snippet.viewer.primary, 0, "a round from a tiny pool doesn't rank");
  result.checks.smallPoolUnranked = true;

  // The next round starts on its own and is a different, still hidden, song.
  await page.locator("text=Next song").first().click().catch(() => {});
  // A clean page never reports anything.
  assert.ok(!seen.some(entry => entry.includes("/api/account/report")), "nothing was reported before the injection");
  // A known cheat panel and a patched fetch: the account is banned and the code captured.
  await page.evaluate(() => {
    const realFetch = window.fetch;
    window.fetch = function solverFetch(...args) { return realFetch.apply(this, args); };
    localStorage.setItem("solver_settings", JSON.stringify({ autoInsert: true }));
    const panel = document.createElement("div");
    panel.textContent = "Yeatle Cracked by krankez · Snippets Solver · Captured Song Answer";
    document.body.appendChild(panel);
  });
  await page.waitForSelector("text=Indeed", { timeout: 15000 });
  const admin = await browser.newPage();
  await admin.goto(`${base}/admin`);
  await admin.fill("input[type=password]", "smoke");
  await admin.click("text=Log in");
  await admin.click("text=Banned users");
  await admin.waitForSelector("text=Automatic · needs review");
  assert.ok(await admin.locator("text=Yeatle Cracked").count());
  await admin.waitForSelector("text=replaced fetch");
  const capture = await admin.evaluate(async () => {
    const link = document.querySelector('a[href^="/api/admin/evidence/"]');
    const res = await fetch(link.getAttribute("href"));
    return { disposition: res.headers.get("content-disposition"), text: await res.text() };
  });
  assert.match(capture.disposition, /^attachment; filename="yeatle-capture-smoketester-/);
  assert.match(capture.text, /solverFetch/);
  assert.match(capture.text, /solver_settings/);
  assert.match(capture.text, /Yeatle Cracked/);
  assert.ok(!/yeatle:account|"token"/.test(capture.text), "the player's own Yeatle data isn't captured");
  result.checks.captured = true;
  await admin.click("text=Players");
  await admin.waitForSelector("text=smoketester");
  result.checks.autoBan = true;
  assert.deepEqual(errors, []);
  result.passed = true;
})().catch(error => { result.passed = false; result.failure = error.stack; process.exitCode = 1; })
  .finally(async () => {
    await browser?.close();
    backend?.kill();
    fs.rmSync(data, { recursive: true, force: true });
    console.log(JSON.stringify(result, null, 2));
  });
