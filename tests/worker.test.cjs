const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const root = path.join(__dirname, "..");
const lifecycle = import(pathToFileURL(path.join(root, "build/assets/worker-lifecycle.mjs")).href);
const tick = () => new Promise(resolve => setImmediate(resolve));

test("the complete shipped worker parses with its module imports removed", () => {
  const source = fs.readFileSync(path.join(root, "build/assets/separator.worker.js"), "utf8");
  new vm.Script(source.replace(/^import[^\r\n]*\r?\n/gm, "").replaceAll("import.meta.url", '"http://worker.test/assets/separator.worker.js"'));
});

test("GPU checks keep the output comparison and release every temporary session on failures", async () => {
  const { compareGpuModel } = await lifecycle;
  for (const failure of [null, "create-cpu", "run-gpu", "run-cpu"]) {
    const released = [];
    const probe = compareGpuModel(new Uint8Array([1]), {
      createInput: () => ({}),
      createSession: async (_model, options) => {
        const provider = options.executionProviders[0];
        if (failure === "create-cpu" && provider === "wasm") throw new Error("create-cpu");
        return {
          release: async () => { released.push(provider); },
          run: async () => {
            if (failure === "run-gpu" && provider === "webgpu" || failure === "run-cpu" && provider === "wasm") throw new Error(failure);
            return { y: { data: new Float32Array([1, 2, 3]) } };
          }
        };
      }
    });
    if (failure) await assert.rejects(probe, new RegExp(failure));
    else assert.equal(await probe, true);
    assert.deepEqual(released.sort(), failure === "create-cpu" ? ["webgpu"] : ["wasm", "webgpu"]);
  }
});

test("timed-out GPU checks do not start more work after an outstanding native call finishes", async () => {
  const { compareGpuModel, runGpuProbe } = await lifecycle;
  let timeout, finishGpu, released = 0, created = 0;
  const result = runGpuProbe(signal => compareGpuModel(new Uint8Array([1]), {
    signal, createInput: () => ({}), createSession: async () => {
      created++;
      return new Promise(resolve => { finishGpu = () => resolve({ release: async () => { released++; }, run() { throw new Error("Do not run after timeout"); } }); });
    }
  }), { setTimeout(fn) { timeout = fn; return 1; }, clearTimeout() {} });
  await tick();
  timeout();
  assert.equal(await result, false);
  finishGpu(); await tick();
  assert.equal(created, 1);
  assert.equal(released, 1);
});

test("failed model initialization releases earlier sessions and preserves the failure", async () => {
  const { initializeSessions } = await lifecycle;
  const models = { drums: new Uint8Array([1]), bass: new Uint8Array([2]), other: new Uint8Array([3]) };
  let created = 0, released = 0;
  await assert.rejects(initializeSessions(models, ["drums", "bass", "other"], async () => {
    if (++created === 3) throw new Error("model unavailable");
    return { release: async () => { released++; if (released === 1) throw new Error("cleanup failed"); } };
  }, "wasm"), /model unavailable/);
  assert.equal(created, 3);
  assert.equal(released, 2);
  assert.deepEqual(Object.keys(models), ["other"]);
});

test("the shipped splitter stops between model runs after cancellation", async () => {
  const { cancellationCheckpoint } = await lifecycle;
  const source = fs.readFileSync(path.join(root, "build/assets/separator.worker.js"), "utf8");
  const first = source.indexOf("async function ph("), last = source.indexOf("Y.wasm.wasmPaths=", first);
  const split = vm.runInNewContext(source.slice(first, last) + ";ph", {
    dh: () => 2, Be: 2, Xe: 1, ee: 2, ne: 3, we: 2, bt: 0,
    Kr: ["drums", "bass", "other"], st: ["vocals", "drums", "bass", "other"],
    xt: new Float32Array([1, 1]), Vt: 1e-8, Nt: { exponent: 2 }, uh() {}, lh() {}, YeatleCancellationCheckpoint: cancellationCheckpoint
  });
  let cancelled = false, runs = 0, segments = 0;
  await assert.rejects(split(new Float32Array(3), new Float32Array(3), async () => {
    runs++; setTimeout(() => { cancelled = true; }, 0); return new Float32Array(8).fill(0.5);
  }, () => { segments++; }, () => cancelled), /cancelled/);
  assert.equal(runs, 1);
  assert.equal(segments, 0);
  runs = 0;
  await split(new Float32Array(3), new Float32Array(3), async () => { runs++; return new Float32Array(8).fill(0.5); }, () => { segments++; });
  assert.equal(runs, 4);
  assert.equal(segments, 1);
});

test("the worker drops cancelled queued audio and can process a new job after cancellation", async () => {
  const source = fs.readFileSync(path.join(root, "build/assets/separator.worker.js"), "utf8");
  let finishStartup, splits = 0;
  const startup = new Promise(resolve => { finishStartup = resolve; });
  const messages = [];
  const context = vm.createContext({
    Zr: false, YeatleActiveJob: null, Jt: [], rt: new Set(),
    Ld: () => startup, fh() {}, ph: async (_left, _right, _run, segment) => { splits++; segment({ stems: { drums: new Float32Array(1) } }); },
    self: { postMessage(message) { messages.push(message); } }
  });
  vm.runInContext(source.slice(source.indexOf("async function mh(){")), context);
  const send = data => context.self.onmessage({ data });
  send({ type: "split", id: 1 });
  send({ type: "split", id: 2, left: new Float32Array(1000) });
  assert.equal(context.Jt.length, 1);
  send({ type: "cancel", id: 2 });
  assert.equal(context.Jt.length, 0);
  send({ type: "cancel", id: 99 });
  assert.equal(context.rt.size, 0);
  send({ type: "cancel", id: 1 });
  finishStartup(); await tick();
  assert.equal(splits, 0);
  assert.equal(context.rt.size, 0);
  assert.equal(context.Zr, false);
  send({ type: "split", id: 3 }); await tick();
  assert.equal(splits, 1);
  assert.deepEqual(messages.map(message => message.type), ["segment", "done"]);
  assert.equal(context.rt.size, 0);
});

test("leaving an unfinished round cancels only after its final listener detaches", () => {
  const source = fs.readFileSync(path.join(root, "build/assets/yeatle.js"), "utf8");
  const first = source.indexOf("class xm{"), last = source.indexOf("function Em(", first);
  const jobs = new Map();
  const Class = vm.runInNewContext(source.slice(first, last) + ";xm", { yt: jobs, YeatleTrim() {}, zt: null });
  for (const complete of [false, true]) {
    const job = Object.assign(Object.create(Class.prototype), { song: { id: "one" }, complete, listeners: new Set(), buffers: {}, abortController: new AbortController() });
    jobs.set("one", job);
    const firstOff = job.on(() => {}), lastOff = job.on(() => {});
    firstOff();
    assert.equal(job.cancelled, undefined);
    lastOff();
    assert.equal(job.abortController.signal.aborted, !complete);
    assert.equal(jobs.has("one"), complete);
    assert.equal(job.buffers === null, !complete);
  }
});
