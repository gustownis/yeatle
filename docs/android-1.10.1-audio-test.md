# Android audio check — 1.10.1 local candidate

Tested on 17 October 2026 on the connected Samsung SM-S931B running Android 16.
Chrome Beta 157.0.8103.5 and Brave 1.97.56 (Chromium 155.0.8059.40) both passed
the checks below. This follows the [silent phone check](android-1.10.1-silent-test.md).
This report records pre-release testing. Publication was authorized separately
by the user after final checks on 17 October 2026.

## Conditions

The phone loaded the local candidate through USB using a private localhost
origin and separate test data. Music volume was set to 15% inside the test app,
with karaoke guide vocals off. System volume and the ten-minute screen timeout
were unchanged. Existing audio from other apps was paused before testing.

The browsers already had Android microphone permission. A temporary microphone
grant applied only to the test origin; that origin returned to the prompt state
afterward. This verifies real capture, not the native permission-dialog flow.
Only aggregate input levels were retained; no microphone recording was saved.
Background noise was uncontrolled, and no person was asked to sing.

## Results

| Check | Chrome Beta | Brave |
| --- | --- | --- |
| Real microphone | Live, unmuted, 48 kHz mono | Live, unmuted, 48 kHz mono |
| Input samples with nonzero signal | 25/30 | 15/30 |
| Speaker echo reduction | Off/on reopened the mic; old track ended | Same |
| HQ karaoke and AI karaoke | Running audio context, advancing time, nonzero music output | Same |
| AI karaoke preparation | All 15 segments completed | All 15 segments completed |
| Pause/resume and seek | Frozen context while paused; resumed and sought to 32 s | Same |
| App mute | Zero music output at zero volume | Same |
| Three karaoke restarts | Two playback gains plus one silent mic sink each time | Same |
| Leave tab and return | Paused automatically; stayed paused on return | Same |
| Results | HQ results opened; AI reached results after seeking near its end | Same |
| HQ game stems | All four tracks played; sampled positions within 1 ms | Within 3 ms |
| Repeated HQ 0.5 s snippets | Stopped 3–10 ms past the media boundary | Stopped 11–17 ms past it |
| Original-audio 0.5 s snippet | Stopped 7 ms past the boundary | Stopped 8 ms past it |
| Real stems final reveal | Full 172.20 s original; playback verified at 100 s | Same |
| Return to Real stems | Old player disposed; replacement preparation succeeded | Same |
| Cleanup | No live test mic tracks or playback sources | Same |

The snippet measurements compare the media playhead with its requested endpoint;
they do not measure speaker or Bluetooth latency. The early isolated drum track
was very quiet, so its loudness was not used as a pass/fail threshold. The final
original-audio output was clearly nonzero at the sampled later position.

Both browser runs reported no uncaught page errors. Playback checks inspect the
real output graph and playback state; subjective sound quality was not assessed
by listening. No new application fix was required during these checks.

Ignored local evidence is in `.tmp/android-1101/chrome-audible-result.json`,
`brave-audible-result.json`, `chrome-game-audio-result.json`, and
`brave-game-audio-result.json`. Instrumented test tabs and their stored data were
removed after each run. The debugging routes and local fixture server were
removed/stopped after testing.

## Still needs hands-on testing

- Sing along to check scoring, sensitivity, guide vocals, and lyric timing.
- Run tap/clap calibration with the intended speaker/headphone setup.
- Check Bluetooth separately, if used.
- Check screen locking/unlocking, actual app switching, landscape layout,
  and longer sessions for heat and memory pressure.
- Try blocked microphone permission, retry, and another physical input if available.

The remaining checks are disclosed in the release notes. See the
[1.10.1 testing checklist](testing-1.10.1.md) for the release verification record.
