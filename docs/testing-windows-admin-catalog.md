# Admin catalog eligibility — Windows, 2026-10-22

These checks were recorded after the 1.11.5 release at `dbaa9e1`. Fetch confirmed the checkout matched `origin/main`, and GitHub's latest regular release was v1.11.5. Subsequent deployment and publication are recorded in the [1.11.6 release verification](testing-windows-1.11.6.md).

Admin now uses the same catalog eligibility check as future gameplay. Its summary, filters and song test search no longer treat excluded recordings as visible or playable. **Excluded only** lists them, and combined rows show each recording's version and eligibility. Hide and Show remain available for eligible entries. The API also rejects activating excluded recordings and skips redundant manual hides, so the distinction is enforced beyond the page controls.

Six default manual hides were removed because their entire entries are already excluded: Summrs/PlaqueBoyMax Hercules and Rino Hercules, Lil Uzi Vert Hehe and Panic, Ski Mask Look At She, and Future/ATL Jacob Millionaire. Their catalog exclusions remain active. Unrelated manual hides, including hidden entries with eligible versions, are preserved. Existing private duplicate hides can be cleared explicitly in admin; doing so leaves their recordings excluded.

- `npm test` on Windows with Node.js 24.15.0: 139 passed, one symlink-permission skip, zero failures. The new HTTP regression covers admin eligibility and per-version metadata, mixed bulk hide requests, clearing a duplicate hide, live activation rejection, normal hide/show and retention of the eligible audio source. The existing 60-row exclusion regression still passes.
- Actual headless Microsoft Edge with disposable settings and a local server: excluded entries cannot be selected for bulk hiding, clearing an old manual hide does not return its song to gameplay, normal Show restores Birthday V2 with Yeat, combined rows distinguish V1 from V2, and song test search offers only eligible visible recordings. No page errors occurred.
- Desktop and 390-pixel portrait screenshots were inspected. The portrait page has no horizontal overflow; long combined-row details remain scrollable.
- `git diff --check` and JavaScript syntax checks passed.

The initial checks did not modify the public website, published 1.11.5 packages, normal admin settings or private Daily data. Evidence and disposable profiles are kept under ignored `.tmp/admin-catalog-audit/`. macOS, Linux and packaged Electron were not exercised in this initial admin-only check; the later release report records the additional verification.
