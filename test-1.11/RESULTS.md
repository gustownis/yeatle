# 1.11 verification

## Windows x64 — 19 October 2026

Started from `db3730a` on `main`. Fetched origin/tags and confirmed zero commits
ahead/behind `origin/main`. The latest regular GitHub release was `v1.10.3`.
This working version is `1.11.0-test.1`; no release or website deployment was
published and these changes have not been committed or pushed.

- `npm test`: **86 passed, 1 skipped, 0 failed**, on Node.js 24.15.0.
  The skipped case is the existing filesystem symlink check on Windows.
  The first sandboxed attempt could not connect to its loopback test servers
  or rename temporary files; the full suite passed outside that sandbox.
- Daily API tests used two independent clients with different local libraries
  against one fixture authority. Both received the same ID, song, explicit
  clip start, seed, reset, and audio bytes. An unavailable host returned an
  error without selecting a local substitute.
- `scripts/daily-smoke.cjs` passed in **Electron 44.7.0 / Chromium 152.0.7977.130**
  on Windows, using real local Lyfe stealer MP3 stems and muted output. It
  verified Base as the first/default option, all six lengths, preservation of
  an existing Hard preference, and the Daily navigation entry.
- The daily renderer decoded all four real stems and scheduled them together
  for exactly 0.1 seconds at the host's explicit clip start. Wrong guesses,
  skips, winning, six-skip loss, unfinished-round reload, completed-result
  reload, and spoiler-free share text passed. The 390 px viewport had no
  horizontal overflow. Desktop and narrow screenshots were visually inspected.
- `scripts/desktop-smoke.cjs` passed against the actual desktop entry point:
  four tabs, desktop navigation identity, microphone permission rules, real HQ
  stem decoding/vocal analysis, Karaoke count-in, pause/resume, five restarts
  during count-in, and returning to song selection. Synthetic microphone,
  muted output, disposable settings/profile.
- `npm run test:1.11 -- --check` prepared the isolated browser test profile;
  syntax checks and `git diff --check` passed. Lockfile changes only update the
  application version; dependencies were already installed for Windows.

Local diagnostic reports and screenshots live in ignored `.tmp/`:

- `daily-smoke-1792413785763/result.json`
- `daily-smoke-1792413785763/daily-desktop.png`
- `daily-smoke-1792413785763/daily-390.png`
- `desktop-smoke-1792413817769/result.json`

The source ZIP in `release/` is a portable source test package, not a built
Linux application or APK. It excludes music, credentials, settings, caches,
models, node_modules, and the Git database. Extract it to a new folder and read
`test-1.11/README.md`. A Git checkout is preferable for subsequent collaboration;
an extracted ZIP has no branch/upstream to synchronize.

## Linux x64 — 19 October 2026

Continued the uncommitted Windows implementation on CachyOS Linux x64,
kernel `7.2.9-2-cachyos`, KDE/Wayland. Fetched origin/tags: `main` and
`origin/main` still point to `db3730a`, zero commits ahead/behind. GitHub's
latest regular release is still `v1.10.3`. The working version remains
`1.11.0-test.1`. No commit, push, release, package publication, or deployment
was made. An ignored backup of all 23 incoming changed/new files was saved
before edits; unrelated incoming edits were retained.

### Fixes made during Linux testing

- Changing the practice song pool while retaining the same song destroyed its
  player without recreating it, leaving Play disabled. Starting/restoring a
  round now advances the existing player generation even for the same song.
  The browser regression reproduces this with a one-song stem library before
  playing all six Base clips.
- Practice and Daily now share answer validation and no longer accept a
  featured-artist label alone as the answer. Song
  titles, display names, and server-provided title aliases still work.
  Truncated/corrupt saved losses are also rejected instead of showing a result
  with fewer than six attempts. Both have rule-test assertions.
- Electron 44's npm package did not install a desktop executable from `npm ci`
  alone. Root `postinstall` now invokes its explicit binary installer. A second
  root `npm ci` confirmed that the Linux ELF executable is installed. The
  lockfile keeps the existing dependency versions and adds the root install
  script metadata. The installer skips the desktop step when devDependencies
  are absent, as in a browser-only installation.
- Test tools gained `YEATLE_TEST_DATA_DIR` for disposable launcher fixtures,
  a visible-window option, an extended desktop Daily check, and the optional
  `scripts/daily-browser-smoke.cjs` check. The default launcher data locations
  and ports are preserved.

### Checks actually run

- Used **Node.js 24.19.0 / npm 11.6.2**, with an isolated npm/runtime path under
  `.tmp/linux-1.11/`; the system Node.js 26 installation was not used for the
  checks. Root dependencies were reinstalled for Linux with `npm ci`.
- `npm test`: **87 passed, 0 skipped, 0 failed**. The Linux symlink check ran.
  The first restricted-sandbox run failed in the two local-server test files;
  the rerun with local HTTP server access passed the complete suite.
- Ran both documented launchers: browser on **3193**, desktop on **3194**.
  Repeatable gameplay used disposable overrides under
  `.tmp/linux-1.11/browser-fixture/` and `desktop-fixture/`, explicit
  `dailyAuthority: ""`, no tracker tabs, and the existing real MP3 stem pack.
  The earlier browser test config was restored byte for byte. An independent
  Chrome profile also decoded/replayed Daily from the desktop launcher's 3194
  server. Normal game settings and music were not used as writable test data.
- **Chrome 155.0.8059.84** passed `scripts/browser-smoke.cjs` and the extended
  Daily browser check: Base first/default, all six actual playback lengths,
  measured media positions for all four stems (including skip autoplay),
  pool-change recovery, a correct practice answer, saved difficulty, separate Base statistics, wrong
  guess/skip/win, unfinished and completed reloads, six-skip loss, cross-tab
  updates, practice-stat isolation, and navigation to/from Karaoke.
- Browser Daily decoded/replayed 0.1s three times at the authoritative explicit
  clip offset. A forced audio HTTP 503 consumed no attempt; retry played the
  same challenge. Spoiler-free six-square text, clipboard-path success,
  native-share success/cancellation handlers, and denied-clipboard selectable
  text fallback passed. Clipboard/native APIs were stubbed for these branches;
  no physical Android share sheet was tested.
- One real local authoritative host served two independent client servers,
  one with an empty library and one with an unrelated song. Their full song
  metadata, ID/date, seed, clip start, UTC reset, and SHA-256 hashes of all four
  MP3 streams matched. Both clients played that host's clip. A separate
  single-file authority/proxy fixture also preserved the exact audio bytes
  and played successfully. A dead authority displayed unavailable, created no
  local daily store, and selected no substitute. API tests additionally inject
  client `Date.now()` offsets of minus/plus one day and still receive the
  authority's date/reset. No PC clock was changed.
- Injected HTTP clock fixtures advanced an open browser Daily across midnight
  UTC, loading a fresh 0.1s round without attempts. Server tests cover pinned
  choices across library edits/reordering/restarts and the UTC boundary.
  Back navigation and leaving during a held audio download passed; those runs
  restored through page reloads (`pageshow.persisted: false`), so BFCache
  restoration is not established here.
- **Electron 44.7.0 / Chromium 152.0.7977.130 / bundled Node.js 24.21.0** passed
  `scripts/daily-smoke.cjs` and the actual source desktop entry-point check.
  This includes existing Hard preference, four synchronized 0.1s sources,
  Daily saved attempts/results, unchanged practice stats, actual window
  hide/show stopping Daily and allowing replay, four tabs, microphone-only
  permission rules, real HQ stem decoding/vocal analysis, Karaoke count-in,
  pause/resume, five count-in restarts, and return to song selection. Audio
  output was muted and microphone input was synthetic.
- The desktop menu dispatched Open in Browser to its running server URL
  (OS shell dispatch was intercepted by the smoke check); the independent
  browser check on the actual launcher server verified the playable target.
- Real stem worker probe: processed **8 seconds / 352800 samples** of existing
  vocal MP3 audio into finite, nonzero separated stems, completing in about
  **6.7 seconds**. This Linux GPU failed the existing compatibility probe with
  WGSL `f16` errors; the worker correctly selected **WASM/CPU** and completed.
  This does not establish GPU acceleration or a full-length AI song run.
- Hidden Electron checks stalled/failed on this Wayland compositor. Reruns
  with `YEATLE_SMOKE_SHOW=1` passed, including real background/foreground
  handling. No production rendering workaround was needed.
- Daily desktop and 360/390 px browser screenshots were visually inspected;
  no horizontal overflow. Karaoke screenshot was also inspected. Syntax
  checks and `git diff --check` passed. No Vite rebuild was attempted.

Final Linux evidence is in ignored `.tmp/`:

- `linux-1.11/npm-ci-final.log`, `npm-test-final.log`, and launcher logs
- `daily-browser-smoke-1792415552354/result.json` and Daily screenshots
- `desktop-smoke-1792414968730/result.json` and Karaoke screenshot
- `linux-1.11/worker-probe.json` and `desktop-server-in-browser.png`
- The final renderer/browser smoke report paths are recorded in
  `linux-1.11/daily-smoke-final.log` and `browser-smoke-final.log`.
  The measured Base/Daily browser run is recorded in
  `linux-1.11/daily-browser-smoke-measured-final.log`.

The existing `release/Yeatle-1.11.0-test.1-source.zip` is the earlier Windows
snapshot and was not regenerated; the current Linux fixes are in the working
tree. No Linux package build or installed-app upgrade was tested.

## Environment status

| Environment | Status | Next step |
| --- | --- | --- |
| Linux x64 browser | Passed local automated checks | Physical audio/device checks remain below |
| Linux desktop | Passed source runtime checks | Packaging/installed-app behavior not tested |
| Physical Android 16 | Passed automated checks in Chrome Beta and Brave | Physical listening and remaining limits are recorded below |
| Public shared Daily | Not deployed | Operator configures the authoritative host and deploys full 1.11 files |

No physical speaker, Bluetooth, microphone quality, phone memory/heat, overnight
open-tab rollover, or production audio-host reliability is established by these
checks. UTC rollover and pinned-day persistence are covered by deterministic
server tests and the injected browser clock check. Actual Android native-share
opening/cancellation is recorded below; delivery to another app was not completed.

Append actual Linux/Android results here when testing, including OS/browser
versions, command outcomes, and unresolved issues. Do not promote the pending
rows to passed based on viewport emulation or Windows packaging.

## Physical Android — 19 October 2026

Tested the USB-connected **SM-S931B, Android 16 / API 36** with ADB 1.0.41
(platform-tools 37.0.0p1), selecting its serial explicitly for device commands.
The active Chrome variant was **Chrome Beta 157.0.8103.5**. The additional
Brave pass used **Brave 1.97.57 / Chromium 155.0.8059.80**. These are real phone
browser checks through ADB/CDP, not desktop mobile emulation.

Fetched origin/tags: `main` remains at `db3730a`, zero commits ahead/behind
`origin/main`; the public GitHub API still reports regular release `v1.10.3`.
The dirty working version remains **1.11.0-test.1**. All incoming changes were
inspected and backed up under ignored `.tmp/` before edits. No commit, push,
publication, deployment, Vite rebuild, dependency replacement, clock change,
or app-data clearing was performed.

### Setup and fixes

- Used the documented isolated browser launcher on **3193**, with
  **Node.js 24.19.0**, a new test-data folder, `dailyAuthority: ""`, `tabs: []`,
  and the existing four real `Lyfe stealer` MP3 stems. No music was downloaded
  or copied over the library. Normal settings, private caches and daily stores
  were retained. ADB reverse made the phone's `127.0.0.1:3193` reach this host.
- A separate shared client on **3195** had an unrelated local song and proxied
  Daily from 3193. A client on **3196** deliberately used an unreachable
  authority. Both used separate disposable server data. The public website
  was not used as an updated 1.11 authority and remains undeployed by this task.
- Fixed Daily's completed-result wording: a win on the 1-second clip displayed
  `You found it in 1 seconds.` It now uses the singular `1 second`; both phone
  browsers verified the corrected text.
- Fixed Karaoke's singer selector being disabled until microphone permission
  was granted. `No mic (just watch)` can now be chosen before granting access.
  Updated the Karaoke script URL for the test version. Both browsers selected
  this option through the UI and completed the playback checks without
  microphone permission or synthetic microphone input.

### Checks actually passed

| Check on the physical phone | Chrome Beta | Brave |
| --- | --- | --- |
| Base first/default; six lengths; skip autoplay; pool changes | Passed | Passed |
| Saved difficulty and separate Base practice statistics | Passed | Passed |
| Repeated Daily 0.1s playback at the explicit host offset | Passed | Passed |
| Wrong guess, skip, correct answer; unfinished/completed reloads | Passed | Passed |
| Six-attempt loss and completed-loss reload | Passed | Passed |
| Daily leaves practice statistics unchanged | Passed | Passed |
| Same authority metadata/audio as a real desktop browser | Passed | Passed |
| Shared proxy with different local library; no local fallback on failure | Passed | Passed |
| Audio HTTP 503: same-challenge retry, zero attempts used | Passed | Passed |
| Home/foreground: stop and replay | Passed | Passed |
| Leave during held audio load, Back, replay after BFCache restoration | Passed | Passed |
| Portrait width, scrolling, volume input, four-mode navigation | Passed | Passed |
| Real native share sheet, cancellation, real clipboard write | Passed | Passed |
| Forced denied-clipboard branch: selectable result text | Passed | Passed |
| Karaoke loading/count-in/playback/pause/resume/restart/quit | Passed | Passed |

- Base playback measured the real media positions of all four stems. Chrome's
  requested 0.1s clip advanced about **0.1045s**, and Brave's about
  **0.1016–0.1043s**. Across all six lengths, the measured spans were within
  about **13 ms** of the requested lengths. This measures browser media
  positions, not acoustic output timing or perceived sound quality.
- Daily scheduled four decoded 162.142-second buffers together, three times
  for exactly **0.1 seconds**, at host offset **6.982 seconds**. Phone browsers
  and desktop **Chrome 155.0.8059.84** matched ID
  `v1:2026-10-19:lyfestealer`, date, full song metadata, seed, clip start,
  reset **2026-10-20T00:00:00.000Z**, and SHA-256 hashes of all four audio
  responses. The independent shared proxy matched those bytes and played that
  offset despite its unrelated local library. Failed shared-host requests
  displayed unavailable, created no local daily store, and chose no substitute.
- Both browsers stopped all four Daily sources after Home and replayed on
  return. Back after an interrupted audio download restored the actual page
  with **`pageshow.persisted: true`** in both browsers, then loaded and replayed
  successfully. A Chrome harness wait for a new load event initially timed
  out on this BFCache restoration; direct inspection and replay established
  recovery. An initial Brave Home/return cycle was too short to finish the
  Android app transition; waiting for the launcher to foreground verified the
  real hidden-state stop. These were harness timing issues, not app fixes.
- At the phone's actual **411 CSS-pixel portrait width**, Daily had no
  horizontal overflow in either browser. Scrolling reached the result and
  navigation remained usable. Volume input values changed and were restored;
  actual loudness remains a listening check. Native keyboard opening shrank
  Chrome's visual viewport to about **367 px**, and a screenshot showed its
  real song suggestion. Tapping that suggestion filled `Lyfe stealer` with
  zero attempts. Brave also showed the keyboard/visual-viewport reduction and
  song suggestions; native suggestion selection was specifically checked in
  Chrome. Daily and Karaoke phone screenshots were visually inspected.
- Android's actual chooser opened for each browser. Back cancelled the real
  `navigator.share` call with `AbortError` and did not show an erroneous
  fallback. Payload was `Yeatle Daily 2026-10-19`, `1s · 3/6`, exactly six
  squares `🟥⬛🟩⬜⬜⬜`, and the local Daily link, without the answer. No share
  target or recipient was selected and nothing was sent or published.
- To reach clipboard fallback, the harness temporarily hid native sharing in
  the test document, then called the **real** Android clipboard `writeText`;
  it resolved successfully in both browsers. A separate forced clipboard
  denial showed the correct text with the full range selected. These branch
  overrides disappeared on reload and did not alter browser settings. An ADB
  paste-key attempt did not insert text, so manual clipboard paste is not
  established by that attempt.
- Karaoke used real stems and vocal-note analysis. Both browsers showed
  **3, 2, 1, Go!**, advanced playback, froze progress while paused, resumed,
  restarted with a fresh count-in, and quit to song selection. All four mode
  links/buttons were exercised. This verifies the playback flow with
  `No mic (just watch)`, not real microphone quality or scoring accuracy.
- After both fixes, **`npm test`: 87 passed, 0 failed, 0 skipped** on Node.js
  24.19.0/Linux. Both changed scripts passed syntax checks and `git diff
  --check` passed. Successful phone runs recorded no page runtime errors.

### Physical checks and remaining limits

Brave was locked through ADB during a 15-second Daily replay. The page became
hidden and all four sources stopped before the clip's natural end. After the
user physically unlocked the phone, the same page successfully replayed four
15-second sources at the original host offset. Chrome lock/unlock was not
separately repeated.

The user reported that physical playback sounded acceptable. This is a
subjective listening result, separate from the automated media measurements.
The user explicitly deferred Bluetooth and real microphone checks until later.
Bluetooth routing/latency, real microphone quality/scoring, manual clipboard
paste, and subjective heat/sluggishness remain **pending user observation**.
No controlled peak-memory/thermal, low-memory handset,
overnight open-tab rollover, long-session battery, full AI separation, APK,
installed-app upgrade, or public audio-host reliability claim follows from
these runs. HTTP failure was simulated in the phone's real browser; airplane
mode and arbitrary real network transitions were not exercised. Native share
handoff to another app was intentionally not completed.

Local evidence is retained in ignored
`.tmp/android-1.11-1792416016/`: incoming backup/hashes, `result.json`,
`brave/result.json`, phone screenshots, audio/metadata comparisons,
`background.json`, `brave/background.json`, `brave/lock.json`, and
`npm-test-final.log`. Temporary harness errors remain in the private reports;
the successful reruns and their scope are described above. Device identifiers
and raw browser diagnostics are not included in this shared document.

### Cleanup

Closed only the two test tabs and the empty tab created by the harness;
browser profile data and saved test progress were retained. Stopped the 3193
launcher and the two fixture servers; all three ports were confirmed closed.
Removed only this session's reverse mappings **3193, 3195, 3196** and debugging
forwards **37009, 34765**. An extra forward **46321** created while identifying
Brave's socket had already been removed. Final ADB reverse/forward lists were
empty, matching the initial state. All unrelated incoming changed/new files
matched their pre-session hashes. Music and normal settings/caches were kept.

## Desktop Daily transitions — 19 October 2026

Daily now loads the shared navigation stylesheet and desktop runtime bootstrap.
Its background, black panel, logo, and tabs use the same named transition
layers as the existing game and Karaoke screens. The shared navigation CSS
URL was advanced in all three HTML entry points. Transition timing and
Stems/Snippets behavior were retained; browser windows still do not opt in.

Verified through the actual desktop entry point on Linux x64/KDE Wayland in
**Electron 44.7.0 / Chromium 152.0.7977.130**, using a visible window, disposable
profile/server data, explicit local Daily authority, existing stems, and muted
output:

- Stems → Daily → Stems, Snippets → Daily → Snippets, and Karaoke → Daily →
  Karaoke each produced a native cross-document transition whose `ready` and
  `finished` promises completed. All six Daily routes passed without skipped
  transitions or page errors. Named layers matched, with the existing **200 ms**
  surface animation and `mode-in` incoming-root animation.
- Existing game/Karaoke transitions also completed. Emulated reduced motion
  produced immediate Stems → Daily and Daily → Karaoke navigation with no
  cross-document transition. The first harness run treated Chromium's expected
  reduced-motion skipped-transition rejection as an application error; the
  final harness separated that event and waited for the media preference to
  apply before navigation, then passed.
- Independent real **Chrome 155.0.8059.84** used the same server without the
  desktop preload. Daily/Karaoke and Daily/Stems/Snippets routes retained the
  browser runtime and produced zero native transitions. The Daily desktop
  screenshot was visually inspected.
- **`npm test`: 87 passed, 0 failed, 0 skipped**, using Node.js 24.19.0.
  `git diff --check` passed. No Vite rebuild, package build, installed-app
  replacement, commit, push, or deployment was performed. Windows/macOS runtime
  checks were not repeated for this change.

Evidence: ignored `.tmp/daily-desktop-transitions/1792418098690/result.json`,
`browser.json`, and `daily.png`, plus `check-final.log` and `npm-test.log` in
`.tmp/daily-desktop-transitions/`. The isolated app and its server exited after
verification; normal profiles, settings, and music were retained.

## Windows release verification — 19 October 2026

Continued on Windows 11 Pro x64 (build 26300) from `db3730a`. Origin was fetched
and remained at that commit, with zero local-only or incoming commits. The
latest published regular release was `v1.10.3`. Inspected and backed up all 27
incoming changed/new files before editing. The actual working tree contained
the later Linux pool-change/answer-validation/Electron-installer fixes, Android
singular-result and No mic fixes, and desktop Daily transition changes. No
transfer from the older source ZIP was needed; that ZIP was not used.

### Setup and fixes

- Reinstalled root dependencies with `npm ci` on Windows using **Node.js
  24.15.0 / npm 11.12.1**. Electron **44.7.0**, Chromium **152.0.7977.130**, and
  bundled Node.js **24.21.0** were installed for Windows. The first restricted
  install failed with EPERM; the authorized unrestricted reinstall succeeded.
- Ran the documented isolated browser launcher on **3193** and desktop launcher
  on **3194**, using separate data/profiles, explicit `dailyAuthority: ""`,
  no tracker tabs, and the existing real Lyfe stealer MP3 stems. An independent
  Edge profile played Daily from the desktop launcher's 3194 server.
- Fixed an empty saved tracker list masking valid local stem packs when no
  tracker rows are available. The existing pack-completion/removal regression
  now starts with an empty cache and verifies recovery without deleting it.
- A directly launched GUI Electron smoke process outlived PowerShell's output
  pipe and displayed an EPIPE dialog from `scripts/daily-smoke.cjs`. Closed only
  that orphaned test process, guarded diagnostic streams against EPIPE, and
  documented the waiting `electron.cmd` wrapper. Reruns wrote successful reports.
- Reproduced the user's flashing Karaoke scrollbars: scaling the full-width
  countdown overlay enlarged page width by up to **362 CSS pixels**. Contained
  the animation inside its note lane with `overflow: clip`. At **1280×756,
  640×480, and 390×844**, all sampled count-in frames then had **zero horizontal
  and vertical overflow**. Added continuous frame sampling/assertions to both
  browser and desktop smoke checks; native desktop also measured zero overflow.

### Source checks actually passed

- Final `npm test`: **86 passed, 1 skipped, 0 failed**. The skipped case is the
  existing privileged filesystem-symlink test on Windows. Syntax/whitespace
  checks passed. No Vite build or replacement of `build/` was performed.
- **Edge 155.0.4283.62** passed standalone browser and extended Daily smoke:
  Base first/default, all six measured media lengths, skip autoplay, pool-change
  recovery, existing/saved difficulty, separate Base statistics, and a correct
  practice answer. Stems navigation, saved Karaoke volume, and reduced motion
  also passed.
- Daily passed three repeated 0.1s plays at the explicit host offset, wrong
  guess/skip/win, six-attempt loss, unfinished/completed reloads, cross-tab
  updates, and unchanged practice statistics. Failed audio used no attempt;
  retry retained the challenge. Leaving during a held download, Back, and replay
  passed. This Edge run restored by reload; it does not establish BFCache.
- Two independent local client servers with different libraries received the
  authority's identical metadata, ID/date, seed, clip start, reset, and hashes
  of all four real audio streams. Both played the same clip. A single-file
  authority/proxy also preserved bytes and played. A failed authority returned
  unavailable, created no local daily store, and selected no substitute. Fixture
  HTTP clocks tested open-tab UTC rollover without changing the PC clock.
- Sharing branches verified date/score, six squares, link, and no answer;
  native-share success/cancellation and clipboard denial were stubbed. The
  selectable fallback contained the result. Nothing was sent. Earlier physical
  Android share-sheet/clipboard observations remain the physical evidence.
- All **six desktop Daily routes** completed native transitions with matching
  layers, the existing 200ms surface animation, and no runtime errors. Existing
  game/Karaoke routes passed. Reduced motion disabled animation; independent
  Edge on the same server had browser identity and zero transitions.
- Actual desktop entry-point checks passed microphone-only permissions with
  synthetic input, real HQ stem decode/vocal analysis, 3-2-1 count-in, playback,
  pause/resume, five restarts, quit, Daily persistence/stat isolation, native
  window hide/show stopping Daily and allowing replay, and Open in Browser URL
  dispatch. OS shell opening was intercepted; the 3194 target was independently
  played in Edge.
- A fresh native Edge permission state was **prompt**: the No mic selector was
  enabled, selection survived reload, and **zero getUserMedia requests** occurred.
  The desktop smoke explicitly simulates that permission-query state because
  Electron otherwise reports granted; its microphone/camera calls stay native.

### Stable metadata and local packages

Promoted the package/lockfile and relevant changed asset URLs to **1.11.0**;
updated README downloads and English release notes. Historical Linux/Android
results retain their original versions. Repeated unit, Daily browser/renderer,
and desktop checks after promotion and the reported Karaoke fix.

Built both Windows x64 packages in `release/local-1.11.0-final/`. Extracted the
installer without installing over the user's application. Installer and portable
contained identical application payloads; the extracted executable and app.asar
matched the unpacked build. The documented smoke verified packaged files against
the checkout, including the changed Karaoke stylesheet, then exercised its
actual entry point with isolated data.

The actual installer-extracted **Yeatle.exe** passed startup, native packaged
identity/version 1.11.0, all six Daily transition routes, repeated Daily playback,
saved attempts/results, Karaoke No mic/loading/count-in/playback/pause/resume/
restart/quit, and settings plus Daily persistence after a full app restart.
Help → Check for Updates reached the real release service and correctly reported
1.11.0 up to date while 1.10.3 was the latest public release. No update was
installed. Native background/foreground was verified separately by the packaged
entry-point smoke: the CDP browser driver forces focus and masks visibility.
Initial driver attempts at that check timed out and are not counted as passes.
The actual **portable executable** also passed the same version/navigation/
Daily/Karaoke/updater checks and a full quit/relaunch with saved settings and
Daily result. Its wrapper extracted into its own temporary directory and kept
the explicitly isolated profile; no normal installation was replaced. The
final portable report is `windows-1.11/packaged-1792420764851/result.json`, and
the final installer-entry smoke is `.tmp/desktop-smoke-1792420778045/`.

Local evidence is in ignored `.tmp/windows-1.11/` (install/test/launcher/build
logs, incoming backup/hashes, overflow measurements, native permission check,
navigation reports, and packaged reports). Final source browser evidence also
includes `.tmp/daily-browser-smoke-1792419924951/`,
`.tmp/browser-smoke-1792420437817/`, `.tmp/desktop-smoke-1792420497064/`, and
the installer executable report `windows-1.11/packaged-1792420645091/result.json`.

At the time of this source record, GitHub Actions builds and public authoritative
Daily verification remain release gates. The public site initially served
1.10.3, with HTTP 404 for `/daily.html` and `/api/daily`; automatic deployment
must be checked after the source reaches main. No public-host deployment or
shared-production success is inferred from local fixtures.

Audio was muted in automated Windows checks. The earlier user report of
acceptable Android sound remains separate. Bluetooth, real microphone quality,
controlled thermal/memory, long-session, and overnight checks remain pending.
Normal music, settings, caches, models, profiles, and daily stores were preserved.
