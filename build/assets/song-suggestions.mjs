import { normalizeGuess } from "./snippet-rules.mjs?v=1.13.2";
import { songsForPool } from "./song-pools.mjs?v=1.13.2";

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
    matches = [...first, ...rest].slice(0, 40);
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
        const label = song?.display || song?.title;
        if (typeof label !== "string" || !label.trim() || unique.has(label)) continue;
        const normTitle = normalizeGuess(song.title);
        const normLabel = normalizeGuess(label);
        const seen = new Set([normTitle, normLabel]);
        const distinct = [];
        for (const raw of song.aliases || []) {
          const trimmed = String(raw || "").trim();
          if (!trimmed) continue;
          const k = normalizeGuess(trimmed);
          if (!k || seen.has(k)) continue;
          seen.add(k);
          distinct.push(trimmed);
        }
        unique.set(label, { label, key: normLabel, title: normTitle, alts: [...song.keys || [], ...song.answerKeys || []].map(normalizeGuess).filter(Boolean), aka: distinct.join(", "), era: song.eraDisplay || song.era || "", year: song.eraYear || song.year || null, status: song.tab === "Unreleased" ? song.tab : "" });
      }
      songs = [...unique.values()].sort((a, b) => a.label.localeCompare(b.label));
      show();
    }
  };
}
