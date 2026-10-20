# Yeatle 1.11 test handoff

This handoff started with **1.11.0-test.1**, based on main commit `db3730a` /
regular release 1.10.3. Stable **1.11.0** and its **1.11.1** UI patch are published;
see the [1.11.1 verification report](../docs/testing-windows-1.11.1.md).
Dated results below retain their original test versions. Read
this file and root `AGENTS.md` before continuing on another OS.

## Intended behavior

- Snippets has **Base** first, above Easy/Medium/Hard/Extreme. New profiles
  default to Base; an existing difficulty stays selected. The six clips are
  **0.1, 0.5, 1, 3, 7, 15 seconds**. Base has its own practice statistics.
- **Daily** is available from the game and Karaoke. One song and seeded clip
  per UTC date, independent of difficulty, eras, pool, and admin activation.
  Wrong guesses and skips use one try. Six tries, no hints or rerolls.
- Results and unfinished attempts survive reloads in that browser/profile.
  Daily does not change practice statistics. Sharing produces text and squares
  without the answer; phones use the share sheet when supported, with clipboard
  or selectable-text fallback. There is no Discord embed work.
- Daily uses the existing desktop transitions when navigating to/from Stems,
  Snippets, and Karaoke. Browser navigation stays immediate, and reduced motion
  disables the desktop animation.
- Reset is **00:00 UTC** (02:00 in Poland during summer time, 01:00 during winter
  time). An open tab changes to the new challenge; the server supplies the clock.
- Normal desktop and browser servers request Daily from the public website:
  **https://playyeatle.duckdns.org**. Its UTC date, song, explicit clip start,
  audio, and reset time are authoritative even if local libraries and clocks
  differ. Each local server proxies the host's audio, avoiding browser CORS
  differences. Shared result links point back to the public website.
- The isolated test launcher explicitly selects **Local test**, so development
  works before the public host is updated. This is labelled on screen and
  shares only within that test server. Configure its `dailyAuthority` with the
  public host or a second test host to exercise global client behavior. A failed
  shared host never silently falls back to a local/random song.

## Shared daily host setup (required before public launch)

The public website operator must deploy the full 1.11 files, add these settings
to the host's private `config.json`, and restart its single server process:

```json
{
  "dailyAuthority": "",
  "dailyPublicUrl": "https://playyeatle.duckdns.org/daily"
}
```

Merge these keys into existing settings; do not replace the rest of the file.
Clients keep the default `dailyAuthority` of
`https://playyeatle.duckdns.org`. This ensures a host chooses and pins the day,
while every app fetches that choice. A proxy-loop check reports a configuration
error if the host mistakenly points back at itself. Until this deployment,
normal shared Daily reports unavailable and the isolated Local test still works.
Verify the public site after deployment; updating a checkout alone does not
establish that its running server or authoritative configuration changed.

For an entirely local authority test, start one server with `dailyAuthority: ""`
and configure other servers' `dailyAuthority` to its origin, such as
`http://127.0.0.1:3193`. Use separate ports for each server. The automated suite
does this with different client libraries and verifies identical audio bytes.

## Where the songs come from

No new music pack is bundled or downloaded by this change. The existing server
reads the configured Yeat tracker, resolves its audio links, uses Apple's
30-second previews when necessary, and reads optional local four-stem packs.
The existing saved song list works when the tracker is unavailable. A fresh
offline machine needs its own local pack or a copied private song cache.

The authoritative host chooses from its visible library and pins the complete song/source
snapshot in **daily-challenges.json** in its data folder, keeping 32 UTC dates.
Tracker refreshes, ordering, admin renames, added songs, and restarts cannot
reroll an already pinned day. A hidden pinned song is withdrawn for the day.
Broken audio offers a retry of the same song and consumes no attempt. There is
no automatic substitution. Clients reuse the host response for up to 30 seconds,
never past its supplied reset time. They do not choose from their local libraries.
Remote audio hosts can still fail; a curated, checked daily
library is the next deployment improvement if these links prove unreliable.
For multiple website processes, use a single authoritative daily server/store;
the current file store is designed for one server process, not concurrent replicas.

Daily prefers one full/preview audio source where available. Otherwise it mixes
the host's four existing local stems. Every client uses the explicit host-chosen
clip start between 5 and 10 seconds; it does not derive it from browser-decoded
duration. Audio must extend 15 seconds beyond that start. It uses Web Audio scheduled playback for exact
short clips without AI separation or model downloads. First playback loads and
decodes the song, so phone memory and network behavior need physical testing.
Do not commit music, private caches, settings, or the daily store.

## Start on Windows or Linux

Use Node.js 24, from the repository root:

```sh
npm test
npm run test:1.11
```

The browser test opens **http://127.0.0.1:3193** and keeps its data in
`.tmp/test-1.11/browser/`. Stop with Ctrl+C. The launcher seeds public metadata
and any existing private song cache once; it leaves normal game settings alone.
It uses existing `build/Songs/` files without copying them. To use a different
stem pack, set `YEATLE_STEMS_DIR` to that pack's Songs folder before starting.
`npm run test:1.11 -- --check` only prepares the test folder and writes a
`session.json` with the actual OS, version, and runtime; it does not test gameplay.

For the desktop test, install dependencies **on the OS being tested**:

```sh
npm ci
npm run test:1.11 -- --desktop
```

This uses `.tmp/test-1.11/desktop/` for both settings and Electron's profile,
and port **3194**. Exit any other desktop copy first because of the existing
single-instance lock. On Windows PowerShell, use `npm.cmd` if necessary.
Do not share `node_modules` between Windows and Linux. Browser play and the
automated suite need no dependency installation. Use the test launcher again
after edits; it deliberately preserves your test progress. Use a fresh browser
profile if you need another attempt, without deleting normal game data.

For scripted fixtures, `YEATLE_TEST_DATA_DIR` selects another disposable data
folder (and the desktop profile). The default folders above remain unchanged.
The launcher still uses the existing stem pack selected by `YEATLE_STEMS_DIR`.
Do not point the test override at normal game data.

## Optional automated renderer checks

After `npm ci`, these use real local MP3 stems and disposable profiles:

```sh
YEATLE_SMOKE_SHOW=1 node_modules/.bin/electron scripts/daily-smoke.cjs
YEATLE_SMOKE_SHOW=1 node_modules/.bin/electron scripts/desktop-smoke.cjs
```

The visible-window option is needed on the tested Linux Wayland compositor;
hidden windows can stop advancing renderer frames. It also allows the desktop
check to hide/show the actual window and verify Daily stops and replays.
In PowerShell, set `$env:YEATLE_SMOKE_SHOW = "1"` before running Electron.
Use the Windows command wrapper so PowerShell waits for completion and keeps
the diagnostic output connected:

```powershell
$env:YEATLE_SMOKE_SHOW = "1"
& .\node_modules\.bin\electron.cmd scripts/daily-smoke.cjs
& .\node_modules\.bin\electron.cmd scripts/desktop-smoke.cjs
```

`scripts/daily-browser-smoke.cjs` checks a running isolated launcher using an
optional `playwright-core` installation and a Chromium browser. Set
`YEATLE_PLAYWRIGHT_MODULE` to its installed module path,
`YEATLE_TEST_BROWSER` to the browser executable, and optionally
`YEATLE_TEST_URL` (default `http://127.0.0.1:3193`). Run it with Node.js 24.
For repeatable offline results, use a disposable launcher folder with
`dailyAuthority: ""`, `tabs: []`, and an existing playable local stem pack;
keep any seeded cache limited to that fixture's songs. The check tests Base,
Daily persistence/sharing/navigation, failed audio, two independent shared
clients, four-stem and single-file proxy audio, and fixture-clock UTC rollover.
Clipboard API stubs and narrow viewports do not replace physical Android checks.

`node scripts/daily-ui-smoke.cjs` uses the same optional browser dependencies to
check Daily suggestions with mouse/keyboard/emulated touch, purple styling,
portrait phone/tablet logos across all modes, copy-only results, and selectable
clipboard fallback. These emulated input/layout checks do not replace a physical phone pass.

## Physical Android, using the same server

Start the browser test on either PC, connect the phone by USB, enable USB
debugging, and authorize that PC on the phone. With Android platform tools:

```sh
adb devices
adb reverse tcp:3193 tcp:3193
```

Open **http://127.0.0.1:3193/daily** in Android Chrome (then your preferred
browser). The PC serves the same pinned daily challenge to the phone. There is
no Android APK in this project. Desktop's Open in Browser uses 3194 instead;
reverse that port if comparing against its server. Keep the PC/server awake.
Remove the test mapping afterwards with `adb reverse --remove tcp:3193`.

## Manual checklist for each OS/device

1. Open Snippets. Verify Base is first and progresses through all six lengths.
   Try Easy and return; ensure saved old difficulty and other modes still work.
2. Open Daily. Compare its UTC date/song/clip across two clients on the same
   server. Change practice eras/difficulty, refresh tracker, and restart server;
   verify Daily does not change. Do not expose the answer until testing sharing.
3. Listen to 0.1s several times. Try a wrong guess, skip, and correct guess.
   Reload mid-round and after completion; ensure attempts and result remain.
   Finish a second test profile with six misses to check loss handling.
4. Compare the shared text: correct date, six squares, time/score, usable link,
   no answer. Test Copy result, clipboard denial, and selectable-text fallback.
   Localhost share links are only useful on the same local/reversed server;
   hosted share links become public after a deployment.
5. Test airplane mode/failed audio then retry: no attempt should be consumed,
   no alternate song selected. Background and resume: sound must stop while
   hidden; replay must work. Test page navigation while audio is loading.
6. Test UTC rollover in a **disposable** fixture/server using the injected clock
   in the daily unit tests. Do not change the production PC clock or edit its
   pinned store. An actual overnight open-tab check remains a device check.
7. On Android check portrait at 360/390 px, keyboard/autocomplete, volume,
   tap-to-play after backgrounding, speaker/Bluetooth output, memory/heat, and
   link sharing. Desktop viewport emulation does not establish these results.
8. Regression: Stems (Light and Real), existing snippet difficulties, Karaoke,
   normal navigation, and desktop Open in Browser.

## Implementation map and continuation instructions

- `build/assets/snippet-rules.mjs`: shared Base lengths, answer normalization,
  saved-round validation, and share formatter.
- `daily-challenge.cjs`: UTC selection and persisted snapshots. `server.js`:
  `/api/daily` and pinned `/api/daily/audio`. Keep the daily store ignored.
- `daily-authority.cjs`: canonical host validation and coalesced client requests;
  the local server proxies its exact audio. No local fallback in shared mode.
- `build/daily.html`, `build/assets/daily.mjs`, `build/assets/daily.css`: editable
  daily screen. It is separate from the imported compiled React bundle.
- `build/assets/yeatle.js`: small guarded edits for Base, separate stats, Daily
  navigation, and `?mode=snippet|stems`. Do not run Vite or replace `build/`;
  original React source is missing. See `source/README.md`.
- `scripts/test-1.11.cjs`: isolated launcher. `YEATLE_TEST_PROFILE` selects a
  test desktop profile; `YEATLE_STEMS_DIR` reuses an external stem library.
- `tests/daily.test.cjs`: deterministic/offline rules and API checks.
- `scripts/daily-smoke.cjs`: actual Electron renderer check with local MP3
  stems, short-clip scheduling, persistence, sharing, and narrow layout.

Before editing, inspect Git status/diffs and sync safely per root `AGENTS.md`.
Keep commits scoped, rerun `npm test`, and record actual OS/device results in
`test-1.11/RESULTS.md`. Do not mark Linux or Android passed from Windows tests.
Testing alone does not authorize publication or deployment. Follow the current
user's explicit release authorization and require the release checks to pass.

To move uncommitted changes to Linux, transfer the changed tracked files plus
new files listed by `git status`, or commit this work to a shared test branch
and fetch that branch on Linux. The private `.tmp/` data is optional and should
stay out of Git. Nothing is available to another PC through Git until pushed.
