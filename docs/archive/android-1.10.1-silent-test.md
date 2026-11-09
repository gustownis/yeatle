# Android 1.10.1 silent checks

Date: 17 October 2026. Candidate: local 1.10.1 preview 3.

The user requested phone debugging while intermittently away, then asked to defer speaker playback because someone was sleeping. All checks below were silent. The phone's ten-minute screen timeout was left unchanged. No release or website deployment was performed.

## Setup and scope

Connected handset: Samsung SM-S931B, Android 16. Browsers tested:

- Chrome Beta 157.0.8103.5.
- Brave 1.97.56, Chromium 155.0.8059.40.

A temporary loopback server supplied two existing audio fixtures and cached models over USB. Each browser used a new test tab and a separate local origin, with test volume zero and the singer set to watch without a microphone. Temporary guards blocked media-element playback, scheduled audio sources, and microphone requests before the app loaded. They recorded **zero playback attempts and zero microphone attempts** in both browsers. No phone volume settings, browser security flags, permissions, installed apps, normal Yeatle progress, or admin passwords were changed.

The setup follows the official [Chrome Android debugging guide](https://developer.chrome.com/docs/devtools/remote-debugging/). Screen state was checked before foreground-dependent stages. The phone remained awake during the completed checks; no automatic unlocking or timeout override was used. Normal test taps interacted with the page.

## Results

| Check | Chrome Beta | Brave |
| --- | --- | --- |
| Real viewport | 411 × 781 CSS pixels | 411 × 733 CSS pixels |
| Setup and game layout | No horizontal overflow; mobile shortcut hint hidden | Same |
| Stems → Snippets → Stems | Correct selected tabs; two transitions; no renderer errors | Same |
| Panel configuration | Separate `yeatle-surface` transition layer present | Same |
| Settings controls | Only music volume visible while collapsed | Same |
| Motion policy | Full motion from reported 8 GB / 8 CPU threads | Full motion from reported 8 GB / 7 CPU threads |
| Dropdown touch input | Opened, showed intermediate heights, closed | Same |
| HQ decoding and chart | 162.14 seconds; 443 notes; 23 phrases; local lyrics loaded | Same |
| HQ preparation time | About 2.44 seconds | About 2.51 seconds |
| AI separation and chart | 172.20 seconds; 15 segments; WebGPU; 395 notes; 19 phrases | 172.20 seconds; 15 segments; WebGPU; 398 notes; 19 phrases |
| AI preparation time | About 40.69 seconds | About 32.27 seconds |
| Generated-stem cache | Second load created no new worker | Persistence safely skipped after compatibility guard returned false |
| Sampled vocal data | Finite, nonzero samples | Same |
| Playback / mic attempts | 0 / 0 | 0 / 0 |

Times include local transfer, preparation, and normal phone conditions. These single runs are functional checks, not a controlled browser performance comparison. Browser memory/CPU hints are not the phone's physical specifications. Automatic charts can differ around pitch/confidence thresholds; this test does not validate their musical accuracy. No audible sources were started even though an audio context was running for preparation.

The panel's continuous darkness was verified separately in desktop paint-frame captures. This phone check confirms configuration and successful navigation, not a frame-by-frame phone compositing measurement.

## Remaining checks

- Actual playback, pause/resume, final-level reveal, and perceived sound quality.
- Real microphone permission, input switching, quiet singing, and scoring.
- Tap/clap calibration, speaker echo reduction, headphones, and Bluetooth timing.
- Screen lock/return, landscape use, cancellation/retry under phone memory pressure, and longer multi-song sessions.

These were deferred during the silent session. The subsequent [audio check](android-1.10.1-audio-test.md) records playback and microphone results and lists the remaining hands-on checks.

## Test record and cleanup

This document is the published summary of the local silent test. Raw diagnostic logs, screenshots, and temporary test scripts were not published. Instrumented tabs and their local test storage were removed after each browser run. Temporary USB mappings and the local test server are removed at the end of this task. Existing unrelated debugging connections and normal browser data are retained.

Initial harness attempts encountered an oversized power-status response and a touch/scroll settling delay. Narrowing the status query and waiting for the mobile toolbar/tap to settle resolved them. They were test-harness issues; neither establishes an application defect. No production-code repair was needed for the completed silent checks.
