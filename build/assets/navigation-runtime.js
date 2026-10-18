(() => {
  const desktop = globalThis.yeatleDesktop === true;
  document.documentElement.dataset.navigationRuntime = desktop ? "desktop" : "browser";
  if (!desktop) return;

  // Opt in before the first paint on both pages, including full-page navigation.
  const style = document.createElement("style");
  style.textContent = "@media (prefers-reduced-motion: no-preference) { @view-transition { navigation: auto; } }";
  document.head.append(style);
})();
