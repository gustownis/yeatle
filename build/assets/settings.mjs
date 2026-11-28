import { accountApi } from "./leaderboard.mjs?v=1.15.0";
import { activeWrappedYear, isWrappedChipHidden, setWrappedChipHidden, openWrapped } from "./wrapped.mjs?v=1.15.0";
import { getInterfaceMotionPreference, setInterfaceMotionPreference } from "./interface-motion.mjs?v=1.15.0";
import { getStemCacheStats, clearStemCache } from "./stem-cache.mjs?v=1.15.0";
import { isMobileDevice } from "./performance.mjs?v=1.15.0";

const BG_KEY = "yeatle:bg";
const VOLUME_KEY = "yeatle:volume";
const LIGHT_STEMS_KEY = "yeatle:lightStems";
const HINTS_KEY = "yeatle:hints";
const FALLBACK_VERSION = "1.15.0";
const GUIDE_URL = "https://github.com/gustownis/yeatle#readme";
const DISCORD_URL = "https://discord.gg/twizz";

/* ---------- pure helpers (exported for tests) ---------- */

export function cornerMode({ wrappedYear, chipHidden }) {
  return wrappedYear && !chipHidden ? "wrapped" : "settings";
}

export function resolveDockPlacement({ isMobile, hasHeaderSlot }) {
  return isMobile && hasHeaderSlot ? "header" : "corner";
}

export function shouldShowKeyboardShortcuts({ device = globalThis.navigator, matchMedia } = {}) {
  if (isMobileDevice(device)) return false;
  const query = matchMedia !== undefined
    ? matchMedia
    : typeof globalThis.matchMedia === "function"
      ? q => globalThis.matchMedia(q)
      : null;
  if (typeof query === "function" && query("(hover: none) and (pointer: coarse)")?.matches) return false;
  return true;
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return "0 MB";
  const mb = n / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  return `${Math.max(0.1, mb).toFixed(1)} MB`;
}

export function getBackgroundPreference(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(BG_KEY);
    if (raw == null) return "full";
    let val = raw;
    try { val = JSON.parse(raw); } catch {}
    return val === "dim" || val === "off" ? val : "full";
  } catch {
    return "full";
  }
}

export function applyBackgroundPreference(pref = getBackgroundPreference()) {
  if (typeof document === "undefined") return;
  const next = pref === "dim" || pref === "off" ? pref : "full";
  if (next === "full") delete document.documentElement.dataset.yeatleBg;
  else document.documentElement.dataset.yeatleBg = next;
}

function readJsonPref(key, fallback, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonPref(key, value, storage = globalThis.localStorage) {
  try { storage?.setItem?.(key, JSON.stringify(value)); } catch {}
}

function emitSettingChanged(key, value) {
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new CustomEvent("yeatle:setting-changed", { detail: { key, value } })); } catch {}
}

function appVersionFromScript() {
  try {
    const url = new URL(import.meta.url);
    return url.searchParams.get("v") || FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}

function svgIcon(paths, size = 16, viewBox = "0 0 16 16") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const item of paths) {
    if (typeof item === "string") {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", item);
      svg.appendChild(p);
    } else {
      const node = document.createElementNS("http://www.w3.org/2000/svg", item.tag);
      for (const [k, v] of Object.entries(item.attrs)) node.setAttribute(k, String(v));
      svg.appendChild(node);
    }
  }
  return svg;
}

const GEAR_ICON = () => svgIcon([
  { tag: "circle", attrs: { cx: 12, cy: 12, r: 3 } },
  "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
], 18, "0 0 24 24");

const CLOSE_ICON = (size = 15) => svgIcon(["M4 4l8 8M12 4l-8 8"], size);

const SPEAKER_ICON = muted => svgIcon(
  muted
    ? [{ tag: "path", attrs: { d: "M2.5 6h2.7l3.3-2.8v9.6L5.2 10H2.5z", fill: "currentColor", stroke: "none" } }, "M11 6l3 4M14 6l-3 4"]
    : [{ tag: "path", attrs: { d: "M2.5 6h2.7l3.3-2.8v9.6L5.2 10H2.5z", fill: "currentColor", stroke: "none" } }, "M11.2 5.4q1.7 2.6 0 5.2"],
  16
);

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const child of children.flat()) if (child != null && child !== false) node.append(child);
  return node;
};

/* ---------- controller & UI ---------- */

let controller = null;

export function openSettings(options = {}) {
  controller?.open(options);
}

export function closeSettings() {
  controller?.close();
}

export function refreshCornerDock() {
  controller?.renderDock();
}

function initSettingsUI() {
  if (typeof document === "undefined" || !document.body) return;

  applyBackgroundPreference();

  let isOpen = false;
  let lastFocused = null;
  let renaming = false;
  let renameDraft = "";
  let focusTarget = "";
  let loginUserDraft = "";
  let loginPassDraft = "";
  let localNotice = "";
  let localError = false;
  let stemCacheStats = null;
  let clearingCache = false;
  let toastTimer = 0;
  let accountSnap = accountApi.getState();
  let desktopState = null;

  const isDesktop = Boolean(globalThis.yeatleDesktop === true && globalThis.yeatleDesktopApi);
  const mobileQuery = globalThis.matchMedia?.("(max-width: 560px)") || null;

  const dock = document.createElement("div");
  dock.className = "yeatle-corner-dock";

  function headerDockSlot() {
    return (
      document.getElementById("yeatle-lb-slot") ||
      document.querySelector(".daily-shell .modebar") ||
      document.querySelector("#setup .top") ||
      document.querySelector(".topbar .score")
    );
  }

  function ensureDockMounted() {
    if (accountSnap.banned) return;
    const slot = headerDockSlot();
    const placement = resolveDockPlacement({
      isMobile: Boolean(mobileQuery?.matches),
      hasHeaderSlot: Boolean(slot)
    });
    const inline = placement === "header";
    dock.classList.toggle("is-inline", inline);
    const target = inline ? slot : document.body;
    if (!target) return;
    if (inline) {
      const lbBtn = target.querySelector(".yeatle-lb-btn");
      if (lbBtn) {
        if (dock.parentElement !== target || lbBtn.nextElementSibling !== dock) {
          lbBtn.after(dock);
        }
        return;
      }
    }
    if (dock.parentElement !== target) target.appendChild(dock);
  }

  const toastNode = document.createElement("div");
  toastNode.className = "yeatle-settings-toast";
  toastNode.setAttribute("role", "status");
  toastNode.setAttribute("aria-live", "polite");
  toastNode.hidden = true;
  document.body.appendChild(toastNode);

  const overlay = document.createElement("div");
  overlay.className = "yeatle-settings-overlay";
  overlay.hidden = true;

  const modal = document.createElement("div");
  modal.className = "yeatle-settings-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "yeatle-settings-title");
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function showToast(msg) {
    clearTimeout(toastTimer);
    toastNode.textContent = msg;
    toastNode.hidden = false;
    toastTimer = setTimeout(() => { toastNode.hidden = true; }, 2600);
  }

  function focusablesIn(root) {
    return [...root.querySelectorAll("button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), a[href], summary, [tabindex]:not([tabindex='-1'])")]
      .filter(node => !node.closest?.("[hidden]") && node.offsetParent !== null);
  }

  function applyFocusHint(hint) {
    if (!hint || !isOpen) return;
    let target = null;
    if (hint === "rename") target = modal.querySelector('[data-settings-focus="rename-input"]');
    else if (hint === "login") target = modal.querySelector('[data-settings-focus="login-user"]');
    else if (hint === "account") target = modal.querySelector('[data-settings-focus="sync"], [data-settings-focus="login-user"]');
    if (target) {
      if (target.tagName === "INPUT" && typeof target.select === "function") target.select();
      target.focus({ preventScroll: true });
    }
  }

  function open(options = {}) {
    if (accountSnap.banned) return;
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : dock.querySelector("button");
    if (options.forceRename) {
      renaming = true;
      renameDraft = "";
    }
    focusTarget = options.focus || "";
    isOpen = true;
    overlay.hidden = false;
    document.body.classList.add("yeatle-settings-open");
    renderModal();
    if (focusTarget) {
      queueMicrotask(() => applyFocusHint(focusTarget));
      focusTarget = "";
    } else {
      modal.querySelector(".yeatle-settings-close")?.focus({ preventScroll: true });
    }
    loadStemStats();
    if (isDesktop) {
      globalThis.yeatleDesktopApi.getState?.().then(st => {
        if (st) {
          desktopState = st;
          renderDock();
          if (isOpen) renderModal();
        }
      }).catch(() => {});
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.hidden = true;
    document.body.classList.remove("yeatle-settings-open");
    renaming = false;
    localNotice = "";
    localError = false;
    const target = lastFocused?.isConnected ? lastFocused : dock.querySelector("button");
    lastFocused = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }

  function renderDock() {
    if (accountSnap.banned) {
      dock.hidden = true;
      return;
    }
    dock.hidden = false;
    ensureDockMounted();
    const inline = dock.classList.contains("is-inline");
    const year = activeWrappedYear();
    const hidden = year ? isWrappedChipHidden(year) : true;
    const mode = cornerMode({ wrappedYear: year, chipHidden: hidden });

    if (mode === "wrapped") {
      const openBtn = el("button", {
        type: "button",
        class: "yeatle-corner-wrapped-open",
        "aria-label": `Open your Yeatle Wrapped ${year}`,
        onclick: () => openWrapped(year)
      },
      el("img", { class: "icon", src: "favicon-64.png", alt: "", width: 16, height: 16 }),
      el("span", { class: "label", text: `Wrapped ${year}` }));

      const hideBtn = el("button", {
        type: "button",
        class: "yeatle-corner-wrapped-hide",
        "aria-label": "Hide Wrapped button",
        title: "Hide Wrapped (stays in Settings)",
        onclick: () => {
          setWrappedChipHidden(year, true);
          renderDock();
          showToast("Wrapped hidden — reopen anytime in Settings.");
          if (isOpen) renderModal();
        }
      }, CLOSE_ICON(13));

      dock.className = `yeatle-corner-dock is-wrapped${inline ? " is-inline" : ""}`;
      dock.replaceChildren(openBtn, hideBtn);
    } else {
      const blocked = Boolean(accountSnap.account?.usernameBlocked);
      const updateReady = Boolean(desktopState?.updateReady);
      const gearBtn = el("button", {
        type: "button",
        class: "yeatle-corner-settings",
        "aria-label": "Open Settings",
        title: blocked ? "Settings (username action required)" : updateReady ? "Settings (update ready)" : "Settings",
        onclick: () => open(blocked ? { focus: "rename", forceRename: true } : {})
      }, GEAR_ICON());

      if (blocked || updateReady) {
        gearBtn.appendChild(el("span", {
          class: `yeatle-corner-dot ${blocked ? "warn" : "update"}`,
          "aria-hidden": "true"
        }));
      }
      dock.className = `yeatle-corner-dock is-settings${inline ? " is-inline" : ""}`;
      dock.replaceChildren(gearBtn);
    }
  }

  async function loadStemStats() {
    try {
      stemCacheStats = await getStemCacheStats();
      if (isOpen) renderModal();
    } catch {
      stemCacheStats = { count: 0, bytes: 0 };
    }
  }

  async function runDesktopAction(action) {
    if (!isDesktop) return;
    try {
      const next = await globalThis.yeatleDesktopApi.run(action);
      if (next) {
        desktopState = next;
        renderDock();
        if (isOpen) renderModal();
      }
    } catch {}
  }

  function renderSegmented(options, currentValue, onSelect, ariaLabel) {
    return el("div", { class: "yeatle-settings-seg", role: "group", "aria-label": ariaLabel },
      options.map(([val, label]) => el("button", {
        type: "button",
        class: `yeatle-settings-seg-btn${currentValue === val ? " on" : ""}`,
        "aria-pressed": String(currentValue === val),
        text: label,
        onclick: () => { if (currentValue !== val) onSelect(val); }
      }))
    );
  }

  function renderAccountSection() {
    const sec = el("section", { class: "yeatle-settings-section" });
    sec.appendChild(el("h3", { text: "Account & Sync" }));

    const { account, streak, prestige, busy, statusMessage, statusError } = accountSnap;
    if (account?.token) {
      const userLine = el("div", { class: "yeatle-settings-user" },
        el("span", { class: "yeatle-settings-username", text: account.username }),
        streak > 0 ? el("span", { class: "yeatle-lb-streak", title: `${streak} day Daily streak`, text: `${streak}d` }) : null,
        prestige > 0 ? el("span", { class: "yeatle-lb-prestige", title: `${prestige} Prestige`, text: `P${prestige}` }) : null
      );

      const syncBtn = el("button", {
        type: "button",
        class: "yeatle-settings-btn",
        "data-settings-focus": "sync",
        disabled: busy,
        text: "Sync progress",
        onclick: () => accountApi.sync()
      });
      const renameBtn = el("button", {
        type: "button",
        class: "yeatle-settings-btn",
        "data-settings-focus": "rename",
        hidden: renaming,
        disabled: busy,
        text: "Change username",
        onclick: () => {
          renaming = true;
          renameDraft = account.username || "";
          accountApi.clearStatus();
          renderModal();
          queueMicrotask(() => applyFocusHint("rename"));
        }
      });
      const outBtn = el("button", {
        type: "button",
        class: "yeatle-settings-btn",
        "data-settings-focus": "logout",
        disabled: busy,
        text: "Log out",
        onclick: () => {
          renaming = false;
          accountApi.logout();
        }
      });

      const top = el("div", { class: "yeatle-settings-account-top" },
        userLine,
        el("div", { class: "yeatle-settings-actions" }, syncBtn, renameBtn, outBtn)
      );
      sec.appendChild(top);
      sec.appendChild(el("p", { class: "yeatle-settings-note", text: "Progress syncs automatically after each round." }));

      if (account.usernameBlocked) {
        sec.appendChild(el("p", {
          class: "yeatle-settings-status err",
          role: "alert",
          text: accountApi.USERNAME_BLOCKED_MESSAGE
        }));
      }

      if (renaming) {
        const nameIn = el("input", {
          type: "text",
          placeholder: "New username",
          maxlength: 20,
          autocomplete: "username",
          required: true,
          "aria-label": "New username",
          "data-settings-focus": "rename-input"
        });
        nameIn.value = renameDraft;
        nameIn.addEventListener("input", () => { renameDraft = nameIn.value; });

        const saveBtn = el("button", {
          type: "submit",
          class: "yeatle-settings-btn primary",
          disabled: busy,
          text: busy ? "Working…" : "Save"
        });
        const cancelBtn = el("button", {
          type: "button",
          class: "yeatle-settings-btn",
          disabled: busy,
          text: "Cancel",
          onclick: () => {
            renaming = false;
            accountApi.clearStatus();
            renderModal();
          }
        });
        const form = el("form", {
          class: "yeatle-settings-auth-form rename",
          onsubmit: async e => {
            e.preventDefault();
            const next = nameIn.value.trim();
            if (next && next !== account.username) {
              await accountApi.rename(next);
              if (!accountApi.getState().statusError) renaming = false;
              if (isOpen) renderModal();
            }
          }
        }, nameIn, el("div", { class: "yeatle-settings-auth-btns" }, saveBtn, cancelBtn));
        sec.appendChild(form);
      }
    } else {
      sec.appendChild(el("p", {
        class: "yeatle-settings-note",
        text: "Sign in to sync progress across devices and appear on the leaderboards."
      }));

      const userIn = el("input", {
        type: "text",
        placeholder: "Username",
        "aria-label": "Username",
        maxlength: 20,
        autocomplete: "username",
        required: true,
        "data-settings-focus": "login-user"
      });
      userIn.value = loginUserDraft;
      userIn.addEventListener("input", () => { loginUserDraft = userIn.value; });

      const passIn = el("input", {
        type: "password",
        placeholder: "Password (4+ chars)",
        "aria-label": "Password",
        maxlength: 128,
        autocomplete: "current-password",
        required: true
      });
      passIn.value = loginPassDraft;
      passIn.addEventListener("input", () => { loginPassDraft = passIn.value; });

      const loginBtn = el("button", {
        type: "submit",
        class: "yeatle-settings-btn primary",
        "data-settings-focus": "login",
        disabled: busy,
        text: busy ? "Working…" : "Log in"
      });
      const regBtn = el("button", {
        type: "button",
        class: "yeatle-settings-btn",
        "data-settings-focus": "register",
        disabled: busy,
        text: "Create account",
        onclick: async () => {
          const u = userIn.value.trim();
          const p = passIn.value;
          if (u && p) {
            await accountApi.register(u, p);
            if (accountApi.getState().account?.token) { loginUserDraft = ""; loginPassDraft = ""; }
            if (isOpen) renderModal();
          } else {
            localError = true;
            localNotice = "Enter a username and password first.";
            renderModal();
          }
        }
      });

      const form = el("form", {
        class: "yeatle-settings-auth-form",
        onsubmit: async e => {
          e.preventDefault();
          const u = userIn.value.trim();
          const p = passIn.value;
          if (u && p) {
            localNotice = "";
            localError = false;
            await accountApi.login(u, p);
            if (accountApi.getState().account?.token) { loginUserDraft = ""; loginPassDraft = ""; }
            if (isOpen) renderModal();
          }
        }
      }, userIn, passIn, el("div", { class: "yeatle-settings-auth-btns" }, loginBtn, regBtn));
      sec.appendChild(form);
    }

    const msg = statusMessage || localNotice;
    const isErr = statusMessage ? statusError : localError;
    if (msg) {
      sec.appendChild(el("p", {
        class: `yeatle-settings-status${isErr ? " err" : ""}`,
        role: isErr ? "alert" : "status",
        "aria-live": "polite",
        text: msg
      }));
    }
    return sec;
  }

  function renderWrappedSection() {
    const year = activeWrappedYear();
    if (!year) return null;
    const live = new Date().getFullYear() === year;
    const hidden = isWrappedChipHidden(year);

    const openBtn = el("button", {
      type: "button",
      class: "yeatle-settings-btn primary",
      text: "Open Wrapped",
      onclick: () => {
        close();
        openWrapped(year);
      }
    });

    const toggleId = "yeatle-settings-wrapped-chip";
    const toggle = el("input", {
      id: toggleId,
      type: "checkbox",
      checked: !hidden,
      onchange: () => {
        setWrappedChipHidden(year, !toggle.checked);
        renderDock();
      }
    });

    return el("section", { class: "yeatle-settings-section yeatle-settings-wrapped" },
      el("div", { class: "yeatle-settings-wrapped-top" },
        el("div", {},
          el("h3", { text: `Yeatle Wrapped ${year}` }),
          el("p", {
            class: "yeatle-settings-note",
            text: live ? "Your yearly recap — keeps updating until December 31." : `Your finished ${year} recap · viewable until January 7.`
          })
        ),
        openBtn
      ),
      el("div", { class: "yeatle-settings-row" },
        el("label", { class: "yeatle-settings-wrapped-label", for: toggleId, text: "Show Wrapped button in bottom-right corner" }),
        el("label", { class: "yeatle-settings-switch" }, toggle, el("span", { class: "slider" }))
      )
    );
  }

  function renderGameplaySection() {
    const sec = el("section", { class: "yeatle-settings-section" });
    sec.appendChild(el("h3", { text: "Gameplay & Display" }));

    // Master volume
    const rawVol = Number(readJsonPref(VOLUME_KEY, 0.8));
    let vol = Number.isFinite(rawVol) ? Math.max(0, Math.min(1, rawVol)) : 0.8;
    let lastNonZero = vol > 0 ? vol : 0.8;

    const muteBtn = el("button", {
      type: "button",
      class: "yeatle-settings-mute",
      "aria-label": vol === 0 ? "Unmute" : "Mute",
      title: vol === 0 ? "Unmute" : "Mute"
    }, SPEAKER_ICON(vol === 0));
    const volRange = el("input", {
      type: "range",
      min: 0,
      max: 1,
      step: 0.01,
      value: String(vol),
      "aria-label": "Master volume"
    });
    const volPct = el("span", { class: "yeatle-settings-pct", text: `${Math.round(vol * 100)}%` });

    const syncVolume = next => {
      vol = Math.max(0, Math.min(1, Number(next) || 0));
      if (vol > 0) lastNonZero = vol;
      writeJsonPref(VOLUME_KEY, vol);
      emitSettingChanged("volume", vol);
      volRange.value = String(vol);
      volPct.textContent = `${Math.round(vol * 100)}%`;
      muteBtn.setAttribute("aria-label", vol === 0 ? "Unmute" : "Mute");
      muteBtn.title = vol === 0 ? "Unmute" : "Mute";
      muteBtn.replaceChildren(SPEAKER_ICON(vol === 0));
    };
    muteBtn.addEventListener("click", () => syncVolume(vol === 0 ? lastNonZero : 0));
    volRange.addEventListener("input", () => syncVolume(parseFloat(volRange.value)));

    sec.appendChild(el("div", { class: "yeatle-settings-row" },
      el("div", { class: "yeatle-settings-label" },
        el("strong", { text: "Master volume" }),
        el("span", { text: "Shared across Stems, Snippets, and Daily." })
      ),
      el("div", { class: "yeatle-settings-vol" }, muteBtn, volRange, volPct)
    ));

    // Stems separation
    const lightStems = Boolean(readJsonPref(LIGHT_STEMS_KEY, false));
    sec.appendChild(el("div", { class: "yeatle-settings-row" },
      el("div", { class: "yeatle-settings-label" },
        el("strong", { text: "Stems separation" }),
        el("span", { text: "Light uses filters instead of AI — easier on slower devices." })
      ),
      renderSegmented([["real", "Real (AI)"], ["light", "Light (Fast)"]], lightStems ? "light" : "real", val => {
        const next = val === "light";
        writeJsonPref(LIGHT_STEMS_KEY, next);
        emitSettingChanged("lightStems", next);
        renderModal();
      }, "Stems separation")
    ));

    // Snippets hints
    const hints = readJsonPref(HINTS_KEY, true) !== false;
    const hintsId = "yeatle-settings-hints";
    const hintsToggle = el("input", {
      id: hintsId,
      type: "checkbox",
      checked: hints,
      onchange: () => {
        writeJsonPref(HINTS_KEY, hintsToggle.checked);
        emitSettingChanged("hints", hintsToggle.checked);
      }
    });
    sec.appendChild(el("div", { class: "yeatle-settings-row" },
      el("div", { class: "yeatle-settings-label" },
        el("label", { for: hintsId, text: "Snippets hints" }),
        el("span", { text: "Era, year, and producer unlock as clips grow. Off in Extreme." })
      ),
      el("label", { class: "yeatle-settings-switch" }, hintsToggle, el("span", { class: "slider" }))
    ));

    // Background photo
    const bgPref = getBackgroundPreference();
    sec.appendChild(el("div", { class: "yeatle-settings-row" },
      el("div", { class: "yeatle-settings-label" },
        el("strong", { text: "Background photo" }),
        el("span", { text: "Dim or turn off for pure black focus." })
      ),
      renderSegmented([["full", "Full"], ["dim", "Dim"], ["off", "Off"]], bgPref, val => {
        writeJsonPref(BG_KEY, val);
        applyBackgroundPreference(val);
        emitSettingChanged("bg", val);
        renderModal();
      }, "Background photo")
    ));

    // Interface motion
    const motionPref = getInterfaceMotionPreference();
    sec.appendChild(el("div", { class: "yeatle-settings-row" },
      el("div", { class: "yeatle-settings-label" },
        el("strong", { text: "Interface motion" }),
        el("span", { text: "Controls transitions and animations." })
      ),
      renderSegmented([["auto", "Auto"], ["full", "Full"], ["reduced", "Reduced"]], motionPref, val => {
        setInterfaceMotionPreference(val);
        renderModal();
      }, "Interface motion")
    ));

    return sec;
  }

  function renderDesktopSection() {
    if (!isDesktop) return null;
    const sec = el("section", { class: "yeatle-settings-section" });
    sec.appendChild(el("h3", { text: "Desktop App" }));

    const st = desktopState || {
      version: appVersionFromScript(),
      updateStatus: "Check for Updates",
      updating: false,
      updateReady: false,
      zoomFactor: 1,
      isFullScreen: false
    };

    sec.appendChild(el("div", { class: "yeatle-settings-row" },
      el("div", { class: "yeatle-settings-label" },
        el("strong", { text: `Yeatle v${st.version}` }),
        el("span", { text: st.updateReady ? "An update is downloaded and ready to install." : st.updating ? st.updateStatus : "Desktop app updates and HQ stem packs." })
      ),
      el("button", {
        type: "button",
        class: `yeatle-settings-btn${st.updateReady ? " primary" : ""}`,
        disabled: Boolean(st.updating),
        text: st.updateStatus || "Check for Updates",
        onclick: () => runDesktopAction("check-updates")
      })
    ));

    sec.appendChild(el("div", { class: "yeatle-settings-row" },
      el("div", { class: "yeatle-settings-label" },
        el("strong", { text: "Optional HQ Stems" }),
        el("span", { text: "Pre-split high-quality stems stored locally." })
      ),
      el("div", { class: "yeatle-settings-actions" },
        el("button", { type: "button", class: "yeatle-settings-btn", text: "Download from server…", onclick: () => runDesktopAction("open-stems-server") }),
        el("button", { type: "button", class: "yeatle-settings-btn", text: "MEGA folder", onclick: () => runDesktopAction("open-stems-mega") })
      )
    ));

    sec.appendChild(el("div", { class: "yeatle-settings-row" },
      el("div", { class: "yeatle-settings-label" },
        el("strong", { text: "Folders & system" }),
        el("span", { text: "Open local folders, system mic settings, or browser view." })
      ),
      el("div", { class: "yeatle-settings-actions" },
        el("button", { type: "button", class: "yeatle-settings-btn", text: "Songs folder", onclick: () => runDesktopAction("open-songs") }),
        el("button", { type: "button", class: "yeatle-settings-btn", text: "Data & logs", onclick: () => runDesktopAction("open-data") }),
        el("button", { type: "button", class: "yeatle-settings-btn", text: "Mic settings", onclick: () => runDesktopAction("open-mic-settings") }),
        el("button", { type: "button", class: "yeatle-settings-btn", text: "Open in browser", onclick: () => runDesktopAction("open-browser") })
      )
    ));

    const zoomPct = `${Math.round((st.zoomFactor || 1) * 100)}%`;
    sec.appendChild(el("div", { class: "yeatle-settings-row" },
      el("div", { class: "yeatle-settings-label" },
        el("strong", { text: "Window" }),
        el("span", { text: "Zoom, fullscreen, or reload." })
      ),
      el("div", { class: "yeatle-settings-actions" },
        el("button", { type: "button", class: "yeatle-settings-btn compact", "aria-label": "Zoom out", text: "−", onclick: () => runDesktopAction("zoom-out") }),
        el("button", { type: "button", class: "yeatle-settings-btn compact tabular", title: "Reset zoom", text: zoomPct, onclick: () => runDesktopAction("zoom-reset") }),
        el("button", { type: "button", class: "yeatle-settings-btn compact", "aria-label": "Zoom in", text: "+", onclick: () => runDesktopAction("zoom-in") }),
        el("button", { type: "button", class: "yeatle-settings-btn", text: st.isFullScreen ? "Exit fullscreen" : "Fullscreen", onclick: () => runDesktopAction("toggle-fullscreen") }),
        el("button", { type: "button", class: "yeatle-settings-btn", text: "Reload", onclick: () => runDesktopAction("reload") })
      )
    ));
    return sec;
  }

  function renderStorageSection() {
    const showShortcuts = shouldShowKeyboardShortcuts();
    const sec = el("section", { class: "yeatle-settings-section" });
    sec.appendChild(el("h3", { text: showShortcuts ? "Storage & Shortcuts" : "Storage" }));

    const statsText = stemCacheStats == null
      ? "Checking cached stems…"
      : stemCacheStats.count > 0
        ? `${stemCacheStats.count} ${stemCacheStats.count === 1 ? "song" : "songs"} · ${formatBytes(stemCacheStats.bytes)}`
        : "Empty";

    const clearBtn = el("button", {
      type: "button",
      class: "yeatle-settings-btn",
      disabled: clearingCache || !stemCacheStats || stemCacheStats.count === 0,
      text: clearingCache ? "Clearing…" : "Clear cache",
      onclick: async () => {
        clearingCache = true;
        renderModal();
        const ok = await clearStemCache();
        clearingCache = false;
        stemCacheStats = await getStemCacheStats();
        if (ok) showToast("Cleared cached AI stems.");
        if (isOpen) renderModal();
      }
    });

    sec.appendChild(el("div", { class: "yeatle-settings-row" },
      el("div", { class: "yeatle-settings-label" },
        el("strong", { text: "Cached AI stems" }),
        el("span", { text: `${statsText} · Never clears scores, streaks, or accounts.` })
      ),
      clearBtn
    ));

    if (showShortcuts) {
      const shortcuts = [
        ["Space", "Play / Stop audio"],
        ["S", "Skip clip / reveal next stem"],
        ["Enter", "Focus guess box / Next song"],
        ["Esc", "Close open modal"],
        ["[ / ]", "Nudge Karaoke lyrics timing"],
        ["K", "Mark Karaoke skip (White people mode)"]
      ];
      sec.appendChild(el("details", { class: "yeatle-settings-details" },
        el("summary", { text: "Keyboard shortcuts" }),
        el("ul", { class: "yeatle-settings-keys" },
          shortcuts.map(([key, desc]) => el("li", {}, el("kbd", { text: key }), el("span", { text: desc })))
        )
      ));
    }
    return sec;
  }

  function renderFooter() {
    const version = desktopState?.version || appVersionFromScript();
    const guideLink = isDesktop
      ? el("button", { type: "button", class: "yeatle-settings-link", text: "Setup guide", onclick: () => runDesktopAction("open-guide") })
      : el("a", { class: "yeatle-settings-link", href: GUIDE_URL, target: "_blank", rel: "noopener noreferrer", text: "Setup guide" });
    const discordLink = el("a", {
      class: "yeatle-settings-link",
      href: DISCORD_URL,
      target: "_blank",
      rel: "noopener noreferrer",
      text: "Yeat Hub Discord"
    });

    return el("footer", { class: "yeatle-settings-foot" },
      el("span", { text: `Yeatle v${version}` }),
      el("div", { class: "yeatle-settings-foot-links" }, guideLink, discordLink)
    );
  }

  function renderModal() {
    const bodyEl = modal.querySelector(".yeatle-settings-body");
    const prevScroll = bodyEl ? bodyEl.scrollTop : 0;
    const activeEl = document.activeElement;
    const prevFocus = activeEl && modal.contains(activeEl) ? activeEl.dataset?.settingsFocus || "" : "";
    const openDetails = new Set([...modal.querySelectorAll(".yeatle-settings-details[open]")].map(d => d.querySelector("summary")?.textContent));

    const closeBtn = el("button", {
      type: "button",
      class: "yeatle-settings-close",
      "data-settings-focus": "close",
      "aria-label": "Close settings",
      onclick: close
    }, CLOSE_ICON(18));

    const head = el("div", { class: "yeatle-settings-head" },
      el("div", {},
        el("h2", { id: "yeatle-settings-title", text: "Settings" }),
        el("p", {
          class: "yeatle-settings-sub",
          text: isDesktop ? "Account, playback, display, and desktop app controls." : "Account, playback, and display."
        })
      ),
      closeBtn
    );

    const body = el("div", { class: "yeatle-settings-body" },
      renderAccountSection(),
      renderWrappedSection(),
      renderGameplaySection(),
      renderDesktopSection(),
      renderStorageSection(),
      renderFooter()
    );

    for (const det of body.querySelectorAll(".yeatle-settings-details")) {
      const label = det.querySelector("summary")?.textContent;
      if (label && openDetails.has(label)) det.open = true;
    }

    modal.replaceChildren(head, body);

    if (prevScroll > 0) body.scrollTop = prevScroll;
    if (prevFocus) {
      const next = modal.querySelector(`[data-settings-focus="${prevFocus}"]`);
      if (next) next.focus({ preventScroll: true });
    }
  }

  /* ---------- event wiring ---------- */

  overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
  overlay.addEventListener("keydown", e => { if (isOpen) e.stopPropagation(); });
  overlay.addEventListener("keyup", e => { if (isOpen && e.code === "Space") e.stopPropagation(); });
  overlay.addEventListener("wheel", e => {
    if (!isOpen) return;
    const bodyEl = e.target?.closest?.(".yeatle-settings-body");
    if (!bodyEl || bodyEl.scrollHeight <= bodyEl.clientHeight) {
      e.preventDefault();
      return;
    }
    if ((e.deltaY < 0 && bodyEl.scrollTop <= 0) ||
        (e.deltaY > 0 && bodyEl.scrollTop + bodyEl.clientHeight >= bodyEl.scrollHeight - 1)) {
      e.preventDefault();
    }
  }, { passive: false });
  overlay.addEventListener("touchmove", e => {
    if (!isOpen) return;
    const bodyEl = e.target?.closest?.(".yeatle-settings-body");
    if (!bodyEl || bodyEl.scrollHeight <= bodyEl.clientHeight) e.preventDefault();
  }, { passive: false });

  window.addEventListener("keydown", e => {
    if (!isOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === "Tab") {
      const items = focusablesIn(modal);
      if (!items.length) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
        e.preventDefault();
        e.stopPropagation();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        e.stopPropagation();
        first.focus();
      }
      return;
    }
    if (!overlay.contains(e.target)) e.stopPropagation();
  }, true);

  window.addEventListener("keyup", e => {
    if (isOpen && e.code === "Space" && !overlay.contains(e.target)) e.stopPropagation();
  }, true);

  window.addEventListener("yeatle:open-settings", e => open(e.detail || {}));
  window.addEventListener("yeatle:wrapped-chip-changed", () => {
    renderDock();
    if (isOpen) renderModal();
  });
  window.addEventListener("yeatle:setting-changed", e => {
    if (e.detail?.key === "bg") applyBackgroundPreference(e.detail.value);
    if (isOpen && e.detail?.key !== "volume") renderModal();
  });
  window.addEventListener("storage", e => {
    if (e.key === BG_KEY) applyBackgroundPreference();
    if (e.key && /^yeatle:wrapped:chip:\d{4}$/.test(e.key)) renderDock();
    if (isOpen && e.key && [VOLUME_KEY, LIGHT_STEMS_KEY, HINTS_KEY, BG_KEY].includes(e.key)) renderModal();
  });
  window.addEventListener("yeatle:banned", () => {
    dockObserver?.disconnect();
    slotObserver?.disconnect();
    close();
    dock.remove();
    toastNode.remove();
  });

  mobileQuery?.addEventListener?.("change", ensureDockMounted);
  window.addEventListener("pagereveal", ensureDockMounted, true);
  let dockObserver = null;
  let slotObserver = null;
  const watchSlot = () => {
    slotObserver?.disconnect();
    const slot = headerDockSlot();
    if (slot && typeof MutationObserver === "function") {
      slotObserver = new MutationObserver(() => {
        if (!accountSnap.banned && mobileQuery?.matches) ensureDockMounted();
      });
      slotObserver.observe(slot, { childList: true });
    }
  };
  watchSlot();
  const mountRoot = document.getElementById("root");
  if (mountRoot && typeof MutationObserver === "function") {
    dockObserver = new MutationObserver(() => {
      if (!accountSnap.banned && mobileQuery?.matches) {
        ensureDockMounted();
        watchSlot();
      }
    });
    dockObserver.observe(mountRoot, { childList: true, subtree: true });
  }

  accountApi.subscribe(next => {
    accountSnap = next;
    renderDock();
    if (isOpen) renderModal();
  });

  if (isDesktop) {
    globalThis.yeatleDesktopApi.onState?.(st => {
      desktopState = st;
      renderDock();
      if (isOpen) renderModal();
    });
    globalThis.yeatleDesktopApi.getState?.().then(st => {
      if (st) {
        desktopState = st;
        renderDock();
        if (isOpen) renderModal();
      }
    }).catch(() => {});
  }

  controller = { open, close, renderDock };
  renderDock();

  // If leaderboard.mjs already detected a blocked username before settings.mjs loaded, open now.
  if (accountSnap.pendingBlockedPrompt && !accountSnap.banned) {
    accountApi.clearBlockedPrompt();
    open({ focus: "rename", forceRename: true });
  }
}

if (typeof document !== "undefined") {
  applyBackgroundPreference();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSettingsUI, { once: true });
  } else {
    initSettingsUI();
  }
}
