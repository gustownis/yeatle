const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fork } = require("node:child_process");
const { createLeaderboardStore, emptyProgress, BANNED_MESSAGE, NETWORK_BLOCKED_MESSAGE } = require("../leaderboard.cjs");
const { clientIp } = require("../client-signals.cjs");

const root = path.resolve(__dirname, "..");
const DAY = 86400000;
const NOW = Date.parse("2026-10-27T12:00:00Z");
const progress = { completed: { stems: ["a", "b"] }, karaoke: { "yeatle-karaoke-best:a:easy": { score: 1000, name: "x" } } };

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-ban-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const isBanned = err => err.status === 403 && err.banned === true && err.message === BANNED_MESSAGE;

test("old account records gain a stable id without changing names, tokens or progress", t => {
  const dir = tempDir(t);
  const file = path.join(dir, "leaderboard-users.json");
  const old = { username: "Mat", key: "mat", salt: "00", hash: "00", tokens: ["t".repeat(48)], createdAt: 1, updatedAt: 2, progress };
  fs.writeFileSync(file, JSON.stringify({ users: { mat: old } }));
  const store = createLeaderboardStore(file);
  const saved = JSON.parse(fs.readFileSync(file, "utf8")).users.mat;
  assert.match(saved.id, /^[a-f0-9]{24}$/);
  assert.equal(saved.username, "Mat");
  assert.deepEqual(saved.tokens, old.tokens);
  assert.deepEqual(saved.progress, progress);
  assert.deepEqual(saved.legacyKaraoke, progress.karaoke, "pre-existing karaoke bests are kept aside, not deleted");
  assert.equal(store.me(old.tokens[0]).account.username, "Mat", "existing sessions keep working");
  createLeaderboardStore(file);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).users.mat.id, saved.id, "the id never changes on later loads");
});

test("a ban signs the account out, resets only its progress, reserves its name and survives renames and restarts", async t => {
  const dir = tempDir(t);
  const file = path.join(dir, "leaderboard-users.json");
  const store = createLeaderboardStore(file);
  const ctx = { ipHash: "ip-cheater", deviceHash: "dev-cheater" };
  const cheater = await store.register({ username: "cheater", password: "pass1234", progress }, NOW, ctx);
  const second = await store.login({ username: "cheater", password: "pass1234" }, NOW, ctx);
  const honest = await store.register({ username: "honest", password: "pass1234", progress }, NOW, { ipHash: "ip-honest", deviceHash: "dev-honest" });
  await store.register({ username: "other", password: "pass1234" }, NOW, { ipHash: "ip-other", deviceHash: "dev-other" });
  store.rename(cheater.token, "cheater2", NOW, ctx);

  const before = JSON.parse(fs.readFileSync(file, "utf8")).users;
  const { bans } = store.banUser("CHEATER2", "aimbot karaoke", NOW);
  const after = JSON.parse(fs.readFileSync(file, "utf8")).users;
  for (const key of Object.keys(before).filter(k => k !== "cheater2")) {
    assert.equal(JSON.stringify(after[key]), JSON.stringify(before[key]), `${key} is byte-identical after someone else's ban`);
  }
  assert.deepEqual(after.cheater2.tokens, []);
  assert.deepEqual(after.cheater2.progress, emptyProgress(), "progress is reset to a new account's");
  assert.equal(bans.length, 1);
  assert.equal(bans[0].username, "cheater2");
  assert.equal(bans[0].reason, "aimbot karaoke");

  // Every session ends immediately, with the banned answer rather than a plain sign-out.
  for (const token of [cheater.token, second.token]) {
    assert.throws(() => store.sync(token, progress, NOW), isBanned);
    assert.throws(() => store.rename(token, "newname", NOW), isBanned);
    assert.throws(() => store.me(token, NOW), isBanned);
    assert.throws(() => store.status(token, NOW), isBanned);
  }
  await assert.rejects(store.login({ username: "cheater2", password: "pass1234" }, NOW, { ipHash: "ip-elsewhere", deviceHash: "dev-elsewhere" }), isBanned, "a different address on the banned account is still banned");
  await assert.rejects(store.register({ username: "Cheater2", password: "pass1234" }, NOW), { status: 409 }, "the name stays reserved");
  const boards = store.getLeaderboards(honest.token, NOW);
  assert.equal(Object.values(boards.boards).some(b => b.entries.some(e => e.username === "cheater2")), false);
  assert.equal(boards.totalAccounts, 2);

  // Restart: the ban and its revoked sessions hold.
  const reopened = createLeaderboardStore(file);
  assert.throws(() => reopened.sync(cheater.token, progress, NOW), isBanned);
  await assert.rejects(reopened.login({ username: "cheater2", password: "pass1234" }, NOW), isBanned);
  assert.throws(() => reopened.banUser("cheater2", "", NOW), /already banned/);
  assert.throws(() => reopened.banUser("nobody", "", NOW), { status: 404 });

  // Restore progress brings the snapshot back; unbanning without it keeps the reset.
  const id = reopened.listBans().bans[0].accountId;
  assert.deepEqual(reopened.unbanUser(id, { restore: true }, NOW).bans, []);
  const restored = await reopened.login({ username: "cheater2", password: "pass1234" }, NOW, ctx);
  assert.equal(restored.account.progress.completed.stems.length, 2, "Restore progress puts the snapshot back");
  reopened.banUser("cheater2", "", NOW);
  reopened.unbanUser(id, {}, NOW);
  const back = await reopened.login({ username: "cheater2", password: "pass1234" }, NOW, ctx);
  assert.deepEqual(back.account.progress, emptyProgress(), "a plain unban doesn't restore progress");
});

test("a ban restricts the account's devices until unbanned and its addresses for a while", async t => {
  const store = createLeaderboardStore(path.join(tempDir(t), "leaderboard-users.json"), { ipBlockMs: 30 * DAY });
  await store.register({ username: "cheater", password: "pass1234" }, NOW, { ipHash: "ip1", deviceHash: "dev1" });
  const { bans } = store.banUser("cheater", "", NOW);

  await assert.rejects(store.register({ username: "fresh1", password: "pass1234" }, NOW, { ipHash: "ip9", deviceHash: "dev1" }), isBanned, "the banned device can't make a new account");
  assert.throws(() => store.status("", NOW, { deviceHash: "dev1" }), isBanned, "the banned device sees the banned screen");
  assert.throws(() => store.getLeaderboards("", NOW, { deviceHash: "dev1" }), isBanned);

  const network = err => err.status === 403 && err.banned === true && err.message === NETWORK_BLOCKED_MESSAGE;
  await assert.rejects(store.register({ username: "fresh2", password: "pass1234" }, NOW, { ipHash: "ip1", deviceHash: "dev2" }), network, "the banned address can't make accounts");
  const neighbour = await store.register({ username: "neighbour", password: "pass1234" }, NOW, { ipHash: "ip2", deviceHash: "dev3" });
  await assert.rejects(store.login({ username: "neighbour", password: "pass1234" }, NOW, { ipHash: "ip1", deviceHash: "dev3" }), network, "nor sign in to other accounts");
  assert.deepEqual(store.status("", NOW, { ipHash: "ip1", deviceHash: "dev3" }), { banned: false }, "plain play on a shared network stays open");
  assert.equal(store.getLeaderboards(neighbour.token, NOW, { ipHash: "ip1", deviceHash: "dev3" }).viewer.username, "neighbour");

  const later = NOW + 31 * DAY;
  assert.equal((await store.register({ username: "fresh3", password: "pass1234" }, later, { ipHash: "ip1", deviceHash: "dev4" })).account.username, "fresh3", "address restrictions expire");
  await assert.rejects(store.register({ username: "fresh4", password: "pass1234" }, later, { ipHash: "ip7", deviceHash: "dev1" }), isBanned, "device restrictions don't");

  store.unbanUser(bans[0].accountId, {}, later);
  assert.equal((await store.register({ username: "fresh5", password: "pass1234" }, later, { ipHash: "ip1", deviceHash: "dev1" })).account.username, "fresh5", "unbanning lifts both");
});

test("sessions expire after six months unused, and a stranger can't lock an owner out", async t => {
  const store = createLeaderboardStore(path.join(tempDir(t), "leaderboard-users.json"));
  const { token } = await store.register({ username: "player", password: "pass1234" }, NOW);
  assert.equal(store.me(token, NOW + 100 * DAY).account.username, "player");
  assert.equal(store.me(token, NOW + 279 * DAY).account.username, "player", "use refreshes the session");
  assert.throws(() => store.sync(token, {}, NOW + 460 * DAY), { status: 401 });

  for (let i = 0; i < 5; i++) await assert.rejects(store.login({ username: "player", password: "wrong" }, NOW, { ipHash: "attacker" }), /Wrong/);
  await assert.rejects(store.login({ username: "player", password: "pass1234" }, NOW, { ipHash: "attacker" }), /Too many/);
  assert.ok((await store.login({ username: "player", password: "pass1234" }, NOW, { ipHash: "owner" })).token, "the owner's own address isn't locked");
});

test("client addresses come from the socket unless a configured proxy forwarded them", () => {
  const req = (peer, forwarded) => ({ socket: { remoteAddress: peer }, headers: forwarded ? { "x-forwarded-for": forwarded } : {} });
  assert.equal(clientIp(req("::ffff:203.0.113.7")), "203.0.113.7");
  assert.equal(clientIp(req("203.0.113.7", "198.51.100.1")), "203.0.113.7", "a direct client can't claim another address");
  assert.equal(clientIp(req("127.0.0.1", "198.51.100.1, 203.0.113.9"), ["127.0.0.1"]), "203.0.113.9", "only the proxy's own right-most entry is trusted");
  assert.equal(clientIp(req("127.0.0.1", "198.51.100.1")), "", "an unconfigured local proxy gives no address instead of one shared by everyone");
  assert.equal(clientIp(req("127.0.0.1")), "127.0.0.1");
});

async function startServer(t, dir, config = {}) {
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ tabs: [], refreshMinutes: 0, openBrowser: false, dailyAuthority: "", ...config }));
  const child = fork(path.join(root, "server.js"), [], { silent: true, env: { ...process.env, YEATLE_DATA_DIR: dir, YEATLE_STEMS_DIR: "", YEATLE_DESKTOP: "1", YEATLE_PORT: "0" } });
  let logs = "";
  child.stdout.on("data", b => { logs += b; });
  child.stderr.on("data", b => { logs += b; });
  t.after(async () => {
    if (child.exitCode === null && !child.signalCode) { const exit = new Promise(r => child.once("exit", r)); child.kill(); await exit; }
  });
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(logs)), 5000);
    child.on("message", m => { if (m.type === "yeatle-ready") { clearTimeout(timeout); resolve(`http://127.0.0.1:${m.port}`); } });
    child.once("exit", () => { clearTimeout(timeout); reject(new Error(logs)); });
  });
  return { url, logs: () => logs };
}

// Test clients: the authority trusts 127.0.0.1 as its reverse proxy, so each request can
// name its own client address the way Caddy would.
const call = (url, { body, token, ip, device, cookie } = {}) => fetch(url, {
  method: body === undefined ? "GET" : "POST",
  headers: {
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(ip ? { "X-Forwarded-For": ip } : {}),
    ...(device ? { "X-Yeatle-Device": device } : {}),
    ...(cookie ? { Cookie: cookie } : {})
  },
  body: body === undefined ? undefined : JSON.stringify(body)
});
const DEV = n => String(n).repeat(32).slice(0, 32);

test("the shared website bans through its admin panel, and copies pass the banned answer through unchanged", async t => {
  const hostDir = tempDir(t);
  fs.writeFileSync(path.join(hostDir, "admin.json"), JSON.stringify({ password: "letmein" }));
  const host = (await startServer(t, hostDir, { trustedProxies: ["127.0.0.1"] })).url;
  const copy = (await startServer(t, tempDir(t), { dailyAuthority: host })).url;

  const reg = await (await call(`${host}/api/account/register`, { body: { username: "cheater", password: "pass1234" }, ip: "203.0.113.50", device: DEV(1) })).json();
  assert.ok(reg.token);
  // The authority recorded a hashed device and address, never the raw values.
  const users = fs.readFileSync(path.join(hostDir, "leaderboard-users.json"), "utf8");
  assert.equal(users.includes(DEV(1)), false);
  assert.equal(users.includes("203.0.113.50"), false);

  // New admin routes need the admin cookie.
  for (const [route, body] of [["/api/admin/bans", undefined], ["/api/admin/bans", { username: "cheater" }], ["/api/admin/unban", { accountId: "x" }], ["/api/admin/karaoke-flags", { id: "x" }]]) {
    assert.equal((await call(`${host}${route}`, { body })).status, 401, `${route} needs the admin cookie`);
  }
  const login = await call(`${host}/api/admin/login`, { body: { password: "letmein" } });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await call(`${host}/api/admin/bans`, { body: { username: "nobody" }, cookie })).status, 404);
  const banned = await call(`${host}/api/admin/bans`, { body: { username: "Cheater", reason: "stem injector" }, cookie });
  assert.equal(banned.status, 200);
  assert.equal((await call(`${host}/api/admin/bans`, { body: { username: "cheater" }, cookie })).status, 409);

  // Admin answers never contain addresses, devices or their hashes.
  const listing = await (await call(`${host}/api/admin/bans`, { cookie })).text();
  const moderation = fs.readFileSync(path.join(hostDir, "leaderboard-bans.json"), "utf8");
  const hashes = [...new Set(moderation.match(/[a-f0-9]{32}/g) || [])].filter(h => !listing.includes(`"accountId":"${h}`));
  assert.ok(hashes.length >= 2, "the moderation file holds address and device hashes");
  for (const secret of [...hashes, DEV(1), "203.0.113.50", "127.0.0.1"]) assert.equal(listing.includes(secret), false, `admin response leaks ${secret}`);
  assert.match(listing, /stem injector/);

  // The copy relays the authority's banned answer byte for byte.
  const direct = await call(`${host}/api/account/sync`, { body: { progress: {} }, token: reg.token });
  const relayed = await call(`${copy}/api/account/sync`, { body: { progress: {} }, token: reg.token, device: DEV(1) });
  assert.equal(direct.status, 403);
  assert.equal(relayed.status, 403);
  const directBody = await direct.text();
  assert.equal(await relayed.text(), directBody);
  assert.deepEqual(JSON.parse(directBody), { banned: true, error: BANNED_MESSAGE });
  assert.equal((await call(`${copy}/api/account/status`, { device: DEV(1) })).status, 403, "the banned device is told on page load");
  assert.equal((await call(`${copy}/api/account/status`, { device: DEV(2) })).status, 200);

  // The address the cheater used can't make accounts directly, and a copy can't forward a
  // made-up address: it sends none, so the authority sees the copy's own.
  assert.equal((await call(`${host}/api/account/register`, { body: { username: "fresh", password: "pass1234" }, ip: "203.0.113.50", device: DEV(3) })).status, 403);
  assert.equal((await call(`${copy}/api/account/register`, { body: { username: "fresh", password: "pass1234" }, ip: "203.0.113.50", device: DEV(4) })).status, 200);

  assert.equal((await (await call(`${host}/api/banned-info`)).json()).jobsUrl, "https://www.indeed.com/");
});

test("sign-ups are rate limited per address and per device", async t => {
  const host = (await startServer(t, tempDir(t), { trustedProxies: ["127.0.0.1"] })).url;
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await call(`${host}/api/account/register`, { body: { username: `farm${i}`, password: "pass1234" }, ip: "198.51.100.20", device: DEV(i + 1) })).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
  const device = [];
  for (let i = 0; i < 4; i++) device.push((await call(`${host}/api/account/register`, { body: { username: `dev${i}`, password: "pass1234" }, ip: `198.51.100.${30 + i}`, device: DEV(9) })).status);
  assert.deepEqual(device, [200, 200, 200, 429]);
  assert.equal((await call(`${host}/api/account/register`, { body: { username: "elsewhere", password: "pass1234" }, ip: "198.51.100.99", device: DEV(8) })).status, 200, "other people are unaffected");
});

test("server settings reject a non-http banned link and a malformed proxy list", async t => {
  for (const config of [{ bannedJobsUrl: "javascript:alert(1)" }, { trustedProxies: ["not an ip"] }, { ipRestrictionDays: -1 }]) {
    await assert.rejects(startServer(t, tempDir(t), config), /Invalid Yeatle settings/);
  }
});

test("the leaderboard secret is created once and kept", async t => {
  const dir = tempDir(t);
  await startServer(t, dir);
  const secret = JSON.parse(fs.readFileSync(path.join(dir, "leaderboard-secret.json"), "utf8")).secret;
  assert.match(secret, /^[a-f0-9]{64}$/);
  await startServer(t, dir);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "leaderboard-secret.json"), "utf8")).secret, secret);
});
