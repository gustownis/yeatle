import { normalizeGuess } from "./snippet-rules.mjs?v=1.12.0";
import { songsForPool } from "./song-pools.mjs?v=1.12.0";

// Daily shares the game's suggestion markup and styles without rebuilding React.
export function attachSongSuggestions(input, list) {
  let songs = [], matches = [], active = 0;

  function close() {
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
    if (!key || input.disabled || document.activeElement !== input) return close();
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
      if (song.era || song.year) {
        const meta = document.createElement("span");
        meta.className = "suggestion-meta";
        meta.textContent = [song.era, song.year, song.status].filter(Boolean).join(" · ");
        copy.append(meta);
      }
      option.append(copy);
      option.addEventListener("pointerdown", event => event.preventDefault());
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
    input.value = song.label;
    input.focus({ preventScroll: true });
    close();
  }

  input.addEventListener("input", show);
  input.addEventListener("focus", show);
  input.addEventListener("blur", close);
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
        unique.set(label, { label, key: normalizeGuess(label), title: normalizeGuess(song.title), alts: [...song.keys || [], ...song.answerKeys || []].map(normalizeGuess).filter(Boolean), era: song.era || "", year: song.eraYear || song.year || null, status: song.tab === "Unreleased" ? song.tab : "" });
      }
      songs = [...unique.values()].sort((a, b) => a.label.localeCompare(b.label));
      show();
    }
  };
}
