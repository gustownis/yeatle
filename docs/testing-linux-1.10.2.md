# Linux verification: 1.10.2 with local fixes

Verified on Linux x64 on 18 October 2026. The checkout is based on the
published `v1.10.2` commit, `46bf90f5240d840fa82c45f749bdafec4958d6e2`.
The desktop navigation fix comes from the earlier local draft,
`6af49b18af325172e3c43b8171661f62aabf4f99`.

## Local changes

- Enable mode transitions only in desktop windows identified by the preload.
  Browser mode changes apply immediately; the settings dropdown retains its
  existing capability and reduced-motion checks.
- Detect and serve capitalized stem filenames on case-sensitive filesystems.
  Existing packs such as `Drums.mp3`, `Bass.mp3`, `Other.mp3`, and `Vocals.mp3`
  work without renaming. Lowercase filenames, byte ranges, and symbolic links
  continue to work. Incomplete folders are not listed as HQ stems.

These checks describe the local draft before publication. The fixes are included
in [Yeatle 1.10.3](releases/1.10.3.md); the AppImage below remains the earlier
local 1.10.2 test package.

## Results

| Check | Result |
| --- | --- |
| Automated suite on system Node.js 26.11.1 | 65 passed, 0 failed |
| Automated suite on bundled Node.js 24.21.0 | 65 passed, 0 failed |
| Desktop navigation in Electron 44.7.0 | Passed |
| Window without the desktop preload | Immediate mode changes; no page transitions |
| Rapid mode changes, reduced motion, capability fallback | Passed |
| Dark panel during transitions, settings dropdown, narrow layout | Passed |
| Packaged application startup and source-file comparison | Passed |
| Final AppImage launched through FUSE on the Wayland desktop | Passed; all three tabs loaded; clean exit |
| Local HQ song detection and actual MP3 decoding | Passed |
| Vocal analysis, note lane, 3-2-1 countdown and restart | Passed |
| Pause, resume, and return to song selection | Passed |
| Synthetic microphone allowed; camera denied | Passed |

The packaged playback check used all four original stems of the local
"Lyfe stealer" song (about 162 seconds). Both music and guide buffers contained
nonzero samples and were scheduled after the count-in; playback progress
advanced. The full song was decoded and analyzed, but the check played only
its opening, then exercised pause, resume, restart, and quit.

Playback was muted. Real microphone capture, audible output, singing accuracy,
calibration, live lyric providers, and a full AI-model separation session have
not been verified by these Linux checks. The separate browser-policy window
also ran in Electron; this is not a standalone Firefox or Chrome test.

## Running the checks

The unit and server tests need Node.js, without installing npm dependencies:

```sh
node --test --test-reporter=spec tests/*.test.cjs
```

For the desktop check, install the project's Electron dependencies on Linux
first, then run:

```sh
./node_modules/.bin/electron scripts/desktop-smoke.cjs
```

The script uses a disposable profile, synthetic microphone, muted playback,
and the existing `build/Songs/Lyfe stealer` stems. Set `YEATLE_TEST_STEMS` to
use a different folder containing four real MP3 stems. Reports and a screenshot
are written under `.tmp/desktop-smoke-*`.

Set `YEATLE_TEST_APP_ROOT` to an unpacked application or its `resources/app.asar`
to verify the packaged entry point as well. The script compares the changed
application files against this checkout before starting it.

## Local AppImage

The fixed x64 package is saved locally as
`release/Yeatle-1.10.2-linux-x64-desktop-fix.AppImage`.
It reuses the published Linux Electron runtime and production dependencies,
with the changed application files repacked into `app.asar`.
The outer AppImage launcher comes from the downloaded appimagetool package
to support its SquashFS compression. This was a local repack, not a fresh
`npm run dist:linux` build. A separate checksum file accompanies the result.

Run it from the project folder:

```sh
./release/Yeatle-1.10.2-linux-x64-desktop-fix.AppImage
```

The fixed AppImage's SHA-256 is:

```text
0d86ceae5f6d86df5edbbf0ca2aa152d6f9e4b661eaf3780b2de2d0f679ef3f3
```

The original downloaded AppImage was preserved and its SHA-256 matched the
GitHub release digest:

```text
3fccec51cdd4efd56fe3649df700b874f8f32df2d37fcd604387bab31bf20bde
```

Only Linux x64 was exercised. ARM64, DEB installation, Windows, macOS, and
installation of future updates were not tested in this run.
