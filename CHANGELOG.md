# What's new since the latest post

Here is a summary of major features, improvements, and updates in Yeatle since 1.11:

### Accounts & Cross-Device Sync

- **Player Accounts:** Register with a username and password (no email required) using secure scrypt password hashing.
- **Cross-Device Sync:** Signing in on another device merges your progress, syncing automatically in the background after each round.
- **Prestige Protection:** Cross-device sync respects your prestige level so older records never overwrite a newer prestige.
- **Username Changes:** Change your username anytime inside the Leaderboard modal; rankings and active sessions update immediately.

### Leaderboards & Streaks

- **Global Leaderboards (🏆):** The header trophy button opens live leaderboards across all core modes:
  - **Daily:** Ranked by active streak (🔥), then by total wins.
  - **Stems & Snippets:** Ranked by total unique songs solved.
  - **Karaoke:** Ranked by cumulative high score across all tracks.
- **Daily Streak Badge (🔥):** Header streak counter tracks consecutive UTC days with a completed Daily, updating live as you finish.
- **Live Updates:** Standings update in real time while the Leaderboard dialog is open.

### Gameplay & Audio

- **Continuous Progress Bar:** Daily and Snippets feature a smooth linear progress bar with clip checkpoints that fills during playback and turns green on solve.
- **Different-Version Retries:** Guessing an alternate song version (demo vs. feature, or V1/V2) highlights yellow and grants a free retry on that clip or stem without penalty.
- **Multi-Stem Playback & Sync:** Seeking four-stem tracks waits until all stems (`drums`, `bass`, `other`, `vocals`) buffer together, with drift correction phase-locking stems to drums.
- **Persistent Stem Buffering:** Snippets rounds retain buffered audio ranges across seeks and clip unlocks, using high-quality local stems when installed.
- **Unified Volume Controls:** Standardized purple sliders, mute toggles, and live volume percentages (`0%` to `100%`) across Stems, Snippets, Daily, and Karaoke.
- **Server-Managed Rounds:** Snippets and Daily rounds are managed by the server, validating guesses securely and revealing solutions on finish.

### Catalog & Search

- **Daily Era Cutoff:** Daily challenges now pick exclusively from the *Alivë* era onwards.
- **Linked Alternate Answers:** Over 46 linked song groups (demos, released features, and versions) accept any member's title as a valid answer.
- **Alternate Titles in Suggestions:** Autocomplete popups in Daily, Snippets, and Stems display distinct alternate tracker names (`also ...`).
- **Catalog Cleanup:** Restored unreleased tracker sections, merged duplicate entries, and cleaned remix tags and redundant aliases from suggestions.

### Polish & Performance

- **Faster Load Times:** Compressed artwork, logos, and icons by over 2.3 MB for snappier loading.
- **Overlay Scrollbars & Smooth Transitions:** Sleek auto-hiding scrollbars eliminate black gutters, and header buttons animate smoothly across page switches.
- **Mobile & Desktop Fixes:** Fixed mobile Daily touch selection on suggestions, fixed viewport scrolling, and added desktop OS microphone privacy shortcuts.

### API & Admin Tools

- **Yeatle Public API:** Read-only endpoints for Discord bots and tools to query live leaderboards, daily reset times, and previous answers.
- **Admin Management:** Tools to inspect player activity, enforce username filters, rename accounts, and replace the daily song if needed.
