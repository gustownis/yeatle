# Catalog exclusion verification — Windows, 2026-10-22

The checkout was synchronized with `origin/main` at `4ea0e99`, version 1.11.4. GitHub's latest regular release was also v1.11.4. No dependency refresh was needed. These checks were recorded before release preparation; the subsequent deployment and publication are recorded in the [1.11.5 release verification](testing-windows-1.11.5.md).

The maintainer's list contains 60 tracker rows across Released and Unreleased, including producer-only tracks. Both live tracker tabs were read on 2026-10-22. Of those rows, 27 currently have playable sources and 33 are already unavailable to the normal catalog. All 60 now have maintained selection exclusions, so a newly available demo cannot enter future rounds merely by acquiring a playable link. Existing exclusions remain in place.

Version labels are retained separately from answer titles. Excluded sources are removed from All songs, Released, Unreleased, Stems only, suggestions, future Daily selection and HQ downloads. Merged titles select an eligible source while retaining their ids, tracker fingerprints and original audio mappings. Birthday V2, Pull Up V2, Dope Sickk V2, Not Da Same V2, Cop My Style V1 and Eaters with Yeat remain eligible. Credits are preserved; the No Clout exclusion is the maintainer's selection decision even though the tracker describes background vocals.

## Checks actually run

- `node --test tests/catalog-exclusions.test.cjs tests/catalog-policy.test.cjs`: all 20 checks passed. Coverage includes every requested row with its captured source and a replacement host, 27 retained neighboring versions, every pool, HQ eligibility, legacy caches, full audio preference, installed excluded stems, saved practice rounds and an unchanged pinned Daily file.
- `npm test` on Windows with Node.js 24.15.0: 138 passed, one skipped for symlink permissions, zero failures. The first restricted attempt blocked loopback networking and temporary-file renames; the complete run with those operations enabled passed.
- Actual headless Microsoft Edge against a disposable local server: removed Love Drug, No Clout and FLUTEBEAT suggestions were absent in All songs, Released and Unreleased; retained Birthday and Eaters suggestions included Yeat. No excluded audio appeared in any of the four pool projections. A saved Love Drug round remained completable. No page errors occurred. Playback used synthetic silent WAV data, so this verifies selection and restoration rather than recording identity or physical audio output.
- `git diff --check`: passed.

The browser fixture uses temporary settings and song caches under ignored `.tmp/`. Personal settings, songs, downloaded models and the real Daily store were not changed. Electron device behavior, macOS and Linux were not exercised for this metadata change. Restart the local server or desktop development session to load the updated policy; a separately installed desktop app and the public website require their own update.
