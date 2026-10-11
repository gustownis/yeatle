#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node.js LTS from https://nodejs.org/en/download, then try again." >&2
  exit 1
fi
if ! node -e 'if (Number(process.versions.node.split(".")[0]) < 18) process.exit(1)'; then
  echo "This Node.js version is too old. Install Node.js 24 LTS or newer." >&2
  exit 1
fi
exec node server.js
