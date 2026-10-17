# Further optimization audit

Historical audit recorded before 1.9.5 release preparation. The verified repair and optimizations are included in the 1.9.5 release candidate, whose asset queries use `v=1.9.5`. See [release notes](releases/1.9.5.md). Website deployment remains separate.

Date: 13 October 2026. This extends the AI measurements in `ai-repair-audit.md`. Optimization candidates were measured or inspected without changing their production implementation. Nothing has been deployed or released.

This is the historical audit made before the user authorized local implementation. Several measured candidates were subsequently implemented and verified; see [local-optimization-results.md](local-optimization-results.md) for the current results and remaining work.

## Main new findings

| Priority | Candidate | Evidence | Expected benefit and constraints |
| ---: | --- | --- | --- |
| 1 | Retire old audio graphs completely | Twenty normal Stems/Snippets round trips created 352 audio nodes, all still alive after forced garbage collection. Closing the shared audio context left the 12 nodes referenced by the current player. | Reduce memory retained across long sessions. Handle native audio-context ownership, source connections, media elements, and event listeners together. Preserve synchronized hand-made stems, snippet fades, and the final-level original source. |
| 2 | Replace or condition the admin-song polling | Idle, playing, paused, and snippet trials each issued 10 `/api/active-song` requests in eight seconds. The client polls whenever the tab is visible, even when admin control is unused. | About 75 requests/minute or 4,500/hour per continuously visible tab. An event stream or a capability-gated poll can avoid much of this traffic while retaining prompt admin-song changes and reconnect behavior. |
| 3 | Compress the prepared song-list response | The hosted `/api/songs` response remained uncompressed even when gzip was requested. Its 525,812 bytes compressed to 65,911 bytes at gzip level 6. | About 87.5% less song-list transfer. Compress once per existing cache rebuild, preserve immediate tracker/admin/photo invalidation, and keep appropriate response headers. |
| 4 | Prepare or cache compressed static variants | The server streams a fresh gzip operation for every full download. The 21,663,894-byte runtime took about 152 ms to gzip at level 1 and produced 6,182,211 bytes. Level 6 produced 5,245,653 bytes in about 412 ms. | Avoid repeating compression under concurrent first-time visits and reduce runtime transfer by a further 0.94 MB when using a prepared level-6 variant. Retain revalidation, MIME types, HEAD behavior, and uncompressed audio/range responses. |
| 5 | Review image delivery and small icons | The background is a 1,481,304-byte, 1920x1080 PNG; the logo is 233,358 bytes. The favicon and prestige icon are identical 198,626-byte, 500x500 PNGs served under different URLs. | Background and logo alone account for 1.71 MB of cold-page artwork. Evaluate suitable encodings and resolutions with visual comparison. Share identical icon URLs and right-size favicon variants. No image conversion or quality change was made in this audit. |

The audio-graph finding belongs beside idle AI-model cleanup near the top of the combined backlog. Both affect memory, while stopping unnecessary final-level splitting remains a strong CPU/GPU saving. API compression and polling are useful improvements independent of the AI regression.

## Audio lifecycle experiment

The local browser ran the repaired compiled frontend and its actual `Lm` constructor/destructor. The game loaded the saved public manifest with 1,152 songs and a real 172.2-second audio fixture. Models were avoided by selecting Light. Audio was muted at the browser output; the playback implementation itself was unchanged. `WeakRef` tracked created audio nodes without deliberately retaining them, and garbage collection was requested before each observation.

| Observation | Audio nodes alive | Renderer private memory | JavaScript heap used |
| --- | ---: | ---: | ---: |
| Initial Light round | 12 | 40.68 MiB | 2.70 MiB |
| After 40 normal mode switches | 352 | 90.24 MiB | 3.41 MiB |
| After explicitly disconnecting retired nodes in the test | 272 | 90.25 MiB | 3.41 MiB |
| After closing the test audio context | 12 | 46.89 MiB | 3.29 MiB |

Closing the context released 340 retired node wrappers and about 43.4 MiB of renderer private memory in this experiment. This includes native audio/media allocation history, not just JavaScript node wrappers; it should not be extrapolated as a fixed memory cost per song. Disconnecting old nodes alone did not release everything. Native ownership and media-element references need investigation before choosing a production cleanup strategy.

A separate direct constructor/destructor stress test created 50 additional Light players and retained all 612 tracked nodes after collection. The subsequent normal-control experiment was used to confirm that the finding was not limited to artificial constructor calls. Longer-delay reclamation and actual Android/Safari behavior have not yet been measured.

The current destructor stops split sources, pauses and unloads media elements, removes the player from the active-player set, and disconnects its master from the destination. It does not explicitly dismantle every internal graph connection. Filter construction also does not keep a complete node list for later cleanup. These are concrete places to investigate rather than assuming a generic React memory problem.

## Network and static measurements

The public song-list response was verified with a fresh request advertising gzip: HTTP 200, no `Content-Encoding`, `Cache-Control: no-store`, and 525,812 decoded bytes. This agrees with the local server route, which caches the serialized JSON but writes it without compression. The existing response cache is useful and should be preserved.

| Input | Raw bytes | Gzip level 1 | Gzip level 6 | Gzip level 9 |
| --- | ---: | ---: | ---: | ---: |
| Song list | 525,812 | 86,433 | 65,911 | 64,680 |
| ONNX runtime | 21,663,894 | 6,182,211 | 5,245,653 | 5,200,941 |
| Drums model | 19,714,140 | 18,185,274 | 18,180,315 | 18,180,070 |

Level-6 song-list compression took about 5.8 ms on this computer. For the runtime, level 9 took about 917 ms and saved only another 44,712 bytes over level 6. Compressing the sample model saved just 7.8% and cost about 0.4 seconds. Model compression is consequently a lower-priority candidate than manifest compression, repeated static compression, and lifecycle cleanup. These are single local encoder runs, not server load-test results.

The server already revalidates unchanged code and runtime files. Precompression would help full downloads; requests satisfied by an existing 304 already avoid that work. Stronger compression should be prepared or cached, not performed afresh at its more expensive level on every request. Browser/model caching is distinct from the persistent generated-stem cache discussed in the earlier audit.

The full audio proxy deliberately uses `no-store`; switching playback paths can fetch the original song again. This is another candidate for a bounded original-audio cache or careful reuse of a decoded original after fallback. It needs separate measurement with edited-song invalidation, upstream failures, ranges, memory limits, and cache quotas. The local fixture server sent complete audio responses quickly, so its transfer behavior is not evidence of how much a phone downloads for a short snippet on the hosted upstream.

## Lower-priority UI findings

During an eight-second Light playback trial, 31 audio time callbacks caused 31 whole-game renders. Idle and paused trials caused no game renders. None of these trials wrote settings or progress to local storage while the audio clock advanced. This rules out the suspected possibility of saving progress on every clock tick.

Fifty synthetic autocomplete input updates against the 1,152-song manifest took about 34 ms total on this desktop. The code already caches normalized search entries and limits displayed suggestions. Moving this to a worker or rewriting the entire compiled UI is not justified by these measurements.

The audio context remained `running` during idle and paused trials. Suspending it when appropriate could be investigated for phone battery use, but the desktop experiment does not establish a large idle CPU benefit. Resume handling must remain compatible with browser gesture requirements and accurate snippet timing.

These renderer trials used a hidden Electron window. The document reported itself visible, but the compositor delivered approximately one animation frame per second. Their waveform and CPU observations do not represent a foreground phone or desktop at 30/60 FPS. Foreground waveform profiling would be needed before making additional drawing changes; the current phone frame cap and hidden-tab checks remain intact.

## Completion of the previously requested hint fix

The audit found an existing stylesheet rule, `@media (hover: none){.keys{display:none}}`, that could override the repaired device classification and hide the hint on a touch-only desktop. That rule was removed as a correction to the already-requested hint behavior, not as an optimization. The React phone/tablet condition now determines whether the hint is present.

Focused browser checks verified computed visibility, not just DOM presence: the hint stayed hidden for Android phone, Android tablet, and iPad identities, and was visibly displayed on a 390-pixel-wide Windows desktop with ten touch points. The S shortcut still worked there. No optimization candidate in this document was implemented.

## Audit record

This document summarizes local browser, compression, and memory measurements. Raw profiles, screenshots, and one-off diagnostic scripts were not published, so these measurements cannot be reproduced from this report alone. The application repair, settings, progress, audio algorithms, and server behavior were otherwise left as they were at the start of this audit. See [local optimization results](local-optimization-results.md) for the later implementation and verification record.
