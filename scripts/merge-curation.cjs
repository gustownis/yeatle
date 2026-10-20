// Three-way merge of the admin curation files for a hosted copy that also updates from Git.
//   node scripts/merge-curation.cjs BASE_DIR LOCAL_DIR TARGET_DIR
// BASE_DIR holds the files as the previous commit had them, LOCAL_DIR the copies the
// running admin panel saved, and TARGET_DIR the files from the newly merged commit.
// The website's own admin changes win; everything else follows the repository.
const fs = require("node:fs");
const path = require("node:path");

const FILES = {
  "hidden-songs.json": { field: "hidden", key: entry => entry && entry.id },
  "song-splits.json": { field: "splits", key: entry => entry && `${entry.title}|${entry.era}|${entry.trackerKey || ""}` },
  "song-renames.json": { field: "renames" },
  "song-edits.json": { field: "edits" }
};

const read = file => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function mergeMaps(base, local, upstream) {
  const result = { ...upstream };
  for (const [key, value] of Object.entries(local)) if (!same(value, base[key])) result[key] = value;
  for (const key of Object.keys(base)) if (!(key in local)) delete result[key];
  return result;
}

function mergeLists(base, local, upstream, key) {
  const map = list => new Map(list.filter(entry => key(entry)).map(entry => [key(entry), entry]));
  const merged = mergeMaps(Object.fromEntries(map(base)), Object.fromEntries(map(local)), Object.fromEntries(map(upstream)));
  return Object.values(merged);
}

function mergeCuration(baseDir, localDir, targetDir) {
  const changed = [];
  for (const [name, { field, key }] of Object.entries(FILES)) {
    const local = read(path.join(localDir, name));
    if (!local) continue; // nothing saved locally for this file
    const base = read(path.join(baseDir, name)) || {};
    const upstream = read(path.join(targetDir, name)) || {};
    const pick = (data, empty) => (data && data[field]) || empty;
    const value = key
      ? mergeLists(pick(base, []), pick(local, []), pick(upstream, []), key)
      : mergeMaps(pick(base, {}), pick(local, {}), pick(upstream, {}));
    const next = { ...upstream, [field]: value };
    // leave files without local changes exactly as the repository has them
    if (same(next, upstream)) continue;
    changed.push(name);
    const target = path.join(targetDir, name);
    fs.writeFileSync(`${target}.tmp`, JSON.stringify(next, null, 2) + "\n");
    fs.renameSync(`${target}.tmp`, target);
  }
  return changed;
}

if (require.main === module) {
  const [base, local, target] = process.argv.slice(2);
  if (!base || !local || !target) {
    console.error("Usage: node scripts/merge-curation.cjs BASE_DIR LOCAL_DIR TARGET_DIR");
    process.exitCode = 1;
  } else {
    const changed = mergeCuration(path.resolve(base), path.resolve(local), path.resolve(target));
    console.log(changed.length ? `Kept this website's admin changes in ${changed.join(", ")}.` : "No admin changes to keep.");
  }
}

module.exports = { mergeCuration };
