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
    document.documentElement.dataset.interfaceMotion =
      interfaceMotionAllowed() && !preference?.matches ? "full" : "reduced";
  };
  update();
  preference?.addEventListener?.("change", update);
  globalThis.navigator?.connection?.addEventListener?.("change", update);
}
