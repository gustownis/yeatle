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

Release package and publication checks are in progress. This paragraph is a
preparation record, not a claim that a package or release has passed.
