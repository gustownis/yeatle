const MODES = ["stems", "snippet", "snippet:base", "snippet:easy", "snippet:hard", "snippet:extreme"];
const ACCOUNT_KEY = "yeatle:account";

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
    if (accountState?.token) return leaderboardData?.viewer?.metrics?.dailyStreak ?? accountState?.dailyStreak ?? 0;
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

  async function apiCall(path, method = "GET", body = null) {
    const headers = { Accept: "application/json" };
    if (accountState?.token) headers.Authorization = `Bearer ${accountState.token}`;
    if (body !== null) headers["Content-Type"] = "application/json";
    const res = await fetch(path, {
      method,
      headers,
      body: body !== null ? JSON.stringify(body) : undefined,
      cache: "no-store"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

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

  async function handleLogout() {
    try {
      if (accountState?.token) await apiCall("api/account/logout", "POST", {});
    } catch {}
    saveAccountState(null);
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

      actions.append(syncBtn, outBtn);
      top.append(userLine, actions);
      accountBox.appendChild(top);
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
      if (accountState?.token) {
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => syncNow(true), 800);
      }
    }
  };

  renderTriggerButton();
  ensureTriggerMounted();
  new MutationObserver(() => ensureTriggerMounted()).observe(document.body, { childList: true, subtree: true });

  // Background sync on page load if logged in
  if (accountState?.token) {
    setTimeout(() => refreshLeaderboard(true), 300);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLeaderboardUI, { once: true });
  } else {
    initLeaderboardUI();
  }
}
