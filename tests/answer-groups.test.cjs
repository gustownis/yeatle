const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { guessKeys, answerGroupFor, groupAnswerKeys, applyCatalogMetadata } = require("../catalog-policy.cjs");
const { answerGroups, sameRecordings } = require("../catalog-metadata.json");
// Tracker records for every group member as the live catalog built them on 2026-11-01.
const records = require("./fixtures/answer-groups.json");

const rules = () => import(pathToFileURL(path.join(__dirname, "..", "build", "assets", "snippet-rules.mjs")).href);
const byId = new Map(records.map(song => [song.id, song]));

// What the server's publicSong sends: corrected metadata plus the group's names.
function publicSong(song, acceptedKeys) {
  song = applyCatalogMetadata(song);
  const group = answerGroupFor(song.id);
  if (!group) return song;
  return { ...song, answerKeys: [...new Set([...song.answerKeys || [], ...groupAnswerKeys(group, id => byId.get(id), acceptedKeys)])] };
}

test("a featured song's aliases also answer with the lead artist in front", async () => {
  const { matchesSong } = await rules();
  const keys = guessKeys({ title: "Yung Bans - YEA X2", features: ["feat. Yeat"], aliases: ["Yea Yea", "They Ask"] });
  assert.ok(keys.includes("yungbansyeayea"));
  assert.ok(keys.includes("yeayea"));
  const song = { title: "Yung Bans - YEA X2", display: "Yung Bans - YEA X2 (feat. Yeat)", features: ["feat. Yeat"], keys };
  assert.ok(matchesSong(song, "Yung Bans - Yea Yea (feat. Yeat)"));
  assert.ok(matchesSong(song, "Yung Bans - They Ask"));
  // An alias that already names the artist isn't doubled.
  assert.ok(!guessKeys({ title: "Drake - IDGAF", aliases: ["Drake - Idgaf freestyle"] }).includes("drakedrakeidgaffreestyle"));
  // Solo titles keep their aliases unchanged.
  assert.deepEqual(guessKeys({ title: "Yea!", aliases: ["Yea Yea"] }), ["yea", "yeayea"]);
});

test("every member of a linked group accepts every member's dropdown name", async () => {
  const { matchesSong, acceptedKeys } = await rules();
  for (const group of [...answerGroups, ...sameRecordings]) {
    for (const id of group.ids) {
      const song = publicSong(byId.get(id), acceptedKeys);
      for (const other of group.ids.map(member => applyCatalogMetadata(byId.get(member)))) {
        assert.ok(matchesSong(song, other.display), `${id} accepts "${other.display}"`);
      }
    }
  }
});

test("today's Daily Yea! accepts both Yung Bans features, and they accept it", async () => {
  const { matchesSong, acceptedKeys } = await rules();
  const yea = publicSong(byId.get("yea"), acceptedKeys);
  for (const name of ["Yung Bans - Yea Yea (feat. Yeat)", "Yung Bans - YEA X2 (feat. Yeat)", "Yea!", "Yea Yea"]) assert.ok(matchesSong(yea, name), name);
  assert.ok(matchesSong(publicSong(byId.get("yungbansyeayea"), acceptedKeys), "Yea!"));
  // The guess still has to name a song in the group.
  assert.ok(!matchesSong(yea, "Yung Bans - Deep Blue (feat. Yeat)"));
  assert.ok(matchesSong(publicSong(byId.get("yungkayoyeet"), acceptedKeys), "Yung Kayo - fleek (feat. Yeat)"));
});

test("answer groups don't overlap", () => {
  const seen = new Map();
  for (const group of answerGroups) {
    assert.ok(group.ids.length >= 2 && group.basis, JSON.stringify(group.ids));
    for (const id of group.ids) {
      assert.ok(!seen.has(id), `${id} is in two answer groups`);
      seen.set(id, group);
    }
  }
  for (const same of sameRecordings) {
    assert.ok(same.answerId && same.basis && same.ids.includes(same.answerId));
    const holders = new Set(same.ids.map(id => seen.get(id)));
    assert.ok(holders.size === 1, `${same.ids} are all in one answer group or in none`);
  }
});

test("same recordings share one answer and their progress; open verses stay separate", () => {
  const pair = ["jealousy", "jelousy"].map(id => applyCatalogMetadata(byId.get(id)));
  assert.equal(pair[0].answerId, pair[1].answerId);
  assert.deepEqual(pair[0].equivalentIds, ["jelousy"]);
  const krank = ["krank", "krank@edit-e5a02f262fbf"].map(id => applyCatalogMetadata(byId.get(id)));
  assert.equal(krank[0].answerId, "krank");
  assert.equal(krank[1].answerId, "krank");
  assert.equal(krank[0].display, "Krank");
  const demo = applyCatalogMetadata(byId.get("yea"));
  assert.equal(demo.answerId, undefined);
  assert.equal(demo.equivalentIds, undefined);
});
