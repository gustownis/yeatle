# Local optimization results

Historical audit recorded before 1.9.5 release preparation. The verified repair and optimizations are included in the 1.9.5 release candidate, whose asset queries use `v=1.9.5`. See [release notes](releases/1.9.5.md). Website deployment remains separate.

Date: 13 October 2026. The user authorized implementing the doable improvements after reviewing the audits. At the time of this report, changes remained in the development checkout and version metadata was still 1.9.4. No deployment, push, release publication, or changes to real admin passwords or saved game data were made.

## Implemented, in measured priority order

| Priority | Change | Measurement or verification |
| ---: | --- | --- |
| 1 | Retire complete audio graphs and close a context after its last player is destroyed | After 40 normal Stems/Snippets switches, 12 audio nodes remained alive, versus 352 before the change. Renderer private memory was 48.89 MiB versus 90.24 MiB in the earlier trial. Native media allocation varies; the node count directly confirms retired graphs were released. |
| 2 | Release idle AI sessions and terminate their worker after 60 seconds without pending separation | Real GPU and CPU separations completed, explicitly released four sessions, and successfully initialized again. The browser test shortened the same timer to 1.5 seconds; production uses 60 seconds. Cached playable audio remains available. |
| 3 | Stop unfinished separation when the final level switches to the original song | Advancing after the first chunk used 5 model inferences instead of 60. Full-song playback retained one original source, the full 172.199-second loop, and a subsequent seek to 50 seconds. Cancellation happens between model runs, so an in-flight inference can finish. |
| 4 | Use rolling overlap-add and normalization buffers | These four worker arrays now occupy 8.0625 MiB, versus 115.97 MiB for the measured 172.2-second song. Their size no longer scales with the whole recording. Original decoded audio, generated audio buffers, model sessions, and FFT buffers still consume additional memory. |
| 5 | Persist completed generated stems in a bounded, lossless browser cache | Reloading the measured song was ready in 2.994 seconds and used zero new model inferences, versus 60 for a fresh split. All sample hashes matched the fresh result. The entry held 91,127,808 bytes in 15 chunks. Corrupt data was rejected and regenerated successfully. |
| 6 | Reuse identical mask powers | Double precision, denominator addition order, FFT windows, normalization, emitted sample ranges, and model input values are preserved. A comparison against the original implementation matched every output sample and model input across a chunk boundary. |
| 7 | Replace steady admin polling with visible-tab event streams, and disable checks when admin control is unavailable | The native browser issued zero steady polling requests during the trial. It received authenticated admin changes, closed its stream while hidden, reconnected to the latest selection, and accepted a restarted server's new sequence. Older servers or failed/unsupported streams retain the existing visible polling fallback. |
| 8 | Compress song lists once and reuse bounded compressed static responses | The measured song list shrank from 525,812 to 65,911 bytes, an 87.5% reduction. Level-6 runtime compression produced 5,245,653 bytes versus the existing level-1 result of 6,182,211 bytes, about 15.1% smaller. Repeated requests share compression work. File edits still invalidate it; HEAD, MIME types, revalidation, audio, and ranges were checked. |
| 9 | Share the byte-identical prestige icon and favicon URL | Avoids fetching identical 198,626-byte artwork under two URLs. No images were resized or re-encoded. |

## Cache and lifecycle constraints

Generated stems remain Float32 samples, with no lossy encoding or reduced sample rate. The IndexedDB cache holds at most 192 MiB of sample payload in total and at most 100 MiB per recording; metadata adds a small amount. Transactions copy at most 6 MiB of samples at a time. Least-recently-used completed entries are evicted to make room, and unfinished reservations cannot be read as complete. Songs above the per-entry limit still separate normally without being persisted. Storage failure or denied storage is optional and does not trigger Light fallback. A physical Brave check found that its privacy protection modifies audio samples on each read; the optional cache now probes a separate synthetic buffer and skips persistence when these APIs alter samples. AI separation remains available without changing browser privacy settings.

Keys include the original audio SHA-256, hashes of all four model files, algorithm identity, sample rate, and browser identity. The server exposes model fingerprints without triggering downloads, validates model HTTP caches, and invalidates hashes when files change. This prevents edited audio or replaced models from reusing stale stems. The worker provides hashes of the models it actually loaded. Existing model warmup is retained for compatibility, so a cached-stem hit avoids inference but can still initialize models.

The worker remains standalone. The 1.9.4 model-download and worker-lifecycle helper dependencies were removed during the repair; listener detachment still does not cancel an active job. New explicit cancellation is limited to eviction, leaving AI playback, idle disposal, and a final level that already has its original audio. Late segment messages cannot restart final-level playback or resurrect discarded buffers. Failed initialization releases any sessions already created. An errored worker is replaced on retry.

The optional stem-cache module is loaded lazily, and a missing or older helper becomes a cache miss. Required server helpers are included in desktop packaging metadata. HTML, CSS, the frontend, and its worker/cache imports now use `v=1.9.4-local-opt2` to distinguish the local changes and the Brave compatibility fix from an earlier deployment without publishing a new release.

## Validation

The automated suite passes 43 tests. Coverage includes separation equivalence across chunk boundaries, explicit cancellation, final-level original playback, visible failure reasons and Light selection, worker retry, active-round cache protection, model replacement, gzip invalidation, live-stream cleanup, audio-read compatibility, progress, and admin authentication. Initial desktop browser checks use isolated temporary profiles, temporary server data, muted output, real audio, and existing real models. They do not use or edit real user settings or passwords. Subsequent physical-phone checks preserve and restore the hosted site's Yeatle settings and use a separate local test origin; see [android-ai-test.md](android-ai-test.md).

Native Chromium browser checks completed full real-song separation through WebGPU and single-thread WASM. The optimized split calculation took 10.76 seconds with WebGPU and 42.63 seconds with single-thread WASM; earlier exploratory runs took 12.54 and 45.88 seconds. These were separate single runs, not a controlled speed comparison, so they do not establish a reliable percentage speedup. The memory sizes, inference counts, and exact sample comparisons above are stronger results.

Additional browser checks verified successful CPU separation with IndexedDB unavailable, exact stem-cache reloads and corruption recovery, deliberate model HTTP 503 and worker startup failures with visible reasons and Light selection, retry, and idle-worker reinitialization. Actual Snippets playback stopped a requested 0.5-second clip at approximately 0.502 seconds. Four real hand-made stems played synchronously with identical observed playback times. Phone, tablet, and iPad identities hid the shortcut hint; a narrow touch-enabled Windows desktop displayed it and handled S.

The user's physical Android phone subsequently completed real-song separation in Chrome Beta and Brave, including the saved round's song on the hosted site. The reported instant fallback remains unreproduced, so its precise cause is still unconfirmed. The local repair's failure display, Light selection, retry, cache, final level, and idle lifecycle have now been verified on this Android. iOS Safari remains untested. The hosted website still runs its existing deployment.

## Deferred until further measurement

- CPU thread selection and GPU compatibility policy remain unchanged. Physical Android comparisons of one, four, and eight CPU threads changed with warming and run order; four threads did not consistently outperform eight. The measured phone completed both default GPU and CPU separation. More controlled thermal and memory measurements on additional devices are needed before changing defaults, and Android does not validate Safari.
- No image quality/resolution changes, model compression, reduced audio precision, or persistent original-audio cache were added. Those require separate visual, transfer, range, invalidation, and storage measurements.
- No broad React rewrite, autocomplete worker, waveform redesign, or audio-clock rendering change was made. Existing measurements did not justify those changes, and foreground frame/battery measurements are still needed.

## Verification record

The measurements above summarize local tests; raw logs and temporary diagnostic scripts were not published. The earlier observations are documented in the [AI repair audit](ai-repair-audit.md) and [further optimization audit](further-optimization-audit.md). The repository includes the [automated tests](../tests) for the shipped implementation; these are distinct from the one-off browser and performance measurements in this report.
