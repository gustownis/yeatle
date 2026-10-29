# Leaderboard anti-cheat and bans

This note covers what the leaderboards trust, how ranked karaoke runs are checked, what bans do, and what none of it can guarantee. It was written for the 1.12 bans and anti-cheat change.

## The problem

The "Yeatle Karaoke Stem Injector" userscript runs at `document-start`, before the game's scripts, and replaces `getUserMedia`, `createMediaStreamSource` and `AudioBufferSourceNode.start`. The game's pitch tracker then hears an uploaded vocal stem, usually the song's own vocal, kept in sync with the backing track by a phase-locked loop. The chart is built from that same vocal, so almost every phrase rates "Awesome" and the score approaches the maximum.

The root cause was not the userscript. The server ranked results the browser reported about play it never saw: karaoke best scores, solved song ids, prestige and Daily results arrived through `/api/account/sync` and were trusted apart from shape checks. A forged sync request reached the top of every board without any userscript.

## What the server now trusts

- **Karaoke** rankings count only verified runs. Synced local best scores still travel between devices for display but never rank. Scores synced before verified runs existed are kept aside on each account (`legacyKaraoke`) and are not ranked.
- **Stems and Snippets** count only songs in the server's catalog, nothing before the catalog has loaded, and newly solved songs are credited at up to 120 an hour with a starting allowance of 300. Faster-than-human play is never held back; a first sign-in with a large local backlog is credited over a few hours. Solves already on an account when this change first runs are credited in full.
- **Prestige** rises at most one level a day and no longer lists a player on a board by itself.
- **Daily** wins are verified only when the last guess matches that day's answer with the game's own `matchesSong` rules. Existing verified entries stay verified.

## Verified karaoke runs

When a signed-in player with a microphone starts a song, the page asks `POST /api/account/karaoke/start` for a single-use run bound to the account, song, difficulty and mode, with the server's start time. At the results it sends `POST /api/account/karaoke/submit` with the score, the song length and a trace of one entry per phrase: start, end, duration, accuracy (or skipped), and three similarity numbers described below. Only Singer 1 is ranked. The server rejects a run that:

- was already submitted, expired after 30 minutes, or belongs to another account
- arrives sooner than 95% of the time its phrases take to sing plus 2 seconds (skip only jumps the gaps between phrases)
- is longer than the catalog's length for the song (plus 10% and 5 seconds) or has phrases outside it
- scores more than every phrase sung perfectly, or more than 1,000 points per second of song
- has a score that doesn't equal its trace re-scored with `build/assets/karaoke-scoring.mjs`; a test checks the game and that module agree

White people mode runs with more than 30% of phrases fully skipped aren't ranked, because skipped phrases score without singing.

## Stopping the injection

The game now opens the microphone and builds its whole audio graph from a hidden same-origin frame. That frame has its own copies of the Web Audio and microphone functions, which a script patching the page's prototypes doesn't touch. The published injector therefore never reaches the game's audio. If a browser won't start the frame's audio from a click, the game falls back to the page's own audio.

## Integrity and similarity checks

These mark a run unranked and list it under **Flagged karaoke runs** in the admin panel. They never ban anyone.

- **Integrity:** before submitting, the page checks that `getUserMedia`, `MediaDevices.prototype.getUserMedia`, `createMediaStreamSource`, `AudioBufferSourceNode.prototype.start`, `HTMLMediaElement.prototype.play` and the iframe `contentWindow` getter are still native, in both the page and the audio frame, using the frame's own `Function.prototype.toString`. It also checks that the microphone track has a label and a device id that `enumerateDevices` lists. Local, unranked play is never blocked.
- **Similarity:** during each phrase the page compares Singer 1's loudness and pitch with the song's own vocal analysis at offsets of up to about ±0.56 s. It reports the best loudness correlation, the median pitch difference at that offset (in cents, octave ignored) and the offset itself. A live singer matches the record loosely; the record itself matches exactly.

The similarity rules in `SIMILARITY_RULES`, applied once at least 6 phrases were measured:

| Rule | Flags a run when |
| --- | --- |
| Identical loudness | median correlation ≥ 0.97 |
| Pitch matches | median correlation ≥ 0.8 and median pitch difference ≤ 10 cents over at least 4 phrases |
| Timing never drifts | median correlation ≥ 0.8 and the offset's standard deviation ≤ 12 ms over at least 8 phrases |

`scripts/karaoke-injector-smoke.cjs` measured the injector, when it was adapted to run inside the audio frame, at a median correlation of 0.92, a pitch difference of 0.25 cents and an offset spread of 0 ms. A control run with Chrome's fake microphone measured 0.19, over 300 cents and about 250 ms. A unit test checks that 200 simulated strong singers (correlation up to 0.85, 15–45 cents, 40–120 ms drift) are not flagged. These thresholds are a starting point: no real singers were recorded for this change, so review flagged runs before banning and adjust the rules if real singers are flagged.

## Bans

Bans are keyed by a stable random account id, so renaming doesn't escape them. A ban revokes every session, resets progress to a new account's with a snapshot kept for **Restore progress**, keeps the username reserved and removes the account from every board. Banned clients receive HTTP 403 `{ "banned": true, "error": "This account or device is banned from Yeatle." }`, which copies of the game relay unchanged.

The server records each account's recent network addresses and device ids (a random id the page keeps in localStorage and sends as `X-Yeatle-Device`) as HMAC-SHA256 hashes, at most 20 of each for 90 days. A ban adds restrictions for them:

- a banned **device** sees the banned screen and can't use any account until the ban is lifted
- a banned **address** can't sign up or sign in for `ipRestrictionDays` (default 30), but can still play without an account, so other people on a school or mobile network aren't locked out

Addresses come from the connection unless `trustedProxies` names the reverse proxy in front of the server; then only the right-most `X-Forwarded-For` entry, which that proxy adds, is used. Copies of the game forward only the device id, so a copy can't make the shared website see a different address.

## What this can't prevent

- Anything running on the player's machine can be changed by a script that runs first. A script rewritten to follow the game into its audio frame and to hide its patches from the integrity check, or a virtual audio cable feeding the vocal into a real-looking device, defeats the client-side layers; only the similarity check and admin review remain, and a determined attacker can add noise and timing jitter to slip under them.
- Someone who forges the whole submit request with a human-looking trace still gets a plausible score, limited by the maximum, the timing and the rate limits.
- The Daily answer is sent to the browser, so a player can read it before guessing. Fixing that needs server-side guessing, which would break Daily for desktop apps older than the release that adds it.
- Stems and Snippets solves are still self-reported; the credit rate only slows mass forgery. Proving solves would need server-issued rounds.
- Device ids disappear when site data is cleared, and addresses change or are shared (VPNs, mobile networks). The account ban holds regardless; the other restrictions only make returning harder. No VPN detection is attempted.

## Checks

- `npm test` covers bans, restrictions, sessions, the proxy, rate limits, verified runs, similarity, Daily checks and solve credit.
- `scripts/karaoke-injector-smoke.cjs` runs the userscript against a local server only (set `YEATLE_INJECTOR_SCRIPT`).
- `scripts/bans-browser-smoke.cjs` checks the banned screen, the leaderboard button and the admin panels at desktop and phone sizes.
- `scripts/review-leaderboard.cjs` is a read-only report of how existing accounts' numbers change under these rules.
