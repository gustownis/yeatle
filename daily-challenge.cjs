const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

// One shared clock and one persisted choice per server, independent of clients,
// tracker ordering, filters, refreshes, and process restarts.
function createDailyChallenges(file) {
  let days = {};
  if (fs.existsSync(file)) {
    try {
      days = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!days || typeof days !== "object" || Array.isArray(days)) throw new Error("expected an object");
    } catch {
      throw new Error(`Could not read ${path.basename(file)}. Restore its saved daily choices before restarting.`);
    }
  }
  const challengeFor = (songs, now = Date.now()) => {
    const date = new Date(now).toISOString().slice(0, 10);
    const resetsAt = Date.parse(`${date}T00:00:00Z`) + 86400000;
    if (!days[date]) {
      const pool = [...songs].filter(s => s.source && (s.mode !== "stems" || s.folder))
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      if (!pool.length) return null;
      const hash = createHash("sha256").update(`yeatle-daily-v1:${date}`).digest();
      const song = pool[hash.readUInt32BE(0) % pool.length];
      const seed = hash.readUInt32BE(4);
      const entry = { song, seed, clipAt: 5 + (seed % 5001) / 1000, id: `v1:${date}:${song.id}` };
      const next = Object.fromEntries(Object.entries({ ...days, [date]: entry }).sort().slice(-32));
      // Refuse to issue an unpersisted challenge: a restart must never reroll it.
      const temp = `${file}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(next));
      fs.renameSync(temp, file);
      days = next;
    }
    const entry = days[date];
    if (!entry?.song?.id || !Number.isInteger(entry.seed)) throw new Error("Invalid saved daily challenge.");
    return { ...entry, clipAt: entry.clipAt ?? 5 + (entry.seed % 5001) / 1000, date, resetsAt, serverTime: now };
  };
  // The challenge this server issued on a date (kept for 32 days), or null.
  challengeFor.saved = date => (days[date]?.song?.id ? days[date] : null);
  return challengeFor;
}

module.exports = { createDailyChallenges };
