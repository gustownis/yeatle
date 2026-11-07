// Checks catalog-metadata.json answer groups against a running Yeatle server with the
// real tracker: every member exists, and every member's dropdown name is accepted as
// the answer for every other member. Also lists the hidden state of each member.
// Run: node scripts/answer-groups-check.cjs [http://127.0.0.1:3093]
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { answerGroups = [], sameRecordings = [] } = require("../catalog-metadata.json");

const base = (process.argv[2] || "http://127.0.0.1:3093").replace(/\/$/, "");

(async () => {
  const { matchesSong, matchesVersion } = await import(pathToFileURL(path.join(__dirname, "..", "build", "assets", "snippet-rules.mjs")).href);
  const list = await (await fetch(`${base}/api/songs`)).json();
  const byId = new Map([...list.songs, ...list.retiredSongs || []].map(song => [song.id, song]));
  const failures = [];
  const missing = [];
  for (const same of sameRecordings) {
    const members = same.ids.map(id => byId.get(id));
    same.ids.forEach((id, i) => { if (!members[i]) missing.push(id); });
    for (const song of members.filter(Boolean)) {
      for (const other of members.filter(Boolean)) {
        if (!matchesSong(song, other.display)) failures.push(`${song.id} rejects same recording "${other.display}" (${other.id})`);
      }
    }
  }
  for (const group of answerGroups) {
    const members = group.ids.map(id => byId.get(id));
    group.ids.forEach((id, i) => { if (!members[i]) missing.push(id); });
    for (const song of members.filter(Boolean)) {
      for (const other of members.filter(Boolean)) {
        if (!matchesSong(song, other.display) && !matchesVersion(song, other.display)) {
          failures.push(`${song.id} rejects "${other.display}" (${other.id})`);
        }
      }
    }
  }
  for (const same of sameRecordings) {
    const ids = same.ids.filter(id => byId.has(id));
    const answers = new Set(ids.map(id => byId.get(id).answerId));
    if (answers.size > 1 || !answers.has(same.answerId)) failures.push(`${ids.join(" + ")} don't share answerId ${same.answerId}`);
  }
  // Members missing from /api/songs are hidden by an admin or not on the tracker.
  console.log(`${byId.size} songs; ${answerGroups.length} answer groups, ${sameRecordings.length} same-recording groups`);
  if (missing.length) console.log(`Not in the song list (hidden or gone): ${[...new Set(missing)].join(", ")}`);
  for (const failure of failures) console.log(`FAIL ${failure}`);
  console.log(failures.length ? `${failures.length} failures` : "All linked names match");
  process.exitCode = failures.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
