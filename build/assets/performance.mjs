const MiB = 1024 * 1024;

export function isMobileDevice(device = globalThis.navigator) {
  const agent = device?.userAgent || "";
  // iPadOS can use a Mac user agent. Screen size and touch on Windows/Linux
  // desktops do not identify a phone or tablet.
  return Boolean(device?.userAgentData?.mobile) || /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Tablet/i.test(agent) || (/Macintosh/i.test(agent) && device?.maxTouchPoints > 1);
}

export function performancePolicy(device = globalThis.navigator) {
  const mobile = isMobileDevice(device);
  const lowMemory = Number(device?.deviceMemory) > 0 && Number(device.deviceMemory) <= 4;
  const constrained = mobile || lowMemory;
  return { mobile, constrained, maxJobs: constrained ? 1 : 2, maxAudioBytes: (constrained ? 128 : 384) * MiB, waveformFps: constrained ? 30 : Infinity };
}

export const audioPerformancePolicy = performancePolicy();

// Saved progress uses the answer id; decoded/separated audio belongs to the
// actual playable source. A release and a leak can share only the first.
export function audioCacheKey(song) {
  return song.audioId || song.id;
}

export function audioBytes(job) {
  if (job.buffers) return Object.values(job.buffers).reduce((bytes, buffer) => bytes + (buffer?.length || 0) * (buffer?.numberOfChannels || 0) * 4, 0);
  // Reserve room before allocating the stereo original and three mono stems.
  return (job.total || 0) * 5 * 4;
}

export function trimAudioCache(jobs, keepId = null, policy = audioPerformancePolicy) {
  let bytes = [...jobs.values()].reduce((total, job) => total + audioBytes(job), 0);
  const idle = [...jobs.entries()].filter(([id, job]) => id !== keepId && !job.listeners?.size).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  const evicted = [];
  for (const [id, job] of idle) {
    if (jobs.size <= policy.maxJobs && bytes <= policy.maxAudioBytes) break;
    jobs.delete(id);
    bytes -= audioBytes(job);
    try { job.cancel(); } catch (_) { /* the entry is still removed */ }
    evicted.push(id);
  }
  // The active round may exceed the soft budget. Never discard its buffers.
  return evicted;
}

export function createWaveformGate(policy = audioPerformancePolicy) {
  const interval = 1000 / policy.waveformFps;
  let last = -Infinity;
  return (timestamp = globalThis.performance.now(), visible = true) => {
    if (!visible) return false;
    if (!interval) return true;
    const elapsed = timestamp - last;
    if (elapsed < interval - 0.5 && elapsed >= 0) return false;
    last = timestamp;
    return true;
  };
}

export function startVisiblePolling(task, { document = globalThis.document, setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout, interval = 800 } = {}) {
  let stopped = false, running = false, timer;
  async function poll() {
    clearTimeout(timer);
    if (stopped || document.hidden || running) return;
    running = true;
    try { await task(); } catch (_) { /* a later check can retry */ }
    finally {
      running = false;
      if (!stopped && !document.hidden) timer = setTimeout(poll, interval);
    }
  }
  function visibilityChanged() {
    clearTimeout(timer);
    if (!document.hidden) poll();
  }
  document.addEventListener("visibilitychange", visibilityChanged);
  poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", visibilityChanged);
  };
}

export function watchActiveSong(onSong, { enabled, document = globalThis.document, EventSource = globalThis.EventSource, poll } = {}) {
  if (enabled === false) return () => {};
  if (enabled !== true || typeof EventSource !== "function") return startVisiblePolling(poll, { document });
  let source, stopPolling, failures = 0, stopped = false;
  function close() { source?.close(); source = null; }
  function connect() {
    close();
    if (stopped || document.hidden || stopPolling) return;
    try { source = new EventSource("/api/active-song/events"); }
    catch (_) { fallback(); return; }
    const current = source;
    current.onopen = () => { if (source === current) failures = 0; };
    current.onmessage = event => {
      if (source !== current) return;
      try { onSong(JSON.parse(event.data)); } catch (_) { /* ignore malformed events */ }
    };
    current.onerror = () => { if (source === current && (++failures >= 3 || current.readyState === 2)) fallback(); };
  }
  function fallback() {
    close();
    if (!stopped && !stopPolling) stopPolling = startVisiblePolling(poll, { document });
  }
  function visibility() { if (document.hidden) close(); else connect(); }
  document.addEventListener("visibilitychange", visibility);
  connect();
  return () => { stopped = true; close(); stopPolling?.(); document.removeEventListener("visibilitychange", visibility); };
}

export function disposeAudioGraph(player) {
  for (const [target, type, listener] of player.events || []) target.removeEventListener(type, listener);
  const nodes = new Set([
    player.master, player.out, player.fade, ...(player.nodes || []), ...(player.sources || []),
    ...(player.analysers || []), ...(player.gates || []).map(gate => gate.node), ...Object.values(player.inputs || {})
  ]);
  for (const node of nodes) { try { node?.disconnect(); } catch (_) { /* already disconnected */ } }
  player.events = []; player.nodes = []; player.sources = []; player.analysers = [];
  player.gates = []; player.inputs = null; player.master = null; player.out = null;
  player.fade = null; player.lead = null;
}
