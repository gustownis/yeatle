# Yeatle 1.11.6 release verification — Windows, 2026-10-22

This release includes the [admin catalog eligibility fix](testing-windows-admin-catalog.md). The starting main checkout at `dbaa9e1` matched `origin/main`; GitHub's latest regular release was v1.11.5. The README receives download links and version-reference updates only, with no new version announcement or admin-feature paragraph.

Release preparation updates package versions and asset query versions without rebuilding the incomplete imported frontend source. The final release-version source passed 139 automated tests on Windows with Node.js 24.15.0, with one symlink-permission skip. Actual Edge checks covered duplicate-hide cleanup, normal Hide/Show, combined recording eligibility, song test search, desktop layout and a 390-pixel portrait layout, with no page errors or horizontal overflow.

Before deployment, the public Daily was `v1:2026-10-22:ugotit` at clip start 5.07 seconds. Its 5,186,154-byte audio had SHA-256 `932c585219b1a8fa9d1d098511e106fcf833e066e0e64ed933f31cdd1dfd901a`. The active catalog contained 1,303 entries. These snapshots are used to check that the admin changes do not alter the playable catalog or existing challenge.

Private settings, songs, downloaded models and the real Daily store are preserved. Physical microphones, singing and native macOS/Linux device behavior are outside this Windows verification.

## Builds and packages

The annotated v1.11.6 tag resolves to runtime commit `d8d2891676bc2ede433f6b93d99759da0f050a16`. [Checks](https://github.com/gustownis/yeatle/actions/runs/39824339027) passed on Windows, macOS and Linux. All five jobs in [Desktop builds](https://github.com/gustownis/yeatle/actions/runs/39824339345) passed, producing Windows x64, macOS x64/ARM64 and Linux x64/ARM64 packages.

- All ten package archives were extracted. Each contains version 1.11.6 and matches all 66 tracked runtime files after text line-ending normalization. Private configuration, Daily stores, song caches, downloaded models and song packs are absent.
- Binary signatures, ten SHA-256 entries and all three updater feeds' filenames, sizes and SHA-512 values passed verification. Fourteen final files were prepared and uploaded.
- The source Electron smoke check passed desktop navigation and tab geometry, Daily playback and saved progress, Karaoke no-mic settings, synthetic microphone permissions and playback, pause/resume/restart/quit, and Open in Browser.
- The app extracted from the actual Windows installer passed startup, all six Daily transitions, repeated playback, Karaoke no-mic controls, preferences and saved results across restart, up-to-date handling and playback from the normal public Daily authority. The portable archive's contents were verified; that executable was not separately launched.

## Website deployment

The existing automatic deployment picked up the pushed runtime. All eight changed entry pages/modules match the 1.11.6 source over public HTTP after line-ending normalization. The full public admin page markup and script also match the release source, confirming the new eligibility controls are deployed without logging in or changing real admin settings.

The active catalog remains the exact same 1,303 ids as before deployment. The six removed duplicate manual hides now appear among 19 retired records, with every active record and pool variant still passing the catalog policy. Actual Edge checks confirmed the admin login page loads, the excluded artist/title suggestions remain absent and Birthday with Yeat remains available. No page errors occurred.

The public Daily remained `v1:2026-10-22:ugotit`, retaining its song, seed, 5.07-second clip start and UTC reset. Its 5,186,154-byte audio remained byte-identical, with SHA-256 `932c585219b1a8fa9d1d098511e106fcf833e066e0e64ed933f31cdd1dfd901a`. The packaged Windows client also received and played the same public challenge.

## Publication

[Yeatle 1.11.6](https://github.com/gustownis/yeatle/releases/tag/v1.11.6) is published as the regular Latest release. All fourteen uploaded sizes and SHA-256 digests matched the prepared files before publication. All fourteen public downloads were then read and hashed successfully, and the three `/releases/latest/download/` updater aliases return the prepared feeds. A client already at 1.11.6 reports no newer release.

An isolated updater presenting version 1.11.5 detected 1.11.6 and downloaded the Windows installer, verifying its 119,476,731 bytes and SHA-256 `1ad49ef60fd04b958ab50c590644e07a53ca44265a784a7e1e1fd3164b71f76c`. Installation was not invoked, and the normal installed app and user profile were not changed.

The rendered GitHub README has eleven correct 1.11.6 download links and its existing screenshot loads. Comparing it with the preceding committed README after normalizing version references confirms that no other prose was changed and no version announcement or feature paragraph was added. The rendered release notes have four bullets and no forced prose line breaks.

This verification record is a documentation-only follow-up to the tagged runtime. Detailed local evidence is kept under ignored `.tmp/windows-1.11.6/`, `.tmp/admin-catalog-audit/` and the corresponding smoke folders.
