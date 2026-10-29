const MODES = ["stems", "snippet", "snippet:base", "snippet:easy", "snippet:hard", "snippet:extreme"];
const ACCOUNT_KEY = "yeatle:account";
const DEVICE_KEY = "yeatle:device";

// The banned screen's wording. Edit it here.
export const BANNED_SCREEN = {
  title: "You've been banned",
  message: "This account or device is banned from Yeatle. You can no longer use Yeatle or its leaderboards.",
  link: "Find something new to do on Indeed",
  videoFallback: "The video couldn't play here."
};
const DEFAULT_JOBS_URL = "https://www.indeed.com/";

const BOARD_META = {
  daily: {
    tabLabel: "Daily 🔥",
    heading: "Top Daily players",
    rule: "🔥 streak counts Dailies finished while signed in",
    formatYou: entry => `You're #${entry.rank} with 🔥 ${entry.dailyStreak} streak (${entry.dailyWins} ${entry.dailyWins === 1 ? "win" : "wins"}).`,
    formatRight: entry => `${entry.dailyWins} ${entry.dailyWins === 1 ? "win" : "wins"}${entry.bestDailyStreak > 0 ? ` · best 🔥 ${entry.bestDailyStreak}` : ""}`
  },
  stems: {
    tabLabel: "Stems",
    heading: "Top Stems players",
    rule: "counts songs solved in Stems mode",
    formatYou: entry => `You're #${entry.rank} with ${entry.primary.toLocaleString()} ${entry.primary === 1 ? "song" : "songs"}.`,
    formatRight: entry => `${entry.primary.toLocaleString()} ${entry.primary === 1 ? "song" : "songs"}${entry.secondary > 0 ? ` · ${entry.secondary.toLocaleString()} ★` : ""}`
  },
  snippet: {
    tabLabel: "Snippets",
    heading: "Top Snippets players",
    rule: "counts songs solved in Snippets mode",
    formatYou: entry => `You're #${entry.rank} with ${entry.primary.toLocaleString()} ${entry.primary === 1 ? "song" : "songs"}.`,
    formatRight: entry => `${entry.primary.toLocaleString()} ${entry.primary === 1 ? "song" : "songs"}${entry.secondary > 0 ? ` · ${entry.secondary.toLocaleString()} ★` : ""}`
  },
  karaoke: {
    tabLabel: "Karaoke",
    heading: "Top Karaoke singers",
    rule: "sum of best scores across Karaoke songs",
    formatYou: entry => `You're #${entry.rank} with ${entry.primary.toLocaleString()} pts.`,
    formatRight: entry => `${entry.primary.toLocaleString()} pts${entry.secondary > 0 ? ` · ${entry.secondary} ${entry.secondary === 1 ? "song" : "songs"}` : ""}`
  }
};

function completedKey(mode) {
  return mode === "stems" ? "yeatle:completed" : `yeatle:completed:${mode}`;
}

function statsKey(mode) {
  return mode === "stems" ? "yeatle:stats" : `yeatle:stats:${mode}`;
}

function safeJsonParse(raw, fallback) {
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function collectLocalProgress(storage = globalThis.localStorage) {
  const completed = {};
  const stats = {};
  if (!storage) return { completed, stats, prestige: 0, daily: {}, karaoke: {} };

  for (const mode of MODES) {
    const comp = safeJsonParse(storage.getItem(completedKey(mode)), []);
    completed[mode] = Array.isArray(comp) ? comp.filter(x => typeof x === "string") : [];
    const st = safeJsonParse(storage.getItem(statsKey(mode)), null);
    if (st && typeof st === "object") stats[mode] = st;
  }

  const prestige = Number(safeJsonParse(storage.getItem("yeatle:prestige"), 0)) || 0;
  const daily = {};
  const karaoke = {};

  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      if (/^yeatle:daily:\d{4}-\d{2}-\d{2}$/.test(key)) {
        const date = key.slice("yeatle:daily:".length);
        const entry = safeJsonParse(storage.getItem(key), null);
        if (entry && typeof entry === "object" && entry.status) {
          daily[date] = entry;
        }
      } else if (key.startsWith("yeatle-karaoke-best:")) {
        const entry = safeJsonParse(storage.getItem(key), null);
        if (entry && typeof entry === "object" && Number(entry.score) > 0) {
          karaoke[key] = entry;
        }
      }
    }
  } catch { /* ignore storage enumeration issues */ }

  return { completed, stats, prestige, daily, karaoke };
}

export function applyServerProgress(progress, storage = globalThis.localStorage, setItemRaw = null) {
  if (!progress || typeof progress !== "object" || !storage) return false;
  const write = setItemRaw || ((k, v) => storage.setItem(k, v));
  let changed = false;

  try {
    for (const mode of MODES) {
      if (Array.isArray(progress.completed?.[mode])) {
        const key = completedKey(mode);
        const nextJson = JSON.stringify(progress.completed[mode]);
        if (storage.getItem(key) !== nextJson) {
          write(key, nextJson);
          changed = true;
        }
      }
      if (progress.stats?.[mode] && typeof progress.stats[mode] === "object") {
        const key = statsKey(mode);
        const nextJson = JSON.stringify(progress.stats[mode]);
        if (storage.getItem(key) !== nextJson) {
          write(key, nextJson);
          changed = true;
        }
      }
    }

    if (typeof progress.prestige === "number" && progress.prestige > 0) {
      const currentPrestige = Number(safeJsonParse(storage.getItem("yeatle:prestige"), 0)) || 0;
      if (progress.prestige > currentPrestige) {
        write("yeatle:prestige", JSON.stringify(progress.prestige));
        changed = true;
      }
    }

    if (progress.daily && typeof progress.daily === "object") {
      for (const [date, entry] of Object.entries(progress.daily)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !entry) continue;
        const key = `yeatle:daily:${date}`;
        const local = safeJsonParse(storage.getItem(key), null);
        if (!local || (local.status === "playing" && entry.status !== "playing")) {
          const { verified: _v, ...cleanRound } = entry;
          write(key, JSON.stringify(cleanRound));
          changed = true;
        }
      }
    }

    if (progress.karaoke && typeof progress.karaoke === "object") {
      for (const [key, entry] of Object.entries(progress.karaoke)) {
        if (!key.startsWith("yeatle-karaoke-best:") || !entry) continue;
        const local = safeJsonParse(storage.getItem(key), null);
        if (!local || Number(entry.score) > Number(local.score || 0)) {
          write(key, JSON.stringify(entry));
          changed = true;
        }
      }
    }
  } catch { /* ignore storage quota errors */ }

  return changed;
}

export function computeLocalDailyStreak(storage = globalThis.localStorage, now = Date.now()) {
  const { daily } = collectLocalProgress(storage);
  const days = [];
  for (const [date, entry] of Object.entries(daily)) {
    if (entry && (entry.status === "won" || entry.status === "lost")) {
      const ms = Date.parse(`${date}T00:00:00Z`);
      if (Number.isFinite(ms)) days.push(Math.floor(ms / 86400000));
    }
  }
  days.sort((a, b) => a - b);
  const unique = [...new Set(days)];
  if (!unique.length) return 0;
  const today = Math.floor(now / 86400000);
  const last = unique[unique.length - 1];
  if (last < today - 1) return 0;
  let streak = 1;
  for (let i = unique.length - 2; i >= 0; i--) {
    if (unique[i] === unique[i + 1] - 1) streak++;
    else break;
  }
  return streak;
}

// A random id for this browser or desktop install, sent with account requests so a ban can
// follow a device to a new account. Clearing site data makes a new one; that's accepted.
export function deviceId(storage = globalThis.localStorage) {
  try {
    let id = storage.getItem(DEVICE_KEY) || "";
    if (!/^[a-f0-9]{32}$/.test(id)) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      id = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
      storage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch { return ""; }
}

// The localStorage keys the leaderboard sync manages. Settings, downloaded stems and the
// device id are left alone.
export function isSyncedKey(key) {
  return typeof key === "string" && (key === ACCOUNT_KEY || key === "yeatle:prestige" || key.startsWith("yeatle:completed") ||
    key.startsWith("yeatle:stats") || /^yeatle:daily:\d{4}-\d{2}-\d{2}$/.test(key) || key.startsWith("yeatle-karaoke-best:"));
}

export function clearSyncedProgress(storage = globalThis.localStorage) {
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i++) if (isSyncedKey(storage.key(i))) keys.push(storage.key(i));
    keys.forEach(key => storage.removeItem(key));
    return keys.length;
  } catch { return 0; }
}

const savedToken = () => {
  try { return safeJsonParse(localStorage.getItem(ACCOUNT_KEY), null)?.token || ""; } catch { return ""; }
};

let bannedShown = false;

// Every account call goes through here. A 403 { banned: true } answer is double-checked
// with the status endpoint: a banned account or device gets the banned screen, while an
// address shared with a banned account only refuses the sign-in, so plain play stays open.
async function requestJson(path, { method = "GET", body = null, token = savedToken() } = {}) {
  const headers = { Accept: "application/json" };
  const device = deviceId();
  if (device) headers["X-Yeatle-Device"] = device;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== null) headers["Content-Type"] = "application/json";
  const res = await fetch(path, { method, headers, body: body !== null ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && data.banned === true) await checkBanStatus();
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.banned = data.banned === true;
    throw err;
  }
  return data;
}

// Asks the server whether this device or signed-in account is banned. Network trouble or
// an older server that doesn't know the endpoint never shows the banned screen.
export async function checkBanStatus() {
  if (bannedShown) return true;
  try {
    const headers = { Accept: "application/json" };
    const device = deviceId(), token = savedToken();
    if (device) headers["X-Yeatle-Device"] = device;
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch("api/account/status", { headers, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.status !== 403 || data.banned !== true) return false;
  } catch { return false; }
  showBannedScreen();
  return true;
}

// Ranked karaoke runs, used by karaoke.js. Null when nobody is signed in on this device.
export const rankedKaraoke = {
  signedIn: () => !bannedShown && Boolean(savedToken()),
  start: body => requestJson("api/account/karaoke/start", { method: "POST", body }),
  submit: body => requestJson("api/account/karaoke/submit", { method: "POST", body })
};

// A full-page screen over the app. It never blocks closing the tab or window, the back
// button or keyboard shortcuts; it only hides the game and its account features.
export function showBannedScreen() {
  if (bannedShown || typeof document === "undefined" || !document.body) return;
  bannedShown = true;
  clearSyncedProgress();
  window.dispatchEvent(new CustomEvent("yeatle:banned"));
  document.querySelectorAll("audio, video").forEach(media => { try { media.pause(); } catch {} });
  for (const node of document.body.children) node.inert = true;
  document.documentElement.classList.add("yeatle-is-banned");

  const screen = document.createElement("div");
  screen.className = "yeatle-banned";
  screen.setAttribute("role", "alertdialog");
  screen.setAttribute("aria-labelledby", "yeatle-banned-title");
  screen.setAttribute("aria-describedby", "yeatle-banned-text");

  const frame = document.createElement("div");
  frame.className = "yeatle-banned-video";
  const video = document.createElement("video");
  Object.assign(video, { autoplay: true, loop: true, muted: true, playsInline: true, preload: "auto" });
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.src = new URL("./banned.mp4", import.meta.url).href;
  const fallback = document.createElement("p");
  fallback.className = "yeatle-banned-fallback";
  fallback.textContent = BANNED_SCREEN.videoFallback;
  fallback.hidden = true;
  const showFallback = () => { fallback.hidden = false; frame.classList.add("failed"); };
  video.addEventListener("error", showFallback);
  const sound = document.createElement("button");
  sound.type = "button";
  sound.className = "yeatle-banned-sound";
  const label = () => { sound.textContent = video.muted ? "🔇 Sound off" : "🔊 Sound on"; sound.setAttribute("aria-pressed", String(!video.muted)); };
  sound.addEventListener("click", () => { video.muted = !video.muted; label(); video.play().catch(() => {}); });
  label();
  frame.append(video, sound);

  const title = document.createElement("h1");
  title.id = "yeatle-banned-title";
  title.textContent = BANNED_SCREEN.title;
  const text = document.createElement("p");
  text.id = "yeatle-banned-text";
  text.textContent = BANNED_SCREEN.message;
  const link = document.createElement("a");
  link.className = "yeatle-banned-link";
  link.href = DEFAULT_JOBS_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = BANNED_SCREEN.link;

  const card = document.createElement("div");
  card.className = "yeatle-banned-card";
  card.append(frame, fallback, title, text, link);
  screen.appendChild(card);
  document.body.appendChild(screen);
  video.play().catch(() => { if (video.error) showFallback(); });

  fetch("api/banned-info", { cache: "no-store" }).then(r => r.json()).then(info => {
    try { if (["http:", "https:"].includes(new URL(info.jobsUrl).protocol)) link.href = info.jobsUrl; } catch {}
  }).catch(() => {});
}

function defaultBoardForPage() {
  if (typeof location === "undefined") return "daily";
  if (/\/daily\b/.test(location.pathname)) return "daily";
  if (/\/karaoke\b/.test(location.pathname)) return "karaoke";
  try {
    const mode = new URLSearchParams(location.search).get("mode") || safeJsonParse(localStorage.getItem("yeatle:gameMode"), "stems");
    if (mode === "snippet") return "snippet";
    if (mode === "stems") return "stems";
  } catch {}
  return "daily";
}

function initLeaderboardUI() {
  if (typeof document === "undefined" || !document.body) return;

  const rawSetItem = Storage.prototype.setItem.bind(localStorage);
  let accountState = safeJsonParse(localStorage.getItem(ACCOUNT_KEY), null);
  let activeBoard = defaultBoardForPage();
  let leaderboardData = null;
  let isOpen = false;
  let busyAuth = false;
  let renaming = false;
  let renameDraft = "";
  let focusRename = false;
  let statusMessage = "";
  let statusError = false;
  let syncTimer = null;

  function saveAccountState(next) {
    accountState = next;
    try {
      if (next) rawSetItem(ACCOUNT_KEY, JSON.stringify(next));
      else localStorage.removeItem(ACCOUNT_KEY);
    } catch {}
    renderTriggerButton();
  }

  function currentStreakBadgeValue() {
    // Signed-in players see the server's streak, which only counts Dailies synced on time.
    // accountState is refreshed by every sync, login and leaderboard load, so it is never
    // older than the cached leaderboard (which is only reloaded when the popup opens).
    if (accountState?.token) return accountState.dailyStreak || 0;
    return computeLocalDailyStreak(localStorage);
  }

  // Trigger button mounted in header
  const triggerBtn = document.createElement("button");
  triggerBtn.type = "button";
  triggerBtn.className = "yeatle-lb-btn";
  triggerBtn.title = "Leaderboards & Account Sync";
  triggerBtn.setAttribute("aria-label", "Open Leaderboards");
  triggerBtn.addEventListener("click", () => openModal());

  function renderTriggerButton() {
    const streak = currentStreakBadgeValue();
    const parts = [];
    const trophy = document.createElement("span");
    trophy.className = "lb-trophy";
    trophy.textContent = "🏆";
    parts.push(trophy);

    const label = document.createElement("span");
    if (accountState?.username) {
      label.className = "lb-user";
      label.textContent = accountState.username;
    } else {
      label.className = "lb-label-default";
      label.textContent = "Leaderboard";
    }
    parts.push(label);

    if (streak > 0) {
      const badge = document.createElement("span");
      badge.className = "yeatle-lb-streak";
      badge.title = `${streak} day Daily streak`;
      badge.textContent = `🔥 ${streak}`;
      parts.push(badge);
    }
    triggerBtn.replaceChildren(...parts);
  }

  function ensureTriggerMounted() {
    if (bannedShown) return;
    const slot =
      document.getElementById("yeatle-lb-slot") ||
      document.querySelector(".daily-shell .modebar") ||
      document.querySelector("#setup .top") ||
      document.querySelector(".topbar .score");
    if (slot && triggerBtn.parentElement !== slot) {
      slot.appendChild(triggerBtn);
    }
  }

  // Modal DOM
  const overlay = document.createElement("div");
  overlay.className = "yeatle-lb-overlay";
  overlay.hidden = true;
  overlay.addEventListener("mousedown", e => {
    if (e.target === overlay) closeModal();
  });

  const modal = document.createElement("div");
  modal.className = "yeatle-lb-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "yeatle-lb-title");
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function closeModal() {
    isOpen = false;
    overlay.hidden = true;
  }

  function openModal() {
    if (bannedShown) return;
    activeBoard = defaultBoardForPage();
    isOpen = true;
    overlay.hidden = false;
    renderModal();
    refreshLeaderboard(true);
  }

  window.addEventListener("keydown", e => {
    if (isOpen && e.key === "Escape") {
      e.preventDefault();
      closeModal();
    }
  });

  function apiCall(path, method = "GET", body = null) {
    return requestJson(path, { method, body, token: accountState?.token || "" });
  }

  window.addEventListener("yeatle:banned", () => {
    accountState = null;
    clearTimeout(syncTimer);
    closeModal();
    triggerBtn.remove();
  });

  async function refreshLeaderboard(syncFirst = false) {
    try {
      if (syncFirst && accountState?.token) {
        await syncNow(true);
      }
      const data = await apiCall("api/leaderboard", "GET");
      leaderboardData = data;
      if (data.viewer) {
        saveAccountState({
          ...accountState,
          username: data.viewer.username,
          dailyStreak: data.viewer.metrics?.dailyStreak || 0
        });
        if (applyServerProgress(data.viewer.progress, localStorage, rawSetItem)) {
          window.dispatchEvent(new CustomEvent("yeatle:progress-synced"));
        }
      }
      if (isOpen) renderModal();
      renderTriggerButton();
    } catch (err) {
      if (isOpen) {
        statusError = true;
        statusMessage = err.message || "Couldn't load leaderboard.";
        renderModal();
      }
    }
  }

  async function syncNow(silent = false) {
    if (!accountState?.token) return;
    try {
      const progress = collectLocalProgress(localStorage);
      const res = await apiCall("api/account/sync", "POST", { progress });
      if (res.account) {
        saveAccountState({
          ...accountState,
          username: res.account.username,
          dailyStreak: res.account.metrics?.dailyStreak || 0
        });
        if (applyServerProgress(res.account.progress, localStorage, rawSetItem)) {
          window.dispatchEvent(new CustomEvent("yeatle:progress-synced"));
        }
      }
      if (!silent) {
        statusError = false;
        statusMessage = "Progress synced across your devices.";
        await refreshLeaderboard(false);
      }
    } catch (err) {
      if (err.message && /expired|log in/i.test(err.message)) {
        saveAccountState(null);
      }
      if (!silent) {
        statusError = true;
        statusMessage = err.message || "Sync failed.";
        if (isOpen) renderModal();
      }
    }
  }

  async function handleAuth(kind, username, password) {
    if (busyAuth) return;
    busyAuth = true;
    statusMessage = "";
    statusError = false;
    renderModal();
    try {
      const progress = collectLocalProgress(localStorage);
      const endpoint = kind === "register" ? "api/account/register" : "api/account/login";
      const res = await apiCall(endpoint, "POST", { username, password, progress });
      saveAccountState({
        token: res.token,
        username: res.account.username,
        dailyStreak: res.account.metrics?.dailyStreak || 0
      });
      if (applyServerProgress(res.account.progress, localStorage, rawSetItem)) {
        window.dispatchEvent(new CustomEvent("yeatle:progress-synced"));
      }
      statusError = false;
      statusMessage = kind === "register"
        ? `Account created! Signed in as ${res.account.username}.`
        : `Welcome back, ${res.account.username}! Progress synced.`;
      await refreshLeaderboard(false);
    } catch (err) {
      statusError = true;
      statusMessage = err.message || "Authentication failed.";
    } finally {
      busyAuth = false;
      if (isOpen) renderModal();
      renderTriggerButton();
    }
  }

  async function handleRename(username) {
    if (busyAuth) return;
    busyAuth = true;
    statusMessage = "";
    statusError = false;
    renderModal();
    try {
      const res = await apiCall("api/account/rename", "POST", { username });
      saveAccountState({ ...accountState, username: res.account.username });
      renaming = false;
      statusMessage = `Username changed to ${res.account.username}.`;
      await refreshLeaderboard(false);
    } catch (err) {
      if (err.message && /expired|log in/i.test(err.message)) saveAccountState(null);
      statusError = true;
      statusMessage = err.message || "Couldn't change your username.";
    } finally {
      busyAuth = false;
      if (isOpen) renderModal();
    }
  }

  async function handleLogout() {
    try {
      if (accountState?.token) await apiCall("api/account/logout", "POST", {});
    } catch {}
    saveAccountState(null);
    renaming = false;
    statusError = false;
    statusMessage = "Logged out on this device.";
    await refreshLeaderboard(false);
  }

  function renderModal() {
    const head = document.createElement("div");
    head.className = "yeatle-lb-head";
    const headText = document.createElement("div");
    const h2 = document.createElement("h2");
    h2.id = "yeatle-lb-title";
    h2.textContent = "Leaderboards";
    const sub = document.createElement("p");
    sub.className = "yeatle-lb-sub";
    sub.textContent = "WHO HAS SOLVED THE MOST SONGS AND KEPT THEIR DAILY STREAK";
    headText.append(h2, sub);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "yeatle-lb-close";
    closeBtn.setAttribute("aria-label", "Close leaderboards");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closeModal);
    head.append(headText, closeBtn);

    const body = document.createElement("div");
    body.className = "yeatle-lb-body";

    // Account & Sync box
    const accountBox = document.createElement("div");
    accountBox.className = "yeatle-lb-account";
    if (accountState?.token) {
      const top = document.createElement("div");
      top.className = "yeatle-lb-account-top";

      const userLine = document.createElement("div");
      userLine.className = "yeatle-lb-account-user";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = accountState.username;
      userLine.appendChild(nameSpan);

      const streak = currentStreakBadgeValue();
      if (streak > 0) {
        const badge = document.createElement("span");
        badge.className = "yeatle-lb-streak";
        badge.textContent = `🔥 ${streak}`;
        userLine.appendChild(badge);
      }

      const actions = document.createElement("div");
      actions.className = "yeatle-lb-account-actions";
      const syncBtn = document.createElement("button");
      syncBtn.type = "button";
      syncBtn.className = "yeatle-lb-btn-action primary";
      syncBtn.textContent = "Sync progress";
      syncBtn.addEventListener("click", () => syncNow(false));

      const outBtn = document.createElement("button");
      outBtn.type = "button";
      outBtn.className = "yeatle-lb-btn-action";
      outBtn.textContent = "Log out";
      outBtn.addEventListener("click", handleLogout);

      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.className = "yeatle-lb-btn-action";
      renameBtn.textContent = "Change username";
      renameBtn.hidden = renaming;
      renameBtn.addEventListener("click", () => {
        renaming = true;
        renameDraft = accountState.username || "";
        focusRename = true;
        statusMessage = "";
        statusError = false;
        renderModal();
      });

      actions.append(syncBtn, renameBtn, outBtn);
      top.append(userLine, actions);
      accountBox.appendChild(top);

      if (renaming) {
        const form = document.createElement("form");
        form.className = "yeatle-lb-auth-form yeatle-lb-rename-form";
        const nameIn = document.createElement("input");
        nameIn.type = "text";
        nameIn.placeholder = "New username";
        nameIn.maxLength = 20;
        nameIn.autocomplete = "username";
        nameIn.required = true;
        // Kept outside the form so a leaderboard refresh does not wipe what is being typed.
        nameIn.value = renameDraft;
        nameIn.addEventListener("input", () => { renameDraft = nameIn.value; });
        nameIn.setAttribute("aria-label", "New username");

        const btns = document.createElement("div");
        btns.className = "yeatle-lb-auth-btns";
        const saveBtn = document.createElement("button");
        saveBtn.type = "submit";
        saveBtn.className = "yeatle-lb-btn-action primary";
        saveBtn.disabled = busyAuth;
        saveBtn.textContent = busyAuth ? "Working…" : "Save";
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "yeatle-lb-btn-action";
        cancelBtn.disabled = busyAuth;
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", () => {
          renaming = false;
          statusMessage = "";
          statusError = false;
          renderModal();
        });

        form.addEventListener("submit", e => {
          e.preventDefault();
          const next = nameIn.value.trim();
          if (next && next !== accountState.username) handleRename(next);
        });
        btns.append(saveBtn, cancelBtn);
        form.append(nameIn, btns);
        accountBox.appendChild(form);
        if (focusRename) {
          focusRename = false;
          queueMicrotask(() => nameIn.isConnected && nameIn.select());
        }
      }
    } else {
      const note = document.createElement("p");
      note.className = "yeatle-lb-account-note";
      note.textContent = "Log in or create an account to transfer your progress across devices and appear on the leaderboard.";

      const form = document.createElement("form");
      form.className = "yeatle-lb-auth-form";
      const userIn = document.createElement("input");
      userIn.type = "text";
      userIn.placeholder = "Username";
      userIn.maxLength = 20;
      userIn.autocomplete = "username";
      userIn.required = true;

      const passIn = document.createElement("input");
      passIn.type = "password";
      passIn.placeholder = "Password (4+ chars)";
      passIn.maxLength = 128;
      passIn.autocomplete = "current-password";
      passIn.required = true;

      const btns = document.createElement("div");
      btns.className = "yeatle-lb-auth-btns";

      const loginBtn = document.createElement("button");
      loginBtn.type = "submit";
      loginBtn.className = "yeatle-lb-btn-action primary";
      loginBtn.disabled = busyAuth;
      loginBtn.textContent = busyAuth ? "Working…" : "Log in";

      const regBtn = document.createElement("button");
      regBtn.type = "button";
      regBtn.className = "yeatle-lb-btn-action";
      regBtn.disabled = busyAuth;
      regBtn.textContent = "Create account";
      regBtn.addEventListener("click", () => {
        if (userIn.value.trim() && passIn.value) {
          handleAuth("register", userIn.value.trim(), passIn.value);
        } else {
          statusError = true;
          statusMessage = "Enter a username and password first.";
          renderModal();
        }
      });

      form.addEventListener("submit", e => {
        e.preventDefault();
        if (userIn.value.trim() && passIn.value) {
          handleAuth("login", userIn.value.trim(), passIn.value);
        }
      });

      btns.append(loginBtn, regBtn);
      form.append(userIn, passIn, btns);
      accountBox.append(note, form);
    }

    if (statusMessage) {
      const st = document.createElement("p");
      st.className = `yeatle-lb-status${statusError ? " err" : ""}`;
      st.textContent = statusMessage;
      accountBox.appendChild(st);
    }
    body.appendChild(accountBox);

    // Mode tabs
    const tabs = document.createElement("div");
    tabs.className = "yeatle-lb-tabs";
    tabs.setAttribute("role", "tablist");
    for (const [key, meta] of Object.entries(BOARD_META)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.role = "tab";
      btn.className = `yeatle-lb-tab${activeBoard === key ? " on" : ""}`;
      btn.setAttribute("aria-selected", String(activeBoard === key));
      btn.textContent = meta.tabLabel;
      btn.addEventListener("click", () => {
        activeBoard = key;
        renderModal();
      });
      tabs.appendChild(btn);
    }
    body.appendChild(tabs);

    // Active board section
    const meta = BOARD_META[activeBoard] || BOARD_META.daily;
    const board = leaderboardData?.boards?.[activeBoard];
    const sectionHead = document.createElement("div");
    sectionHead.className = "yeatle-lb-section-head";
    const h3 = document.createElement("h3");
    h3.textContent = meta.heading;
    const metaLine = document.createElement("p");
    metaLine.className = "yeatle-lb-section-meta";
    const count = board ? board.totalPlayers : 0;
    metaLine.textContent = `${count} ${count === 1 ? "player" : "players"} · ${meta.rule}`;
    sectionHead.append(h3, metaLine);

    if (board?.viewer) {
      const youLine = document.createElement("p");
      youLine.className = "yeatle-lb-you";
      const text = meta.formatYou(board.viewer);
      const match = /^(You're )(#[0-9]+)(.*)$/.exec(text);
      if (match) {
        const strong = document.createElement("strong");
        strong.textContent = match[2];
        youLine.append(match[1], strong, match[3]);
      } else {
        youLine.textContent = text;
      }
      sectionHead.appendChild(youLine);
    }
    body.appendChild(sectionHead);

    // Entries list
    if (!leaderboardData) {
      const loading = document.createElement("div");
      loading.className = "yeatle-lb-empty";
      loading.textContent = statusError && statusMessage ? statusMessage : "Loading leaderboard…";
      body.appendChild(loading);
    } else if (!board?.entries?.length) {
      const empty = document.createElement("div");
      empty.className = "yeatle-lb-empty";
      empty.textContent = "No players on this board yet. Sign in above to claim #1!";
      body.appendChild(empty);
    } else {
      const ol = document.createElement("ol");
      ol.className = "yeatle-lb-list";
      for (const entry of board.entries) {
        const li = document.createElement("li");
        li.className = `yeatle-lb-row rank-${entry.rank}${entry.isViewer ? " me" : ""}`;

        const left = document.createElement("div");
        left.className = "yeatle-lb-row-left";

        const rankSpan = document.createElement("span");
        rankSpan.className = "yeatle-lb-rank";
        rankSpan.textContent = String(entry.rank);

        const nameSpan = document.createElement("span");
        nameSpan.className = "yeatle-lb-name";
        nameSpan.textContent = `${entry.rank === 1 && (entry.primary > 0 || entry.dailyStreak > 0) ? "👑 " : ""}${entry.username}`;

        left.append(rankSpan, nameSpan);

        if (entry.dailyStreak > 0) {
          const streakBadge = document.createElement("span");
          streakBadge.className = "yeatle-lb-streak";
          streakBadge.title = `${entry.dailyStreak} day Daily streak`;
          streakBadge.textContent = `🔥 ${entry.dailyStreak}`;
          left.appendChild(streakBadge);
        }

        if (entry.prestige > 0) {
          const prestBadge = document.createElement("span");
          prestBadge.className = "yeatle-lb-prestige";
          prestBadge.title = `${entry.prestige} Prestige`;
          prestBadge.textContent = `P${entry.prestige}`;
          left.appendChild(prestBadge);
        }

        const right = document.createElement("span");
        right.className = "yeatle-lb-row-right";
        right.textContent = meta.formatRight(entry);

        li.append(left, right);
        ol.appendChild(li);
      }
      body.appendChild(ol);
    }

    modal.replaceChildren(head, body);
  }

  // Intercept localStorage writes so progress syncs automatically when a round finishes
  Storage.prototype.setItem = function (key, value) {
    rawSetItem(key, value);
    if (typeof key === "string" && (key.startsWith("yeatle:completed") || key.startsWith("yeatle:stats") || key === "yeatle:prestige" || key.startsWith("yeatle:daily:") || key.startsWith("yeatle-karaoke-best:"))) {
      renderTriggerButton();
      if (accountState?.token && !bannedShown) {
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => syncNow(true), 800);
      }
    }
  };

  renderTriggerButton();
  ensureTriggerMounted();
  new MutationObserver(() => ensureTriggerMounted()).observe(document.body, { childList: true, subtree: true });

  // Every page asks once whether this device or account is banned, then syncs if signed in.
  checkBanStatus().then(banned => {
    if (!banned && accountState?.token) setTimeout(() => refreshLeaderboard(true), 300);
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLeaderboardUI, { once: true });
  } else {
    initLeaderboardUI();
  }
}
