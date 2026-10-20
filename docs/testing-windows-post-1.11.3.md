# Post-1.11.3 catalog, routes and HQ picker verification

Tested on Windows x64 on 2026-10-20 with Node.js 24.15.0, Electron 44.7.0
(its bundled Node.js 24.21.0), and Edge 155.0.4283.62. Tests used disposable
profiles and data directories. Playback was muted; no physical listening,
singing, microphone, iPhone, macOS or Linux device pass is claimed.

## Starting point

The checkout was clean on main at `5c64921c2d61aaeae899096fe76f04ef6825f139`,
also the published `v1.11.3` tag. Fetching origin confirmed it was current;
GitHub's latest regular release was v1.11.3. Root package.json was 1.11.3.
This checks the source folder, not a separately installed desktop executable.
The published version and tag are unchanged by this follow-up.

## Causes and changes

- The tracker parser discarded vocal features while retaining Production
  records. The credit policy now includes features and excludes producer-only
  tracks from future pools, suggestions and the download catalog. Records,
  installed files and existing rounds remain available. An OG File row or a
  stem folder without its artist prefix cannot erase the production credit.
- 1.11.3 combined released metadata with whichever audio ranked highest, even
  when that was a leak. Merged entries now retain individual sources, with
  stable audio ids and separate Released, Unreleased and Stems-only projections.
  All songs retains source quality ordering. Era counts follow those sources.
- Addicited was an unmatched stem folder, separate from tracker addicted V2.
  Full audio comparison verified the relationship. Both original ids and the
  original folder remain; the display is Addicted, either spelling answers
  correctly, and future pools/suggestions prefer the installed stem entry.
- Whatchu/Watchu already shared bare aliases, but an alias combined with the
  actual guest name was missing. Exact matching now expands maintained aliases
  with that recording's guests, accepting feat., ft. and with. It does not use
  fuzzy names or accept unrelated artists. The 1:45 and 4:09 recordings remain
  separate versions.
- Now LS's pack and tracker recording match, and share a verified answer
  identity. Both source ids remain. LYFESTYLE [V2], 2024 and Unreleased display
  consistently; AftërLyfe's Now remains separate and does not answer Now LS.
- Popout's exact playable source matches the tracker open-verse demo. Its
  version label and relationship to KillBunk — Pop Out (feat. Yeat) appear in
  information and results. The completed feature stays separate with its own
  primary artist and release metadata. Preview and lyric searches use that
  artist rather than assuming every recording is primarily by Yeat.
- Canonical /daily and /karaoke pages serve the tracked HTML. .html and
  trailing-slash links redirect with 308, preserving queries and browser
  fragments. Navigation and copied results use the clean paths. Hosts with an
  old dailyPublicUrl emit its clean equivalent without rewriting private
  configuration. Normal clients retain the public shared authority.
- Check all is a checkbox above the HQ list. It selects available search
  matches, supports partial selection and unchecking, and skips installed,
  busy and conflicting entries. Download selected queues them through the
  existing bounded downloader. Selecting alone starts no transfer.
- The updater's application-menu rebuild was reattaching the menu to the HQ
  popup. Every rebuild now removes the menu and hides the menu bar on utility
  windows, in addition to removing it on creation.
- New practice snapshots preserve the selected recording across reloads.
  Older snapshots restore the original id before suggestion deduplication.
  Pinned Daily song/audio/clip/reset and saved attempts remain intact.

## Recording evidence

The live [tracker](https://docs.google.com/spreadsheets/d/1FUzAZyTCgFTVxQ--qbCAS2bUk4dsAw6ASxwjURPHbyI/edit)
and public catalog were read, and the specific public audio files were saved
only in ignored temporary storage. Web Audio decoded mono samples at 8 kHz;
full cross-correlation established offsets, followed by normalized waveform
correlation in independent ten-second windows. Volume normalization does not
establish equivalence on its own; tracker provenance and the whole overlap
were considered together.

| Comparison | Result |
| --- | --- |
| Addicited stem sum / tracker addicted V2 | 163.213 s, zero lag, 0.99545 full correlation |
| Now LS stem sum / tracker Now prod synthetic | 166.452 s, zero lag, 0.99660 |
| The Coste V2 / V5 | 153.835 s available files, zero lag, 0.96201 |
| THE COSTËS stem sum / V2 | 153.835 s overlap, zero lag, 0.96429 |
| V2 / official THE COSTËS preview | 29.976 s excerpt at 84.985 s, 0.98150 |
| Playable Popout / tracker Popout OPEN prod juju | Byte-identical; 181.499 s |
| Popout open verse / official KillBunk preview | 29.975 s excerpt at 32.135 s, 0.98492 |

The official [THE COSTËS](https://music.apple.com/us/album/the-cost%C3%ABs/1774384537?i=1774384684)
and [KillBunk release](https://music.apple.com/us/song/1847717924) checks cover
their available previews, not full released audio. The tracker distinguishes
the completed KillBunk feature from the earlier open verse; shared Yeat vocals
do not establish that both complete recordings are interchangeable.

No verified pair of indistinguishable stems from two eligible songs was added.
AMG C63's production-only exclusion resolves its future selection without
making it an Expensive Taste alias. Additional stem ambiguity handling needs
verified stem relationships; a shared beat alone never grants an answer.

## Checks run

- `npm test`: 129 tests, 128 passed, zero failed, one Windows symlink-rights
  skip. Initial sandbox runs could not open loopback servers; the full passing
  run used the normal Windows environment.
- `scripts/catalog-smoke.cjs`: actual browser checks passed for direct routes,
  redirects, query strings, fragments, reload/history, matching at 0.5/1/3 s
  under both Addicted ids, typed/selected Watchu answers through 15 s,
  suggestion selection using no attempt, distinct Now identities, preserved
  retired rounds, Popout information/results, deduplication and 390 px layout.
  Metadata fixtures use one local song as synthetic playback; actual recording
  identity was checked separately above.
- `scripts/desktop-stems-smoke.cjs`: actual Windows app passed selection,
  download/install/cancel/retry display, byte checks, live catalog refresh,
  four-stem decoding and Karaoke playback. Check all toggled all three fixture
  songs; menu bar stayed hidden after an update check, twelve seconds, and Alt.
- `scripts/desktop-smoke.cjs`: desktop transitions, reduced motion, saved
  preferences, Karaoke lifecycle, Daily persistence and Open in Browser passed.
- `scripts/browser-smoke.cjs`: standalone browser navigation, playback,
  preferences, reduced motion and portrait layout passed.
- `scripts/daily-ui-smoke.cjs` and `scripts/daily-browser-smoke.cjs` passed
  with an isolated authority: mouse/keyboard/touch suggestions, copy-only
  sharing and clipboard fallback, two independent clients with identical
  audio/clip/reset, four-stem and single-file authority playback, failed-host
  retry without a local fallback, navigation during loading, and fixture-clock
  UTC rollover. Older QA selectors referencing .html navigation were updated
  before the final passing runs. Detailed reports, screenshots and audio
  comparisons are in ignored `.tmp/`.

## Delivery

Source changes are prepared for the repository's existing automatic website
deployment. Public deployment and independent public-client verification are
recorded after the push. No subsequent desktop release has been published;
the installed 1.11.3 app requires a later build to receive desktop-only changes.
Private host settings, music, models, caches and the pinned Daily store have
not been overwritten.
