const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// Just enough of a page for wrapped.mjs to build its window in Node.
class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parent = null;
    this.attrs = {};
    this.textContent = "";
    this.className = "";
    const classes = new Set();
    this.classList = {
      add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
      toggle: (c, on = !classes.has(c)) => { on ? classes.add(c) : classes.delete(c); return on; }
    };
  }
  setAttribute(k, v) { this.attrs[k] = v; if (k === "class") this.className = v; }
  append(...nodes) { for (const n of nodes) { if (n instanceof FakeElement) { n.parent = this; this.children.push(n); } } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); this.parent = null; }
  replaceWith(n) { if (this.parent) { const i = this.parent.children.indexOf(this); this.parent.children[i] = n; n.parent = this.parent; } }
  addEventListener() {}
  focus() {}
  closest() { return null; }
  getBoundingClientRect() { return { left: 0, width: 400 }; }
}

const body = new FakeElement("body");
globalThis.document = {
  readyState: "complete",
  body,
  createElement: tag => new FakeElement(tag),
  createRange: () => ({ selectNodeContents() {} }),
  querySelector: () => null,
  addEventListener() {}
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.location = new URL("https://playyeatle.duckdns.org/");
globalThis.navigator = {};
const store = new Map();
globalThis.localStorage = {
  get length() { return store.size; }, key: i => [...store.keys()][i] ?? null,
  getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k)
};
// A slow song list, like a phone on a weak connection.
globalThis.fetch = () => new Promise(resolve => setTimeout(() => resolve({ ok: false, json: async () => null }), 300));

const overlays = () => body.children.filter(n => /yeatle-wrapped-overlay/.test(n.className));

test("tapping the Wrapped button twice while it loads opens one window", async () => {
  const wrapped = await import(pathToFileURL(path.join(__dirname, "../build/assets/wrapped.mjs")).href);
  await Promise.all([wrapped.openWrapped(2026), wrapped.openWrapped(2026)]);
  assert.equal(overlays().length, 1);
});
