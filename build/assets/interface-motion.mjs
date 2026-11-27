const MOTION_KEY = "yeatle:motion";

export function getInterfaceMotionPreference(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(MOTION_KEY);
    if (raw == null) return "auto";
    let val = raw;
    try { val = JSON.parse(raw); } catch {}
    return val === "full" || val === "reduced" ? val : "auto";
  } catch {
    return "auto";
  }
}

export function setInterfaceMotionPreference(mode, storage = globalThis.localStorage) {
  const next = mode === "full" || mode === "reduced" ? mode : "auto";
  try {
    if (next === "auto") storage?.removeItem?.(MOTION_KEY);
    else storage?.setItem?.(MOTION_KEY, JSON.stringify(next));
  } catch {}
  if (typeof document !== "undefined") {
    const preference = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    document.documentElement.dataset.interfaceMotion =
      next === "reduced" ? "reduced" : next === "full" ? "full" :
        (interfaceMotionAllowed() && !preference?.matches ? "full" : "reduced");
  }
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new CustomEvent("yeatle:setting-changed", { detail: { key: "motion", value: next } })); } catch {}
  }
  return next;
}

// Resource hints are approximate. Unknown or modest hardware gets instant controls.
export function interfaceMotionAllowed(device = globalThis.navigator) {
  const memory = Number(device?.deviceMemory);
  const cores = Number(device?.hardwareConcurrency);
  const lowMemory = memory > 0 && memory <= 4;
  const fewCores = cores > 0 && cores <= 4;
  return (memory > 4 || cores > 4) && !lowMemory && !fewCores && device?.connection?.saveData !== true;
}

if (typeof document !== "undefined") {
  const preference = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  const update = () => {
    const pref = getInterfaceMotionPreference();
    document.documentElement.dataset.interfaceMotion =
      pref === "reduced" ? "reduced" : pref === "full" ? "full" :
        (interfaceMotionAllowed() && !preference?.matches ? "full" : "reduced");
  };
  update();
  preference?.addEventListener?.("change", update);
  globalThis.navigator?.connection?.addEventListener?.("change", update);
  globalThis.addEventListener?.("storage", e => { if (e.key === MOTION_KEY) update(); });
  globalThis.addEventListener?.("yeatle:setting-changed", e => { if (e.detail?.key === "motion") update(); });
}
