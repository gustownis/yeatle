/*
  Yeatle local server.

  Runs on the player's own PC. On launch it reads the Yeat tracker sheet, builds
  the song list, and serves the game at http://localhost:3093. Nothing has to be
  updated by hand: new songs on the sheet show up the next time Yeatle starts
  (or every 30 minutes while it's running).

  Songs that have hand-made stems in build/Songs/<name>/ still use them. Every
  other song streams its full file from the host the sheet links to (pillows,
  Drive, pixeldrain, exoshare, imgur), and released songs that only exist on
  streaming services use Apple's 30-second preview.

  The sheet reading and link handling are borrowed from tracker-player.

  No npm install needed - only Node 18+ (or the packaged Yeatle.exe).
*/
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { exec } = require("child_process");
const { pipeline } = require("stream/promises");
const { staticCacheHeaders, isNotModified, rangeAllowed } = require("./static-cache.cjs");
const APP_VERSION = require("./package.json").version;

// when packaged as an exe, files live next to the exe, not inside it
const ROOT = process.pkg ? path.dirname(process.execPath) : __dirname;
const WEB_DIR = path.join(ROOT, "build");
// Installed desktop apps keep writable files outside the application bundle.
const DATA_DIR = process.env.YEATLE_DATA_DIR ? path.resolve(process.env.YEATLE_DATA_DIR) : ROOT;
const STEMS_DIR = process.env.YEATLE_DATA_DIR ? path.join(DATA_DIR, "Songs") : path.join(WEB_DIR, "Songs");
const CACHE_FILE = path.join(DATA_DIR, "songs-cache.json");
const PREVIEW_CACHE_FILE = path.join(DATA_DIR, "preview-cache.json");
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (err) {
  console.error(`Yeatle cannot write to its data folder: ${DATA_DIR}. Choose a writable folder and try again.`);
  process.exit(1);
}

const DEFAULT_CONFIG = {
  port: 3093,
  openBrowser: true,
  refreshMinutes: 30,
  artist: "Yeat",
  sheetId: "1FUzAZyTCgFTVxQ--qbCAS2bUk4dsAw6ASxwjURPHbyI",
  tabs: [
    { name: "Released", gid: "1617341558" },
    { name: "Unreleased", gid: "1241081326" }
  ],
  // optional - only needed for sheets that hide links behind "Download" text
  googleApiKey: ""
};

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return fallback;
  }
}

const configFile = path.join(DATA_DIR, "config.json");
let customConfig = {};
try {
  if (fs.existsSync(configFile)) customConfig = JSON.parse(fs.readFileSync(configFile, "utf8"));
  if (!customConfig || typeof customConfig !== "object" || Array.isArray(customConfig)) throw new Error("expected a JSON object");
} catch (err) {
  console.error(`Could not read ${configFile}. Check the JSON syntax (double quotes, no trailing commas), then restart Yeatle.`);
  process.exit(1);
}
const CONFIG = { ...DEFAULT_CONFIG, ...customConfig };
if (process.env.YEATLE_PORT !== undefined) CONFIG.port = Number(process.env.YEATLE_PORT);
if (process.env.YEATLE_DESKTOP === "1") CONFIG.openBrowser = false;
if (!Number.isInteger(CONFIG.port) || CONFIG.port < 0 || CONFIG.port > 65535 ||
    !Number.isFinite(CONFIG.refreshMinutes) || CONFIG.refreshMinutes < 0 ||
    !Array.isArray(CONFIG.tabs) || CONFIG.tabs.some(tab => !tab || typeof tab.name !== "string" || !/^[0-9]+$/.test(String(tab.gid))) ||
    typeof CONFIG.sheetId !== "string" || typeof CONFIG.artist !== "string" || typeof CONFIG.openBrowser !== "boolean") {
  console.error("Invalid Yeatle settings. Use a port from 0 to 65535, a non-negative refreshMinutes number, and the format shown in config.example.json.");
  process.exit(1);
}
const ERA_COVERS = (loadJson(path.join(DATA_DIR, "era-covers.json"), {}).covers) || {};

/* ------------------------------------------------------------------ *
 *  Small helpers
 * ------------------------------------------------------------------ */

// "Bëttr 0ff" and "Bettr 0ff" are the same guess; so are "$trips" and "Strips"
function norm(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/æ/gi, "ae")
    .replace(/ø/gi, "o")
    .replace(/\$/g, "s")
    .replace(/&/g, "and")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function looseEraKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// RFC 4180 CSV: quoted fields may hold commas, quotes ("") and newlines
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row);
      row = []; field = "";
    } else {
      field += ch;
    }
  }

  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ------------------------------------------------------------------ *
 *  HTTP fetch (follows redirects, passes Range through)
 * ------------------------------------------------------------------ */

// respects HTTPS_PROXY for anyone behind a work/school proxy
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || "";

function tunnel(target) {
  return new Promise((resolve, reject) => {
    const proxy = new URL(PROXY);
    const req = http.request({
      host: proxy.hostname,
      port: proxy.port || 80,
      method: "CONNECT",
      path: `${target.hostname}:${target.port || 443}`,
      headers: proxy.username ? { "Proxy-Authorization": "Basic " + Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64") } : {}
    });
    req.on("connect", (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); reject(new Error(`proxy said ${res.statusCode}`)); return; }
      socket.on("error", () => {});
      resolve(socket);
    });
    req.on("error", reject);
    req.end();
  });
}

async function request(url, { headers = {}, method = "GET", redirects = 6 } = {}) {
  const target = new URL(url);
  const lib = target.protocol === "http:" ? http : https;
  const extra = {};

  if (PROXY && target.protocol === "https:") {
    const socket = await tunnel(target);
    extra.createConnection = () => require("tls").connect({ socket, servername: target.hostname });
    extra.agent = false;
  }

  return new Promise((resolve, reject) => {
    const req = lib.request(target, {
      method,
      ...extra,
      headers: { "User-Agent": "Mozilla/5.0 (Yeatle)", ...headers }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, target).toString();
        resolve(request(next, { headers, method, redirects: redirects - 1 }));
        return;
      }
      resolve(res);
    });

    req.setTimeout(30000, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function fetchText(url, headers) {
  const res = await request(url, { headers });
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  if (res.statusCode >= 400) throw new Error(`${res.statusCode} from ${new URL(url).host}`);
  return body;
}

async function fetchJson(url, headers) {
  return JSON.parse(await fetchText(url, { Accept: "application/json", ...headers }));
}

/* ------------------------------------------------------------------ *
 *  Column finding (from tracker-player)
 * ------------------------------------------------------------------ */

function normaliseHeader(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

const COLUMN_ALIASES = {
  era: ["era", "rel. era", "rel era", "release era", "released era"],
  name: ["name", "song", "song name", "title", "track"],
  notes: ["notes"],
  length: ["track length", "length", "song length"],
  type: ["type"],
  quality: ["quality"],
  availableLength: [
    "available length", "available type", "availability", "portion", "available",
    "availablitity", "availabilty", "availablity", "availibility"
  ],
  link: ["link(s)", "links", "link", "main link", "song link", "download", "source"],
  altLink: ["alternate links", "alternate link", "alt links", "alt link", "alternate", "backup link", "backup links"],
  streaming: ["streaming", "streaming?", "on streaming", "streaming service", "streaming services"],
  // Released tabs say both: the era a song was recorded in and the one it came out in
  recEra: ["rec. era", "rec era", "recording era", "recorded era", "rec. era(s)"]
};

function findNameColumn(headers) {
  const flat = headers.map(normaliseHeader);
  const lengthAliases = COLUMN_ALIASES.length;

  for (const alias of COLUMN_ALIASES.name) {
    const exact = flat.indexOf(alias);
    if (exact >= 0) return exact;
  }

  for (const alias of COLUMN_ALIASES.name) {
    const prefixed = flat.findIndex(h => h.startsWith(alias) && !lengthAliases.some(len => h.startsWith(len)));
    if (prefixed >= 0) return prefixed;
  }

  const era = findColumn(headers, "era");
  if (era >= 0 && flat[era + 1] === "") return era + 1;
  return -1;
}

function findColumn(headers, key) {
  if (key === "name") return findNameColumn(headers);

  const aliases = COLUMN_ALIASES[key] || [];
  const flat = headers.map(normaliseHeader);

  for (const alias of aliases) {
    const exact = flat.indexOf(alias);
    if (exact >= 0) return exact;
  }

  for (const alias of aliases) {
    const prefixed = flat.findIndex(h => h.startsWith(alias));
    if (prefixed >= 0) return prefixed;
  }

  return -1;
}

const HEADER_HINTS = ["name", "link", "quality", "type", "availableLength", "length", "notes"];

function findHeaderRow(rows) {
  const limit = Math.min(rows.length, 12);

  for (let i = 0; i < limit; i++) {
    if (HEADER_HINTS.filter(key => findColumn(rows[i] || [], key) >= 0).length >= 3) return i;
  }

  return 0;
}

function findEraColumn(headers, claimed) {
  const named = findColumn(headers, "era");
  if (named >= 0) return named;
  return claimed.includes(0) ? -1 : 0;
}

/* Dates (from tracker-player) */
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const TEXT_DATE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i;
const ISO_DATE = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/;

function parseDateCell(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 40) return null;

  let m = text.match(TEXT_DATE);
  if (m) return { text, year: Number(m[3]) };

  m = text.match(ISO_DATE);
  if (m) return { text, year: Number(m[1]) };

  return null;
}

function findDateColumn(rows, exclude) {
  const width = rows.reduce((most, row) => Math.max(most, row.length), 0);
  const blocked = new Set(exclude.filter(i => i >= 0));
  let best = -1;
  let bestHits = Math.max(5, Math.round(rows.length * 0.15));

  for (let i = 0; i < width; i++) {
    if (blocked.has(i)) continue;
    const hits = rows.reduce((n, row) => n + (parseDateCell(row[i]) ? 1 : 0), 0);
    if (hits > bestHits) { best = i; bestHits = hits; }
  }

  return best;
}

/* ------------------------------------------------------------------ *
 *  Links (from tracker-player)
 * ------------------------------------------------------------------ */

function getPillowsId(link) {
  const m = /pillow(?:s|case)\.[a-z]+\/.*?([a-f0-9]{32})/i.exec(link || "");
  return m ? m[1] : null;
}

function getImgurId(link) {
  const page = /imgur\.gg\/f\/([A-Za-z0-9]+)/i.exec(link || "");
  if (page) return page[1];
  const direct = /i\.imgur\.gg\/([A-Za-z0-9]+)-/i.exec(link || "");
  return direct ? direct[1] : null;
}

function getExoshareId(link) {
  const m = /exoshare\.org\/(?:share|s)\/([A-Za-z0-9_-]+)/i.exec(link || "");
  return m ? m[1] : null;
}

function getExoshareFile(link) {
  const m = /exoshare\.org\/api\/shares\/([A-Za-z0-9_-]+)\/files\/([A-Za-z0-9-]+)/i.exec(link || "");
  return m ? { shareId: m[1], fileId: m[2] } : null;
}

function getPixeldrainId(link) {
  const m = /pixeldrain\.com\/(?:u|api\/file)\/([A-Za-z0-9]+)/i.exec(link || "");
  return m ? m[1] : null;
}

function getDriveId(link) {
  const text = String(link || "");
  if (!/(?:drive\.google\.com|drive\.usercontent\.google\.com)/i.test(text)) return null;
  if (/\/drive\/folders\//i.test(text)) return null;
  if (/\/(spreadsheets|document|presentation|forms)\//i.test(text)) return null;

  for (const pattern of [/\/file\/d\/([A-Za-z0-9_-]{10,})/i, /\/d\/([A-Za-z0-9_-]{10,})/i, /[?&]id=([A-Za-z0-9_-]{10,})/i]) {
    const m = pattern.exec(text);
    if (m) return m[1];
  }
  return null;
}

function getAppleTrackId(link) {
  const m = /music\.apple\.com\/[^\s]*?\/song\/[^\s/]*\/(\d+)/i.exec(link || "") ||
    /music\.apple\.com\/[^\s]*?[?&]i=(\d+)/i.exec(link || "");
  return m ? m[1] : null;
}

// what the server knows how to stream, as { kind, id } - or null
function playableSource(link) {
  const pillows = getPillowsId(link);
  if (pillows) return { kind: "pillows", id: pillows };

  const drive = getDriveId(link);
  if (drive) return { kind: "drive", id: drive };

  const exoFile = getExoshareFile(link);
  if (exoFile) return { kind: "exofile", id: `${exoFile.shareId}/${exoFile.fileId}` };

  const exo = getExoshareId(link);
  if (exo) return { kind: "exoshare", id: exo };

  const pixel = getPixeldrainId(link);
  if (pixel) return { kind: "pixeldrain", id: pixel };

  const imgur = getImgurId(link);
  if (imgur) return { kind: "imgur", id: imgur };

  // any other link that points straight at an audio file
  if (/^https?:\/\/[^\s]+\.(mp3|wav|flac|ogg|opus|m4a)(\?[^\s]*)?$/i.test(link)) return { kind: "url", id: link };

  return null;
}

const DEAD_HOSTS = [/music\.froste\.lol/i, /krakenfiles\.com/i];

function extractLinks(cell) {
  return (String(cell || "").match(/https?:\/\/[^\s,;|]+/gi) || [])
    .map(link => link.replace(/[)\]}.,;]+$/, ""))
    .filter(link => !DEAD_HOSTS.some(host => host.test(link)));
}

/* ------------------------------------------------------------------ *
 *  Song titles
 * ------------------------------------------------------------------ */

// brackets that are part of the song's actual name
const TITLE_KEEP = /\b(remix|mix|version|edit|intro|outro|interlude|freestyle|skit|reprise|live|acoustic|slowed|sped)\b/i;

/*
  "Hëavyweight [V2]\n(prod. Jonah Abraham)\n(Awoo)" ->
    title "Hëavyweight", feat "", producer "Jonah Abraham", aliases ["Awoo"]
*/
function parseNameCell(cell) {
  let text = String(cell || "").replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
  text = text.replace(/[℗©].*$/, "").trim();

  // [V1], [V2], [Snippet] and the like are tracker bookkeeping, not the title
  text = text.replace(/\s*\[[^\]]*\]/g, "").trim();

  // ⭐ ✨ 🏆 mark Best Of / Special / Grails on the sheet
  text = text.replace(/^[^\p{L}\p{N}#$!.(]+/u, "").trim();

  // a folder name like "GO2WORK feat. Summrs)" lost its opening bracket
  text = text.replace(/\s+((?:feat|ft|with)\.?\s[^()]*)\)\s*$/i, " ($1)");

  const groups = [];
  let title = text.replace(/\(([^()]*)\)/g, (whole, inner) => {
    groups.push(inner.trim());
    return "\u0000";
  });

  const features = [];
  const producers = [];
  const aliases = [];
  let kept = "";
  let index = 0;

  title = title.replace(/\u0000/g, () => {
    const inner = groups[index++];

    if (/^(feat|ft|with)\b\.?/i.test(inner)) {
      features.push(inner);
      return "";
    }

    if (/^prod\b/i.test(inner)) {
      producers.push(inner.replace(/^prod\.?\s*(by\s*)?/i, "").trim());
      return "";
    }

    // "(6minfreestyle Remix)" is part of the name; "(AMG C63 Remix, Expensive
    // Taste V2)" is a list of other names
    if (TITLE_KEEP.test(inner) && !inner.includes(",") && !kept) {
      kept = inner;
      return `(${inner})`;
    }

    inner.split(",").forEach(alias => {
      const a = alias.trim();
      if (a && a.length <= 60) aliases.push(a);
    });
    return "";
  });

  title = title.replace(/\s+/g, " ").replace(/\s+\)/g, ")").trim();
  return { title, features, producers, aliases };
}

/* ------------------------------------------------------------------ *
 *  Reading the sheet
 * ------------------------------------------------------------------ */

function csvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:csv&gid=${gid}&headers=0`;
}

// with an API key, hyperlinks hidden behind cell text are read too
async function fetchGridWithLinks(gid) {
  const key = CONFIG.googleApiKey;
  if (!key) return null;

  const meta = await fetchJson(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetId}?fields=sheets.properties(sheetId,title)&key=${key}`);
  const sheet = (meta.sheets || []).find(s => String(s.properties.sheetId) === String(gid));
  if (!sheet) return null;

  const range = encodeURIComponent(`'${sheet.properties.title.replace(/'/g, "''")}'`);
  const data = await fetchJson(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetId}?includeGridData=true&ranges=${range}` +
    `&fields=sheets(data(rowData(values(formattedValue,hyperlink))))&key=${key}`);

  const rowData = ((((data.sheets || [])[0] || {}).data || [])[0] || {}).rowData || [];
  return rowData.map(row => (row.values || []).map(cell =>
    (cell && cell.hyperlink && !(cell.formattedValue || "").includes(cell.hyperlink))
      ? `${cell.formattedValue || ""} ${cell.hyperlink}`
      : (cell && cell.formattedValue) || ""));
}

const SKIP_AVAILABILITY = /^(snippet|partial|confirmed|rumored|rumoured|recording|beat only|unavailable|not available)/i;

const ERA_YEARS = new Map();
// each tab's era header rows, in sheet order: name, other names, notes, cover
const ERA_HEADINGS = new Map();

/*
  The sheet's HTML view is read first. Google's CSV export guesses a type for
  each column and blanks out cells that don't fit - the Era column is mostly
  numbers ("530", "1500"), so names like "Elegance" or "DC2" came through
  empty and those songs ended up under the wrong era (and the wrong cover).
  The HTML view has every cell exactly as written, links and pictures too.
*/
const sheetHtmlCache = new Map();

async function sheetHtml(gid, { fresh = false } = {}) {
  const held = sheetHtmlCache.get(gid);
  if (!fresh && held && Date.now() - held.at < 10 * 60 * 1000) return held.html;
  const html = await fetchText(`https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/htmlview/sheet?headers=true&gid=${gid}`);
  sheetHtmlCache.set(gid, { at: Date.now(), html });
  return html;
}

async function loadTab(tab) {
  let rows = null;
  let linkRows = null;
  let imageRows = [];

  try {
    const grid = parseSheetHtml(await sheetHtml(tab.gid, { fresh: true }));
    if (grid.rows.length > 5) ({ rows, linkRows, imageRows } = grid);
  } catch (err) {
    console.warn(`  [${tab.name}] HTML view failed (${err.message}), trying the other exports`);
  }

  if (!rows) {
    try {
      rows = await fetchGridWithLinks(tab.gid);
    } catch (err) {
      console.warn(`  [${tab.name}] Sheets API failed (${err.message}), using CSV`);
    }
  }

  if (!rows) rows = parseCsv(await fetchText(csvUrl(tab.gid)));
  if (!linkRows) linkRows = rows;

  const headerRow = findHeaderRow(rows);
  const headers = rows[headerRow] || [];
  const data = rows.slice(headerRow + 1);
  const dataLinks = linkRows.slice(headerRow + 1);
  const dataImages = imageRows.slice(headerRow + 1);

  const col = {};
  ["name", "notes", "length", "type", "quality", "availableLength", "link", "altLink", "streaming", "recEra"]
    .forEach(key => { col[key] = findColumn(headers, key); });
  col.era = findEraColumn(headers, Object.values(col));
  /*
    Which date is which. Unreleased tabs have File Date (when the song was
    made), then First Preview, Leak Date and OG File Leak Date; Released tabs
    have one Date, the release. Picking "whichever column has the most dates"
    landed on Leak Date, so a 2021 song showed up as 2024.
  */
  const flatHeaders = headers.map(normaliseHeader);
  const headerAt = names => { for (const n of names) { const i = flatHeaders.indexOf(n); if (i >= 0) return i; } return -1; };
  col.date = headerAt(["file date", "date", "release date", "recorded", "recording date"]);
  if (col.date < 0) col.date = findDateColumn(data, [col.era, col.name, col.notes, col.length, col.link, col.altLink]);
  col.leak = headerAt(["leak date", "leaked", "date leaked"]);

  if (col.name < 0 || col.link < 0) {
    throw new Error(`${tab.name}: couldn't find the Name / Link columns`);
  }

  const cell = (row, key) => (col[key] >= 0 ? String(row[col[key]] || "").trim() : "");
  const songs = [];

  /*
    Each era opens with a header row - "530\n(...)\n℗ 2017 YEAT" in the Name
    column and no link. The sheet only fills the era column on some rows, so
    songs with a blank era take the header above them.
  */
  let headingEra = "";
  const headings = [];

  data.forEach((row, index) => {
    const nameCell = cell(row, "name");
    if (!nameCell) return;
    const linkRow = dataLinks[index] || row;
    const linkCell = key => (col[key] >= 0 ? String(linkRow[col[key]] || "").trim() : "");

    // an era's header row: its cover pasted in, or "℗ 2017 YEAT", and no file
    const isHeading = !extractLinks(linkCell("link")).length && (dataImages[index] || /[℗©]\s*\d{4}/.test(nameCell));
    if (isHeading) {
      headingEra = nameCell.split("\n")[0].trim();
      headings.push({
        tab: tab.name,
        cell: nameCell,
        name: headingEra,
        notes: cell(row, "notes"),
        image: dataImages[index] || ""
      });
      // "℗ 2017 YEAT" - the one place an era's year is written down
      const stamped = nameCell.match(/[℗©]\s*(\d{4})/);
      if (stamped && !ERA_YEARS.has(looseEraKey(headingEra))) ERA_YEARS.set(looseEraKey(headingEra), Number(stamped[1]));
      return;
    }

    const availability = cell(row, "availableLength");
    if (availability && SKIP_AVAILABILITY.test(availability)) return;
    if (/^not available/i.test(cell(row, "quality"))) return;
    if (/^lost$/i.test(cell(row, "streaming"))) return;

    const links = [...extractLinks(linkCell("link")), ...extractLinks(linkCell("altLink"))];
    if (!links.length) return;

    const parsed = parseNameCell(nameCell);
    if (!parsed.title) return;

    // a song by someone else that Yeat is only featured on isn't a Yeat song
    if (parsed.features.some(f => /\byeat\b/i.test(f))) return;
    if (/^feature$/i.test(cell(row, "type"))) return;

    let source = null;
    for (const link of links) {
      source = playableSource(link);
      if (source) break;
    }

    if (!source) {
      const apple = links.map(getAppleTrackId).find(Boolean);
      const onStreaming = links.some(link => /spotify\.com|music\.apple\.com|lnk\.to|tidal\.com|deezer\.com/i.test(link));
      if (apple) source = { kind: "apple", id: apple };
      else if (onStreaming) source = { kind: "search", id: "" };
    }

    if (!source) return;

    const dated = col.date >= 0 ? parseDateCell(row[col.date]) : null;

    songs.push({
      title: parsed.title,
      features: parsed.features,
      producers: parsed.producers,
      aliases: parsed.aliases,
      // the era it was RECORDED in - used to line released songs up with their
      // leaks on the Unreleased tab. The game shows releasedOn for released songs.
      era: cell(row, "recEra") || cell(row, "era") || headingEra,
      releasedOn: /^released/i.test(tab.name) ? (cell(row, "era") || headingEra) : "",
      date: dated ? dated.text : "",
      year: dated ? dated.year : null,
      leaked: col.leak >= 0 && parseDateCell(row[col.leak]) ? String(row[col.leak]).trim() : "",
      length: cell(row, "length"),
      type: cell(row, "type"),
      availability,
      tab: tab.name,
      source
    });
  });

  console.log(`  [${tab.name}] ${songs.length} playable rows, ${headings.length} eras`);
  ERA_HEADINGS.set(tab.name, headings);
  return songs;
}

/* ------------------------------------------------------------------ *
 *  Stems folders (the hand-split songs that came with Yeatle)
 * ------------------------------------------------------------------ */

const STEM_FILES = ["drums", "bass", "other", "vocals"];

function readStemFolders() {
  let names = [];
  try {
    names = fs.readdirSync(STEMS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  } catch (err) {
    return [];
  }

  return names
    .filter(name => STEM_FILES.every(stem => fs.existsSync(path.join(STEMS_DIR, name, `${stem}.mp3`))))
    .map(folder => {
      const info = {};
      try {
        fs.readFileSync(path.join(STEMS_DIR, folder, "info.txt"), "utf8").split(/\r?\n/).forEach(line => {
          const m = /^\s*([^:]+):\s*"?(.*?)"?\s*$/.exec(line);
          if (m) info[m[1].trim().toLowerCase()] = m[2];
        });
      } catch (err) { /* no info.txt */ }

      // folders can't hold "/", so the friend used "_" - "Bad Bënd _ Dëmon"
      const parsed = parseNameCell(folder.replace(/ _ /g, " / "));
      return { folder, ...parsed, info };
    });
}

/* ------------------------------------------------------------------ *
 *  Building the song list
 * ------------------------------------------------------------------ */

function coverForEra(era) {
  if (!era) return "";
  if (ERA_COVERS[era]) return ERA_COVERS[era];

  // "Up 2 Më" finds "Up 2 Më [V1]", "ADL (Deluxe)" finds "ADL"
  const strip = name => looseEraKey(String(name).replace(/\s*[[(].*$/, ""));
  const key = looseEraKey(era);
  const base = strip(era);
  for (const [name, url] of Object.entries(ERA_COVERS)) {
    if (url && looseEraKey(name) === key) return url;
  }
  for (const [name, url] of Object.entries(ERA_COVERS)) {
    if (url && strip(name) === base) return url;
  }
  return "";
}

// "LYFESTYLE [V1]" and "LYFESTYLE [V2]" are the same era with two versions
const eraBaseKey = era => looseEraKey(String(era || "").replace(/\s*[[(].*$/, ""));

/*
  Rows that share a title are merged into one song only when they look like the
  same song: a leak and its release, or V1 and V2 in the same era. Rows with the
  same title from different eras stay separate songs, so one song's info never
  gets another song's audio.
  The admin panel can still force a split: song-splits.json lists the title and
  era to separate.
*/
const SPLITS_FILE = path.join(DATA_DIR, "song-splits.json");
let SPLITS = (loadJson(SPLITS_FILE, {}).splits || []).filter(x => x && x.title && x.era);
const splitKey = (title, era) => `${norm(title)}|${eraBaseKey(era)}`;
const splitRowKey = (title, trackerKey) => `${norm(title)}|${trackerKey}`;
let SPLIT_KEYS = new Set(SPLITS.filter(x => !x.trackerKey).map(x => splitKey(x.title, x.era)));
let SPLIT_ROW_KEYS = new Set(SPLITS.filter(x => x.trackerKey).map(x => splitRowKey(x.title, x.trackerKey)));

function saveSplits() {
  SPLIT_KEYS = new Set(SPLITS.filter(x => !x.trackerKey).map(x => splitKey(x.title, x.era)));
  SPLIT_ROW_KEYS = new Set(SPLITS.filter(x => x.trackerKey).map(x => splitRowKey(x.title, x.trackerKey)));
  try {
    fs.writeFileSync(SPLITS_FILE, JSON.stringify({ splits: SPLITS }, null, 2));
  } catch (err) {
    console.warn("  Couldn't save song-splits.json: " + err.message);
  }
}

const SOURCE_RANK = { stems: 0, pillows: 1, drive: 1, exofile: 1, exoshare: 1, pixeldrain: 1, imgur: 1, url: 1, apple: 2, search: 3 };

function guessKeys(entry) {
  const keys = new Set();
  const add = value => { const k = norm(value); if (k.length >= 1) keys.add(k); };

  add(entry.title);
  add(entry.title.replace(/\s*\(.*?\)\s*/g, " "));
  // "Drake - IDGAF" also answers to "IDGAF"
  if (/ - /.test(entry.title)) add(entry.title.split(" - ").slice(1).join(" - "));
  (entry.features || []).forEach(f => add(`${entry.title} (${f})`));
  (entry.aliases || []).forEach(add);
  return [...keys];
}

function buildSongList(sheetRows, stemFolders) {
  const byKey = new Map();
  const groupsByTitle = new Map(); // norm(title) -> the separate songs that share it

  sheetRows.forEach(rawRow => {
    const trackerKey = trackerRowKey(rawRow);
    const edit = ROW_EDITS[trackerKey];
    const row = {
      ...rawRow,
      ...(edit ? {
        title: edit.title || rawRow.title,
        features: edit.title ? [] : rawRow.features,
        era: edit.era,
        tab: edit.tab
      } : {}),
      _trackerKey: trackerKey,
      _originalTitle: rawRow.title,
      _originalEra: rawRow.era || "",
      _originalTab: rawRow.tab || ""
    };
    const titleKey = norm(row.title);
    if (!titleKey) return;
    let key = titleKey;

    // the era shown in the game: a released song shows the era it came OUT in,
    // and the era it was recorded in is kept next to it
    const released = row.tab === "Released";
    row.displayEra = edit ? (edit.era || row.era || "") : (released && row.releasedOn ? row.releasedOn : (row.era || ""));
    row.recordedIn = !edit && released ? (row.era || "") : "";

    const recKey = eraBaseKey(row.era);
    const relKey = eraBaseKey(row.releasedOn);
    const rowEras = [recKey, relKey].filter(Boolean);

    if (edit) {
      // An edited tracker row always stays independent, even if its new title and era match another entry.
      key = `${titleKey}@edit-${trackerKey.slice(0, 12)}`;
    } else if (SPLIT_ROW_KEYS.has(splitRowKey(row.title, trackerKey))) {
      // the admin marked this specific tracker row as a different song
      key = `${titleKey}@split-${trackerKey.slice(0, 12)}`;
    } else if (SPLIT_KEYS.has(`${titleKey}|${recKey}`)) {
      // legacy era-level split: keep rows in this era separate from other eras
      key = `${titleKey}@${recKey || "other"}`;
    } else {
      // same title: join a group only if it shares an era (recorded or released)
      const groups = groupsByTitle.get(titleKey) || [];
      let group = groups.find(g => !rowEras.length || !g.eras.size || rowEras.some(e => g.eras.has(e)));

      if (!group) {
        // the first group keeps the plain id, so saved renames / hidden songs still line up
        let id = groups.length ? `${titleKey}@${recKey || relKey || "other"}` : titleKey;
        for (let n = 2; byKey.has(id) || groups.some(g => g.id === id); n++) id = `${titleKey}@${recKey || relKey || "other"}-${n}`;
        group = { id, eras: new Set() };
        groups.push(group);
        groupsByTitle.set(titleKey, groups);
      }

      rowEras.forEach(e => group.eras.add(e));
      key = group.id;
    }

    // what this row says about itself, so the admin panel can show what was combined
    const piece = {
      trackerKey, title: row.title, display: row.features.length ? `${row.title} (${row.features[0]})` : row.title, originalTitle: rawRow.title,
      era: row.era || "", tab: row.tab || "", date: row.date || "", length: row.length || "", releasedOn: row.releasedOn || "",
      originalEra: rawRow.era || "", originalTab: rawRow.tab || ""
    };

    const held = byKey.get(key);
    if (!held) {
      byKey.set(key, { ...row, aliases: [...row.aliases], mergedFrom: [piece] });
      return;
    }

    // same song listed twice (V1/V2, released + leaked): show the released
    // row's details, but play whichever file is best
    const aliases = held.aliases;
    row.aliases.forEach(a => { if (!aliases.includes(a)) aliases.push(a); });

    const betterSource = SOURCE_RANK[row.source.kind] < SOURCE_RANK[held.source.kind] ? row.source : held.source;
    const infoRow = held.tab !== "Released" && row.tab === "Released" ? row : held;
    byKey.set(key, { ...infoRow, aliases, source: betterSource, mergedFrom: [...held.mergedFrom, piece] });
  });

  // other names the sheet gives a song ("Pychocainë" for "Psychocainë")
  const byAlias = new Map();
  byKey.forEach(entry => {
    entry.aliases.forEach(alias => { const k = norm(alias); if (k && !byAlias.has(k)) byAlias.set(k, entry); });
  });

  // put the friend's stems onto the matching sheet song, or add them as-is
  stemFolders.forEach(stem => {
    const keys = [norm(stem.title), norm(stem.title.replace(/\s*\(.*?\)\s*/g, " "))];
    let match = null;

    // the song with this title - or, if the admin split two apart, the one whose
    // era matches the album written in the folder's info.txt
    const sameTitle = k => [...byKey.entries()].filter(([id]) => id === k || id.startsWith(k + "@")).map(([, entry]) => entry);
    const pickByAlbum = list => {
      if (list.length < 2) return list[0] || null;
      const album = eraBaseKey(stem.info.album);
      return (album && list.find(entry => eraBaseKey(entry.era) === album || eraBaseKey(entry.releasedOn) === album)) || list[0];
    };
    for (const k of keys) { const found = pickByAlbum(sameTitle(k)); if (found) { match = found; break; } }
    if (!match) for (const k of keys) { if (byAlias.has(k)) { match = byAlias.get(k); break; } }

    const stemSource = { kind: "stems", folder: stem.folder };

    // two different songs can share a title ("Flawless" and "Flawlëss (feat.
    // Lil Uzi Vert)") - the second one becomes its own entry
    if (match && match.source.kind === "stems") match = null;
    let id = norm(stem.title) || stem.folder;
    if (!match && byKey.has(id)) id = `${id}-${norm(stem.features.join(" ")) || norm(stem.folder)}`;

    if (match) {
      match.fallback = match.source;
      match.source = stemSource;
      if (!match.producers.length && stem.info["producer(s)"]) match.producers = [stem.info["producer(s)"]];
      return;
    }

    byKey.set(id, {
      title: stem.title,
      features: stem.features,
      producers: stem.info["producer(s)"] ? [stem.info["producer(s)"]] : stem.producers,
      aliases: stem.aliases,
      era: stem.info.album || "",
      displayEra: stem.info.album || "",
      date: "",
      year: /^\d{4}$/.test(stem.info.year || "") ? Number(stem.info.year) : null,
      length: "",
      type: "",
      availability: "",
      tab: "Released",
      source: stemSource
    });
  });

  const songs = [];
  byKey.forEach((song, key) => {
    const era = song.displayEra != null ? song.displayEra : (song.era || "");
    const recordedIn = song.recordedIn && looseEraKey(song.recordedIn) !== looseEraKey(era) ? song.recordedIn : "";
    songs.push({
      id: key,
      title: song.title,
      display: song.features.length ? `${song.title} (${song.features[0]})` : song.title,
      features: song.features,
      producers: song.producers,
      keys: guessKeys(song),
      era,
      recordedIn,
      releasedOn: song.releasedOn || "",
      eraYear: ERA_YEARS.get(looseEraKey(era)) || ERA_YEARS.get(looseEraKey(String(era || "").replace(/\s*[[(].*$/, ""))) || null,
      cover: coverForEra(era),
      date: song.date,
      year: song.year,
      length: song.length,
      type: song.type,
      availability: song.availability,
      leaked: song.leaked || "",
      tab: song.tab,
      mode: song.source.kind === "stems" ? "stems" : "filter",
      preview: song.source.kind === "apple" || song.source.kind === "search",
      folder: song.source.folder || null,
      mergedFrom: song.mergedFrom || [],
      source: song.source,
      fallback: song.fallback || null
    });
  });

  songs.sort((a, b) => a.title.localeCompare(b.title));
  return songs;
}

let SONGS = [];
let LAST_INPUT = null; // the rows from the last tracker read, kept so a split can be applied right away
let SONG_INDEX = new Map();
let ACTIVE_SONG = { id: "", seq: 0 };
let LAST_UPDATE = 0;
let LAST_SOURCE = "none";
let LAST_ERROR = "";

function setSongs(songs, source) {
  SONGS = songs.map(song => {
    const override = RENAMES[song.id];
    return override ? { ...song, display: override } : song;
  });
  SONG_INDEX = new Map(songs.map(s => [s.id, s]));
  LAST_SOURCE = source;
}

// build the list again from the last tracker read (after a split changes)
function rebuildFromLast() {
  if (!LAST_INPUT) return false;
  const oldEraCover = new Map(ERAS.filter(e => e.cover).map(e => [e.name, e.cover]));
  const oldSongCover = new Map(SONGS.filter(x => x.cover).map(x => [x.era, x.cover]));
  const songs = buildSongList(LAST_INPUT.rows, LAST_INPUT.stemFolders);
  buildEras(songs);
  ERAS.forEach(e => { if (!e.cover && oldEraCover.has(e.name)) e.cover = oldEraCover.get(e.name); });
  songs.forEach(x => { if (!x.cover && oldSongCover.has(x.era)) x.cover = oldSongCover.get(x.era); });
  setSongs(songs, "sheet");
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ updated: LAST_UPDATE, songs, eras: ERAS }));
  } catch (err) { /* read-only folder is fine */ }
  return true;
}

async function refreshSongs() {
  console.log("Reading the Yeat tracker sheet...");
  ERA_HEADINGS.clear();
  const stemFolders = readStemFolders();
  const rows = [];
  const errors = [];

  for (const tab of CONFIG.tabs) {
    try {
      rows.push(...await loadTab(tab));
    } catch (err) {
      errors.push(`${tab.name}: ${err.message}`);
      console.warn(`  [${tab.name}] failed: ${err.message}`);
    }
  }

  if (!rows.length) {
    LAST_ERROR = errors.join("; ") || "No songs found on the sheet.";
    if (!SONGS.length) {
      const cached = loadJson(CACHE_FILE, null);
      if (cached && Array.isArray(cached.songs)) {
        setSongs(cached.songs, "cache");
        ERAS = Array.isArray(cached.eras) ? cached.eras : [];
        LAST_UPDATE = cached.updated || 0;
        console.log(`Couldn't reach the sheet - using the saved list (${SONGS.length} songs).`);
      } else {
        setSongs(buildSongList([], stemFolders), "stems-only");
        console.log(`Couldn't reach the sheet - only the ${SONGS.length} stem songs are available.`);
      }
    }
    return;
  }

  LAST_INPUT = { rows, stemFolders };
  const songs = buildSongList(rows, stemFolders);
  buildEras(songs);
  await fillEraCovers(songs);
  // eras that got their art from Apple
  const appleArt = new Map(songs.filter(x => x.cover).map(x => [x.era, x.cover]));
  ERAS.forEach(era => { if (!era.cover && appleArt.has(era.name)) era.cover = appleArt.get(era.name); });
  setSongs(songs, "sheet");
  LAST_UPDATE = Date.now();
  LAST_ERROR = errors.join("; ");

  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ updated: LAST_UPDATE, songs, eras: ERAS }));
  } catch (err) { /* read-only folder is fine */ }

  const stemCount = songs.filter(s => s.mode === "stems").length;
  const previewCount = songs.filter(s => s.preview).length;
  console.log(`Loaded ${songs.length} songs (${stemCount} with stems, ${previewCount} as 30s previews).`);
}

/* ------------------------------------------------------------------ *
 *  Resolving audio
 * ------------------------------------------------------------------ */

const previewCache = loadJson(PREVIEW_CACHE_FILE, {});
const resolvedCache = new Map();

function savePreviewCache() {
  try { fs.writeFileSync(PREVIEW_CACHE_FILE, JSON.stringify(previewCache)); } catch (err) { /* ignore */ }
}

// exact title only - "Go" must not pick up "Go2work", "Gone" or "Go (Remix)"
function titleMatches(song, candidate) {
  const want = norm(song.title.replace(/\s*\((?:feat|ft|with)\b.*?\)\s*/gi, " "));
  const got = norm(String(candidate || "").replace(/\s*\((?:feat|ft|with)\b.*?\)\s*/gi, " ").replace(/\s*\[.*?\]\s*/g, " "));
  return Boolean(want && got && got === want);
}

// keyed by the Apple track itself (or the song + era), never just the title,
// so two songs with the same name can't share a preview
function previewKey(song) {
  return song.source && song.source.kind === "apple" && song.source.id
    ? `apple:${song.source.id}`
    : `search:${song.id}|${eraBaseKey(song.recordedIn || song.era)}`;
}

async function findPreview(song) {
  const cacheKey = previewKey(song);
  if (previewCache[cacheKey]) return previewCache[cacheKey];

  const artist = norm(CONFIG.artist);
  let url = null;

  if (song.source.kind === "apple") {
    try {
      const data = await fetchJson(`https://itunes.apple.com/lookup?id=${song.source.id}&entity=song`);
      const hit = (data.results || []).find(r => r.previewUrl);
      if (hit) url = hit.previewUrl;
    } catch (err) { /* fall through to search */ }
  }

  if (!url) {
    try {
      const term = encodeURIComponent(`${CONFIG.artist} ${song.title}`);
      const data = await fetchJson(`https://itunes.apple.com/search?term=${term}&entity=song&limit=25`);
      const hit = (data.results || []).find(r => r.previewUrl && norm(r.artistName).includes(artist) && titleMatches(song, r.trackName));
      if (hit) url = hit.previewUrl;
    } catch (err) { /* try deezer */ }
  }

  if (!url) {
    try {
      const q = encodeURIComponent(`artist:"${CONFIG.artist}" track:"${song.title.replace(/"/g, "")}"`);
      const data = await fetchJson(`https://api.deezer.com/search?q=${q}`);
      const hit = (data.data || []).find(r => r.preview && norm(r.artist && r.artist.name).includes(artist) && titleMatches(song, r.title));
      if (hit) url = hit.preview;
    } catch (err) { /* nothing found */ }
  }

  if (url) {
    previewCache[cacheKey] = url;
    savePreviewCache();
  }
  return url;
}

/*
  Eras newer than era-covers.json (a copy of tracker-player's cover list) get
  their album art from Apple, looked up once and remembered.
*/
async function fillEraCovers(songs) {
  const missing = [...new Set(songs.filter(s => s.era && !s.cover).map(s => s.era))];
  const artist = norm(CONFIG.artist);
  let changed = false;

  for (const era of missing) {
    const cacheKey = `era:${looseEraKey(era)}`;

    if (!(cacheKey in previewCache)) {
      let art = "";
      try {
        const base = era.replace(/\s*\(.*$/, "");
        const data = await fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(`${CONFIG.artist} ${base}`)}&entity=album&limit=15`);
        const hit = (data.results || []).find(r => norm(r.artistName).includes(artist) &&
          norm(String(r.collectionName).replace(/\s*[-(].*$/, "")) === norm(base));
        if (hit && hit.artworkUrl100) art = hit.artworkUrl100.replace(/100x100bb/, "600x600bb");
      } catch (err) {
        continue; // offline - try again next time
      }
      previewCache[cacheKey] = art;
      changed = true;
    }

    songs.forEach(s => { if (s.era === era && !s.cover) s.cover = previewCache[cacheKey]; });
  }

  if (changed) savePreviewCache();
}

/* ------------------------------------------------------------------ *
 *  Era covers straight from the sheet (same method as tracker-player)
 *
 *  Each era's header row on the tracker has its cover pasted INTO a cell. No
 *  CSV export shows those, but the sheet's HTML view does, as
 *  docs.google.com/sheets-images-rt URLs. Those can't be loaded by a browser
 *  from another site, so /api/cover fetches them here and passes the bytes on,
 *  re-reading the sheet if a URL has gone stale.
 * ------------------------------------------------------------------ */

const HTML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#160": " " };

function decodeHtml(text) {
  return String(text || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
    const key = code.toLowerCase();
    if (HTML_ENTITIES[key]) return HTML_ENTITIES[key];
    if (key[0] === "#") {
      const n = key[1] === "x" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      if (Number.isFinite(n)) return String.fromCodePoint(n);
    }
    return whole;
  });
}

function cellText(html) {
  return decodeHtml(String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
    .replace(/<[^>]*>/g, "")).trim();
}

// covers are square; logos and banners in the same row are not
function pickRowImage(rowHtml) {
  const found = [];
  const pattern = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = pattern.exec(rowHtml))) found.push(decodeHtml(m[1]));
  if (found.length <= 1) return found[0] || "";

  const squareness = url => {
    const size = String(url).match(/=w(\d+)-h(\d+)/i);
    if (!size) return 1;
    const w = Number(size[1]);
    const h = Number(size[2]);
    return w && h ? Math.min(w, h) / Math.max(w, h) : 0;
  };

  let best = found[0];
  found.forEach(url => { if (squareness(url) > squareness(best) + 0.05) best = url; });
  return best;
}

// the HTML view wraps every link as google.com/url?q=<real link>
function unwrapGoogleLink(href) {
  const m = /^https?:\/\/(?:www\.)?google\.com\/url\?(?:.*&)?q=([^&]+)/i.exec(href);
  if (!m) return href;
  try { return decodeURIComponent(m[1]); } catch (err) { return href; }
}

function parseSheetHtml(html) {
  const table = String(html || "").match(/<table[\s\S]*?<\/table>/i);
  if (!table) return { rows: [], linkRows: [], imageRows: [] };

  const rows = [];
  const linkRows = [];
  const imageRows = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let row;

  while ((row = rowPattern.exec(table[0]))) {
    const cells = [];
    const links = [];
    const cellPattern = /<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi;
    let cell;

    while ((cell = cellPattern.exec(row[1]))) {
      if (cell[1].toLowerCase() === "h") continue; // row-number gutter
      const span = cell[2].match(/\bcolspan\s*=\s*["']?(\d+)/i);
      const width = Math.min(span ? Number(span[1]) : 1, 50);
      const text = cellText(cell[3]);
      const hrefs = (cell[3].match(/<a\b[^>]*\bhref\s*=\s*["'][^"']+["']/gi) || [])
        .map(tag => unwrapGoogleLink(decodeHtml(tag.match(/href\s*=\s*["']([^"']+)["']/i)[1])));
      cells.push(text);
      // a link cell's real addresses, plus its text in case it's typed out
      links.push(hrefs.length ? `${hrefs.join(" ")} ${text}` : text);
      for (let i = 1; i < width; i++) { cells.push(""); links.push(""); }
    }

    if (cells.length) {
      rows.push(cells);
      linkRows.push(links);
      imageRows.push(pickRowImage(row[1]));
    }
  }

  return { rows, linkRows, imageRows };
}

// "=w100-h99" is the cell thumbnail; ask for a proper cover size instead
function atCoverSize(url) {
  return String(url || "").replace(/=[swh]\d+(-[hw]\d+)?(-[a-z0-9]+)*$/i, "") + "=w600";
}

// an era header lists its name and then other names: "HiTunes [V1]\n(HyTunes)"
function eraNamesInCell(cell) {
  const lines = String(cell || "").split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const names = [lines[0]];
  const trimmed = lines[0].replace(/\s*\(.*$/, "").trim();
  if (trimmed && trimmed !== lines[0]) names.push(trimmed);

  lines.forEach(line => {
    const inside = line.match(/^\((.+)\)$/);
    if (!inside) return;
    inside[1].split(",").forEach(alias => {
      const name = alias.trim();
      if (name && name.length <= 60 && !/^(prod|feat|with|collaboration)\b/i.test(name)) names.push(name);
    });
  });

  return [...new Set(names.map(n => n.replace(/\s+/g, " ")))];
}

/*
  The era list.

  The Unreleased tab has every era, in the order they started, each opening
  with a header row: the era's name, its other names in brackets, a notes cell
  of "(date) (what happened)" lines from start to end, and the cover pasted in.
  The Released tab only has release eras, so songs there are grouped by their
  "Rec. Era" column instead and line up with the same list.

  An era's own name always beats another header's "other names": the Released
  tab's Trëndi header lists "(Up 2 Më, My Lyfe)" and 4L lists "(4L with us)",
  and letting those claim the name is what gave Up 2 Më and 4L with us the
  wrong covers.
*/
let ERAS = [];
const ERA_IMAGE = new Map();      // looseEraKey(name) -> sheet image URL
const ERA_LOOKUP = new Map();     // looseEraKey(any name or alias) -> era name

function otherNames(cell) {
  const lines = String(cell || "").split("\n").map(l => l.trim()).filter(Boolean);
  const names = [];
  lines.slice(1).forEach(line => {
    const inside = line.match(/^\((.+)\)$/);
    if (!inside) return;
    inside[1].split(",").forEach(alias => {
      const name = alias.trim();
      if (name && name.length <= 60 && !/^(prod|feat|with|collaboration)\b/i.test(name)) names.push(name);
    });
  });
  return names;
}

const MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// "May 16, 2021", "Late February 2021", "Mid 2018", "January 2025" -> sortable number
function roughDate(text) {
  const t = String(text || "");
  const year = (t.match(/\b(19|20)\d{2}\b/) || [])[0];
  if (!year) return null;
  const month = (t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i) || [])[1];
  const day = Number((t.match(/\b(\d{1,2}),/) || [])[1] || 0);
  let m = month ? MONTH_INDEX[month.toLowerCase()] : null;
  let d = day || 15;
  if (m == null) {
    m = /early/i.test(t) ? 1 : /mid/i.test(t) ? 5 : /late/i.test(t) ? 9 : 0;
  } else if (!day) {
    d = /early/i.test(t) ? 5 : /late/i.test(t) ? 25 : 15;
  }
  return Number(year) * 10000 + m * 100 + d;
}

// the header notes run from the era's start to its end
function eraSpan(notes) {
  const events = String(notes || "").split("\n")
    .map(line => line.match(/^\(([^)]*)\)\s*\((.*)\)\s*$/))
    .filter(Boolean)
    .map(m => ({ date: m[1].trim(), what: m[2].trim() }));
  const real = events.filter(e => !/is born/i.test(e.what));
  if (!real.length) return { start: "", end: "" };
  const last = real[real.length - 1];
  return {
    start: real[0].date,
    end: /^ongoing$/i.test(last.date) || /^ongoing$/i.test(last.what) ? "Ongoing" : (real.length > 1 ? last.date : "")
  };
}

function buildEras(songs) {
  const unreleased = [...ERA_HEADINGS.entries()].filter(([tab]) => /^unreleased/i.test(tab)).flatMap(([, h]) => h);
  const released = [...ERA_HEADINGS.entries()].filter(([tab]) => !/^unreleased/i.test(tab)).flatMap(([, h]) => h);

  const eras = [];
  const byKey = new Map();
  ERA_LOOKUP.clear();
  ERA_IMAGE.clear();

  const addEra = (heading, order) => {
    const key = looseEraKey(heading.name);
    if (!key || byKey.has(key)) return byKey.get(key);
    const span = eraSpan(heading.notes);
    const stamped = String(heading.cell || "").match(/[℗©]\s*(\d{4})/);
    const era = {
      name: heading.name,
      aliases: otherNames(heading.cell),
      start: span.start,
      end: span.end,
      year: stamped ? Number(stamped[1]) : null,
      order,
      sortKey: roughDate(span.start),
      image: heading.image ? atCoverSize(heading.image) : ""
    };
    byKey.set(key, era);
    eras.push(era);
    return era;
  };

  unreleased.forEach((h, i) => addEra(h, i));

  // pass 1: every era's own name
  eras.forEach(era => ERA_LOOKUP.set(looseEraKey(era.name), era.name));
  // the Released tab's headers fill in pictures for the same eras
  released.forEach(h => {
    const era = byKey.get(looseEraKey(h.name));
    if (era && !era.image && h.image) era.image = atCoverSize(h.image);
  });
  // pass 2: other names, only where no era already owns them
  eras.forEach(era => era.aliases.forEach(alias => {
    const key = looseEraKey(alias);
    if (key && !ERA_LOOKUP.has(key)) ERA_LOOKUP.set(key, era.name);
  }));

  // put every song under its era's proper name
  const resolve = name => {
    if (!name) return "";
    const key = looseEraKey(name);
    if (ERA_LOOKUP.has(key)) return ERA_LOOKUP.get(key);
    // "Up 2 Më [V2]" style tails, only if that leaves exactly one era
    const base = looseEraKey(String(name).replace(/\s*[[(].*$/, ""));
    const hits = eras.filter(e => looseEraKey(e.name.replace(/\s*[[(].*$/, "")) === base);
    return hits.length === 1 ? hits[0].name : name;
  };

  // a released song's era is the Released tab's own section name ("ADL",
  // "LYFESTYLE"), not an Unreleased era it happens to be an alias of
  const releasedName = new Map(released.map(h => [looseEraKey(h.name), h.name]));
  const releaseEraName = song => {
    if (song.tab !== "Released" || !song.releasedOn || looseEraKey(song.era) !== looseEraKey(song.releasedOn)) return "";
    const key = looseEraKey(song.era);
    const name = releasedName.get(key);
    // "2093 (P2)" is still the 2093 album
    return name && !byKey.has(key) && !/\(\s*p(?:art)?\s*\d+\s*\)\s*$/i.test(name) ? name : "";
  };

  songs.forEach(song => {
    song.era = releaseEraName(song) || resolve(song.era);
    if (song.recordedIn) song.recordedIn = resolve(song.recordedIn);
    if (song.recordedIn === song.era) song.recordedIn = "";
  });

  // eras only the Released tab (or a stems folder) knows about go in too
  let extra = unreleased.length;
  songs.forEach(song => {
    if (!song.era || byKey.has(looseEraKey(song.era))) return;
    const heading = released.find(h => looseEraKey(h.name) === looseEraKey(song.era)) || { name: song.era, cell: song.era, notes: "", image: "" };
    const era = addEra(heading, extra++);
    if (era) ERA_LOOKUP.set(looseEraKey(era.name), era.name);
  });

  // oldest first by when each era started; an era with no readable date keeps
  // its place in the sheet
  let lastKey = 0;
  eras.forEach(era => { if (era.sortKey == null) era.sortKey = lastKey; else lastKey = era.sortKey; });
  eras.sort((a, b) => a.sortKey - b.sortKey || a.order - b.order);

  eras.forEach(era => {
    if (era.image) ERA_IMAGE.set(looseEraKey(era.name), era.image);
    era.cover = era.image || coverForEra(era.name) || "";
    // the tag changes whenever the picture does, so a browser never shows an old one
    if (era.image) era.cover = `api/cover?era=${encodeURIComponent(era.name)}&v=${require("crypto").createHash("md5").update(era.image).digest("hex").slice(0, 8)}`;
  });

  const coverOf = new Map(eras.map(e => [e.name, e.cover]));
  songs.forEach(song => { song.cover = coverOf.get(song.era) || song.cover || ""; });

  const used = new Set(songs.map(s => s.era));
  ERAS = eras.filter(e => used.has(e.name)).map(({ name, aliases, start, end, year, cover }) => ({ name, aliases, start, end, year, cover }));
  console.log(`  [eras] ${ERAS.length} eras with songs, ${ERA_IMAGE.size} covers from the sheet`);
}

// a cover URL that stopped working means the sheet moved on: read it again
async function rereadEraImages() {
  for (const tab of CONFIG.tabs) {
    try {
      const grid = parseSheetHtml(await sheetHtml(tab.gid, { fresh: true }));
      const headerRow = findHeaderRow(grid.rows);
      const nameIndex = findColumn(grid.rows[headerRow] || [], "name");
      if (nameIndex < 0) continue;
      grid.rows.forEach((row, i) => {
        if (i <= headerRow || !grid.imageRows[i]) return;
        const name = String(row[nameIndex] || "").split("\n")[0].trim();
        const key = looseEraKey(name);
        if (key && (ERA_IMAGE.has(key) || /^unreleased/i.test(tab.name))) ERA_IMAGE.set(key, atCoverSize(grid.imageRows[i]));
      });
    } catch (err) { /* keep what we had */ }
  }
}

const coverBytes = new Map();

async function fetchImage(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await request(url);
      const chunks = [];
      for await (const chunk of res) chunks.push(chunk);
      const type = res.headers["content-type"] || "";
      if (res.statusCode < 400 && /^image\//i.test(type)) return { type, body: Buffer.concat(chunks) };
    } catch (err) { /* retry */ }
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  return null;
}

async function serveCover(res, era) {
  const key = looseEraKey(era);
  if (coverBytes.has(key)) return sendImage(res, coverBytes.get(key));

  let url = ERA_IMAGE.get(key);
  let image = url ? await fetchImage(url) : null;

  if (!image && url) {
    await rereadEraImages();
    url = ERA_IMAGE.get(key);
    image = url ? await fetchImage(url) : null;
  }

  // last resort: the cover list copied from tracker-player
  if (!image) {
    const fallback = coverForEra(era);
    if (fallback) image = await fetchImage(fallback);
  }

  if (!image) {
    res.writeHead(404);
    res.end();
    return;
  }

  coverBytes.set(key, image);
  sendImage(res, image);
}

function sendImage(res, image) {
  res.writeHead(200, { "Content-Type": image.type, "Cache-Control": "public, max-age=86400", "Content-Length": image.body.length });
  res.end(image.body);
}

const IMGUR_EXT = "mp3|m4a|wav|flac|ogg|opus|aac|mp4|webm|aiff|alac";

async function resolveImgur(id) {
  const html = (await fetchText(`https://imgur.gg/f/${id}`)).replace(/\\u002[fF]/g, "/").replace(/\\\//g, "/");
  const byId = new RegExp(`https?://i\\.imgur\\.gg/${id}-[^"'\\\\\\s<>]*?\\.(?:${IMGUR_EXT})`, "i");
  const any = new RegExp(`https?://i\\.imgur\\.gg/[^"'\\\\\\s<>]*?\\.(?:${IMGUR_EXT})`, "i");
  const m = html.match(byId) || html.match(any);
  if (!m) throw new Error("no media on imgur.gg page");
  return m[0];
}

function isAudioName(name) {
  return /\.(mp3|m4a|wav|flac|ogg|opus|aac|aiff|webm)$/i.test(name || "");
}

async function resolveExoshare(shareId, fileId) {
  const data = await fetchJson(`https://exoshare.org/api/shares/${shareId}`);
  const files = (Array.isArray(data.files) ? data.files : []).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const wanted = fileId && files.find(f => f.id === fileId && isAudioName(f.name));
  const audio = wanted || files.find(f => isAudioName(f.name));
  if (!audio) throw new Error("no audio in exoshare share");
  return `https://exoshare.org/api/shares/${shareId}/files/${audio.id}`;
}

async function resolveSource(song, source) {
  const cacheKey = source.kind === "search" ? `search:${song.id}` : `${source.kind}:${source.id}`;
  if (resolvedCache.has(cacheKey)) return resolvedCache.get(cacheKey);

  let url;
  switch (source.kind) {
    case "pillows": url = `https://api.pillows.su/api/get/${source.id}`; break;
    case "drive": url = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(source.id)}&export=download&confirm=t`; break;
    case "pixeldrain": url = `https://pixeldrain.com/api/file/${source.id}`; break;
    case "url": url = source.id; break;
    case "imgur": url = await resolveImgur(source.id); break;
    case "exoshare": url = await resolveExoshare(source.id); break;
    case "exofile": { const [s, f] = source.id.split("/"); url = await resolveExoshare(s, f); break; }
    case "apple":
    case "search": url = await findPreview(song); break;
    default: url = null;
  }

  if (url) resolvedCache.set(cacheKey, url);
  return url;
}

function detectAudioType(buf) {
  if (!buf || buf.length < 12) return null;
  const ascii = (a, b) => buf.slice(a, b).toString("ascii");
  if (ascii(4, 8) === "ftyp") return "audio/mp4";
  if (ascii(0, 4) === "fLaC") return "audio/flac";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (ascii(0, 3) === "ID3") return "audio/mpeg";
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "audio/webm";
  return null;
}

async function pipeAudio(req, res, url) {
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;

  const upstream = await request(url, { headers });

  if (upstream.statusCode >= 400) {
    upstream.resume();
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `The song host returned HTTP ${upstream.statusCode}. Try another song; this link may be unavailable.` }));
    return;
  }

  let type = upstream.headers["content-type"] || "";
  if (/^text\/html/i.test(type)) {
    upstream.resume();
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "This song link opens a web page instead of an audio file. Try another song or use local stems." }));
    return;
  }

  // read the first chunk so mislabelled files (octet-stream, m4a as mpeg) get the right type
  const first = await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err, chunk) => {
      if (settled) return;
      settled = true;
      upstream.removeListener("data", onData);
      upstream.removeListener("end", onEnd);
      upstream.removeListener("error", onError);
      upstream.removeListener("aborted", onAborted);
      upstream.removeListener("close", onClose);
      if (err) reject(err);
      else resolve(chunk);
    };
    const onData = chunk => { upstream.pause(); finish(null, chunk); };
    const onEnd = () => finish(null, Buffer.alloc(0));
    const onError = err => finish(err);
    const onAborted = () => finish(new Error("audio host closed before sending audio"));
    const onClose = () => {
      if (!upstream.complete) finish(new Error("audio host disconnected before sending audio"));
    };
    upstream.once("data", onData);
    upstream.once("end", onEnd);
    upstream.once("error", onError);
    upstream.once("aborted", onAborted);
    upstream.once("close", onClose);
  });

  const sniffed = upstream.statusCode === 200 || /bytes 0-/.test(upstream.headers["content-range"] || "")
    ? detectAudioType(first) : null;
  if (sniffed) type = sniffed;
  else if (!/^(audio|video)\//i.test(type)) type = "audio/mpeg";

  const out = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
  if (upstream.headers["content-length"]) out["Content-Length"] = upstream.headers["content-length"];
  if (upstream.headers["content-range"]) out["Content-Range"] = upstream.headers["content-range"];

  upstream.on("error", () => res.destroy());
  res.writeHead(upstream.statusCode === 206 ? 206 : 200, out);
  res.write(first);
  upstream.pipe(res);
  upstream.resume();
  req.on("close", () => upstream.destroy());
}

async function serveSongAudio(req, res, id) {
  const song = SONG_INDEX.get(id);
  if (!song) return sendJson(res, 404, { error: "This song is no longer in the list. Refresh the game and try again." });

  // stems songs only come here for their full-file fallback
  const source = song.mode === "stems" ? song.fallback : song.source;
  if (!source) return sendJson(res, 404, { error: "No full audio file is available for this song. Use its local stems or choose another song." });

  try {
    const url = await resolveSource(song, source);
    if (!url) return sendJson(res, 404, { error: "No playable audio link was found for this song. Try another song or use local stems." });
    await pipeAudio(req, res, url);
  } catch (err) {
    console.warn(`[audio] ${song.title}: ${err.message}`);
    if (!res.headersSent) sendJson(res, 502, { error: `Could not load this song. Check your internet connection or try another song. (${err.message})` });
    else res.destroy();
  }
}

/* ------------------------------------------------------------------ *
 *  Static files
 * ------------------------------------------------------------------ */

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".mp4": "video/mp4",
  ".webm": "video/webm", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2",
  ".wasm": "application/wasm", ".mjs": "text/javascript", ".onnx": "application/octet-stream",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif"
};

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (err) { rel = pathname; }
  if (rel === "/") rel = "/index.html";

  const base = rel.startsWith("/Songs/") ? STEMS_DIR : WEB_DIR;
  const requested = rel.startsWith("/Songs/") ? rel.slice("/Songs/".length) : rel.slice(1);
  const file = path.resolve(base, requested);
  const relative = path.relative(base, file);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    res.writeHead(403); res.end("This path is outside the game folder."); return;
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end("Not found"); return; }

    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    const cache = staticCacheHeaders(file, stat, APP_VERSION);
    for (const [header, value] of Object.entries(cache)) res.setHeader(header, value);
    if (isNotModified(req.headers, cache.ETag, stat.mtimeMs)) {
      res.writeHead(304);
      res.end();
      return;
    }
    const range = rangeAllowed(req.headers, stat.mtimeMs) ? /bytes=(\d*)-(\d*)/.exec(req.headers.range || "") : null;

    if (range) {
      const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start >= stat.size || start > end) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        "Content-Type": type, "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": end - start + 1
      });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      "Content-Type": type, "Content-Length": stat.size, "Accept-Ranges": "bytes"
    });
    fs.createReadStream(file).pipe(res);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

/* ------------------------------------------------------------------ *
 *  Server
 * ------------------------------------------------------------------ */

/*
  The song splitter's model: Spleeter 4-stem, converted to ONNX by
  madewith-bestpractice (Apache-2.0). Four files, about 80 MB together,
  downloaded once into models/ the first time Yeatle runs and kept there.
*/
const MODELS_DIR = path.join(DATA_DIR, "models");
const MODEL_URL = "https://huggingface.co/Best-Practice/spleeter-4stems-onnx/resolve/main/";
const MODEL_STEMS = ["vocals", "drums", "bass", "other"];
const modelDownloads = new Map();

function ensureModel(stem) {
  const file = path.join(MODELS_DIR, `${stem}.fp16.onnx`);
  if (fs.existsSync(file) && fs.statSync(file).size > 1000000) return Promise.resolve(file);
  if (modelDownloads.has(stem)) return modelDownloads.get(stem);

  const job = (async () => {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    const res = await request(`${MODEL_URL}${stem}.fp16.onnx`);
    if (res.statusCode >= 400) { res.resume(); throw new Error(`model download returned ${res.statusCode}`); }
    const temp = `${file}.part`;
    try {
      await pipeline(res, fs.createWriteStream(temp));
      const downloaded = fs.statSync(temp).size;
      const expected = Number(res.headers["content-length"] || 0);
      if (downloaded < 1000000 || (expected && downloaded !== expected)) {
        throw new Error("the download was incomplete; restart Yeatle to retry");
      }
    } catch (err) {
      try { fs.unlinkSync(temp); } catch (_) { /* optional temporary file */ }
      throw err;
    }
    fs.renameSync(temp, file);
    console.log(`  [splitter] downloaded the ${stem} model`);
    return file;
  })();

  modelDownloads.set(stem, job);
  job.catch(err => {
    console.warn(`  [splitter] Could not download the ${stem} model: ${err.message}. Check your connection to huggingface.co, then restart Yeatle. Local stems remain available; the game can fall back to audio filters.`);
  }).finally(() => modelDownloads.delete(stem));
  return job;
}

async function serveModel(req, res, stem) {
  if (!MODEL_STEMS.includes(stem)) { res.writeHead(404); res.end(); return; }
  try {
    const file = await ensureModel(stem);
    const size = fs.statSync(file).size;
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": size, "Cache-Control": "public, max-age=86400" });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    sendJson(res, 502, { error: `couldn't download the song splitter: ${err.message}` });
  }
}

let refreshing = null;
function refreshOnce() {
  if (!refreshing) refreshing = refreshSongs().finally(() => { refreshing = null; });
  return refreshing;
}

/* ------------------------------------------------------------------ *
 *  Inside-joke photos: a few songs show a picture when you get them
 *
 *  joke-photos.json lists them; the pictures go in build/Images/jokes/.
 *  It's read again on every song-list request, so edits show up on a refresh.
 * ------------------------------------------------------------------ */

const JOKES_FILE = path.join(DATA_DIR, "joke-photos.json");

function attachJokes(songs) {
  const entries = (loadJson(JOKES_FILE, {}).photos || []).filter(p => p && p.song && p.image);
  if (!entries.length) return songs;

  return songs.map(song => {
    // the song's title as shown in the game, its tracker title, or its id
    const entry = entries.find(e => e.song === song.id || norm(e.song) === norm(song.display) || norm(e.song) === norm(song.title));
    if (!entry) return song;
    const image = /^https?:\/\//i.test(entry.image)
      ? entry.image
      : "Images/jokes/" + String(entry.image).split("/").map(encodeURIComponent).join("/");
    return { ...song, joke: { image, caption: String(entry.caption || ""), showOnLoss: Boolean(entry.showOnLoss) } };
  });
}

/* ------------------------------------------------------------------ *
 *  Admin: take songs out of the game (password protected)
 *
 *  Switched on by an admin.json next to this file:  { "password": "..." }
 *  The password is replaced by a salted hash the first time the server starts.
 *  Don't share admin.json; do share hidden-songs.json.
 * ------------------------------------------------------------------ */

const crypto = require("crypto");
const HIDDEN_FILE = path.join(DATA_DIR, "hidden-songs.json");
const RENAMES_FILE = path.join(DATA_DIR, "song-renames.json");
const ROW_EDITS_FILE = path.join(DATA_DIR, "song-edits.json");
// Stable tracker-row fingerprints keep edits connected when the sheet refreshes.
const trackerRowKey = row => crypto.createHash("sha256").update(JSON.stringify([
  norm(row.title), (row.features || []).map(norm), norm(row.era), norm(row.tab),
  String(row.date || ""), String(row.length || ""), norm(row.type), norm(row.releasedOn)
])).digest("hex");
let ROW_EDITS = loadJson(ROW_EDITS_FILE, {}).edits || {};
function saveRowEdits() {
  try { fs.writeFileSync(ROW_EDITS_FILE, JSON.stringify({ edits: ROW_EDITS }, null, 2)); }
  catch (err) { console.warn("  Couldn't save song-edits.json: " + err.message); }
}
// Display-name overrides are keyed by the original song id. Never change the
// tracker title/id used for lookup, merging, audio, or spreadsheet connections.
let RENAMES = loadJson(RENAMES_FILE, {}).renames || {};
function saveRenames() {
  try { fs.writeFileSync(RENAMES_FILE, JSON.stringify({ renames: RENAMES }, null, 2)); }
  catch (err) { console.warn("  Couldn't save song-renames.json: " + err.message); }
}
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");

// songs hidden from the game: [{ id, name, era, key }]
let HIDDEN = (loadJson(HIDDEN_FILE, {}).hidden || []).filter(h => h && h.id);
let HIDDEN_IDS = new Set();
let HIDDEN_KEYS = new Set();

// the title and era as a second way to recognise a song if the tracker changes its id
const hiddenKey = song => `${norm(song.display || song.title)}|${norm(song.era)}`;

function rebuildHidden() {
  HIDDEN_IDS = new Set(HIDDEN.map(h => h.id));
  HIDDEN_KEYS = new Set(HIDDEN.map(h => h.key).filter(Boolean));
}
rebuildHidden();

function isHidden(song) {
  return HIDDEN_IDS.has(song.id) || HIDDEN_KEYS.has(hiddenKey(song)) ||
    Boolean(song.recordedIn && HIDDEN_KEYS.has(hiddenKey({ ...song, era: song.recordedIn })));
}

function saveHidden() {
  rebuildHidden();
  try {
    fs.writeFileSync(HIDDEN_FILE, JSON.stringify({ hidden: HIDDEN }, null, 2));
  } catch (err) {
    console.warn("  Couldn't save hidden-songs.json: " + err.message);
  }
}

function loadAdmin() {
  const saved = loadJson(ADMIN_FILE, null);
  if (!saved) return null;
  if (typeof saved.password === "string" && saved.password) {
    // first start with a plain password: keep only a hash of it from now on
    const salt = crypto.randomBytes(16).toString("hex");
    const stored = { salt, hash: crypto.scryptSync(saved.password, salt, 64).toString("hex") };
    try { fs.writeFileSync(ADMIN_FILE, JSON.stringify(stored, null, 2)); } catch (err) { /* read-only folder */ }
    return stored;
  }
  return saved.salt && saved.hash ? saved : null;
}
const ADMIN = loadAdmin();

const adminSessions = new Map(); // token -> expires
let adminFails = 0;
let adminLockedUntil = 0;

function passwordOk(password) {
  const expected = Buffer.from(ADMIN.hash, "hex");
  const given = crypto.scryptSync(String(password || ""), ADMIN.salt, 64);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

function adminToken(req) {
  const match = /(?:^|;\s*)yeatle_admin=([a-f0-9]+)/.exec(req.headers.cookie || "");
  return match ? match[1] : "";
}

function loggedIn(req) {
  const token = adminToken(req);
  const expires = adminSessions.get(token);
  if (!expires || expires < Date.now()) { adminSessions.delete(token); return false; }
  return true;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > 200000) { reject(new Error("Request too big")); req.destroy(); }
      else chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch (err) { reject(new Error("Bad request")); }
    });
    req.on("error", reject);
  });
}

// every song, hidden or not, plus hidden entries the tracker no longer has
function adminSongList() {
  const songs = SONGS.map(s => ({
    id: s.id, title: s.title, display: s.display, era: s.era || "", tab: s.tab, date: s.date || "",
    type: s.type || "", length: s.length || "", preview: Boolean(s.preview), hidden: isHidden(s),
    rows: s.mergedFrom || [], stems: s.mode === "stems" ? (s.folder || "") : ""
  }));
  const ids = new Set(SONGS.map(s => s.id));
  const keys = new Set(SONGS.map(hiddenKey));
  const stale = HIDDEN.filter(h => !ids.has(h.id) && !keys.has(h.key)).map(h => ({ id: h.id, name: h.name, era: h.era }));
  return { songs, stale, splits: SPLITS };
}

const ADMIN_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Yeatle admin</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #000; color: #fff; font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  button, input, select { font: inherit; }
  :focus-visible { outline: 2px solid #b565e0; outline-offset: 2px; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 24px 16px 80px; }
  h1 { margin: 0; font-size: 1.4rem; }
  .muted { color: rgba(255,255,255,.6); font-size: .85rem; }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .btn { padding: 8px 14px; background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.3); border-radius: 6px; cursor: pointer; }
  .btn:hover:not(:disabled) { background: rgba(255,255,255,.1); }
  .btn:disabled { opacity: .4; cursor: not-allowed; }
  .btn.solid { background: #fff; color: #000; border-color: #fff; font-weight: 600; }
  .btn.solid:hover:not(:disabled) { background: #ddd; }
  .btn.red { background: #b8352e; border-color: #b8352e; font-weight: 600; }
  .btn.red:hover:not(:disabled) { background: #d2453d; }
  .btn.small { padding: 4px 10px; font-size: .8rem; }
  input[type=text], input[type=password], select { padding: 8px 10px; background: #000; color: #fff; border: 1px solid rgba(255,255,255,.3); border-radius: 6px; }
  .login { max-width: 340px; margin: 18vh auto 0; }
  .login h1 { margin-bottom: 14px; }
  .login input { width: 100%; margin-bottom: 10px; }
  .error { color: #ff6f65; min-height: 1.4em; margin: 6px 0 0; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px 0; border-top: 1px solid rgba(255,255,255,.16); }
  .bar.sticky { position: sticky; top: 0; background: #000; z-index: 5; border-bottom: 1px solid rgba(255,255,255,.16); }
  .bar .grow { flex: 1 1 200px; }
  .list { margin-top: 4px; }
  .row { display: grid; grid-template-columns: 24px 74px 1fr auto; gap: 10px; align-items: center; padding: 8px 4px; border-bottom: 1px solid rgba(255,255,255,.1); }
  .row.hidden-song .name { color: rgba(255,255,255,.45); text-decoration: line-through; }
  .row input[type=checkbox] { width: 18px; height: 18px; accent-color: #8901b9; }
  .name { font-weight: 600; word-break: break-word; }
  .tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 3px; }
  .tag { padding: 1px 8px; border-radius: 10px; font-size: .72rem; background: rgba(255,255,255,.14); }
  .tag.hid { background: #b8352e; }
  .tag.dup { background: #8901b9; }
  .tag.mix { background: #a35a00; }
  .rowsbox { margin-top: 8px; padding: 10px 12px; border: 1px solid rgba(255,255,255,.2); border-radius: 6px; display: grid; gap: 8px; }
  .test-search { margin: 8px 0 14px; padding: 12px; border: 1px solid rgba(181,101,224,.45); border-radius: 8px; background: rgba(137,1,185,.08); }
  .test-search input { width: 100%; }
  .test-results { display: grid; gap: 4px; margin-top: 8px; max-height: 280px; overflow: auto; }
  .test-result { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 7px 8px; border-bottom: 1px solid rgba(255,255,255,.1); }
  .test-result .grow { min-width: 0; }
  .rowline { display: flex; gap: 10px; align-items: center; justify-content: space-between; font-size: .85rem; }
  h2 { font-size: 1.05rem; margin: 28px 0 4px; }
  .empty { padding: 24px 0; color: rgba(255,255,255,.6); }
  @media (max-width: 600px) { .row { grid-template-columns: 24px 1fr auto; } .row .play { display: none; } }
</style>
</head>
<body>
<div class="wrap" id="app"></div>
<script>
var app = document.getElementById("app");
var state = { songs: [], stale: [], splits: [], open: {}, selected: {}, search: "", show: "all", tab: "all", era: "all" };
var audio = null;
var playingId = null;

function el(tag, attrs, kids) {
  var node = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (key) {
    if (key === "text") node.textContent = attrs[key];
    else if (key.indexOf("on") === 0) node.addEventListener(key.slice(2), attrs[key]);
    else if (key === "checked" || key === "disabled" || key === "value") node[key] = attrs[key];
    else node.setAttribute(key, attrs[key]);
  });
  (kids || []).forEach(function (kid) { if (kid) node.appendChild(kid); });
  return node;
}

function api(path, body) {
  var options = body === undefined
    ? { credentials: "same-origin" }
    : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  return fetch(path, options).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (res.status === 401) { var err = new Error("Please log in"); err.login = true; throw err; }
      if (!res.ok) throw new Error(data.error || ("Error " + res.status));
      return data;
    });
  });
}

/* ---------- finding likely duplicates ---------- */

// "Song [V2]" and "Song (OG)" and "song" all boil down to the same key
function baseKey(title) {
  var out = "";
  var depth = 0;
  var text = String(title || "").toLowerCase();
  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i);
    if (c === "[" || c === "(") { depth++; continue; }
    if (c === "]" || c === ")") { if (depth > 0) depth--; continue; }
    if (depth > 0) continue;
    if ((c >= "0" && c <= "9") || c.toLowerCase() !== c.toUpperCase()) out += c;
  }
  return out;
}

function markDuplicates() {
  var counts = {};
  state.songs.forEach(function (song) {
    song.key = baseKey(song.title);
    if (song.key) counts[song.key] = (counts[song.key] || 0) + 1;
  });
  state.songs.forEach(function (song) { song.dupes = song.key ? counts[song.key] : 1; });
}

/* ---------- login ---------- */

function showLogin(message) {
  stopAudio();
  app.textContent = "";
  var input = el("input", { type: "password", placeholder: "Password", "aria-label": "Password", autocomplete: "current-password" });
  var error = el("p", { class: "error", text: message || "" });
  function submit() {
    api("/api/admin/login", { password: input.value }).then(load).catch(function (err) {
      error.textContent = err.login ? "Wrong password" : err.message;
      input.value = "";
      input.focus();
    });
  }
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
  app.appendChild(el("div", { class: "login" }, [
    el("h1", { text: "Yeatle admin" }),
    input,
    el("button", { class: "btn solid", text: "Log in", onclick: submit }),
    error
  ]));
  input.focus();
}

/* ---------- main screen ---------- */

var listBox, summary, selectedCount, hideBtn, showBtn, staleBox, splitBox, eraSelect;

function load() {
  return api("/api/admin/songs").then(function (data) {
    state.songs = data.songs;
    state.stale = data.stale;
    state.splits = data.splits || [];
    markDuplicates();
    if (!listBox) buildScreen();
    updateEraOptions();
    renderList();
  }).catch(function (err) {
    if (err.login) { listBox = null; showLogin(); } else alert(err.message);
  });
}

function eras() {
  var seen = {};
  var list = [];
  state.songs.forEach(function (song) {
    var name = song.era || "(no era)";
    if (!seen[name]) { seen[name] = true; list.push(name); }
  });
  return list;
}

function buildScreen() {
  app.textContent = "";
  summary = el("span", { class: "muted" });
  selectedCount = el("span", { class: "muted" });
  listBox = el("div", { class: "list" });
  staleBox = el("div");
  splitBox = el("div");

  var testPanel = el("div", { class: "test-search", style: "display:none" });
  var testInput = el("input", { type: "text", placeholder: "Search songs by title or era", "aria-label": "Find a song to play in the game" });
  var testResults = el("div", { class: "test-results" });
  var testNote = el("div", { class: "muted", text: "Search for a song, then choose Play in game. The open game will switch to it." });
  function renderTestResults() {
    testResults.textContent = "";
    var query = testInput.value.trim().toLowerCase();
    if (!query) return;
    var matches = state.songs.filter(function (song) {
      return !song.hidden && (song.display + " " + song.title + " " + (song.era || "") + " " + (song.tab || "")).toLowerCase().indexOf(query) >= 0;
    }).slice(0, 25);
    if (!matches.length) { testResults.appendChild(el("div", { class: "muted", text: "No matching playable songs." })); return; }
    matches.forEach(function (song) {
      var meta = [song.era, song.tab].filter(Boolean).join(" · ");
      testResults.appendChild(el("div", { class: "test-result" }, [
        el("div", { class: "grow" }, [el("div", { class: "name", text: song.display }), el("div", { class: "muted", text: meta })]),
        el("button", { class: "btn small solid", text: "Play in game", onclick: function () {
          api("/api/admin/activate", { id: song.id }).then(function () { testNote.textContent = "Selected: " + song.display + ". Switch to the open game to hear it."; }).catch(function (err) { alert(err.message); });
        } })
      ]));
    });
  }
  testInput.addEventListener("input", renderTestResults);
  var testToggle = el("button", { class: "btn", text: "Song test search", onclick: function () {
    var open = testPanel.style.display === "none";
    testPanel.style.display = open ? "block" : "none";
    testToggle.textContent = open ? "Hide song test search" : "Song test search";
    if (open) testInput.focus();
  } });
  testPanel.appendChild(testInput);
  testPanel.appendChild(testNote);
  testPanel.appendChild(testResults);

  var search = el("input", { type: "text", class: "grow", placeholder: "Search title or era", "aria-label": "Search" });
  search.addEventListener("input", function () { state.search = search.value.toLowerCase(); renderList(); });

  function select(label, key, options) {
    var node = el("select", { "aria-label": label }, options.map(function (o) {
      return el("option", { value: o[0], text: o[1] });
    }));
    node.addEventListener("change", function () { state[key] = node.value; renderList(); });
    return node;
  }

  eraSelect = select("Era", "era", [["all", "All eras"]].concat(eras().map(function (name) { return [name, name]; })));

  hideBtn = el("button", { class: "btn red", text: "Hide selected", onclick: function () { apply(true); } });
  showBtn = el("button", { class: "btn", text: "Show selected", onclick: function () { apply(false); } });

  app.appendChild(el("div", { class: "top" }, [
    el("div", null, [el("h1", { text: "Yeatle admin" }), summary]),
    el("button", { class: "btn", text: "Log out", onclick: function () { api("/api/admin/logout", {}).then(function () { listBox = null; showLogin(); }); } })
  ]));
  app.appendChild(el("p", { class: "muted", text: "Hidden songs disappear from the game for everyone using this copy. Entry edits are saved by tracker row in song-edits.json, so tracker updates keep the change attached to its original entry." }));

  app.appendChild(el("div", { class: "bar" }, [
    search,
    select("Show", "show", [["all", "All songs"], ["visible", "Visible only"], ["hidden", "Hidden only"], ["dupes", "Possible duplicates"], ["merged", "Combined songs"]]),
    select("Tab", "tab", [["all", "Released and unreleased"], ["Released", "Released"], ["Unreleased", "Unreleased"]]),
    eraSelect,
    testToggle
  ]));
  app.appendChild(testPanel);
  app.appendChild(el("div", { class: "bar sticky" }, [
    el("button", { class: "btn small", text: "Select all shown", onclick: function () { shown().forEach(function (s) { state.selected[s.id] = true; }); renderList(); } }),
    el("button", { class: "btn small", text: "Clear", onclick: function () { state.selected = {}; renderList(); } }),
    selectedCount,
    el("span", { class: "grow" }),
    showBtn,
    hideBtn
  ]));
  app.appendChild(listBox);
  app.appendChild(staleBox);
  app.appendChild(splitBox);
}

function updateEraOptions() {
  if (!eraSelect) return;
  var selected = state.era;
  eraSelect.textContent = "";
  [["all", "All eras"]].concat(eras().map(function (name) { return [name, name]; })).forEach(function (option) {
    eraSelect.appendChild(el("option", { value: option[0], text: option[1] }));
  });
  eraSelect.value = eras().indexOf(selected) >= 0 || selected === "all" ? selected : "all";
  state.era = eraSelect.value;
}

function shown() {
  var list = state.songs.filter(function (song) {
    if (state.show === "visible" && song.hidden) return false;
    if (state.show === "hidden" && !song.hidden) return false;
    if (state.show === "dupes" && song.dupes < 2) return false;
    if (state.show === "merged" && !(song.rows && song.rows.length > 1)) return false;
    if (state.tab !== "all" && song.tab !== state.tab) return false;
    if (state.era !== "all" && (song.era || "(no era)") !== state.era) return false;
    if (state.search) {
      var hay = (song.display + " " + song.title + " " + (song.era || "")).toLowerCase();
      if (hay.indexOf(state.search) === -1) return false;
    }
    return true;
  });
  if (state.show === "dupes") list.sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
  return list;
}

function stopAudio() {
  if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
  playingId = null;
}

function togglePlay(song, button) {
  var wasPlaying = playingId === song.id;
  stopAudio();
  renderList();
  if (wasPlaying) return;
  audio = audio || new Audio();
  audio.src = "api/audio/" + encodeURIComponent(song.id);
  playingId = song.id;
  audio.onerror = function () { playingId = null; renderList(); alert("Couldn't load audio for " + song.display); };
  audio.onended = function () { playingId = null; renderList(); };
  audio.play().catch(function () {});
  renderList();
}

function updateBar() {
  var ids = Object.keys(state.selected).filter(function (id) { return state.selected[id]; });
  selectedCount.textContent = ids.length + " selected";
  hideBtn.disabled = !ids.length;
  showBtn.disabled = !ids.length;
}

function apply(hide, ids) {
  var chosen = ids || Object.keys(state.selected).filter(function (id) { return state.selected[id]; });
  if (!chosen.length) return;
  api("/api/admin/hide", { ids: chosen, hidden: hide }).then(function (data) {
    state.songs = data.songs;
    state.stale = data.stale;
    state.splits = data.splits || [];
    state.selected = {};
    markDuplicates();
    updateEraOptions();
    renderList();
  }).catch(function (err) {
    if (err.login) { listBox = null; showLogin(); } else alert(err.message);
  });
}

/* ---------- songs the tracker lists more than once ---------- */

function send(path, body) {
  api(path, body).then(function (data) {
    state.songs = data.songs;
    state.stale = data.stale;
    state.splits = data.splits || [];
    state.selected = {};
    markDuplicates();
    updateEraOptions();
    renderList();
    if (data.pending) alert("Saved. The game has not read the tracker yet this session, so the change will show after the next sync.");
  }).catch(function (err) {
    if (err.login) { listBox = null; showLogin(); } else alert(err.message);
  });
}

function separate(song, row) {
  if (!confirm("Make " + song.title + " (" + row.era + ") its own song, separate from the others with this title?")) return;
  send("/api/admin/split", { title: song.title, era: row.era, trackerKey: row.trackerKey });
}

function editTrackerEntry(song, row) {
  if (!row || !row.trackerKey) { alert("This entry has no tracker row attached yet. Sync the tracker and try again."); return; }
  var title = prompt("Song title (leave blank to use the tracker title):", row.display || row.originalTitle || song.display || song.title);
  if (title === null) return;
  var era = prompt("Era to use in the game:", row.era || "");
  if (era === null) return;
  var tab = prompt("Classify this entry as Released or Unreleased:", row.tab || "Unreleased");
  if (tab === null) return;
  tab = tab.trim().toLowerCase();
  if (tab !== "released" && tab !== "unreleased") { alert("Enter Released or Unreleased."); return; }
  send("/api/admin/edit-row", { trackerKey: row.trackerKey, title: title.trim(), era: era.trim(), tab: tab === "released" ? "Released" : "Unreleased" });
}

// the rows the game combined into one song, with a way to pull one back out
function rowsPanel(song) {
  if (!song.rows || song.rows.length < 2) return null;
  var isOpen = state.open[song.id];
  var toggle = el("button", { class: "btn small", style: "margin-top:6px", text: isOpen ? "Hide the combined rows" : "See the combined rows", onclick: function () { state.open[song.id] = !isOpen; renderList(); } });
  if (!isOpen) return toggle;
  var lines = song.rows.map(function (row) {
    var info = [row.era, row.tab, row.date, row.length].filter(Boolean).join(", ");
    return el("div", { class: "rowline" }, [
      el("span", { text: info }),
      el("div", null, [
        el("button", { class: "btn small", text: "Edit tracker entry", onclick: function () { editTrackerEntry(song, row); } }),
        el("button", { class: "btn small", style: "margin-left:6px", text: "This is a different song", onclick: function () { separate(song, row); } })
      ])
    ]);
  });
  var note = el("div", { class: "muted", text: "The tracker lists this title more than once, and the game treated those rows as one song. If one of them is really a different song, separate it." });
  return el("div", null, [toggle, el("div", { class: "rowsbox" }, [note].concat(lines))]);
}

function renderList() {
  var list = shown();
  var hiddenCount = state.songs.filter(function (s) { return s.hidden; }).length;
  summary.textContent = (state.songs.length - hiddenCount) + " in the game, " + hiddenCount + " hidden. Showing " + list.length + ".";
  listBox.textContent = "";
  if (!list.length) listBox.appendChild(el("div", { class: "empty", text: "Nothing matches." }));

  list.forEach(function (song) {
    var box = el("input", { type: "checkbox", "aria-label": "Select " + song.display, checked: Boolean(state.selected[song.id]) });
    box.addEventListener("change", function () { state.selected[song.id] = box.checked; updateBar(); });

    var details = [song.era, song.tab, song.date, song.type, song.length].filter(Boolean).join(", ");
    var tags = [];
    if (song.hidden) tags.push(el("span", { class: "tag hid", text: "Hidden" }));
    if (song.dupes > 1) tags.push(el("span", { class: "tag dup", text: "Possible duplicate (" + song.dupes + ")" }));
    if (song.preview) tags.push(el("span", { class: "tag", text: "30s preview" }));
    if (song.rows && song.rows.length > 1) tags.push(el("span", { class: "tag mix", text: "Combined from " + song.rows.length + " tracker rows" }));

    listBox.appendChild(el("div", { class: "row" + (song.hidden ? " hidden-song" : "") }, [
      box,
      el("button", { class: "btn small play", text: playingId === song.id ? "Stop" : "Play", onclick: function () { togglePlay(song); } }),
      el("div", null, [
        el("div", { class: "name", text: song.display }),
        el("div", { class: "muted", text: details }),
        tags.length ? el("div", { class: "tags" }, tags) : null,
        rowsPanel(song)
      ]),
      song.rows && song.rows.length === 1 ? el("button", { class: "btn small", text: "Edit tracker entry", onclick: function () { editTrackerEntry(song, song.rows[0]); } }) : el("button", { class: "btn small", text: "Rename", onclick: function () {
        var next = prompt("Display name for this song (leave blank to restore the tracker name):", song.display || song.title);
        if (next === null) return;
        send("/api/admin/rename", { id: song.id, name: next.trim() });
      } }),
      el("button", { class: "btn small" + (song.hidden ? "" : " red"), text: song.hidden ? "Show" : "Hide", onclick: function () { apply(!song.hidden, [song.id]); } })
    ]));
  });
  updateBar();

  splitBox.textContent = "";
  if (state.splits.length) {
    splitBox.appendChild(el("h2", { text: "Songs you have separated" }));
    splitBox.appendChild(el("p", { class: "muted", text: "These titles are treated as a different song in the era shown, not combined with other rows that share the name." }));
    state.splits.forEach(function (split) {
      splitBox.appendChild(el("div", { class: "row", style: "grid-template-columns: 1fr auto" }, [
        el("div", null, [el("div", { class: "name", text: split.title }), el("div", { class: "muted", text: split.era })]),
        el("button", { class: "btn small", text: "Join back", onclick: function () { send("/api/admin/split", { title: split.title, era: split.era, trackerKey: split.trackerKey, join: true }); } })
      ]));
    });
  }

  staleBox.textContent = "";
  if (state.stale.length) {
    staleBox.appendChild(el("h2", { text: "Hidden songs that are no longer on the tracker" }));
    staleBox.appendChild(el("p", { class: "muted", text: "These were hidden, but the tracker has since renamed or removed them. Remove them from the list, or hide the renamed version above." }));
    state.stale.forEach(function (entry) {
      staleBox.appendChild(el("div", { class: "row", style: "grid-template-columns: 1fr auto" }, [
        el("div", null, [el("div", { class: "name", text: entry.name }), el("div", { class: "muted", text: entry.era })]),
        el("button", { class: "btn small", text: "Remove from list", onclick: function () { apply(false, [entry.id]); } })
      ]));
    });
  }
}

load();
</script>
</body>
</html>
`;

async function handleAdmin(req, res, pathname) {
  if (pathname !== "/admin" && !pathname.startsWith("/api/admin/")) return false;

  if (!ADMIN) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(pathname === "/admin"
      ? "The admin panel is switched off.\n\nTo turn it on, create a file called admin.json next to server.js containing:\n{ \"password\": \"pick a password\" }\nthen restart Yeatle."
      : "Not found");
    return true;
  }

  if (pathname === "/admin") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(ADMIN_HTML);
    return true;
  }

  if (pathname === "/api/admin/login" && req.method === "POST") {
    if (Date.now() < adminLockedUntil) {
      sendJson(res, 429, { error: `Too many tries. Wait ${Math.ceil((adminLockedUntil - Date.now()) / 1000)} seconds.` });
      return true;
    }
    if (!/application\/json/.test(req.headers["content-type"] || "")) { sendJson(res, 400, { error: "Bad request" }); return true; }
    const body = await readJsonBody(req);
    if (!passwordOk(body.password)) {
      adminFails++;
      if (adminFails >= 5) { adminFails = 0; adminLockedUntil = Date.now() + 60000; }
      sendJson(res, 401, { error: "Wrong password" });
      return true;
    }
    adminFails = 0;
    const token = crypto.randomBytes(24).toString("hex");
    adminSessions.set(token, Date.now() + 12 * 3600 * 1000);
    res.setHeader("Set-Cookie", `yeatle_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${12 * 3600}`);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (!loggedIn(req)) { sendJson(res, 401, { error: "Please log in" }); return true; }

  if (pathname === "/api/admin/logout" && req.method === "POST") {
    adminSessions.delete(adminToken(req));
    res.setHeader("Set-Cookie", "yeatle_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (pathname === "/api/admin/songs" && req.method === "GET") {
    sendJson(res, 200, adminSongList());
    return true;
  }

  if (pathname === "/api/admin/activate" && req.method === "POST") {
    if (!/application\/json/.test(req.headers["content-type"] || "")) { sendJson(res, 400, { error: "Bad request" }); return true; }
    const body = await readJsonBody(req);
    const id = String(body.id || "");
    const song = SONGS.find(s => s.id === id);
    if (!song || isHidden(song)) { sendJson(res, 404, { error: "Song not found or hidden. Refresh the tracker and try again." }); return true; }
    ACTIVE_SONG = { id, seq: ACTIVE_SONG.seq + 1 };
    sendJson(res, 200, { ok: true, seq: ACTIVE_SONG.seq });
    return true;
  }

  if (pathname === "/api/admin/hide" && req.method === "POST") {
    if (!/application\/json/.test(req.headers["content-type"] || "")) { sendJson(res, 400, { error: "Bad request" }); return true; }
    const body = await readJsonBody(req);
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const byId = new Map(SONGS.map(s => [s.id, s]));

    if (body.hidden) {
      ids.forEach(id => {
        const song = byId.get(id);
        if (song && !HIDDEN.some(h => h.id === id)) HIDDEN.push({ id, name: song.display, era: song.era || "", key: hiddenKey(song) });
      });
    } else {
      const wantedKeys = new Set(ids.map(id => byId.get(id)).filter(Boolean).map(hiddenKey));
      HIDDEN = HIDDEN.filter(h => !ids.includes(h.id) && !wantedKeys.has(h.key));
    }
    saveHidden();
    sendJson(res, 200, adminSongList());
    return true;
  }

  if (pathname === "/api/admin/rename" && req.method === "POST") {
    if (!/application\/json/.test(req.headers["content-type"] || "")) { sendJson(res, 400, { error: "Bad request" }); return true; }
    const body = await readJsonBody(req);
    const id = String(body.id || "");
    const song = SONGS.find(s => s.id === id);
    if (!song) { sendJson(res, 404, { error: "Song not found. Refresh the tracker and try again." }); return true; }
    const name = String(body.name || "").trim();
    if (name.length > 200) { sendJson(res, 400, { error: "Song names must be 200 characters or fewer." }); return true; }
    if (name) RENAMES[id] = name;
    else delete RENAMES[id];
    saveRenames();
    // Update display only; canonical title/id and spreadsheet mapping remain untouched.
    SONGS = SONGS.map(s => s.id === id ? { ...s, display: name || s.title } : s);
    SONG_INDEX = new Map(SONGS.map(s => [s.id, s]));
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify({ updated: LAST_UPDATE, songs: SONGS, eras: ERAS })); } catch (err) { /* cache is optional */ }
    sendJson(res, 200, adminSongList());
    return true;
  }

  if (pathname === "/api/admin/edit-row" && req.method === "POST") {
    if (!/application\/json/.test(req.headers["content-type"] || "")) { sendJson(res, 400, { error: "Bad request" }); return true; }
    const body = await readJsonBody(req);
    const trackerKey = String(body.trackerKey || "");
    const rawRow = LAST_INPUT && LAST_INPUT.rows.find(row => trackerRowKey(row) === trackerKey);
    if (!trackerKey || !rawRow) { sendJson(res, 404, { error: "Tracker row not found. Refresh the tracker and try again." }); return true; }
    const title = String(body.title || "").trim();
    const era = String(body.era || "").trim();
    const tab = String(body.tab || "").trim();
    if (title.length > 200 || era.length > 200 || !["Released", "Unreleased"].includes(tab)) {
      sendJson(res, 400, { error: "Use a title and era of 200 characters or fewer, and choose Released or Unreleased." }); return true;
    }
    if (!title && era === (rawRow.era || "") && tab === (rawRow.tab || "")) delete ROW_EDITS[trackerKey];
    else ROW_EDITS[trackerKey] = { title, era, tab };
    saveRowEdits();
    const rebuilt = rebuildFromLast();
    sendJson(res, 200, { ...adminSongList(), pending: !rebuilt });
    return true;
  }

  if (pathname === "/api/admin/split" && req.method === "POST") {
    if (!/application\/json/.test(req.headers["content-type"] || "")) { sendJson(res, 400, { error: "Bad request" }); return true; }
    const body = await readJsonBody(req);
    const title = String(body.title || "");
    const era = String(body.era || "");
    const trackerKey = String(body.trackerKey || "");
    if (!norm(title) || !era || (trackerKey && !/^[a-f0-9]{64}$/.test(trackerKey))) { sendJson(res, 400, { error: "Bad request" }); return true; }

    const wanted = splitKey(title, era);
    if (body.join) {
      SPLITS = trackerKey
        ? SPLITS.filter(x => !(x.trackerKey && x.trackerKey === trackerKey && norm(x.title) === norm(title)))
        : SPLITS.filter(x => splitKey(x.title, x.era) !== wanted);
    } else if (trackerKey) {
      // Upgrade an older era-wide split to a row-specific split so selecting
      // one of two same-era tracker entries doesn't keep both grouped.
      SPLITS = SPLITS.filter(x => x.trackerKey || splitKey(x.title, x.era) !== wanted);
      if (!SPLITS.some(x => x.trackerKey === trackerKey && norm(x.title) === norm(title))) SPLITS.push({ title, era, trackerKey });
    } else if (!SPLITS.some(x => !x.trackerKey && splitKey(x.title, x.era) === wanted)) SPLITS.push({ title, era });
    saveSplits();

    // applied straight away when the tracker has been read; otherwise on the next sync
    const rebuilt = rebuildFromLast();
    sendJson(res, 200, { ...adminSongList(), pending: !rebuilt });
    return true;
  }

  sendJson(res, 404, { error: "Not found" });
  return true;
}

const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, "http://localhost");

  // lets the song splitter use every CPU core (shared memory needs these)
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");

  try {
    if (await handleAdmin(req, res, pathname)) return;

    const model = /^\/models\/(\w+)\.fp16\.onnx$/.exec(pathname);
    if (model) return serveModel(req, res, model[1]);

    if (pathname === "/api/active-song") return sendJson(res, 200, ACTIVE_SONG);

    if (pathname === "/api/songs") {
      if (searchParams.get("refresh")) await refreshOnce();
      else if (!SONGS.length) await refreshOnce();

      // the client never needs the raw sources
      const songs = attachJokes(SONGS.filter(s => !isHidden(s)).map(({ source, fallback, mergedFrom, ...rest }) => ({ ...rest, hasFull: Boolean(rest.mode === "filter" || fallback) })));
      return sendJson(res, 200, { songs, eras: ERAS, updated: LAST_UPDATE, source: LAST_SOURCE, error: LAST_ERROR, artist: CONFIG.artist });
    }

    if (pathname === "/api/cover") return serveCover(res, searchParams.get("era") || "");

    const audio = /^\/api\/audio\/(.+)$/.exec(pathname);
    if (audio) return serveSongAudio(req, res, decodeURIComponent(audio[1]));

    serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: err.message });
  }
});

// a dropped connection to a song host shouldn't take the whole game down
process.on("uncaughtException", err => console.warn("[warn]", err.message || err));
process.on("unhandledRejection", err => console.warn("[warn]", (err && err.message) || err));

server.on("error", err => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${CONFIG.port} is already in use. Close the other Yeatle window, or change "port" in config.json and restart.`);
  } else {
    console.error(`Yeatle could not start: ${err.message}. Check the settings and folder permissions, then try again.`);
  }
  process.exit(1);
});

function openBrowser() {
  if (!CONFIG.openBrowser) return;
  const url = `http://127.0.0.1:${server.address().port}`;
  const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

server.listen(CONFIG.port, "127.0.0.1", async () => {
  const port = server.address().port;
  console.log("");
  console.log("  Yeatle is running at http://127.0.0.1:" + port);
  console.log("  Keep this window open while you play. Close it to stop Yeatle.");
  if (ADMIN) console.log("  Admin panel: http://127.0.0.1:" + port + "/admin");
  console.log("");
  // Show the game immediately, while tracker refresh and model downloads run.
  const cached = loadJson(CACHE_FILE, null);
  if (cached && Array.isArray(cached.songs)) {
    setSongs(cached.songs, "cache");
    ERAS = Array.isArray(cached.eras) ? cached.eras : [];
    LAST_UPDATE = cached.updated || 0;
  }
  if (process.send) process.send({ type: "yeatle-ready", port });
  openBrowser();
  // fetch the splitter model in the background on the first run
  Promise.all(MODEL_STEMS.map(ensureModel)).catch(() => {});
  await refreshOnce();

  if (CONFIG.refreshMinutes > 0) {
    setInterval(refreshOnce, CONFIG.refreshMinutes * 60 * 1000).unref();
  }
});
