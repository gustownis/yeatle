import { interfaceMotionAllowed } from "./interface-motion.mjs?v=1.10.2";

let activeTransition = null;
let selection = 0;

// Commit only the latest tab click, including when a previous snapshot is pending.
export function changeMode(update, animate = true) {
  const current = ++selection;
  activeTransition?.skipTransition();
  if (!animate || !interfaceMotionAllowed() || !document.startViewTransition || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  let applied = false;
  const apply = () => {
    if (current !== selection || applied) return;
    applied = true;
    update();
  };
  try {
    const transition = document.startViewTransition(apply);
    activeTransition = transition;
    // A hidden tab or an interrupted navigation can skip the visual transition.
    transition.ready.catch(() => {});
    transition.finished.catch(() => {}).finally(() => {
      if (activeTransition === transition) activeTransition = null;
    });
  } catch {
    apply();
  }
}
