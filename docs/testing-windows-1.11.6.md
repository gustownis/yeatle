# Yeatle 1.11.6 release verification — Windows, 2026-10-22

This release includes the [admin catalog eligibility fix](testing-windows-admin-catalog.md). The starting main checkout at `dbaa9e1` matched `origin/main`; GitHub's latest regular release was v1.11.5. The README receives download links and version-reference updates only, with no new version announcement or admin-feature paragraph.

Release preparation updates package versions and asset query versions without rebuilding the incomplete imported frontend source. The final release-version source passed 139 automated tests on Windows with Node.js 24.15.0, with one symlink-permission skip. Actual Edge checks covered duplicate-hide cleanup, normal Hide/Show, combined recording eligibility, song test search, desktop layout and a 390-pixel portrait layout, with no page errors or horizontal overflow.

Before deployment, the public Daily was `v1:2026-10-22:ugotit` at clip start 5.07 seconds. Its 5,186,154-byte audio had SHA-256 `932c585219b1a8fa9d1d098511e106fcf833e066e0e64ed933f31cdd1dfd901a`. The active catalog contained 1,303 entries. These snapshots are used to check that the admin changes do not alter the playable catalog or existing challenge.

Package verification, website deployment and publication results will be recorded after they complete. Private settings, songs, downloaded models and the real Daily store are preserved. Physical microphones, singing and native macOS/Linux device behavior are outside this Windows verification.
