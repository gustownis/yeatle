# Linux verification: Yeatle 1.10.3

Tested on Linux x64 on 18 October 2026, following the [initial local checks](testing-linux-1.10.2.md). The release combines the published 1.10.2 karaoke changes with the earlier desktop-only navigation fix and Linux stem-loading fixes.

## Automated checks

- 78 tests passed on system Node.js 26.11.1 and Electron's bundled Node.js 24.21.0.
- Navigation checks cover rapid selections, an instant selection superseding a pending transition, a failing or missing transition API, reduced motion, and capability fallback.
- Karaoke lifecycle checks cover three scheduled count-in beeps, the negative playback clock before the music, pause/resume without duplicate sources, seeking without another count-in, and stopping all sources when quitting during the countdown.
- Server checks cover lowercase and mixed-case stem packs, valid file symlinks, broken links, directory symlinks, incomplete folders, encoded Unicode folder names, HEAD requests, conditional requests, suffix and invalid ranges, cache invalidation, and refreshing changed local packs while the tracker is unavailable. The symlink-only check is skipped on Windows because creating symlinks can require extra privileges.

Run the suite without installing desktop dependencies:

```sh
node --test --test-reporter=spec tests/*.test.cjs
```

## Standalone browsers

Chrome 155.0.8059.84 and Brave's Chromium 155.0.8059.85 each passed the optional [browser smoke check](../scripts/browser-smoke.cjs) with no page errors:

- Twenty rapid Stems/Snippets selections ended on the last selection, with zero animated mode-transition calls.
- Navigation to Karaoke used normal browser navigation and loaded the local "Lyfe stealer" HQ song.
- All four real MP3 stems were decoded and analyzed. The full 3-2-1/Go count-in completed and playback progress advanced.
- The saved volume survived navigation back to the guessing game and into Karaoke again.
- The 390-pixel layout did not overflow horizontally, and reduced motion was applied.

The script requires the optional `playwright-core` package and a Chromium-compatible browser. Set `YEATLE_TEST_BROWSER` to its executable; `YEATLE_PLAYWRIGHT_MODULE` can point to an existing Playwright Core installation. Set `YEATLE_TEST_STEMS` to an existing four-stem MP3 folder, or use the default `build/Songs/Lyfe stealer` folder. Each run creates a separate profile and data folder under `.tmp/browser-smoke-*`.

## Desktop checks

The [desktop smoke check](../scripts/desktop-smoke.cjs) uses the actual desktop entry point, a disposable profile, real HQ stems, muted output, and a synthetic microphone. It checks source/package file agreement, the desktop runtime flag, microphone/camera permissions, vocal analysis, countdown, pause/resume, five consecutive restarts during the count-in, and returning to song selection.

With the project's Electron dependencies installed for the host platform:

```sh
./node_modules/.bin/electron scripts/desktop-smoke.cjs
```

Set `YEATLE_TEST_APP_ROOT` to an unpacked application or its `resources/app.asar` to test the packaged entry point. The script verifies that the relevant packaged application files match this checkout before running. Test output and a screenshot are saved under `.tmp/desktop-smoke-*`.

The separate navigation window check also covers the black panel during transitions, narrow layout, repeated mode changes, reduced motion, a missing transition API, and a window without the desktop preload. It runs in Electron, separately from the standalone Chrome and Brave checks above.

## Limits

These checks do not establish physical microphone quality, audible output, human singing accuracy, tap/clap calibration, Bluetooth delay, screen-lock recovery, or long-session memory and heat behavior. Lyrics use a local timing fixture; live lyric-provider accuracy and a fresh complete AI-model separation were not exercised. ARM64 and macOS/Windows runtime behavior require their own devices; build and automated-test results do not replace those checks.
