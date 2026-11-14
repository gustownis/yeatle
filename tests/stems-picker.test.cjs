const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Element {
  constructor(tag = "div") {
    this.tag = tag; this.children = []; this.events = {}; this.style = { setProperty() {} };
    this.value = ""; this.checked = false; this.disabled = false;
  }
  setAttribute(key, value) { this[key] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  querySelector(selector) { return this.children.find(child => child?.className === selector.slice(1)) || null; }
  click() { if (!this.disabled) { if (this.events.change) { this.checked = !this.checked; this.events.change({ target: this }); } else this.events.click?.({ target: this }); } }
}

async function picker(initial) {
  const elements = new Map(["host", "dest", "status", "list", "search", "hide-installed", "picked", "check-all", "clear", "get-picked", "open-folder"].map(id => [`#${id}`, new Element()]));
  const frames = [], calls = [];
  let notify;
  const api = {
    onChange(callback) { notify = callback; },
    state: async () => initial, refresh: async () => initial,
    download: async ids => { calls.push([...ids]); return initial; },
    cancel() {}, replace() {}, openFolder() {}
  };
  const context = vm.createContext({ window: { yeatleStems: api }, document: { querySelector: selector => elements.get(selector), createElement: tag => new Element(tag) }, requestAnimationFrame: callback => { frames.push(callback); return frames.length; } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../build/assets/stems-download.js"), "utf8"), context);
  const flush = async () => { await new Promise(setImmediate); while (frames.length) frames.shift()(); };
  await flush();
  return { get: id => elements.get(`#${id}`), calls, async update(next) { notify(next); await flush(); }, search(value) { const input = elements.get("#search"); input.value = value; input.events.input(); } };
}

function snapshot() {
  const songs = ["First", "Second", "Installed", "Queued", "Conflict", "Failed"].map((display, index) => ({ id: String(index), title: display, display, era: "Test era", year: 2024, features: [], size: 1000000 }));
  return { host: "https://example.test", songsDir: "Songs", catalog: { songs, loaded: true, loading: false, error: "" }, items: { "2": { status: "installed" }, "3": { status: "queued" }, "4": { status: "conflict" }, "5": { status: "failed" } } };
}

test("Check all selects only available matches and never starts a download", async () => {
  const ui = await picker(snapshot());
  assert.equal(ui.get("get-picked").disabled, true);
  ui.search("First");
  ui.get("check-all").click();
  assert.match(ui.get("picked").textContent, /^1 selected/);
  assert.equal(ui.get("list").children[0].children[0].checked, true);
  assert.equal(ui.get("check-all").checked, true);
  assert.deepEqual(ui.calls, []);
  ui.search("");
  assert.equal(ui.get("check-all").indeterminate, true);
  ui.get("check-all").click();
  assert.match(ui.get("picked").textContent, /^3 selected/);
  assert.deepEqual(ui.get("list").children.map(row => row.children[0].checked), [true, true, false, false, false, true]);
  assert.deepEqual(ui.calls, []);
  ui.get("check-all").click();
  assert.equal(ui.get("picked").textContent, "Nothing selected");
  ui.get("check-all").click();
  ui.get("get-picked").click();
  assert.deepEqual(ui.calls, [["0", "1", "5"]]);
});

test("Clear, no matches, status changes and removed songs keep selection accurate", async () => {
  const state = snapshot(), ui = await picker(state);
  ui.get("check-all").click();
  ui.get("clear").click();
  assert.equal(ui.get("picked").textContent, "Nothing selected");
  ui.search("does not exist");
  assert.equal(ui.get("check-all").disabled, true);
  ui.search("");
  ui.get("check-all").click();
  await ui.update({ ...state, catalog: { ...state.catalog, songs: state.catalog.songs.filter(song => song.id !== "5") }, items: { ...state.items, "0": { status: "installed" }, "1": { status: "downloading" } } });
  assert.equal(ui.get("picked").textContent, "Nothing selected");
  assert.equal(ui.get("get-picked").disabled, true);
  assert.equal(ui.get("check-all").disabled, true);
  assert.equal(ui.get("list").children.some(row => row.children[0].checked), false);
});

test("refreshing the application menu keeps utility windows without menu bars", () => {
  const source = fs.readFileSync(path.join(__dirname, "../desktop/main.cjs"), "utf8");
  const refresh = source.slice(source.indexOf("function refreshMenu()"), source.indexOf("function openAdmin()"));
  const utility = () => ({ visible: true, menu: "game", isDestroyed: () => false, setMenu(menu) { this.menu = menu; }, setMenuBarVisibility(value) { this.visible = value; } });
  const adminWindow = utility(), stemsWindow = utility();
  const context = vm.createContext({ serverUrl: "http://localhost", updates: {}, process, adminWindow, stemsWindow, Menu: { buildFromTemplate: value => value, setApplicationMenu() { for (const win of [adminWindow, stemsWindow]) { win.menu = "game"; win.visible = true; } } }, menuTemplate: () => [], openAdmin() {}, openStemsServer() {} });
  vm.runInContext(refresh, context);
  for (let i = 0; i < 2; i++) {
    vm.runInContext("refreshMenu()", context);
    for (const win of [adminWindow, stemsWindow]) { assert.equal(win.menu, null); assert.equal(win.visible, false); }
  }
});

test("a refreshed catalog updates metadata on reused song rows", async () => {
  const state = snapshot(), ui = await picker(state);
  await ui.update({ ...state, catalog: { ...state.catalog, songs: state.catalog.songs.map(song => song.id === "0" ? { ...song, display: "Corrected title", era: "Corrected era", tab: "Unreleased" } : song) } });
  const label = ui.get("list").children[0].children[2];
  assert.equal(label.children[0].textContent, "Corrected title");
  assert.match(label.children[1].textContent, /Corrected era.*Unreleased/);
});

test("render reuses shownSongs within a single render pass without redundant search filtering", async () => {
  const elements = new Map(["host", "dest", "status", "list", "search", "hide-installed", "picked", "check-all", "clear", "get-picked", "open-folder"].map(id => [`#${id}`, new Element()]));
  let searchValue = "";
  let searchReads = 0;
  let hideChecked = false;
  let hideReads = 0;
  Object.defineProperty(elements.get("#search"), "value", {
    get() { searchReads++; return searchValue; },
    set(v) { searchValue = v; }
  });
  Object.defineProperty(elements.get("#hide-installed"), "checked", {
    get() { hideReads++; return hideChecked; },
    set(v) { hideChecked = Boolean(v); }
  });

  const frames = [];
  let notify;
  const initial = snapshot();
  const api = {
    onChange(callback) { notify = callback; },
    state: async () => initial,
    refresh: async () => initial,
    download: async () => initial,
    cancel() {},
    replace() {},
    openFolder() {}
  };
  const context = vm.createContext({
    window: { yeatleStems: api },
    document: { querySelector: selector => elements.get(selector), createElement: tag => new Element(tag) },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../build/assets/stems-download.js"), "utf8"), context);
  let shownCalls = 0;
  const origShownSongs = context.shownSongs;
  context.shownSongs = (...args) => { shownCalls++; return origShownSongs(...args); };

  const flush = async () => { await new Promise(setImmediate); while (frames.length) frames.shift()(); };
  await flush();

  assert.equal(shownCalls, 1, "initial render invokes shownSongs once");
  assert.equal(searchReads, 1, "initial render reads #search.value once");
  assert.equal(hideReads, 1, "initial render reads #hide-installed.checked once");
  assert.equal(elements.get("#list").children.length, 6);
  assert.equal(elements.get("#check-all").disabled, false);

  // Searching invokes a single render pass with one shownSongs call and one #search.value read.
  shownCalls = 0; searchReads = 0; hideReads = 0;
  searchValue = "First";
  elements.get("#search").events.input();
  assert.equal(shownCalls, 1);
  assert.equal(searchReads, 1);
  assert.equal(hideReads, 1);
  assert.deepEqual(elements.get("#list").children.map(r => r.attributes?.["data-id"] ?? r["data-id"]), ["0"]);
  assert.equal(elements.get("#check-all").disabled, false);
  assert.equal(elements.get("#check-all").checked, false);

  // Toggling hide-installed also filters once per render and omits installed rows identically.
  shownCalls = 0; searchReads = 0; hideReads = 0;
  searchValue = "";
  hideChecked = true;
  elements.get("#hide-installed").events.change();
  assert.equal(shownCalls, 1);
  assert.equal(searchReads, 1);
  assert.equal(hideReads, 1);
  assert.deepEqual(elements.get("#list").children.map(r => r["data-id"]), ["0", "1", "3", "4", "5"]);

  // Empty search result shows the empty-search message and disables Check all after one shownSongs pass.
  shownCalls = 0; searchReads = 0; hideReads = 0;
  searchValue = "no-match-song";
  elements.get("#search").events.input();
  assert.equal(shownCalls, 1);
  assert.equal(searchReads, 1);
  assert.equal(hideReads, 1);
  assert.equal(elements.get("#list").children[0].textContent, "No songs match that search.");
  assert.equal(elements.get("#check-all").disabled, true);

  // Progress update preserves single pass and updates picked/check-all state accurately.
  searchValue = "";
  hideChecked = false;
  elements.get("#search").events.input();
  elements.get("#list").children[0].children[0].click(); // check First
  shownCalls = 0; searchReads = 0; hideReads = 0;
  notify({ ...initial, items: { ...initial.items, "1": { status: "downloading", received: 500000, total: 1000000 } } });
  await flush();
  assert.equal(shownCalls, 1);
  assert.equal(searchReads, 1);
  assert.equal(hideReads, 1);
  assert.match(elements.get("#picked").textContent, /^1 selected/);
  assert.equal(elements.get("#check-all").indeterminate, true);
  assert.equal(elements.get("#check-all").checked, false);
});
