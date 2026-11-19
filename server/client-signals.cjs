const fs = require("node:fs");
const net = require("node:net");
const crypto = require("node:crypto");

// Devices send a random id they keep in localStorage. Nothing else about the device is read.
const DEVICE_HEADER = "x-yeatle-device";
const DEVICE_ID = /^[a-f0-9]{32}$/;

function cleanDeviceId(value) {
  const id = String(value || "").trim().toLowerCase();
  return DEVICE_ID.test(id) ? id : "";
}

function normalIp(value) {
  let ip = String(value || "").trim();
  if (ip.startsWith("::ffff:") && net.isIPv4(ip.slice(7))) ip = ip.slice(7);
  return net.isIP(ip) ? ip.toLowerCase() : "";
}

const isLoopback = ip => ip === "::1" || /^127\./.test(ip);

// The peer address is the client unless it is a configured reverse proxy. A proxy such as
// Caddy appends the address it saw to X-Forwarded-For, so only the right-most entry is
// trusted: anything to its left was written by the client. A request that reached the
// server through an unconfigured local proxy has no usable address at all, so IP limits
// and restrictions stay off instead of treating every visitor as one person.
function clientIp(req, trustedProxies = []) {
  const peer = normalIp(req.socket?.remoteAddress);
  const forwarded = req.headers["x-forwarded-for"];
  if (peer && trustedProxies.includes(peer)) {
    if (!forwarded) return peer;
    const parts = String(forwarded).split(",");
    return normalIp(parts[parts.length - 1]);
  }
  if (forwarded && isLoopback(peer)) return "";
  return peer;
}

// Raw addresses and device ids are never stored. Keyed hashes still let the server
// recognise a repeat visitor, but can't be reversed without the secret, and the secret
// never leaves DATA_DIR.
function loadSecret(file) {
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof saved?.secret === "string" && /^[a-f0-9]{64}$/.test(saved.secret)) return saved.secret;
    throw new Error("the secret is missing or malformed");
  } catch (err) {
    if (err.code !== "ENOENT") throw new Error(`Could not read ${file} (${err.message}). Restore or delete it before restarting.`);
  }
  const secret = crypto.randomBytes(32).toString("hex");
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ secret }), { mode: 0o600 });
  fs.renameSync(temp, file);
  return secret;
}

function createSignalHasher(secret) {
  const hash = (kind, value) => value ? crypto.createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex").slice(0, 32) : "";
  return { ip: ip => hash("ip", ip), device: id => hash("device", id) };
}

// Sliding-window counters kept in memory. A restart forgets them, which only ever
// loosens a limit for a moment.
function createRateLimiter({ maxEntries = 50000 } = {}) {
  const hits = new Map();
  let sweeps = 0;
  function prune(now) {
    for (const [k, entry] of hits) {
      const list = entry.list;
      if (!list.length || list[list.length - 1] <= now - entry.windowMs) hits.delete(k);
    }
  }
  function take(bucket, key, limit, windowMs, now = Date.now()) {
    if (!key) return true;
    const id = `${bucket}\n${key}`;
    const prev = hits.get(id);
    const list = (prev ? prev.list : []).filter(at => at > now - windowMs);
    const keepWindow = prev ? Math.max(prev.windowMs, windowMs) : windowMs;
    if (++sweeps % 500 === 0) prune(now);
    const saveEntry = nextList => {
      if (!hits.has(id) && hits.size >= maxEntries) {
        prune(now);
        while (hits.size >= maxEntries) hits.delete(hits.keys().next().value);
      }
      hits.delete(id);
      hits.set(id, { list: nextList, windowMs: keepWindow });
    };
    if (list.length >= limit) {
      if (list.length) saveEntry(list); else hits.delete(id);
      return false;
    }
    list.push(now);
    saveEntry(list);
    return true;
  }
  return { take, get size() { return hits.size; } };
}

module.exports = { DEVICE_HEADER, cleanDeviceId, clientIp, normalIp, loadSecret, createSignalHasher, createRateLimiter };
