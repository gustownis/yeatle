const MiB = 1024 * 1024;

export function performancePolicy(device = globalThis.navigator) {
  const agent = device?.userAgent || "";
  const mobile = Boolean(device?.userAgentData?.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(agent) || (/Macintosh/i.test(agent) && device?.maxTouchPoints > 1);
  const lowMemory = Number(device?.deviceMemory) > 0 && Number(device.deviceMemory) <= 4;
  const constrained = mobile || lowMemory;
  return { constrained, maxJobs: constrained ? 1 : 2, maxAudioBytes: (constrained ? 128 : 384) * MiB, waveformFps: constrained ? 30 : Infinity };
}

export const audioPerformancePolicy = performancePolicy();

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
