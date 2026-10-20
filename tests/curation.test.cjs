const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { mergeCuration } = require("../scripts/merge-curation.cjs");

test("a hosted copy keeps its admin changes when the repository's curation files change", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yeatle-curation-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dirs = Object.fromEntries(["base", "local", "target"].map(name => [name, path.join(root, name)]));
  Object.values(dirs).forEach(dir => fs.mkdirSync(dir));
  const write = (dir, name, data) => fs.writeFileSync(path.join(dirs[dir], name), JSON.stringify(data));
  const hidden = (...ids) => ({ hidden: ids.map(id => ({ id, name: id, key: `${id}|era` })) });
  write("base", "hidden-songs.json", hidden("a", "b"));
  write("local", "hidden-songs.json", hidden("a", "web"));          // website hid "web", unhid "b"
  write("target", "hidden-songs.json", hidden("a", "b", "repo"));   // repository hid "repo"
  write("base", "song-renames.json", { renames: { x: "Old", y: "Same" } });
  write("local", "song-renames.json", { renames: { x: "Website name", y: "Same" } });
  write("target", "song-renames.json", { renames: { x: "Old", y: "Same", z: "Repo name" } });
  const changed = mergeCuration(dirs.base, dirs.local, dirs.target);
  const read = name => JSON.parse(fs.readFileSync(path.join(dirs.target, name), "utf8"));
  assert.deepEqual(read("hidden-songs.json").hidden.map(entry => entry.id).sort(), ["a", "repo", "web"]);
  assert.deepEqual(read("song-renames.json").renames, { x: "Website name", y: "Same", z: "Repo name" });
  assert.deepEqual(changed.sort(), ["hidden-songs.json", "song-renames.json"]);
  // Files the website never edited are left exactly as the repository has them.
  assert.equal(fs.existsSync(path.join(dirs.target, "song-edits.json")), false);
});
