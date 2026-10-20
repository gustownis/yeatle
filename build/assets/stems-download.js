/*
  Picker for downloading HQ stem sets from the Yeatle server. Runs only in the
  desktop app's download window, which provides window.yeatleStems; the downloads
  themselves happen in the app, which checks and installs every file.
*/
const api = window.yeatleStems;
const $ = sel => document.querySelector(sel);
const picked = new Set();
const rowCache = new Map();
let state = null;

const norm = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const mb = bytes => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`);
const busyStates = new Set(["queued", "downloading", "installing"]);

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "checked" || key === "disabled") node[key] = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid);
  return node;
}

function statusOf(id) { return (state.items[id] || { status: "idle" }); }

function rowFor(song) {
  const item = statusOf(song.id);
  const installed = item.status === "installed";
  const busy = busyStates.has(item.status);
  const meta = [song.era || "No era", song.year, song.features.length ? `feat. ${song.features.join(", ")}` : ""].filter(Boolean).join(" · ");
  const check = el("input", {
    type: "checkbox", checked: picked.has(song.id), disabled: installed || busy || item.status === "conflict",
    "aria-label": `Select ${song.display}`,
    onchange: e => { if (e.target.checked) picked.add(song.id); else picked.delete(song.id); render(); }
  });
  const act = el("div", { class: "act" });
  let note = item.note || "";
  let noteErr = false;
  if (installed) act.append(el("span", { class: "tag ok", text: "Installed" }));
  else if (item.status === "queued") act.append(el("span", { class: "tag", text: "Waiting" }), el("button", { class: "btn small", text: "Cancel", onclick: () => api.cancel(song.id) }));
  else if (item.status === "downloading" || item.status === "installing") {
    const bar = el("div", { class: "bar" }, el("i"));
    bar.style.setProperty("--p", `${Math.round(((item.received || 0) / (item.total || song.size)) * 100)}%`);
    act.append(item.status === "installing" ? el("span", { class: "tag", text: "Installing" }) : bar, el("button", { class: "btn small", text: "Cancel", onclick: () => api.cancel(song.id) }));
    if (item.status === "downloading") note = `${mb(item.received || 0)} of ${mb(item.total || song.size)}`;
  } else if (item.status === "failed") {
    act.append(el("span", { class: "tag bad", text: "Failed" }), el("button", { class: "btn small", text: "Retry", onclick: () => api.download([song.id]) }));
    note = `Didn't install: ${item.error}. Nothing was added to your Songs folder.`;
    noteErr = true;
  } else if (item.status === "cancelled") {
    act.append(el("span", { class: "tag", text: "Cancelled" }), el("button", { class: "btn small", text: "Retry", onclick: () => api.download([song.id]) }));
  } else if (item.status === "conflict") {
    act.append(el("button", { class: "btn small", text: "Replace mine", onclick: () => api.replace(song.id) }), el("button", { class: "btn small", text: "Keep mine", onclick: () => api.cancel(song.id) }));
    noteErr = true;
  } else act.append(el("button", { class: "btn small primary", text: "Download", onclick: () => api.download([song.id]) }));
  if (item.error && item.status !== "failed") { note = item.error; noteErr = true; }

  return el("div", { class: "dl-row" + (picked.has(song.id) ? " on" : ""), "data-id": song.id },
    check,
    song.cover ? el("img", { src: song.cover, alt: "", loading: "lazy", onerror: e => e.target.replaceWith(el("span", { class: "nocover" })) }) : el("span", { class: "nocover" }),
    el("span", { class: "song-text" }, el("b", { text: song.display }), el("small", { text: meta })),
    el("span", { class: "size", text: mb(song.size) }),
    act,
    note ? el("span", { class: "note" + (noteErr ? " err" : ""), text: note }) : null
  );
}

function render() {
  if (!state) return;
  const { catalog } = state;
  $("#host").textContent = `From ${state.host.replace(/^https?:\/\//, "")}`;
  $("#dest").textContent = state.songsDir;
  const status = $("#status");
  const list = $("#list");
  if (catalog.loading && !catalog.loaded) { status.textContent = "Loading the list of songs…"; list.replaceChildren(); }
  else if (catalog.error) {
    status.replaceChildren(catalog.error + " ", el("button", { class: "linkish", text: "Try again", onclick: () => api.refresh() }));
  } else {
    const query = norm($("#search").value);
    const hide = $("#hide-installed").checked;
    const shown = catalog.songs.filter(song => (!hide || statusOf(song.id).status !== "installed") &&
      (!query || norm(`${song.display} ${song.title} ${song.era} ${song.year || ""} ${song.features.join(" ")}`).includes(query)));
    const installed = catalog.songs.filter(song => statusOf(song.id).status === "installed").length;
    const extra = [catalog.pending ? `${catalog.pending} more are still being prepared on the server` : "", catalog.skipped ? `${catalog.skipped} couldn't be offered` : ""].filter(Boolean).join(" · ");
    status.textContent = `${catalog.songs.length} song${catalog.songs.length === 1 ? "" : "s"} available · ${installed} installed${extra ? ` · ${extra}` : ""}. Pick the ones you want; nothing downloads until you do.`;
    // Reuse rows that haven't changed, and only move the progress of a downloading one,
    // so buttons keep working while progress updates arrive.
    const rows = shown.map(song => {
      const item = statusOf(song.id);
      const key = JSON.stringify([item.status, item.note, item.error, picked.has(song.id)]);
      const old = rowCache.get(song.id);
      if (old && old.key === key) {
        if (item.status === "downloading") {
          old.node.querySelector(".bar")?.style.setProperty("--p", `${Math.round(((item.received || 0) / (item.total || song.size)) * 100)}%`);
          const note = old.node.querySelector(".note");
          if (note) note.textContent = `${mb(item.received || 0)} of ${mb(item.total || song.size)}`;
        }
        return old.node;
      }
      const node = rowFor(song);
      rowCache.set(song.id, { key, node });
      return node;
    });
    if (rows.length !== list.children.length || rows.some((row, i) => list.children[i] !== row)) list.replaceChildren(...rows);
    if (!shown.length) list.replaceChildren(el("p", { class: "muted", text: query ? "No songs match that search." : "Nothing to show." }));
  }
  for (const id of [...picked]) { const s = statusOf(id).status; if (s === "installed" || busyStates.has(s)) picked.delete(id); }
  const chosen = catalog.songs.filter(song => picked.has(song.id));
  $("#picked").textContent = chosen.length ? `${chosen.length} selected · ${mb(chosen.reduce((sum, s) => sum + s.size, 0))}` : "Nothing selected";
  $("#get-picked").disabled = !chosen.length;
  $("#clear").disabled = !chosen.length;
}

let frame = 0;
const update = next => { state = next; if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); }); };

if (!api) {
  $("#status").textContent = "This page works in the Yeatle desktop app: Help → Optional HQ Stems → Download from server.";
} else {
  api.onChange(update);
  $("#search").addEventListener("input", render);
  $("#hide-installed").addEventListener("change", render);
  $("#clear").addEventListener("click", () => { picked.clear(); render(); });
  $("#get-picked").addEventListener("click", () => { const ids = [...picked]; picked.clear(); api.download(ids).then(update); });
  $("#open-folder").addEventListener("click", () => api.openFolder());
  api.state().then(s => { update(s); return api.refresh(); }).then(update);
}
