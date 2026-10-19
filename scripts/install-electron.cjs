const fs = require("node:fs");
const path = require("node:path");

// Electron 44 requires an explicit binary install. Browser-only installs may
// omit devDependencies, in which case no desktop runtime needs downloading.
const installer = path.join(__dirname, "..", "node_modules", "electron", "install.js");
if (fs.existsSync(installer)) require(installer);
