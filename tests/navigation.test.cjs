const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const bootstrap = fs.readFileSync(path.join(__dirname, "../build/assets/navigation-runtime.js"), "utf8");
const navigation = fs.readFileSync(path.join(__dirname, "../build/assets/navigation.mjs"), "utf8")
  .replace(/^import[^\n]*\n/, "").replace("export function", "function");

function page(desktop, reduced = false, capable = true) {
  const transitions = [], styles = [];
  const document = {
    documentElement: { dataset: {} },
    head: { append: style => styles.push(style) },
    createElement: () => ({}),
    startViewTransition(update) {
      const finished = Promise.resolve().then(update);
      const transition = { ready: finished, finished, skipped: false, skipTransition() { this.skipped = true; } };
      transitions.push(transition);
      return transition;
    }
  };
  const context = vm.createContext({
    document, yeatleDesktop: desktop,
    // Resource capability and desktop identity are independent decisions.
    navigator: { userAgent: "Electron/44.7.0", deviceMemory: 8, hardwareConcurrency: 8 },
    interfaceMotionAllowed: () => capable,
    matchMedia: () => ({ matches: reduced })
  });
  vm.runInContext(bootstrap + "\n" + navigation, context);
  return { context, document, transitions, styles };
}

test("a capable browser changes modes immediately without a desktop app flag", () => {
  for (const flag of [undefined, false, "true"]) {
    const { context, document, transitions, styles } = page(flag);
    let mode = "stems";
    context.changeMode(() => { mode = "snippet"; });
    assert.equal(mode, "snippet");
    assert.equal(transitions.length, 0);
    assert.equal(styles.length, 0);
    assert.equal(document.documentElement.dataset.navigationRuntime, "browser");
  }
});

test("desktop mode transitions retain only the last rapid selection", async () => {
  const { context, document, transitions } = page(true);
  const applied = [];
  context.changeMode(() => applied.push("snippet"));
  context.changeMode(() => applied.push("stems"));
  assert.equal(document.documentElement.dataset.navigationRuntime, "desktop");
  assert.equal(transitions.length, 2);
  assert.equal(transitions[0].skipped, true);
  await Promise.all(transitions.map(t => t.finished));
  assert.deepEqual(applied, ["stems"]);
});

test("desktop reduced motion still applies the selected mode immediately", () => {
  const { context, transitions } = page(true, true);
  let changed = false;
  context.changeMode(() => { changed = true; });
  assert.equal(changed, true);
  assert.equal(transitions.length, 0);
});

test("desktop capability fallback and missing transition support keep modes usable", () => {
  for (const capable of [false, true]) {
    const { context, document, transitions } = page(true, false, capable);
    if (capable) delete document.startViewTransition;
    let selected;
    context.changeMode(() => { selected = "snippet"; });
    assert.equal(selected, "snippet");
    assert.equal(transitions.length, 0);
  }
});

test("an instant selection supersedes a pending animated selection", async () => {
  const { context, transitions } = page(true);
  const applied = [];
  context.changeMode(() => applied.push("stale"));
  context.changeMode(() => applied.push("latest"), false);
  await transitions[0].finished;
  assert.equal(transitions[0].skipped, true);
  assert.deepEqual(applied, ["latest"]);
});

test("a transition API failure applies a mode change exactly once", () => {
  for (const started of [false, true]) {
    const { context, document } = page(true);
    let changes = 0;
    document.startViewTransition = update => {
      if (started) update();
      throw new Error("snapshot unavailable");
    };
    context.changeMode(() => { changes++; });
    assert.equal(changes, 1);
  }
});

test("a skipped transition does not prevent subsequent mode changes", async () => {
  const { context, document } = page(true);
  const applied = [];
  const failed = Promise.reject(new Error("hidden document"));
  document.startViewTransition = update => {
    update();
    return { ready: failed, finished: failed, skipTransition() {} };
  };
  context.changeMode(() => applied.push("first"));
  await failed.catch(() => {});
  await Promise.resolve();
  context.changeMode(() => applied.push("second"), false);
  assert.deepEqual(applied, ["first", "second"]);
});
