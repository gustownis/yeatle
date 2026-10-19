# Daily tab transition correction — Windows, 2026-10-19

The published 1.11.1 Daily page used a full-width tab container, including the
divider. Stems and Snippets use a content-sized tab strip inside a full-width
mode bar. Chromium interpolated those different snapshot dimensions, visibly
stretching the labels and active underline during the desktop transition.

## Reproduction and correction

An actual Electron desktop window measured the Stems/Snippets strip at
254.55×37.60 CSS pixels and Daily's at 594.40×38.40 at the same viewport.
The native `yeatle-tabs` animation keyframes confirmed this size interpolation.
Daily now uses the existing `.modebar > .tabs` structure and shared styles;
its tab width, height and desktop position match Stems and Snippets exactly.
The divider remains full-width on the surrounding mode bar. The changed Daily
stylesheet URL is versioned 1.11.2; the working frontend was edited in place.

After correction, both animation keyframes retain width 254.547px and height
37.594px (rounding below 0.001px). The existing 200ms transition still runs.
All six Daily desktop routes, other-mode navigation, reduced motion and instant
browser navigation passed. The geometry correction was added to the actual
desktop smoke check, comparing both page dimensions and native animation
keyframes so a large scale change cannot pass as a successful transition.

## Checks actually run

Windows 11 x64; Node.js 24.15.0, npm 11.12.1, Electron 44.7.0
(Chromium 152, bundled Node.js 24.21.0), Edge 155.0.4283.62.

- `npm.cmd test`: 86 passed, one existing privileged-symlink skip, zero failed.
- `desktop-smoke.cjs`: native tab geometry/keyframes and the existing Daily,
  Stems, Karaoke, background/foreground, saved settings and Open in Browser
  checks passed. An initial run hit an existing reload timing race: a selector
  matched the outgoing document before reload, then read the new page before
  its controls existed. The harness now waits for `did-finish-load` before
  inspecting reloaded controls; the complete run then passed.
- The separate native navigation check passed all six Daily routes and the
  existing routes, with reduced motion and an independent browser's instant
  navigation. Before/after measurements and animation keyframes were retained.
- `daily-ui-smoke.cjs`: suggestions, purple styling, copy-only/fallback,
  desktop/portrait layout and emulated touch passed.
- `daily-browser-smoke.cjs`: all six Base lengths, saved practice preferences,
  Daily playback/retries/wins/losses/persistence, copy fallback, independent
  authority clients, failed-host behavior and simulated UTC rollover passed.
- The actual packaged Windows executable passed the full packaged UI check,
  including unchanged tab dimensions on both Stems/Snippets routes, all six
  Daily transitions, repeated playback, Karaoke controls, saved settings after
  app restart, updater up-to-date handling, and a normal client matching and
  playing the public Daily challenge.

- The actual portable executable also passed the full packaged UI check and
  normal public authority playback. The desktop entry-point check against the
  packaged `app.asar` passed, including the native animation keyframes,
  background/foreground, Karaoke and Open in Browser dispatch. Both Windows
  package formats were built locally without touching the normal installation.

GitHub Checks, five Desktop builds, package/source
comparisons, fourteen assets, public website and post-publication download/feed/
updater/README verification must pass before the release is considered finished.
The published release notes record those completed gates separately from this
source-time report.

Evidence is ignored under `.tmp/tab-motion/`, `.tmp/windows-1.11.2/`, and the
timestamped desktop/browser smoke folders. Tests use isolated data, explicit
local test authorities, and existing playable music. Normal client authorities,
settings, music, models, caches, profiles and pinned stores are preserved.
Physical microphone quality, Bluetooth, heat/memory, long sessions and overnight
checks remain pending. No sharing result was sent, and no updater was installed
over the normal app.
