# Catalog answers, sources and credits

A song's answer names, playable recording, artist role, release status and era
are separate facts. A shared beat, similar name, matching runtime or era label
does not establish identical vocal performances. Confirm an audio relationship
before adding an interchangeable full-song answer or merging more entries.

The existing 1.11.3 catalog merges are retained. Each merged entry now also
retains its individual source records and tracker fingerprints. Public pool
variants contain safe metadata and stable audio identifiers; source host data
stays on the server. Selecting Released or Unreleased projects the appropriate
source rather than playing a leaked file under a released label. Stems only
selects the installed pack. All songs retains the existing source quality
ranking; it does not globally prioritize releases.

`catalog-policy.cjs` handles eligibility. Explicit Production/producer-only
credits and confirmed recordings without Yeat vocals are excluded from future normal rounds, suggestions and the stem
download catalog. Yeat features remain eligible even when another artist is
the primary artist. Missing credits remain unknown and eligible for further
investigation. Unmatched stem folders are not automatically classified as
released. Optional `Status: Released` or `Status: Unreleased` in verified pack
metadata can supply that fact.

`catalog-metadata.json` holds narrowly scoped, evidence-described corrections.
It preserves audio files and tracker fingerprints. Administrator display-name
overrides are applied afterward. Now LS remains separate from the released Now
on AftërLyfe; its LYFESTYLE [V2] era and 2024 era year follow the supplied
identification and tracker metadata. Both existing LS source ids are retained.
Full-length decoded comparisons on 2026-10-20 established that the Now LS pack
and tracker Now prod synthetic are the same performance (166.452 s, zero lag,
0.99660 normalized correlation), separate from AftërLyfe's Now.

The Addicited pack likewise matches tracker addicted V2 (163.213 s, zero lag,
0.99545 correlation). Its display spelling is corrected to Addicted; the folder,
both ids and audio mappings remain unchanged. Verified `answerId` relationships
deduplicate future pools and suggestions, preferring installed stems while
respecting each source's own release status. `answerKeys` accepts either spelling.
`equivalentIds` carries completion, Karaoke scores, lyrics and timing to the
preferred playable source without deleting the original saved references.

Cant See has two distinct recordings: the 2:49 Synthetic & Perdu LS V2 song
and the 2:17 Curesful Alivë remix. Both keep their existing tracker ids and
have explicit version labels in suggestions and results. The unqualified
title remains a valid answer to either, but one version label does not answer
the other. The public Cant See pack has no era metadata: its decoded four-stem
sum matches LS V2 at zero lag (169.0905 s, 0.995234 correlation), while Alivë
does not match (0.01085). `stemBindings` binds that folder to its verified
tracker source before title matching. An old cache moves the pack to LS V2
and restores Alivë's original source. A saved practice snapshot using the
pack follows the same files, keeping attempts and clip start. Pinned Daily
snapshots are excluded from this source repair.

The solo Kankan Zaza V1 and solo Yung Kayo Fleek V1 lack Yeat vocals and are
excluded; GOONIE's Zaza V2 with Yeat remains eligible. At the maintainer's
request, the separate Fleek V2 tracker entry is also excluded, retaining only
Yung Kayo's YEET featuring Yeat. This explicit eligibility decision does not
change Fleek V2's tracker credits or declare two recordings interchangeable.

The maintainer's 2026-10-22 exclusion list covers 60 tracker rows, including early solo demos, reference tracks, the released Have You Ever without Yeat's verse, Eaters V2 without Yeat, fuëgo's instrumental, and producer-only AMG C63, ATM and Louder. `excludedRecordings` in `catalog-metadata.json` scopes the rules to the supplied titles, tabs and tracker versions; the two untitled rows additionally require their Firemane or Houston, Texas alias. Known audio source ids also cover older caches and installed packs with those sources as fallbacks. These are selection exclusions and do not rewrite credits: for example, the tracker describes background vocals on No Clout, which is still excluded at the maintainer's request. Unavailable rows are covered if they acquire playable links later.

The parser retains `trackerVersion` separately from answer titles. Excluding a demo never excludes a later Yeat feature just because their titles match. Merged entries and old caches reselect an eligible source for each pool while retaining every original source, audio id and tracker fingerprint. Full recordings keep their existing preference over streaming previews. Birthday V2, Pull Up V2, Dope Sickk V2, Not Da Same V2, Cop My Style V1 and the original Eaters release with Yeat remain eligible. Existing pinned Daily snapshots and practice audio selections retain their original recordings.

Audio preparation caches use `audioId` when supplied, falling back to `id`
for older records. Pool projections with different playable sources cannot
share a preparation job merely because their progress id is the same. All
songs and a pool selecting the very same source can reuse that job.

The public The Coste V2 and V5 files align throughout (0.96201 correlation);
the released THE COSTËS pack aligns with V2 (0.96429), and the official Apple
preview aligns at 84.985 seconds (0.98150). Together with the tracker filenames
and version notes, this supports retaining 1.11.3's existing answer grouping.
The official preview checks only its available 29.976-second excerpt.

Popout's playable source is byte-identical to tracker Popout OPEN prod juju
(181.499 s). It is labeled open verse and links its relationship to KillBunk's
Pop Out (feat. Yeat) in information and results. The released feature retains
its own credits, status and audio; the unrelated SUBZEROSWIZ snippet receives
no such label. No interchangeable full-song identity between the open verse
and completed feature is asserted.

Guess matching is exact after accent, case and punctuation normalization.
Maintained aliases can be combined with this recording's actual featured
artist, using feat., ft. or with. A suggestion click still only fills the input.
No fuzzy title or arbitrary featured-artist matching is introduced.

Saved Daily entries retain their original song, audio and clip start. The new
eligibility rule affects future choices. Retired entries remain separately
available to restore existing practice rounds; they are excluded from future
selection and suggestion lists. Old mixed-source caches keep their ids and
audio but await a tracker refresh before claiming a release-specific source.
New practice snapshots retain their public source selection across reloads;
old snapshots resolve their original id before deduplication, including retired
producer-only records. Metadata can add correct answer keys without changing
the stored source or clip.

For instrumental-only hints, an alternate answer must be supported by a
verified relationship between the actual stems of two eligible songs. No
blanket same-beat acceptance is registered here. The reported AMG C63 case is
handled by its Production credit, without making it an alias of Expensive
Taste. Verification of any additional indistinguishable-stem relationship is
required before enabling ambiguity handling for it.
