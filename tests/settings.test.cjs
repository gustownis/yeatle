const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

test("cornerMode shows Wrapped when active and not hidden, and Settings otherwise", async () => {
  const { cornerMode, resolveDockPlacement } = await import(pathToFileURL(path.join(root, "build/assets/settings.mjs")).href);
  assert.equal(cornerMode({ wrappedYear: 2026, chipHidden: false }), "wrapped");
  assert.equal(cornerMode({ wrappedYear: 2026, chipHidden: true }), "settings");
  assert.equal(cornerMode({ wrappedYear: null, chipHidden: false }), "settings");
  assert.equal(cornerMode({ wrappedYear: null, chipHidden: true }), "settings");
  assert.equal(resolveDockPlacement({ isMobile: true, hasHeaderSlot: true }), "header");
  assert.equal(resolveDockPlacement({ isMobile: true, hasHeaderSlot: false }), "corner");
  assert.equal(resolveDockPlacement({ isMobile: false, hasHeaderSlot: true }), "corner");
});

test("wrapped chip state treats legacy small and hidden identically and toggles cleanly", async () => {
  const store = new Map();
  globalThis.localStorage = {
    get length() { return store.size; },
    key: i => [...store.keys()][i] ?? null,
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  };
  const wrapped = await import(pathToFileURL(path.join(root, "build/assets/wrapped.mjs")).href);
  assert.equal(wrapped.isWrappedChipHidden(2026), false);
  store.set("yeatle:wrapped:chip:2026", JSON.stringify("small"));
  assert.equal(wrapped.isWrappedChipHidden(2026), true);
  wrapped.setWrappedChipHidden(2026, false);
  assert.equal(wrapped.isWrappedChipHidden(2026), false);
  wrapped.setWrappedChipHidden(2026, true);
  assert.equal(wrapped.isWrappedChipHidden(2026), true);
  delete globalThis.localStorage;
});

test("interface-motion and background preferences read, persist, and validate cleanly", async () => {
  const store = new Map();
  const storage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  };
  const motion = await import(pathToFileURL(path.join(root, "build/assets/interface-motion.mjs")).href);
  assert.equal(motion.getInterfaceMotionPreference(storage), "auto");
  motion.setInterfaceMotionPreference("reduced", storage);
  assert.equal(motion.getInterfaceMotionPreference(storage), "reduced");
  motion.setInterfaceMotionPreference("full", storage);
  assert.equal(motion.getInterfaceMotionPreference(storage), "full");
  motion.setInterfaceMotionPreference("auto", storage);
  assert.equal(motion.getInterfaceMotionPreference(storage), "auto");
  assert.equal(store.has("yeatle:motion"), false);

  const settings = await import(pathToFileURL(path.join(root, "build/assets/settings.mjs")).href);
  assert.equal(settings.getBackgroundPreference(storage), "full");
  store.set("yeatle:bg", JSON.stringify("dim"));
  assert.equal(settings.getBackgroundPreference(storage), "dim");
  store.set("yeatle:bg", JSON.stringify("invalid"));
  assert.equal(settings.getBackgroundPreference(storage), "full");
  assert.equal(settings.formatBytes(0), "0 MB");
  assert.equal(settings.formatBytes(68 * 1024 * 1024), "68 MB");
});

test("stem-cache reports stats and clears entries and chunks cleanly", async t => {
  const stores = new Map([["entries", new Map()], ["chunks", new Map()]]);
  const makeReq = run => { const r = { result: undefined, error: null, onsuccess: null, onerror: null }; queueMicrotask(() => { try { run(r); r.onsuccess?.({ target: r }); } catch (e) { r.error = e; r.onerror?.({ target: r }); } }); return r; };
  const db = {
    transaction(_names, _mode) {
      let pending = 0;
      const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
      const done = () => { if (pending === 0) queueMicrotask(() => tx.oncomplete?.()); };
      const wrap = fn => { pending++; return makeReq(r => { fn(r); pending--; done(); }); };
      tx.objectStore = name => ({
        getAll: () => wrap(r => { r.result = [...stores.get(name).values()]; }),
        clear: () => wrap(() => { stores.get(name).clear(); })
      });
      queueMicrotask(done);
      return tx;
    }
  };
  stores.get("entries").set("k1", { key: "k1", bytes: 1024 * 1024 * 5, complete: true });
  stores.get("entries").set("k2", { key: "k2", bytes: 1024 * 1024 * 3, complete: false });
  stores.get("chunks").set("k1:0", { id: "k1:0" });

  const prevIDB = globalThis.indexedDB;
  globalThis.indexedDB = {
    open() {
      const req = { result: db, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
      queueMicrotask(() => req.onsuccess?.());
      return req;
    }
  };
  t.after(() => { if (prevIDB === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = prevIDB; });

  const cache = await import(`${pathToFileURL(path.join(root, "build/assets/stem-cache.mjs")).href}?t=${Date.now()}`);
  const stats = await cache.getStemCacheStats();
  assert.deepEqual(stats, { count: 1, bytes: 1024 * 1024 * 5 });
  assert.equal(await cache.clearStemCache(), true);
  assert.equal(stores.get("entries").size, 0);
  assert.equal(stores.get("chunks").size, 0);
});

test("pages load settings.css and settings.mjs non-blocking with current ?v= and desktop main wires dark chrome and IPC", () => {
  const { version } = require("../package.json");
  for (const page of ["index.html", "daily.html", "karaoke.html"]) {
    const html = fs.readFileSync(path.join(root, "build", page), "utf8");
    assert.ok(html.includes(`./assets/settings.css?v=${version}`), `${page} loads settings.css`);
    const tag = html.match(/<script[^>]*src="\.\/assets\/settings\.mjs\?v=[^"]+"[^>]*>/);
    assert.ok(tag && tag[0].includes(`?v=${version}`), `${page} loads settings.mjs`);
    assert.equal(/blocking="render"/.test(tag[0]), false);
  }
  const lb = fs.readFileSync(path.join(root, "build/assets/leaderboard.mjs"), "utf8");
  assert.equal(lb.includes("yeatle-lb-account"), false, "Leaderboards no longer embeds the account card");
  assert.ok(lb.includes("Sign in in Settings"));

  const main = fs.readFileSync(path.join(root, "desktop/main.cjs"), "utf8");
  assert.match(main, /nativeTheme\.themeSource\s*=\s*"dark"/);
  assert.match(main, /window\.setMenu\(null\)/);
  assert.match(main, /ipcMain\.handle\("yeatle:desktop-state"/);
  assert.match(main, /ipcMain\.handle\("yeatle:desktop-action"/);
  assert.equal(main.includes("openAdmin"), false);
  assert.equal(main.includes("open-admin"), false);
  assert.equal(main.includes("toggle-devtools"), false);

  const settingsSrc = fs.readFileSync(path.join(root, "build/assets/settings.mjs"), "utf8");
  assert.equal(settingsSrc.includes("Open Admin Panel"), false);
  assert.equal(settingsSrc.includes("Toggle Developer Tools"), false);
  assert.ok(settingsSrc.includes(`./performance.mjs?v=${version}`), "settings.mjs imports performance.mjs with current version");
  assert.match(settingsSrc, /shouldShowKeyboardShortcuts\(\)/);
  assert.match(settingsSrc, /showShortcuts\s*\?\s*"Storage & Shortcuts"\s*:\s*"Storage"/);
});

test("shouldShowKeyboardShortcuts hides shortcuts on phones, tablets, and coarse no-hover devices", async () => {
  const { shouldShowKeyboardShortcuts } = await import(pathToFileURL(path.join(root, "build/assets/settings.mjs")).href);
  const noCoarseMatch = () => ({ matches: false });

  for (const device of [
    { userAgent: "iPhone" },
    { userAgent: "Android" },
    { userAgent: "iPad" },
    { userAgent: "Macintosh", maxTouchPoints: 5 },
    { userAgentData: { mobile: true } }
  ]) {
    assert.equal(shouldShowKeyboardShortcuts({ device, matchMedia: noCoarseMatch }), false);
  }

  assert.equal(
    shouldShowKeyboardShortcuts({
      device: { userAgent: "Windows NT" },
      matchMedia: q => ({ matches: q === "(hover: none) and (pointer: coarse)" })
    }),
    false
  );

  assert.equal(
    shouldShowKeyboardShortcuts({
      device: { userAgent: "Windows NT", maxTouchPoints: 10 },
      matchMedia: noCoarseMatch
    }),
    true
  );
  assert.equal(
    shouldShowKeyboardShortcuts({
      device: { userAgent: "Macintosh", maxTouchPoints: 0 },
      matchMedia: null
    }),
    true
  );
});
