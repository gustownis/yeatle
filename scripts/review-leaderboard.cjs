// Read-only: compares each account's leaderboard numbers under the old rules and the
// anti-cheat rules, without changing any file.
//
//   node scripts/review-leaderboard.cjs [DATA_DIR]
//
// DATA_DIR defaults to YEATLE_DATA_DIR or the project folder (where the website keeps
// leaderboard-users.json and songs-cache.json).
const fs = require("node:fs");
const path = require("node:path");
const { computeMetrics } = require("../leaderboard.cjs");

const dir = path.resolve(process.argv[2] || process.env.YEATLE_DATA_DIR || path.join(__dirname, ".."));
const users = Object.values(JSON.parse(fs.readFileSync(path.join(dir, "leaderboard-users.json"), "utf8")).users || {});
let songs = [];
try { songs = JSON.parse(fs.readFileSync(path.join(dir, "songs-cache.json"), "utf8")).songs || []; } catch { console.warn("No songs-cache.json: song ids can't be checked against the catalog."); }
const index = new Map();
for (const song of songs) for (const id of [song.id, ...(song.formerIds || []), ...(song.equivalentIds || [])]) index.set(id, song);
const canonical = songs.length ? id => { const s = index.get(id); return s ? (s.equivalentIds?.length ? [s.id, ...s.equivalentIds].sort()[0] : s.id) : null; } : null;
let bans = {};
try { bans = JSON.parse(fs.readFileSync(path.join(dir, "leaderboard-bans.json"), "utf8")).bans || {}; } catch { /* none yet */ }

const rows = users.map(u => {
  const old = computeMetrics(u.progress, Date.now(), canonical);
  const verified = u.ranked?.karaoke || {};
  const now = computeMetrics(u.progress, Date.now(), canonical, { karaoke: verified });
  return {
    username: u.username, banned: Boolean(u.id && bans[u.id]),
    karaoke: [old.karaokeTotalScore, now.karaokeTotalScore], karaokeSongs: old.karaokeSongs,
    stems: old.stemsSolved, snippet: old.snippetSolved, prestige: old.prestige,
    leavesStemsBoard: old.stemsSolved === 0 && old.prestige > 0, leavesSnippetBoard: old.snippetSolved === 0 && old.prestige > 0
  };
});

const karaoke = rows.filter(r => r.karaoke[0] > 0);
console.log(`${users.length} accounts in ${dir}`);
console.log(`Karaoke: ${karaoke.length} accounts have synced (unverified) scores. If rankings use verified runs only, ${karaoke.filter(r => r.karaoke[1] < r.karaoke[0]).length} drop to their verified totals:`);
for (const r of karaoke.sort((a, b) => b.karaoke[0] - a.karaoke[0])) console.log(`  ${r.username.padEnd(20)} ${String(r.karaoke[0]).padStart(9)} -> ${String(r.karaoke[1]).padStart(9)}  (${r.karaokeSongs} songs)`);
console.log(`Stems/Snippets: solves already synced are credited in full; ${rows.filter(r => r.leavesStemsBoard).length} account(s) leave the Stems board and ${rows.filter(r => r.leavesSnippetBoard).length} the Snippets board, because prestige alone no longer lists a player:`);
for (const r of rows.filter(r => r.leavesStemsBoard || r.leavesSnippetBoard)) console.log(`  ${r.username} (prestige ${r.prestige}, stems ${r.stems}, snippets ${r.snippet})`);
console.log("Daily: entries already verified stay verified; only new wins are checked against the day's answer.");
