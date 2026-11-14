import { normalizeGuess } from "./snippet-rules.mjs?v=1.13.9";
import { songsForPool } from "./song-pools.mjs?v=1.13.9";

const ALIAS_PARENS_RE = /\s*\(([^()]*(?:,|\([^()]*\))[^()]*)\)/g;
const PAREN_BLOCK_RE = /\s*\([^()]*\)/g;
const PAREN_CAPTURE_RE = /\(([^()]+)\)/g;
const GENERIC_ALIAS_RE = /^(yeat\s+)?(remix|mix|version|edit|intro|outro|interlude|freestyle|skit|open|solo|bonus)$/i;
const N_AND_TEST_RE = /\b(?:n|and)\b/i;
const N_AND_RE = /\b(?:n|and)\b/gi;
const WHITESPACE_RE = /\s+/g;
const ALREADY_NORM_RE = /^[a-z0-9]+$/;

const fastNorm = s => (typeof s === "string" && ALREADY_NORM_RE.test(s) ? s : normalizeGuess(s));
const looseNorm = s => {
  const str = String(s || "");
  return N_AND_TEST_RE.test(str) ? normalizeGuess(str.replace(N_AND_RE, "and")) : fastNorm(str);
};

function stripAliasParens(str, extraAliases) {
  const s = String(str || "");
  if (!s.includes("(")) return s.replace(WHITESPACE_RE, " ").trim();
  return s.replace(ALIAS_PARENS_RE, (_, inner) => {
    for (const part of inner.split(",")) {
      const p = part.trim();
      if (p) extraAliases.push(p);
    }
    return "";
  }).replace(WHITESPACE_RE, " ").trim();
}

// Daily shares the game's suggestion markup and styles without rebuilding React.
export function attachSongSuggestions(input, list) {
  let songs = [], matches = [], active = 0, interacting = false, down = null, chosenValue = null;

  function close() {
    interacting = false;
    down = null;
    list.hidden = true;
    list.replaceChildren();
    matches = [];
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function highlight(index) {
    active = Math.max(0, Math.min(index, matches.length - 1));
    [...list.children].forEach((option, i) => {
      option.classList.toggle("hl", i === active);
      option.setAttribute("aria-selected", String(i === active));
    });
    const option = list.children[active];
    if (option) {
      input.setAttribute("aria-activedescendant", option.id);
      if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
      else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
      }
    }
  }

  function show() {
    const key = normalizeGuess(input.value);
    if (!key || input.disabled || (document.activeElement !== input && !interacting)) return close();
    const first = [], rest = [];
    for (const song of songs) {
      // Other names the tracker gives a song are searchable too ("The Coste" finds THE COSTËS).
      if (song.title.startsWith(key) || song.key.startsWith(key) || song.alts.some(alt => alt.startsWith(key))) first.push(song);
      else if (song.key.includes(key) || song.alts.some(alt => alt.includes(key))) rest.push(song);
    }
    matches = [...first, ...rest].slice(0, 10);
    if (!matches.length) return close();
    list.replaceChildren(...matches.map((song, index) => {
      const option = document.createElement("div");
      option.id = `${list.id}-${index}`;
      option.className = "suggestion-item";
      option.setAttribute("role", "option");
      const copy = document.createElement("div");
      copy.className = "suggestion-copy";
      const title = document.createElement("span");
      title.className = "suggestion-title";
      title.textContent = song.label;
      copy.append(title);
      if (song.aka) {
        const aka = document.createElement("span");
        aka.className = "suggestion-aka";
        aka.textContent = `also ${song.aka}`;
        copy.append(aka);
      }
      if (song.era || song.year) {
        const meta = document.createElement("span");
        meta.className = "suggestion-meta";
        meta.textContent = [song.era, song.year, song.status].filter(Boolean).join(" · ");
        copy.append(meta);
      }
      option.append(copy);
      option.addEventListener("pointerdown", event => {
        interacting = true;
        down = { index, x: event.clientX, y: event.clientY, moved: false, song };
      });
      option.addEventListener("pointermove", event => {
        if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 10) down.moved = true;
      });
      option.addEventListener("pointercancel", () => {
        interacting = false;
        down = null;
      });
      option.addEventListener("pointerup", event => {
        const tap = down && down.index === index && !down.moved && (event.button == null || event.button <= 0);
        down = null;
        if (tap) {
          setTimeout(() => {
            interacting = false;
            if (matches[index] === song) choose(index);
          }, 0);
        } else {
          interacting = false;
        }
      });
      option.addEventListener("mousedown", event => {
        event.preventDefault();
        choose(index);
      });
      option.addEventListener("click", () => choose(index));
      option.addEventListener("pointerenter", () => highlight(index));
      return option;
    }));
    list.hidden = false;
    list.scrollTop = 0;
    input.setAttribute("aria-expanded", "true");
    highlight(0);
  }

  function choose(index) {
    const song = matches[index];
    if (!song) return;
    chosenValue = song.label;
    input.value = song.label;
    close();
    input.focus({ preventScroll: true });
  }

  list.addEventListener?.("pointerdown", () => { interacting = true; });
  list.addEventListener?.("mousedown", event => event.preventDefault());
  document.addEventListener?.("pointerdown", event => {
    if (!list.hidden && event.target !== input && !list.contains?.(event.target)) close();
  });
  input.addEventListener("input", () => { chosenValue = null; show(); });
  input.addEventListener("focus", () => { if (chosenValue === null || input.value !== chosenValue) show(); });
  input.addEventListener("blur", () => { if (!interacting) close(); });
  input.addEventListener("keydown", event => {
    if (event.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) show();
      else highlight(active + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Enter" && !list.hidden && matches[active] && normalizeGuess(input.value) !== matches[active].key) {
      event.preventDefault();
      choose(active);
    }
  });

  return {
    close,
    setSongs(entries) {
      const unique = new Map();
      for (const song of songsForPool(entries)) {
        const rawLabel = song?.display || song?.title;
        if (typeof rawLabel !== "string" || !rawLabel.trim()) continue;
        const extraAliases = [];
        const cleanTitle = stripAliasParens(song.title, extraAliases);
        const sameRaw = rawLabel === song.title;
        const label = sameRaw ? cleanTitle : stripAliasParens(rawLabel, extraAliases);
        if (!label || unique.has(label)) continue;
        const baseTitle = cleanTitle.includes("(") ? cleanTitle.replace(PAREN_BLOCK_RE, "").trim() : cleanTitle;
        const baseLabel = sameRaw ? baseTitle : (label.includes("(") ? label.replace(PAREN_BLOCK_RE, "").trim() : label);
        const normTitle = fastNorm(cleanTitle);
        const normLabel = label === cleanTitle ? normTitle : fastNorm(label);
        const looseTitle = N_AND_TEST_RE.test(cleanTitle) ? looseNorm(cleanTitle) : normTitle;
        const looseLabel = label === cleanTitle ? looseTitle : (N_AND_TEST_RE.test(label) ? looseNorm(label) : normLabel);
        const seen = new Set([normTitle, normLabel, looseTitle, looseLabel]);
        if (baseTitle !== cleanTitle) {
          const nb = fastNorm(baseTitle);
          seen.add(nb);
          seen.add(N_AND_TEST_RE.test(baseTitle) ? looseNorm(baseTitle) : nb);
        }
        if (baseLabel !== label && baseLabel !== baseTitle) {
          const nb = fastNorm(baseLabel);
          seen.add(nb);
          seen.add(N_AND_TEST_RE.test(baseLabel) ? looseNorm(baseLabel) : nb);
        }
        if (cleanTitle.includes("(")) {
          for (const m of cleanTitle.matchAll(PAREN_CAPTURE_RE)) seen.add(looseNorm(m[1]));
        }
        seen.delete("");
        const distinct = [];
        const rawAliases = extraAliases.length
          ? (song.aliases?.length ? [...extraAliases, ...song.aliases] : extraAliases)
          : (song.aliases || []);
        for (const raw of rawAliases) {
          const trimmed = String(raw || "").trim();
          if (!trimmed) continue;
          const k = fastNorm(trimmed);
          if (!k || k.length <= 1 || GENERIC_ALIAS_RE.test(trimmed)) continue;
          const kl = N_AND_TEST_RE.test(trimmed) ? looseNorm(trimmed) : k;
          const aliasBase = trimmed.includes("(") ? trimmed.replace(PAREN_BLOCK_RE, "").trim() : trimmed;
          const kb = aliasBase === trimmed ? kl : looseNorm(aliasBase);
          if (seen.has(k) || seen.has(kl) || (kb && seen.has(kb))) continue;
          seen.add(k);
          seen.add(kl);
          if (kb) seen.add(kb);
          distinct.push(trimmed);
        }
        const altSet = new Set();
        if (song.keys) for (const item of song.keys) { const ak = fastNorm(item); if (ak) altSet.add(ak); }
        if (song.answerKeys) for (const item of song.answerKeys) { const ak = fastNorm(item); if (ak) altSet.add(ak); }
        unique.set(label, {
          label,
          key: normLabel,
          title: normTitle,
          alts: [...altSet],
          aka: distinct.join(", "),
          era: song.eraDisplay || song.era || "",
          year: song.eraYear || song.year || null,
          status: song.tab === "Unreleased" ? song.tab : ""
        });
      }
      songs = [...unique.values()].sort((a, b) => a.label.localeCompare(b.label));
      show();
    }
  };
}
