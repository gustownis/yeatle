# Catalog follow-up verification — Windows, 2026-10-20

This follows the post-1.11.3 work described in
[the earlier report](testing-windows-post-1.11.3.md). The checkout and latest
regular release were both 1.11.3; main was synchronized before these edits.
No installer or replacement release is published by this change.

## Behavior

- The Cant See HQ pack is bound to the verified LS V2 tracker source rather
  than the first title match. Alivë retains its own recording and progress id.
  Both versions have explicit suggestion/result labels. Old catalog caches
  are repaired without moving files; saved HQ rounds follow their actual pack
  with attempts and clip start intact. Pinned Daily audio remains unchanged.
- Both Fleek entries are excluded at the maintainer's request. YEET featuring
  Yeat remains. Kankan's original Zaza without Yeat is excluded while GOONIE's
  version featuring Yeat and Kankan stays. AMG C63 remains excluded from new
  rounds, as it was before this follow-up.
- Audio preparation jobs use playable source ids. A regression test first
  reproduced the old bug: a released recording and a leak sharing a progress
  id reused one job. They now prepare separately; repeating the same source
  still reuses its job, and failed-source retries leave the other source alone.

## Evidence and checks

The public four-stem Cant See sum and tracker LS V2 recording both decode to
169.0905 s and align at zero lag with 0.995234 normalized correlation. Each
ten-second window also aligns. The distinct 137.273 s Alivë recording has
only 0.01085 correlation. Audio and decoded samples are kept in ignored
temporary storage. The tracker identifies solo Fleek V1 as the original
Yung Kayo recording before the Yeat feature, and Zaza V1 as lacking the
additional Yeat feature. Fleek V2's exclusion is a selection decision, not
a changed tracker credit.

- `npm test`: 133 tests, 132 passed, zero failed, one Windows symlink-rights
  skip. Policy checks cover fresh matching, old cache repair, distinct answer
  labels, unchanged pinned Daily source/clip and eligibility in every pool.
- `scripts/catalog-smoke.cjs`: actual Edge checks passed, including saved HQ
  Cant See round migration, LS V2 information, rejecting the Alivë version
  label for LS V2, both suggestion labels, reload persistence, Fleek/Zaza
  exclusions, retained features and portrait layout. Metadata fixtures use
  local synthetic playback; recording identity was checked separately above.
- `scripts/desktop-smoke.cjs`: actual Windows Electron checks passed for
  navigation, preferences, Karaoke playback/pause/resume/restarts, permissions,
  Daily persistence and Open in Browser. Its pause check now waits for the
  suspended audio clock and final rendered frame instead of a fixed delay;
  the initial run exposed that test timing race under concurrent load.
- An additional Edge probe exercised the shipped job cache and constructor
  with real fetch/decode of two synthetic tones, isolating model execution.
  It produced two distinct decoded buffers, reused the repeated source and
  kept the original job alive. This does not claim a new AI model-quality test.
- Profiling a captured 1,314-song public catalog found all four pool projections
  plus era counts together took about 4 ms median on desktop and 33 ms with
  four-times CPU throttling at portrait width. Six pool-control interactions
  took 22–43 ms and 77–96 ms respectively, with no overflow or page errors.
  These are local diagnostic measurements, not hardware guarantees.

The HQ Check all/menu regression checks from the preceding report remain
applicable; this change additionally excludes non-vocal records at download
catalog validation. Physical microphone behavior, macOS and Linux were not
exercised locally in this follow-up.

## Delivery

Runtime changes were pushed as `ec44d1c`. GitHub Checks passed on Windows,
macOS and Linux for that commit. The existing automatic deployment updated
the public website, where all ten checked pages/modules match the pushed
source after line-ending normalization. Both Fleek records and Kankan's solo
Zaza are absent from the normal catalog; YEET and GOONIE's Zaza with Yeat
remain. Searching a retained title alias can still find YEET, without
reintroducing either excluded recording.

Live Cant See entries are labeled LS V2 and Alivë. Only LS V2 owns the HQ
pack, including the download catalog's id and era. The public Daily stayed
`v1:2026-10-20:comengo`, with clip start 6.53 s, the same reset and byte-identical
audio (1,848,547 bytes; SHA-256
`fd681e8da78e005d249fcafdaca1512ac8fef466ab987d91c21f97f44d33d93f`).
Two independent local clients using the public authority confirmed that same
Daily and audio. Separately installed desktop executables still require a
later build; this checkout contains the desktop fixes.
