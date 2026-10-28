const { spawnSync } = require('node:child_process');
const { version } = require('../package.json');

// 1.12.0 -> 1.12, 1.12.1 zostaje 1.12.1
const shortVersion = version.replace(/\.0$/, '');

const result = spawnSync(
  process.execPath,
  [require.resolve('electron-builder/cli.js'), ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, YEATLE_VERSION: shortVersion } }
);
process.exit(result.status ?? 1);
