# Yeatle 1.11.1 verification — Windows, 2026-10-19

This patch follows the published 1.11.0 release at `9c590f3`. It changes Daily's
presentation and suggestions, copies results directly, scales portrait logos,
and sets the Windows app identity. The shared challenge protocol is unchanged.
Root dependencies were installed fresh on Windows during the 1.11.0 pass;
the 1.11.1 lockfile changes only its two root version fields.

## Source checks

Windows 11 x64, Node.js **24.15.0**, npm **11.12.1**, Electron **44.7.0**
(Chromium 152; bundled Node.js 24.21.0), and Edge **155.0.4283.62**:

- `npm.cmd test`: **86 passed, 1 skipped, 0 failed**. The existing Windows
  privileged-symlink test remains skipped.
- `daily-ui-smoke.cjs`: matching suggestion markup/styles, era/year labels,
  mouse, keyboard, Escape/blur, bounded scrollable results, emulated touch,
  and selection without spending a try passed. Daily uses the 640px panel,
  purple controls and current clip; copy-only output and selected fallback
  for clipboard denial passed. Native sharing was stubbed and never called.
- Portrait Daily at 360×844, 390×844, 768×1024 and 820×1180 uses a 240px logo;
  Stems and Snippets at phone/tablet sizes do too. Karaoke's header is 30px.
  No horizontal overflow occurred; desktop retained its 360px logo. Screenshots
  were inspected. This is emulation, not a new physical Android test.
- `daily-browser-smoke.cjs`: all six Base lengths, playback after skipping,
  difficulty/pool changes, preferences, separate practice stats, Daily
  wins/losses/reloads/retries, copy fallback, independent shared clients,
  failed audio/host and simulated UTC rollover passed on isolated port 3193.
- `daily-smoke.cjs`: actual Electron renderer, real local stems, precise
  short clips, saved attempts/results, six-attempt loss, copy and narrow layout
  passed. Initial screenshot capture failed with `UnknownVizError` before the
  first composited frame; waiting two renderer frames fixed the test harness,
  and the check then passed. The test now uses Yeatle's icon and a test identity.
- `desktop-smoke.cjs`: actual desktop entry point, Daily popup, purple clip,
  background/foreground, saved progress, practice stats, Stems, Karaoke
  No mic/count-in/pause/resume/restart/quit, saved settings and Open in Browser
  dispatch passed. `browser-smoke.cjs` also passed, including zero countdown
  overflow frames. Audio output was muted.
- Native navigation: all six Daily routes and the existing other-mode routes
  retained the named 200ms transitions; reduced motion and instant browser
  navigation passed. An initial browser subprocess lacked its optional module
  environment; rerunning with the documented dependencies passed.

The local authority is explicitly empty only in disposable fixtures. Their
Lyfe stealer challenge intentionally differs from the public shared challenge.
No normal settings, songs, cache, models, profiles or pinned store were changed.

## Windows packages

Built the x64 installer and portable executable from the 1.11.1 source. Both
embedded payloads match the unpacked app archive. The installer-extracted
actual executable passed startup/version, all six Daily routes, repeated
playback, attempts/results across reloads, Karaoke controls and No mic, saved
settings across full app restart, and the real updater's up-to-date response
while 1.11.0 was public. The icon extracted from the executable is Yeatle's.

A second isolated packaged profile omitted the authority override. Its Daily
matched the public site exactly: `v1:2026-10-19:livlikedis@edit-aa7672e11d14`,
Liv Likë Dis, clip start **6.982s**, reset **2026-10-20 00:00 UTC**. Actual
public audio playback and suggestions passed. The actual portable executable
also passed the same navigation/Daily/Karaoke/updater/restart checks and its
second profile matched the public Daily challenge and played its audio.
This verifies the normal client
configuration separately from the local fixture. The normal installation was
not overwritten. Native background/foreground is covered by the separate
desktop entry-point smoke; the CDP driver forces focus in packaged UI tests.

## Release gates and limitations

At the time of this source record, exact-commit GitHub
Checks and all five Desktop builds, ten-package comparison, fourteen prepared
assets, updated public frontend, and publication/download/updater verification
remain release gates. They must pass before publication; this source report is
not evidence of unrun CI or public checks.

Local evidence is ignored under `.tmp/windows-1.11.1/` and the timestamped
`daily-ui-smoke-*`, `daily-browser-smoke-*`, `daily-smoke-*`,
`desktop-smoke-*`, and `browser-smoke-*` folders. The earlier 1.11 Linux and
physical Android results remain in `test-1.11/RESULTS.md`. Bluetooth, real
microphone quality/scoring, heat/memory, long sessions and overnight checks
remain pending. No result was sent to anyone. Desktop packages remain unsigned.
