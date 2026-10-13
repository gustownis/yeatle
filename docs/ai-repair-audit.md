# Local AI repair and optimization audit

Historical audit recorded before 1.9.5 release preparation. The verified repair and optimizations are included in the 1.9.5 release candidate, whose asset queries use `v=1.9.5`. See [release notes](releases/1.9.5.md). Website deployment remains separate.


Date: 13 October 2026. Release metadata remains 1.9.4. This work is local and has not been deployed, pushed, packaged as a release, or published.

This document records the initial repair and measurements before optimization approval. After the user authorized the doable improvements, the worker received separately verified lifecycle, buffer, and calculation changes. Its current contents therefore differ from the initial byte-for-byte rollback described below. See [local-optimization-results.md](local-optimization-results.md) for the current implementation, asset queries, and verification.

The user later connected the reported Android phone for physical testing. Chrome Beta completed hosted real-song separation, including the saved round's song, and both Chrome Beta and Brave passed the local repair checks. The original instant fallback remains unreproduced. Current device results and the additional Brave cache compatibility fix are in [android-ai-test.md](android-ai-test.md).

## Hosted investigation

The reported failure was on Android Chrome Beta and possibly iOS Safari. Fresh desktop Chromium sessions on https://playyeatle.duckdns.org/ loaded and separated real songs, so the exact mobile exception was not reproduced on physical hardware. Mobile memory pressure and cold initialization remain hypotheses, not established causes.

Public HTTP downloads of `yeatle.js`, `separator.worker.js`, `performance.mjs`, `model-download.mjs`, `worker-lifecycle.mjs`, and the ONNX runtime module matched the local 1.9.4 content after normalizing line endings. All returned HTTP 200 with JavaScript MIME types. Models returned HTTP 200 with `application/octet-stream`; the runtime binary returned `application/wasm` with gzip. Code used `no-cache` validators, the HTML referenced 1.9.4, and the worker's imports also referenced 1.9.4. No service worker registration exists in the shipped frontend. No missing helper, incorrect path, MIME mismatch, or fresh-load mixed deployment was found. This cannot exclude an older browser cache on either reported phone.

An isolated Chromium browser trace recorded the real song `livinlykeus`, all four model responses, worker startup, the runtime module and WASM response, progressive separation, and completion of the 172.2-second song. No separation failure appeared in that desktop trace. This is stronger evidence than the previous silent-input check, but it does not validate Android Chrome Beta or the Safari runtime.

The fallback UI defect was confirmed in the shipped code: `Lm.onJob` logged the error and changed playback to filters, but only changed the internal playback state. The dropdown and mode explanation continued to use the saved AI preference. An errored worker also remained stored in the singleton, allowing later attempts to reuse a broken worker.

## Reversed AI changes

- Restored `separator.worker.js` byte for byte from the v1.9.3 tag. This restores its original model reader, GPU/CPU comparison, sequential model initialization, split loop, and cancellation queue behavior. The worker no longer imports the two 1.9.4 AI helpers, and those unused helper files and their obsolete tests were removed.
- Restored frontend warmup when Real stems mode is selected. The server still downloads missing models in response to requests, so unrelated server startup, caching, compression, and admin improvements remain intact.
- Reversed immediate cancellation when an unfinished job loses its last listener. Brief detach/reattach now keeps the existing job and audio. Existing cache eviction and mode-switch cancellation remain available. Cancellation can again finish the current model chunk before stopping; this is an intentional consequence of the conservative rollback.
- Retained the 1.9.2 final-level fix and the existing phone cache limits, next-song preload policy, waveform throttling, and visible-tab polling.

The rollback restores the last known working AI implementation. The precise change that caused the reported mobile failure remains unproven because the physical phone runtimes were unavailable.

## Repair behavior and verification

AI errors now pass their original reason to a persistent visible status message. The dropdown and mode explanation reflect Light playback. Selecting Real stems retries the current round while retaining the saved AI preference. A crashed worker is terminated and replaced on retry. Missing worker, audio-decoding, or WebAssembly capabilities also produce an explicit fallback reason.

The shortcut hint is hidden for phone and tablet identities, including Android tablets and iPadOS using a Mac user agent. Window width, low memory, and touch on a Windows/Linux desktop do not hide it. Desktop keyboard handlers remain unchanged.

A follow-up audit removed the old `hover: none` stylesheet override and verified computed visibility on a touch-only desktop. See `further-optimization-audit.md` for the additional audio-lifecycle, network, and asset findings.

All 33 automated tests passed, covering actual bundle methods, final-level original playback, hand-made stems, cache protection, cancellation, server compression and validation, progress, and admin authentication. The original snippet playback, snippet start selection, random seed handling, hand-made stem loading, and final-level transition methods were also checked for equality with 1.9.4. No settings, progress data, song edits, or admin password files were edited.

A local browser served the repaired compiled frontend, the real hosted audio fixture, the existing real models, and the same isolation headers. Deliberate model HTTP 503 and worker startup failures displayed their reasons, selected Light, preserved the saved AI preference, and successfully retried. Android phone, Android tablet, and iPad identity checks hid the hint; a 390-pixel-wide Windows desktop with ten touch points kept the hint and handled the S shortcut. These identity checks ran in Chromium and do not emulate Safari's execution engine or phone hardware.

Asset URLs use `v=1.9.4-ai-repair1` so a later authorized deployment can distinguish this repair from cached 1.9.4 scripts without changing the release version.

## Measurements

Input: the real 172.199-second `Livin lyke us` recording, decoded to 7,593,984 samples per channel at 44,100 Hz. Each complete separation ran 60 model inferences over 15 chunks. Models were already on disk; network download time is excluded. The browser was Chromium 152 in Electron 44.7 on this Windows computer. Timers wrapped existing inference and FFT functions only in the test server's response; no measurement code was added to production assets.

| Provider | CPU threads | First stem ready | Total including startup/decode | Split computation | Model inference | FFT |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| WebGPU | 8 for the CPU compatibility probe | 4.03 s | 15.33 s | 12.54 s | 3.40 s | 2.62 s |
| WASM | 1 | 4.75 s | 47.05 s | 45.88 s | 37.03 s | 2.45 s |
| WASM | 4 | 3.72 s | 29.80 s | 28.46 s | 19.19 s | 2.64 s |
| WASM | 8 | 3.49 s | 34.75 s | 33.74 s | 25.00 s | 2.48 s |

These are exploratory single runs, not statistically controlled benchmarks. Browser allocation history, instrumentation, and background activity affect timings and process memory. A short mask microbenchmark overlapped the end of the eight-thread run. No automatic provider or thread-count policy was changed.

The game's original stereo plus three mono stem buffers occupy exactly 144.84 MiB for this song. The three generated mono stems alone occupy 86.91 MiB. Worker accumulation and normalization arrays occupy another 115.97 MiB; spectral arrays occupy 16.01 MiB, with a 4 MiB model input and approximately 16 MiB of model outputs, in addition to the worker's stereo input and ONNX session memory. These figures come from the actual decoded sample count and allocated array dimensions, not an assumed song duration.

Four initialized sessions stayed alive while Light playback was active and the worker was idle. Terminating the idle worker in the measurement harness reduced combined process private memory by about 201 MiB in the GPU case and 534 MiB in the single-thread CPU case after one second. Four-thread and eight-thread cases showed about 172 MiB and less than 1 MiB after one second, respectively. This variability means parent-worker termination alone is insufficient evidence of complete runtime/thread-pool cleanup. The measurements include all app processes and exclude dedicated GPU VRAM; they do not isolate model weights.

In the GPU run, advancing to final-level original-song playback immediately after the first chunk still allowed 56 of 60 inferences to run. The final playback source itself remained the original full song. This confirms avoidable computation, without changing the final-level fix.

The normalization loop calls `Math.pow` twice for each mask value, once in the denominator and again in its numerator. This recording requires 121,552,896 such calls. An isolated V8 microbenchmark using a sample of the actual model output repeated across bins measured 247-255 ms per 1,000 frames for the current loop and 138-145 ms when reusing the same computed double-precision powers, with 64 KiB of temporary storage. The sampled results were bit-identical. This is a limited microbenchmark, not a measured end-to-end speedup or a full audio-quality validation. Production calculations remain unchanged.

## Ranked opportunities for later approval

| Rank | Opportunity | Evidence and likely benefit | Required constraints |
| ---: | --- | --- | --- |
| 1 | Release idle AI sessions and their runtime/thread pools | Four sessions remain after entering Light; idle memory is substantial and cleanup varies with thread count. Most relevant to phone reliability. | Explicitly release all sessions and child workers, measure delayed memory reclamation, retain original audio, and verify reinitialization on Android and Safari. |
| 2 | Stop separation at the final level | 56 of 60 inferences continued after the original song was already sufficient. | Cancel worker computation without clearing the original buffer, restarting playback, or changing the 1.9.2 timing behavior. |
| 3 | Reduce worker buffers to a rolling overlap region | Accumulation and normalization alone consume 115.97 MiB for this song and scale with length. | Preserve FFT windows, overlap-add boundaries, normalization, emitted sample ranges, seek behavior, and numerical output. Do not reduce quality or change snippet timing. |
| 4 | Tune CPU/GPU selection and CPU threads | Four threads beat eight for total CPU processing in this exploratory run; WebGPU was fastest. | Repeat on actual phone hardware with thermal and memory measurements. Keep the correctness comparison and a supported CPU path. Do not generalize one desktop result to phones. |
| 5 | Persist generated stems | A reload currently repeats all 60 inferences; preserving float32 stems costs 86.91 MiB per song before metadata. Potentially avoids 12-46 seconds of split computation on repeats. | Use an audio/model/algorithm identity key, handle edited songs, enforce quota and eviction, preserve float32 quality, and measure actual storage and read latency before choosing a format. Current model-download caching and hand-made stems must remain distinct. |
| 6 | Reuse repeated mask powers and review repeated reconstruction work | The isolated power loop was about 42% faster with identical sampled output; about 6.5 seconds of the GPU split remained outside measured FFT and inference. | Preserve double precision and addition order, verify complete stem output and listening quality, and measure the whole pipeline before claiming a speedup. |

No opportunity in this ranking has been implemented. Test-only provider overrides, worker termination, and the isolated mask experiment are measurements, not production optimizations.

## Local evidence files

The ignored `.tmp/` folder contains `hosted-ai-audit/`, `hosted-browser-audit.trace`, `ai-repair-verification.json`, `ai-repair-smoke.json`, `mask-repetition-measurement.json`, `ai-failure-desktop.png`, and the diagnostic harnesses. These files contain local test evidence and are not part of a release. Any later release notes should use normal dashes with each paragraph on one physical line.
