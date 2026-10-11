#!/bin/bash
cd "$(dirname "$0")"

echo "=================================="
echo "       Starting Yeatle"
echo "=================================="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed."
  echo "Install the LTS version from https://nodejs.org/en/download"
  echo
  read -r -p "Press Return to close this window..."
  exit 1
fi

node_version="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null)"
if [ -z "$node_version" ] || [ "$node_version" -lt 18 ]; then
  echo "Yeatle requires Node.js 18 or newer."
  echo "Please install Node.js 24 LTS or newer from https://nodejs.org/en/download"
  echo
  read -r -p "Press Return to close this window..."
  exit 1
fi

node server.js
status=$?
echo
if [ "$status" -ne 0 ]; then
  echo "Yeatle stopped with an error (exit code $status)."
  read -r -p "Press Return to close this window..."
fi
