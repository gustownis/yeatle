const { spawnSync } = require('node:child_process');
const { version } = require('../package.json');

// Installer names keep all three numbers (1.13.0): installed apps' updaters and
// scripts/prepare-release.cjs look for exactly those names. Release titles, notes and the
// README say "1.13" instead; see AGENTS.md.
const result = spawnSync(
  process.execPath,
  [require.resolve('electron-builder/cli.js'), ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, YEATLE_VERSION: version } }
);
process.exit(result.status ?? 1);
