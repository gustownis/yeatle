# Yeatle 1.11.3 verification — Linux, 2026-10-20

Checks run in a Linux x64 workspace (Ubuntu 24.04) before release. Node.js
22.22.0 and 24.22.0, npm 10.9.4, Electron 44.7.0 under Xvfb, and Playwright
1.56.1 with Chromium 141. Tests used isolated profiles and data folders,
explicit local Daily authorities, and synthetic or existing test music. Audio
output was muted.

## Not covered here

- **Windows packaged app.** It wasn't built or run here. Before publishing,
  run the packaged checks on Windows, including
  `scripts/desktop-stems-smoke.cjs` against the packaged `app.asar` (it checks
  that the packaged files match this checkout) and a real download from the
  public server into the normal Songs folder.
- **Physical microphones.** White people mode was tested with a synthetic
  microphone only (below). Singing it for real, with headphones and speakers,
  remains to be done.
- **iPhone silent switch.** The Daily fix sets the page's audio session to
  "playback". It was checked in a Chromium iPhone emulation, which can't
  reproduce the hardware switch. Check it on an iPhone with the ringer off.
- **The hosted server.** These changes aren't deployed yet. The public site
  answered `/api/songs` with 1154 songs, 239 of them HQ stem songs. All 239
  folder names and ids pass the download checks. `/api/stems/catalog` returns
  404 until the host runs 1.11.3 with `"stemDownloads": true`.

## Results

- `npm test` (`node --test tests/*.test.cjs`): 111 passed, 0 failed, on both
  Node.js 22 and 24.
- `scripts/desktop-smoke.cjs` passed. It includes the new return-from-Daily
  assertions: the returning page is revealed at its finished height, in the
  chosen mode, with the tabs where Daily drew them.
- `scripts/desktop-stems-smoke.cjs` passed. It ran the real menu (Help → Optional
  HQ Stems shows both items) and the sandboxed picker (no `require` or
  `process`, a seven-call bridge, nothing selected at first). Search worked.
  Two of three songs were picked and installed into an empty profile; names
  with spaces and accents were byte-identical to the host. The third was
  cancelled mid-download and left nothing. The game listed both songs as HQ
  stems without a restart. All four stems decoded in the game page, and
  Karaoke loaded and played one (No mic).
- `scripts/karaoke-skip-smoke.cjs` passed. It ran nine Chromium rounds with a
  synthetic microphone that follows the song clock. Medium, line-timed lyrics,
  one estimated skip. "Score" is the round score out of a perfect 3030.

  | Round | Score |
  | --- | --- |
  | Normal, perfect | 3030 |
  | Normal, silent for the word | 2806 |
  | White people mode, silent for the word | 3030 |
  | White people mode, silent during an ordinary note | 2712 |
  | Normal, silent during the same ordinary note | 2709 |
  | White people mode, 150 ms mic delay (mic delayed to match) | 3030 |
  | White people mode, lyrics shifted 0.5 s (silence moved to match) | 3030 |
  | White people mode, own skip time only, found times off | 3030 |
  | White people mode, restarted mid-round | 3030 |

  No round requested the microphone before **Sing**. Best scores were saved
  under separate `:wpm` keys.
- `scripts/browser-smoke.cjs`, `scripts/daily-smoke.cjs` (Electron),
  `scripts/daily-ui-smoke.cjs` and `scripts/daily-browser-smoke.cjs` passed.
  The last needs a test server whose only song is the local stem song
  (`"tabs": []`); with the tracker fixtures, Daily picks a tracker song that
  has no local audio, and the script's guess step fails.
- Transition probes measured the actual desktop window at each `pagereveal` and
  after the transition, for all six Daily routes, Stems ↔ Snippets, Karaoke,
  rapid switching and reduced motion. Every route revealed at its final
  height, with the tabs at the same rectangle on every page.

## What the tests cover

- **White people mode** (`tests/karaoke-skips.test.cjs`):
  - Whole-word matching of the n-word, its spellings and censored forms; words
    like Niger, niggle and snigger are not matched.
  - Exact windows from word-timed LRC, moved by `[offset]` and lyric shifts.
  - Estimated windows from line-timed lyrics, placed inside the line's singing
    and never longer than about a word.
  - Overlapping windows merging.
  - Scripted-microphone scoring through the game's own `scoreFrame` and
    `scorePhrase`: a forgiven skip, an ordinary miss that costs exactly what
    it costs in normal mode, and a fully skipped phrase.
  - No mic, restarting in normal mode, the default-off saved setting, and
    separate best scores that carry over to merged songs.
- **HQ stem downloads** (`tests/stem-downloads.test.cjs`, real `server.js`):
  - The catalog lists only complete real sets. Symlinked folders and stems,
    incomplete sets and non-audio stems are excluded.
  - File requests outside the catalog return 404, and the server limits
    concurrent files.
  - Two songs install into an empty profile.
  - An existing identical folder shows as installed, and a different
    same-named folder is kept until "Replace mine" moves it aside.
  - Cancel and retry, automatic retry after a dropped connection,
    corrupt-file and no-retries failures that install nothing, a busy (503)
    server, an unreachable host, and downloads that are turned off.
  - Unsafe catalog names and hashes are rejected, and the menu entries are
    checked.
- **Song data** (`tests/catalog.test.cjs`): Soup shows DC2 · 2020, older song
  caches are upgraded, the duplicate-spelling merges (The Coste/THE COSTËS
  and others) happen while distinct songs stay separate, and Karaoke data is
  carried over to merged ids.

Evidence is in the ignored `.tmp/` folders: `desktop-smoke-*`,
`desktop-stems-smoke-*`, `karaoke-skip-smoke-*`, `daily-*-smoke-*` and
`browser-smoke-*`.
