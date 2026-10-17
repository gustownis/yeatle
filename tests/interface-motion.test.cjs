const { test } = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const motion = import(pathToFileURL(path.join(__dirname, "../build/assets/interface-motion.mjs")).href);

test("interface motion uses resource hints, including capable phones, and defaults to instant controls", async () => {
  const { interfaceMotionAllowed } = await motion;
  for (const device of [
    { userAgent: "Android", deviceMemory: 8, hardwareConcurrency: 8 },
    { deviceMemory: 8, hardwareConcurrency: 12 },
    { hardwareConcurrency: 8 },
    { deviceMemory: 8 }
  ]) assert.equal(interfaceMotionAllowed(device), true);
  for (const device of [
    {}, null,
    { deviceMemory: 4, hardwareConcurrency: 8 },
    { deviceMemory: 8, hardwareConcurrency: 4 },
    { deviceMemory: 2, hardwareConcurrency: 2 },
    { deviceMemory: 8, hardwareConcurrency: 8, connection: { saveData: true } }
  ]) assert.equal(interfaceMotionAllowed(device), false);
});
