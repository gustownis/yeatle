const { performance } = require("node:perf_hooks");

function createDailyAuthority(origin, fetchJson) {
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("dailyAuthority must be an http(s) origin, or an empty string for the authoritative host.");
  let cached, receivedAt = 0, pending;
  const get = async () => {
    const elapsed = performance.now() - receivedAt;
    if (cached && elapsed < 30000 && cached.serverTime + elapsed < cached.resetsAt) return { ...cached, serverTime: cached.serverTime + elapsed };
    if (pending) return pending;
    pending = (async () => {
      const daily = await fetchJson(new URL("/api/daily", url).href, { "X-Yeatle-Daily-Proxy": "1" });
      if (!daily || typeof daily.id !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(daily.date) || !daily.song?.id ||
          !Number.isInteger(daily.seed) || !Number.isFinite(daily.clipAt) || daily.clipAt < 0 || !Number.isFinite(daily.serverTime) || !Number.isFinite(daily.resetsAt) ||
          daily.serverTime >= daily.resetsAt || !Array.isArray(daily.audio) || ![1, 4].includes(daily.audio.length) ||
          !daily.audio.every(audio => typeof audio === "string" && /^(Songs\/|api\/daily\/audio\?)/.test(audio) && new URL(audio, url).origin === url.origin)) {
        throw new Error("The daily host did not return a valid 1.11 challenge");
      }
      receivedAt = performance.now();
      cached = daily;
      return daily;
    })().finally(() => { pending = null; });
    return pending;
  };
  return { get, audioUrl: audio => new URL(audio, url).href, shareUrl: new URL("/daily.html", url).href };
}
module.exports = { createDailyAuthority };
