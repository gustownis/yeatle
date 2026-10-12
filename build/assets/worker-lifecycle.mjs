export async function releaseSessions(sessions) {
  await Promise.allSettled(sessions.filter(Boolean).map(session => Promise.resolve().then(() => session.release())));
}

export async function cancellationCheckpoint(isCancelled) {
  // Native WASM calls may complete synchronously. Yield to the worker's task
  // queue so posted cancel messages can arrive before the next model run.
  await new Promise(resolve => setTimeout(resolve, 0));
  if (isCancelled()) throw new Error("cancelled");
}

export async function compareGpuModel(model, { createSession, createInput, signal }) {
  let gpu, cpu;
  const check = () => { if (signal?.aborted) throw new Error("GPU check timed out."); };
  try {
    check();
    gpu = await createSession(model, { executionProviders: ["webgpu"] });
    check();
    cpu = await createSession(model, { executionProviders: ["wasm"] });
    check();
    const gpuOutput = (await gpu.run(createInput())).y.data;
    check();
    const cpuOutput = (await cpu.run(createInput())).y.data;
    check();
    let difference = 0, magnitude = 0;
    for (let index = 0; index < gpuOutput.length; index += 97) {
      difference += Math.abs(gpuOutput[index] - cpuOutput[index]);
      magnitude += Math.abs(cpuOutput[index]);
    }
    return magnitude > 0 && difference / magnitude < 0.05;
  } finally { await releaseSessions([gpu, cpu]); }
}

export async function runGpuProbe(probe, { timeoutMs = 20000, setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout } = {}) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve(false); }, timeoutMs);
  });
  try {
    // A native operation already in progress must finish before its resources
    // can be released. The abort check prevents subsequent probe operations.
    return await Promise.race([Promise.resolve().then(() => probe(controller.signal)).catch(() => false), timeout]);
  } finally { clearTimeout(timer); }
}

export async function initializeSessions(models, stems, createSession, provider) {
  const sessions = {};
  try {
    for (const stem of stems) {
      sessions[stem] = await createSession(models[stem], { executionProviders: [provider] });
      delete models[stem];
    }
    return sessions;
  } catch (error) {
    await releaseSessions(Object.values(sessions));
    throw error;
  }
}
