# Yeatle 1.11.5 release verification — Windows, 2026-10-22

This release includes the [catalog exclusions](testing-windows-catalog-exclusions.md) requested by the maintainer. Release preparation updates package versions, download links and asset query versions without rebuilding the incomplete imported frontend source. The starting main checkout at `4ea0e99` matched `origin/main`; GitHub's latest regular release was v1.11.4.

The release-version source passed 138 automated tests on Windows with Node.js 24.15.0, with one symlink-permission skip. The disposable Edge browser check covered all four pools, removed suggestions, retained Yeat features and completion of a saved excluded round, with no page errors.

Before deployment, the public Daily was `v1:2026-10-22:ugotit` at clip start 5.07 seconds. Its 5,186,154-byte audio had SHA-256 `932c585219b1a8fa9d1d098511e106fcf833e066e0e64ed933f31cdd1dfd901a`. This snapshot is used to check that deployment preserves the existing challenge.

Private settings, songs, downloaded models and real Daily stores are preserved. Physical microphones, singing and native macOS/Linux device behavior are outside this Windows verification.

## Builds and package verification

The tagged runtime commit is `a4ced0aea1f2a7751d4ea2d4c9a74e8d8b6d2b73`. [Checks](https://github.com/gustownis/yeatle/actions/runs/39759253558) passed on Windows, macOS and Linux for that commit. All five jobs in [Desktop builds](https://github.com/gustownis/yeatle/actions/runs/39759260821) passed, producing Windows x64, macOS x64/ARM64 and Linux x64/ARM64 packages.

- All ten package archives were extracted. Each contains version 1.11.5 and matches all 66 tracked runtime files after text line-ending normalization. No private configuration, Daily store, song cache, downloaded model or song pack is included.
- Binary signatures, all ten SHA-256 entries, and filenames, sizes and SHA-512 values in the three updater feeds passed verification. Fourteen final files were uploaded.
- The source Electron smoke check passed desktop navigation, tab geometry, saved Daily attempts/results, Karaoke no-mic settings, synthetic microphone permissions and playback, pause/resume/restart/quit, and Open in Browser.
- The app extracted from the actual Windows installer passed startup, all six Daily transitions, repeated playback, Karaoke no-mic playback and controls, preferences and saved wins across restart, up-to-date handling and normal public Daily authority playback. The portable archive's contents were verified, but that executable was not separately launched in this release check.

## Website deployment

The existing automatic deployment picked up the pushed runtime commit. All eight changed entry pages/modules checked over public HTTP match the 1.11.5 source after line-ending normalization. The live catalog has 1,303 active entries and 13 retained retired entries after the site's existing manual hides. All active records and pool variants pass the new exclusion policy. The previously hidden Eaters group remains hidden by its existing configuration; the code-level test confirms its Yeat version remains eligible.

Actual Edge checks against the public website confirmed that the exact Weiland Love Drug, SeptembersRich No Clout and Suburban Plaza FLUTEBEAT entries are absent from suggestions. Weiland Birthday with Yeat remains suggested. Shared aliases can still find eligible recordings, such as Joji's Rose Colored with Yeat. No page errors occurred.

The public Daily remained `v1:2026-10-22:ugotit`, retaining its seed, song, 5.07-second clip start and UTC reset. Its 5,186,154-byte audio remained byte-identical to the predeployment snapshot, with SHA-256 `932c585219b1a8fa9d1d098511e106fcf833e066e0e64ed933f31cdd1dfd901a`. The packaged Windows client also received and played the same public challenge using the normal authority.

## Publication

[Yeatle 1.11.5](https://github.com/gustownis/yeatle/releases/tag/v1.11.5) is published as the regular Latest release. The annotated tag resolves to the runtime commit above. All fourteen uploaded sizes and SHA-256 digests matched the prepared files before publication; all fourteen public downloads were then read and hashed again successfully. All three `/releases/latest/download/` updater aliases return the exact prepared feeds.

An isolated updater presenting version 1.11.4 detected 1.11.5 and downloaded the actual Windows installer, verifying its 119,476,233 bytes and SHA-256 `1f2ab8b67e75bb2a0758faf54036294c0a2a86b0c68f7df3e4dd5da450d3ffc1`. Installation was not invoked. A client already at 1.11.5 correctly reports no newer release. The normal installed application and user profile were not changed.

The rendered GitHub README has eleven correct 1.11.5 download links and its existing screenshot loads. The published release notes have four bullets and no forced prose line breaks. This publication record is a documentation-only follow-up to the tagged runtime. Detailed local evidence is preserved under ignored `.tmp/windows-1.11.5/` and the corresponding smoke folders.
