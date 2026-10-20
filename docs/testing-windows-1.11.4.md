# Yeatle 1.11.4 release verification — Windows, 2026-10-20

Version 1.11.4 includes the changes verified in the
[post-1.11.3 report](testing-windows-post-1.11.3.md) and
[catalog follow-up report](testing-windows-catalog-followup.md).
The release preparation updates version metadata and frontend asset queries;
it does not rebuild the incomplete imported frontend source.

The starting checkout was clean on main at `d2b50cd`. Fetch confirmed it
matched upstream, and the latest regular GitHub release was v1.11.3. The
Windows dependency installation uses Node.js 24.15.0 and Electron 44.7.0.
Private settings, songs, models, caches and the Daily store are preserved.

The first packaged-app test interrupted initial navigation and exposed a false
fatal startup dialog: `ERR_ABORTED (-3)` on the test profile's port. The event
handler already ignored this normal cancellation, but the `loadURL` promise
handler still reported it as fatal. `desktop/window-load.cjs` now handles
superseded navigation and closed windows consistently for the game, admin and
HQ popup. Real load failures remain visible. A real Electron reproduction
records ERR_ABORTED before the fix and no error after it; regression tests
also retain the connection-refused failure case. The Windows suite now has
135 tests: 134 passed and one symlink-permission skip. Every release package
is rebuilt after this correction; earlier candidate downloads are not used.

## Final candidate checks

The final runtime commit is `9f94a59261bcce47529589f5d6cbc4523f6cc11f`.
[Checks](https://github.com/gustownis/yeatle/actions/runs/39490544907) passed on
Windows, macOS and Linux. All five jobs in
[Desktop builds](https://github.com/gustownis/yeatle/actions/runs/39490545338)
passed, producing Windows x64, macOS x64/ARM64 and Linux x64/ARM64 packages.

- The final Windows source passed the full desktop smoke check. The
  release-version browser catalog check passed, including saved Cant See
  rounds, version labels, excluded Fleek/Zaza entries and portrait layout.
- All ten final packages were extracted. Each contains version 1.11.4 and
  matches all 66 tracked runtime files, after text line-ending normalization.
  Private settings, Daily stores, catalog caches, models and Songs folders
  are absent from the archives.
- Ten binary signatures and SHA-256 entries, plus all three updater feeds'
  filenames, sizes and SHA-512 values, were checked. Fourteen files are
  prepared for upload; none comes from the superseded candidate.
- The app extracted from the actual GitHub-built Windows installer passed
  startup, all six Daily transitions, repeated playback, Karaoke no-mic
  playback/pause/resume/restart/quit, preferences and saved wins across restart,
  updater up-to-date handling and normal public Daily authority playback.
- The actual portable executable passed the same packaged-app checks.
- The final installer's app archive passed `desktop-stems-smoke.cjs` in
  Electron: Check all, queue/download/install/cancel/retry, decoded playback,
  and the HQ menu remaining hidden after an updater check, delay and Alt.
- The deployed website matches all ten checked release entry pages/modules.
  Its corrected song catalog and HQ Cant See download metadata are live.
  Public Daily `v1:2026-10-20:comengo` retains clip start 6.53 s, UTC reset and
  byte-identical 1,848,547-byte audio, including checks from two independent
  clients using the normal authority.
- The rendered GitHub README has eleven correct 1.11.4 release links and its
  existing screenshot loads.

Checks used disposable profiles and muted playback. The normal app was not
installed over or updated during testing. Physical microphones, singing,
native macOS/Linux behavior and ARM hardware were not exercised on this PC.
Detailed machine-local evidence is ignored under `.tmp/windows-1.11.4/` and
the corresponding timestamped smoke folders.

## Publication

[Yeatle 1.11.4](https://github.com/gustownis/yeatle/releases/tag/v1.11.4) is
published as a regular Latest release. Its annotated tag resolves to the
final runtime/build commit `9f94a59261bcce47529589f5d6cbc4523f6cc11f`.
All fourteen uploaded asset sizes and SHA-256 digests matched the prepared
files before publication. After publication, every public download was read
and hashed again; all fourteen matched. All three `/releases/latest/download/`
updater aliases return the exact prepared feeds.

An isolated updater presenting version 1.11.3 detected 1.11.4 and downloaded
the actual Windows installer, checking its 119,472,597 bytes and SHA-256
`89ce365bc5e6b2cb459289e6e13b5c09411b3581b34756cb06b172088fc6f9c6`.
Installation was not invoked. A client already at 1.11.4 correctly reports
no newer release. The normal installed application and user profile remain
untouched. This publication record is a documentation-only follow-up to the
tagged runtime.
