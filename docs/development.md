# Development and desktop builds

## Local setup and tests

Install **Node.js 24 LTS** (Node.js 22+ is the minimum supported version), clone the repository, and run commands from the repository root:

```sh
npm ci
npm test
npm run desktop
```

In Windows PowerShell, use `npm.cmd` instead of `npm` if execution policy blocks `npm.ps1`. Browser-only play (`node server.js` or `npm start`) does not need `npm ci`.

`npm ci` installs `electron` and `electron-builder`, and runs `postinstall` (`scripts/install-electron.cjs`) to install the Electron binary for the current OS. Do not reuse a `node_modules/` folder across Windows, macOS, and Linux; reinstall with `npm ci` when switching platforms.

### Smoke checks

Several targeted verification scripts live in `scripts/` (requiring Playwright/Chromium, Electron, or `ffmpeg` depending on the script):

- `scripts/browser-smoke.cjs` — browser playback, audio separation, and layout checks.
- `scripts/desktop-smoke.cjs` — Electron startup, Daily persistence, Karaoke UI, and menu checks.
- `scripts/desktop-stems-smoke.cjs` — HQ stem downloads inside the desktop app.
- `scripts/karaoke-skip-smoke.cjs` — Karaoke White people mode with a synthetic microphone.
- `scripts/bans-browser-smoke.cjs` — banned notice screen, leaderboard button, and admin panel UI.
- `scripts/snippet-rounds-smoke.cjs` — server-picked Snippets rounds (requires `ffmpeg` and Playwright).
- `scripts/answer-groups-check.cjs` — checks `data/catalog-metadata.json` answer groups against a running server (`node scripts/answer-groups-check.cjs http://127.0.0.1:3093`).
- `scripts/test-1.11.cjs` — launches an isolated test instance (`--desktop` for desktop mode, `--check` for a dry environment check).

## Building desktop packages

Build on the matching operating system (`release/` outputs are gitignored):

```sh
npm run dist:win -- --x64
npm run dist:mac -- --arm64
npm run dist:mac -- --x64
npm run dist:linux -- --x64
npm run dist:linux -- --arm64
```

`npm run pack` creates an unpacked build in `release/` for quick local testing. Windows builds output an NSIS installer and a portable executable; macOS outputs `.dmg` and `.zip`; Linux outputs `.AppImage` and `.deb`. These local and CI builds are unsigned unless separate signing/notarization credentials are configured.

In GitHub, **Actions → Desktop builds → Run workflow** builds all five targets and keeps artifacts for 14 days without publishing a release unless requested.

## Publishing a release

1. Bump the three-part semver in `package.json`, `package-lock.json`, and `?v=` asset query strings in `build/`.
2. Add release notes at `docs/releases/X.Y.md` using a two-part heading (`# Yeatle X.Y`, omitting `.0` for `.0` releases). Keep paragraphs on single lines so GitHub renders them without forced breaks.
3. Run the **Desktop builds** GitHub workflow with **release** ticked. It runs `npm test`, builds all five targets, runs `scripts/prepare-release.cjs` to generate `SHA256SUMS.txt` and `latest*.yml` updater feeds, and creates a draft release tagged `vX.Y.Z` with all 14 assets.
4. Run **Desktop builds** again with **publish** ticked to promote the draft to Latest, then update the download links in [README.md](../README.md).

Three-part version numbers (`v1.13.11`, `Yeatle-Setup-1.13.11-windows-x64.exe`) are required on tags and installer filenames so installed desktop updaters recognize them. To assemble release metadata locally from downloaded CI artifacts instead, run:

```sh
npm run prepare:release -- 1.13.11 release/github-builds-1.13.11 release/update-metadata-1.13.11
```

To fix notes on an already published release, edit its `docs/releases/*.md` file, push, and run **Desktop builds** with **notes** set to the tag (e.g., `v1.13.11`).

## Note on the frontend `source/` folder

The working frontend lives in tracked `build/` files (`build/index.html`, `build/assets/`, `build/ort/`), which `server.js` and Electron package directly. The `source/` directory contains the original Vite config and lockfile without `source/src/` (`main.jsx` and components were not supplied) and has no source maps, so `npm run build` inside `source/` fails unless the original React source is restored. See [source/README.md](../source/README.md) for rebuild steps if you have those files.
