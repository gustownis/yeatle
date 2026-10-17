# 1.10.1 verification and manual checklist

Version 1.10.1 is based on 1.10.0. Automated PC checks and physical Android checks for playback and real microphone capture have passed. Singing, calibration, and the remaining hands-on checks are still pending. The user authorized release after the final checks on 17 October 2026. Unchecked items below remain documented limitations of the verification.

## Automated verification

- The unmodified 1.10.0 baseline passed all 48 existing tests on this PC.
- New regression checks cover microphone request ordering, an obsolete mic stream, lyrics timeouts and overlapping requests, saved lyrics winning a race, cancelling during microphone permission, cancellation before worker creation, audio connection cleanup, late screen locks, and vocal-analysis cancellation.
- The candidate passed **59/59 tests** on Windows with Node 24.15.0.
- An isolated Electron check loaded a 162.14-second HQ song with 443 notes and 23 phrases, played it, and verified pause/resume. After twelve restarts, only the current two playback gains and one microphone sink remained connected.
- A real 172.20-second recording completed WebGPU separation (15 segments) and karaoke chart generation: 396 notes, 19 phrases. Preparation took about 17.6 seconds in this local run. A second load used saved stems with no new worker. This is a functional check, not a controlled performance comparison.
- Synthetic audio input was accepted; video input returned `NotAllowedError`. The narrow desktop viewport had no horizontal overflow. This does not establish physical Android behavior or foreground animation performance.
- The unpacked Windows preview built successfully. Its packaged server, desktop permissions helper, karaoke page, and karaoke module match the local files. Both game/karaoke pages and their assets loaded from the package; microphone access succeeded and camera access was denied.
- The final renderer checks reported no uncaught errors. Synthetic microphone devices do not verify a real microphone, acoustic scoring accuracy, or headphone/Bluetooth latency. Online lyrics services were deliberately blocked for the real-audio check; folder lyrics and the no-online-lyrics path worked.

The public [cross-platform checks](https://github.com/gustownis/yeatle/actions/runs/39014716339) and [desktop builds](https://github.com/gustownis/yeatle/actions/runs/39014103284) record the automated test and packaging results. The [test suite](../tests) and [build workflow](../.github/workflows/desktop-builds.yml) are committed to this repository. Run `npm ci` and `npm test` from a checkout to run the automated tests.

Desktop UI, installer-runtime, and phone results in this document are observations recorded during local testing. Their raw logs, screenshots, and temporary diagnostic scripts were not published. The linked CI runs establish automated test and packaging results; they do not reproduce those local observations. Tests used separate data/browser profiles and did not alter real passwords or game progress.

## Manual PC checks

Download the published [Windows installer](https://github.com/gustownis/yeatle/releases/download/v1.10.1/Yeatle-Setup-1.10.1-windows-x64.exe) or [portable app](https://github.com/gustownis/yeatle/releases/download/v1.10.1/Yeatle-1.10.1-windows-x64-portable.exe). Developers can build a local copy with `npm ci` and `npm run pack`. Normal desktop launches use the usual Yeatle profile; the automated checks used isolated profiles.

The isolated UI check confirmed one visible setup slider by default, all four additional sliders available when expanded, saved values preserved, timing reset limited to its two delay values, and no horizontal overflow at a 390-pixel viewport. Stems/Snippets transitions completed, quick clicks kept the last selection, reduced motion bypassed animation, and navigation to/from Karaoke produced cross-document transitions. The new motion stylesheet left the game panel's measured width and height unchanged.

The final UI check also verified the settings dropdown opening and closing through intermediate heights. Simulated 2 GB hardware and reduced-motion preferences produce a zero-second transition. Motion is allowed when the browser reports more than 4 GB memory or more than four logical CPU threads, with neither a reported memory nor CPU limit below that threshold. Unknown capabilities and data saver disable the optional animation. The existing audio-memory policy is unchanged; a capable phone is not automatically classified as low-end for motion.

The panel regression was reproduced using a bright test background and captured paint frames: without a separate panel layer, green rose to 196/255 at an empty point inside the panel; with the fix, it stayed at 13–15/255 throughout sampled switches in both directions. This test changes only the isolated fixture's background. Real artwork, panel size, and saved game data are unchanged.

- [ ] Open Stems, Snippets, and Karaoke; confirm the song list loads and switching modes preserves the usual settings and progress.
- [ ] Allow a real microphone, change the input, and check the level meter. Add a second singer if a second input is available; remove them during setup.
- [ ] Sing an HQ stem song and an AI-split song. Check guide volume, music volume, vocal notes, lyrics, accuracy ratings, and the results screen by ear.
- [ ] Pause/resume, restart repeatedly, return to song selection, and cancel a loading song. Retry a song after a failed audio or microphone request.
- [ ] Run tap/clap calibration with the intended headphones. Confirm the saved delay and lyric timing survive a reload. Check Bluetooth separately if used.
- [ ] Check pasted LRC lyrics, local `lyrics.lrc`, unavailable online lyrics, and a preview-only song. Plain lyrics have approximate automatic timing.

## Android testing

The [silent physical-phone report](android-1.10.1-silent-test.md) and subsequent [audio report](android-1.10.1-audio-test.md) record successful Chrome Beta and Brave checks on 17 October 2026. Real microphone capture, HQ/AI playback, pause/restart, timed snippets, and the Real stems reveal passed. The ten-minute timeout and system volume were preserved. Scoring accuracy and calibration still require active participation.

Use the checked-out version through USB. Enable USB debugging on the phone and accept this PC's debugging prompt. Keep the phone unlocked for playback. Do not change browser security flags or expose the server to the LAN.

1. Run `node server.js` from the repository with `YEATLE_PORT=3095` and `YEATLE_DESKTOP=1` in that terminal's environment. Use a separate data directory with `YEATLE_DATA_DIR` if you want to keep test progress and settings separate.
2. With Android Platform-Tools, run `adb devices`, then `adb reverse tcp:3095 tcp:3095` for the connected test device. With multiple devices, select the intended one using `adb -s DEVICE_SERIAL ...`.
3. Open `http://localhost:3095/karaoke.html` in the phone browser. USB reversal reaches the PC's loopback server while keeping the phone's localhost origin suitable for microphone access. A plain HTTP LAN IP is unsuitable for karaoke.
4. Test Chrome and the browser normally used for Yeatle, with real microphone permission, headphones, foreground playback, and a screen-lock/return cycle.
5. When finished, run `adb reverse --remove tcp:3095` for the same device. Leave other debugging mappings and existing browser data alone.

- [x] Silent HQ full-song decoding, chart generation, and folder lyrics.
- [x] Silent AI separation and chart generation in Chrome Beta and Brave; saved-stem reload in Chrome and safe cache bypass in Brave.
- [x] Portrait layout, settings dropdown animation, and both tab-switch directions.
- [x] HQ/AI playback output, pause/resume, and results in both browsers.
- [x] Real microphone capture and speaker-mode echo reduction; old tracks close.
- [x] Three karaoke restarts, app mute, seek, and pause when leaving the browser tab.
- [ ] AI cancellation/retry and memory stability through several phone rounds.
- [ ] Native microphone permission prompts, device changes, real sung-note scoring, sensitivity, speaker mode, and tap/clap calibration.
- [ ] Portrait/landscape layout, long titles, scrolling, app switching, screen locking, and returning without unintentional playback.
- [x] Stems/Snippets playback, repeated 0.5 s clips, HQ track synchronization, Real stems reveal beyond the prepared segment, and return/retry in both browsers.

## Release preparation

The final local package check passed with release-version asset URLs and exact packaged file matches. The final motion test passed with no page errors, callback failures, or browser cancellations.

The temporary test runner now writes diagnostics to its own file and is launched with output redirected while waiting for completion. This prevents the `EPIPE` dialog caused by the earlier detached test process. Browser-native skipped transitions are recorded separately from callback failures and application errors. A diagnostic run disabling only cross-page animation confirmed that the earlier skip message came from native navigation; the final run passed with native cross-page animations enabled and no skipped transitions.

GitHub Checks passed on Windows, macOS, and Linux. Desktop build run [39014103284](https://github.com/gustownis/yeatle/actions/runs/39014103284) built Windows x64, macOS x64/ARM64, and Linux x64/ARM64 from commit `8b3b992`; all five jobs passed their tests and packaging. Later release documentation changes do not alter the packaged application.

All ten downloads passed binary-format and SHA-256 checks. The three updater feeds match the appropriate installer sizes and SHA-512 hashes. All fourteen uploaded draft assets match GitHub's reported sizes and SHA-256 digests. The README's download links were updated after these draft assets were verified.

The application archive was extracted from the actual GitHub-built Windows installer without installing it. Its packaged files match the release sources, both game pages load, synthetic audio input succeeds, camera access is denied, and no page errors were reported. These are local runtime observations, not additional CI checks. The published [release downloads](https://github.com/gustownis/yeatle/releases/tag/v1.10.1) and [SHA-256 checksums](https://github.com/gustownis/yeatle/releases/download/v1.10.1/SHA256SUMS.txt) are publicly available. The committed [release preparation script](../scripts/prepare-release.cjs) shows how checksums and updater feeds are generated.
