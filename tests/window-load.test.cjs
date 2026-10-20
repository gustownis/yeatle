const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadWindowPage } = require("../desktop/window-load.cjs");

test("superseded and closed-window navigations do not report fatal startup errors", async () => {
  for (const error of [Object.assign(new Error("replaced"), { code: "ERR_ABORTED" }), Object.assign(new Error("replaced"), { errno: -3 })]) {
    const errors = [];
    await loadWindowPage({ loadURL: () => Promise.reject(error), isDestroyed: () => false }, "http://127.0.0.1/", error => errors.push(error));
    assert.deepEqual(errors, []);
  }
  let reported = false;
  await loadWindowPage({ loadURL: () => Promise.reject(new Error("closed")), isDestroyed: () => true }, "http://127.0.0.1/", () => { reported = true; });
  assert.equal(reported, false);
});

test("real page failures are still reported and successful navigation keeps its URL", async () => {
  const error = Object.assign(new Error("connection refused"), { code: "ERR_CONNECTION_REFUSED", errno: -102 }), errors = [];
  await loadWindowPage({ loadURL: () => Promise.reject(error), isDestroyed: () => false }, "http://127.0.0.1/", error => errors.push(error));
  assert.deepEqual(errors, [error]);
  let loaded;
  await loadWindowPage({ async loadURL(url) { loaded = url; }, isDestroyed: () => false }, "http://127.0.0.1/daily", error => errors.push(error));
  assert.equal(loaded, "http://127.0.0.1/daily");
  assert.equal(errors.length, 1);
});
