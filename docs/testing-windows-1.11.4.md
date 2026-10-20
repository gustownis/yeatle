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

Release package and publication checks are in progress. This paragraph is a
preparation record, not a claim that a package or release has passed.
