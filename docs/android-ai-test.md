# Physical Android AI test

Historical audit recorded before 1.9.5 release preparation. The verified repair and optimizations are included in the 1.9.5 release candidate, whose asset queries use `v=1.9.5`. See [release notes](releases/1.9.5.md). Website deployment remains separate.


Date: 13 October 2026. The user connected the phone and authorized USB debugging for this test. Device identifiers are omitted from this report. Release metadata remains 1.9.4; no website deployment, push, or release publication occurred.

## Device and setup

The connected phone reports model SM-S931B, Android 16 / API 36, eight logical processors in Chrome Beta, and approximately 10.85 GiB in Android's `MemTotal`. Installed browsers were Chrome Beta 156.0.8078.25 and Brave 1.97.56, whose Chromium engine reports 155.0.8059.40. Brave reported six processors and 4 GiB through browser APIs; Chrome Beta reported eight processors and 8 GiB. These browser values do not establish the phone's physical memory or core count.

Google's portable Android SDK Platform-Tools were downloaded into the ignored `.tmp/android-debug/` directory. USB forwarding connected the browsers' separate DevTools sockets and a temporary local server. No phone apps, drivers, browser flags, global device settings, real admin passwords, or production server data were changed. Only test tabs were inspected. Hosted Yeatle settings and progress were backed up before each hosted trial and restored before retiring its tab. Local tests used a separate loopback origin with temporary server data, existing real models, and real audio fixtures.

The setup follows the official [Android platform-tools documentation](https://developer.android.com/tools/releases/platform-tools) and [Chrome Android debugging documentation](https://developer.chrome.com/docs/devtools/remote-debugging/). No root access or broad device log collection was used.

At completion, the local test origin's IndexedDB and local settings were cleared in both phone browsers, test tabs were closed, the isolated server was stopped, and the USB mappings created for this test were removed. The hosted site's useful model downloads and restored user data were retained.

## Hosted 1.9.4

The reported instant AI-to-Light fallback did not occur in the captured fresh trials. Selecting Real stems created a worker, fetched models and the ONNX runtime, initialized WebGPU, progressively emitted stems, and completed the real song `livinlykeus`. The first model download took about 88 seconds on the phone's connection; the trial completed around 124.5 seconds after selection. Long initial downloads remain a user-visible cost and should not be confused with completed separation.

The song in the user's saved round was `rockets`. It also initialized WebGPU, emitted all 15 chunks, and completed hosted separation. Cached model responses avoided the first trial's long download. No scoped browser exception, worker startup error, model/helper request failure, MIME problem, or immediate cancellation was captured in either trial. The dropdown remained Real stems while separation actually ran.

These successful runs do not establish why the original report failed or prove every mobile session is reliable. Earlier settings, upstream audio availability, memory pressure, prior cached files, and browser version differences were not reproduced. The hosted site still uses its existing deployment, which does not include the local regression repair or generated-stem cache.

## Local repair on Chrome Beta

Input: the real 172.199-second `Livin lyke us` recording, decoded to 7,593,984 samples per channel at 44,100 Hz. The final verification used the compiled local frontend and actual backend responses through USB forwarding; diagnostic wrappers exposed state and timings without changing the normal GPU/thread selection or DSP calculations.

| Check | Observed result |
| --- | --- |
| Full GPU separation | First stem ready in 5.13 seconds; complete in 30.55 seconds; 60 model inferences; WebGPU selected. |
| Split computation | 26.98 seconds in the final run. These timings include normal phone/browser conditions and are not a controlled comparison with desktop or Brave. |
| Actual playback | The audio context resumed and four preview sources played. All generated buffers contained finite, nonzero samples. |
| Persistent stem reload | Ready in 2.456 seconds; zero new separation inferences; original and all three generated sample hashes matched the fresh result. |
| Final level after the first chunk | Five inferences, then cancellation; one original-song source retained the full song loop and seeking to 50 seconds. |
| Deliberate model HTTP 503 | A visible reason identified the failed drums model; actual playback and the dropdown changed to Light. |
| Retry after that failure | Selecting Real stems created a new attempt and produced playable stems. |
| Phone shortcut hint | The desktop shortcut hint was absent on the physical phone. |

After the user unlocked the phone for foreground playback, a requested 0.5-second snippet stopped at approximately 0.515 seconds. All four real hand-made stems played together; observed playback positions differed by at most 0.000058 seconds. The checks used the normal game controls and native media playback. The earlier locked-screen automation failures were resolved without changing the game's snippet or media logic.

## CPU, idle lifetime, and thermal observations

The actual Android WASM path completed full separation with the existing eight-thread policy: first stem in 4.59 seconds, completion observed in 37.14 seconds, 60 inferences, and 31.16 seconds of split computation. All output buffers contained finite samples. Storage was unavailable in this trial by a test-only override, and AI playback remained supported.

After completion, the production 60-second idle timer disposed the worker while the completed audio buffers remained available. Playback resumed successfully afterward. The measurement began several seconds after the worker's completion message, so the observed remaining wait was 56.74 seconds. Aggregate Chrome Beta proportional memory fell from approximately 1,354.5 MiB to 1,234.9 MiB after disposal. Peak sampled proportional memory during CPU separation was approximately 1,413.6 MiB. These totals cover the whole browser package, include other retained browser resources, and do not isolate model weights or dedicated GPU memory.

Short comparisons cancelled after two emitted chunks and nine inferences, with identical model order and input dimensions:

| CPU threads | Ready and cancellation observed | Mean inference | Battery temperature at end |
| ---: | ---: | ---: | ---: |
| 4 | 5.89 s | 370.11 ms | 37.8 C |
| 1 | 9.93 s | 776.52 ms | 38.6 C |
| 8 | 8.24 s | 512.68 ms | 39.2 C |
| 4, repeated | 8.32 s | 556.81 ms | 39.6 C |

The repeated four-thread trial reversed the apparent advantage over eight. Battery temperature is only an indirect indicator of chip temperature, and USB charging, foreground activity, allocator history, and thermal throttling were not controlled. These measurements do not justify changing the automatic thread policy. Test-only CPU overrides were removed by navigating to the ordinary worker, which selected WebGPU and produced stems again.

## Brave finding and repair

Brave completed full WebGPU separation. Its initial persistent-cache comparison then failed: readback hashes of cached stems differed from the fresh buffers even though the original-song hash matched. A separate synthetic buffer confirmed that each `getChannelData` call modified all 1,024 samples: a value written as 0.25 became approximately 0.249951 on its first read and 0.249902 on its second read. `copyFromChannel` was affected as well.

This behavior agrees with Brave's [audio-buffer implementation](https://github.com/brave/brave-core/blob/master/chromium_src/third_party/blink/renderer/modules/webaudio/audio_buffer.cc), which applies its privacy randomization to audio reads, and its [fingerprinting-protection documentation](https://brave.com/privacy-updates/4-fingerprinting-defenses-2.0/). Repeated reads in the newly added cache would therefore alter live buffers and persist changed samples. The hosted 1.9.4 worker does not use that generated-stem cache; the original hosted fallback cause remains unconfirmed.

The local cache now tests a separate 1,024-sample synthetic buffer before attaching to a separation job. If reads change samples, throw, or the optional helper is unavailable/outdated, persistence is skipped. The probe does not read or modify real game audio. This preserves normal AI separation and the user's privacy settings without introducing repeated cache reads of real buffers. Compatible Chrome Beta still uses the lossless cache, as confirmed by the final sample-exact reload above.

After this fix, Brave completed 60 WebGPU inferences, delivered its first stem in 3.92 seconds, and completed the recording in 33.20 seconds. Persistent caching was correctly disabled in its current privacy configuration; reloading attempted fresh separation rather than reusing altered samples. A deliberate model 503 displayed its reason and selected Light, and retry produced stems successfully. Asset queries were advanced to `v=1.9.4-local-opt2`; the release version was not changed.

## Evidence and limits

The automated suite passes 43 tests, including a non-mutating probe case, a simulated privacy-mutating API, and an unavailable API. The ignored `.tmp/android-debug/` directory contains hosted and local network/worker traces, `hosted-result.json`, `original-round-result.json`, `local-result.json`, `cpu-result.json`, `brave-before-cache-guard.json`, `brave-audio-inspection.json`, `brave-result.json`, `playback-result.json`, screenshots, private settings backups, and the test harnesses. Settings backups and device connection files are intentionally excluded from Git.

Some earlier harness files retain test-only errors: an opaque `about:blank` storage access in an initial bootstrap, and a cleanup call made after the Rockets tab had already closed. The final local and Brave harnesses guard their test origin and close in the correct order. The hosted worker completed and settings were restored before the Rockets cleanup error. These harness errors do not establish a Yeatle browser failure.

Testing covers this Android handset and these browser versions. It does not validate iOS Safari, low-memory Android hardware, all recordings, long-term battery use, or every network condition. CPU/GPU policy and audio quality settings remain unchanged. The phone's lock screen initially blocked timed media-element playback despite the renderer reporting itself visible; those checks passed after the user unlocked it. Performance measurements were exploratory and do not establish foreground frame rate or battery savings. This test did not deploy the website or publish a release.
