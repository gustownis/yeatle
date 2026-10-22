# Yeatle 1.11.5 release verification — Windows, 2026-10-22

This release includes the [catalog exclusions](testing-windows-catalog-exclusions.md) requested by the maintainer. Release preparation updates package versions, download links and asset query versions without rebuilding the incomplete imported frontend source. The starting main checkout at `4ea0e99` matched `origin/main`; GitHub's latest regular release was v1.11.4.

The release-version source passed 138 automated tests on Windows with Node.js 24.15.0, with one symlink-permission skip. The disposable Edge browser check covered all four pools, removed suggestions, retained Yeat features and completion of a saved excluded round, with no page errors. Package verification, website deployment and publication results will be recorded below after they complete.

Before deployment, the public Daily was `v1:2026-10-22:ugotit` at clip start 5.07 seconds. Its 5,186,154-byte audio had SHA-256 `932c585219b1a8fa9d1d098511e106fcf833e066e0e64ed933f31cdd1dfd901a`. This snapshot is used to check that deployment preserves the existing challenge.

Private settings, songs, downloaded models and real Daily stores are preserved. Physical microphones, singing and native macOS/Linux device behavior are outside this Windows verification.
