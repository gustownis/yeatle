# Code Audit Progress

Tracking the full repository audit (`H1–H15`, `M1–M16`, `L1–L11`) across phases so progress stays clear across sessions. Remove this file and the temporary notice in `AGENTS.md` once the remaining items are finished or closed.

## High Priority — Bugs, Security & Reliability

- [x] ~~**H1** (`server/leaderboard.cjs`): Load `state.users` and moderation maps with `Object.create(null)` and guard dynamic property lookups with `Object.hasOwn()` to prevent crashes or prototype mutation on keys like `"constructor"` or `"__proto__"`.~~
- [x] ~~**H2** (`server.js`): Await `snippetRules` and `songPools` dynamic imports before `server.listen()`, and include `Boolean(snippetRules)` in `songListJson()`'s cache key to avoid cold-start misses and cache poisoning.~~
- [x] ~~**H3** (`server/leaderboard.cjs`): Cap `round.close` in `dailyRoundAct()` at 20 entries and deduplicate identical `(level, text)` entries.~~
- [x] ~~**H4** (`server/audio-cache.cjs`): Use unique per-write filenames (`${file}.${++seq}`), treat expired entries (`expires <= now()`) as misses in `fill()`, and accumulate at least 32 bytes for `detectType()`.~~
- [x] ~~**H5** (`server.js`): Restrict outbound `request()` redirect schemes and strip sensitive headers cross-origin, add a `tunnel()` timeout, handle `HEAD` properly in `pipeAudio()` and `serveStatic()`, attach early abort cleanup, sniff at least 12 bytes, use `pipeline()`, and evict/retry expired cached audio URLs once on upstream `403`/`404`/`410`.~~
- [x] ~~**H6** (`desktop/stem-downloads.cjs`): Guard missing queued songs inside `try/finally`, keep abort and inactivity timeouts active across body reads, clean up `wait()` abort listeners and paired `"error"` listeners on `"drain"`, and await stream `"close"` before Windows `rename`/`rm`.~~
- [x] ~~**H7** (`desktop/permissions.cjs`, `desktop/menu.cjs`): Allow same-origin `"clipboard-sanitized-write"` and `"screen-wake-lock"` permissions, and include `{ role: "editMenu" }` on `darwin` only.~~
- [x] ~~**H8** (`desktop/updates.cjs`): Deduplicate `setStatus(text)` when `text === status` to avoid rebuilding the native menu on every download chunk.~~
- [x] ~~**H9** (`build/assets/wrapped.mjs`): Compute win guess count from `Number.isInteger(round.solvedLevel)` so 1st-try and subsequent-try stats are counted accurately.~~
- [x] ~~**H10** (`build/assets/daily.mjs`): Guard missing `challenge.song` on cross-tab finished Daily sync by triggering `loadChallenge()`, and refresh checked Daily on `yeatle:progress-synced`.~~
- [x] ~~**H11** (`build/assets/leaderboard.mjs`): Track `authEpoch` across async auth/sync awaits, guard concurrent `handleLogout()`, and sync token changes via cross-tab `storage` events.~~
- [x] ~~**H12** (`build/assets/leaderboard.mjs`, `build/assets/song-pools.mjs`): Replace temporary `round-*` `audioId`s with real song `audioId || id` in `snippetRounds.reveal()` and clear stale `round-*` values on restore.~~
- [x] ~~**H13** (`build/assets/karaoke.js`): Scale `MicDetector`'s power-of-two `fftSize` from `ctx.sampleRate` (`2048`/`4096`/`8192`) and size `this.buf` to match.~~
- [x] ~~**H14** (`build/assets/karaoke.js`): Add cancellation tokens across `openCalibration()` awaits, read `ctx` after `enableMics()` + `resumeAudio()`, and ensure full timer/loop cleanup on close.~~
- [ ] **H15** (`build/assets/yeatle.js`): Handle `NotAllowedError` in `Lm.resyncStems`, `Lm.playSnippet`, and `Lm.play` without triggering `this.onError()`, and pass `{ next: !0 }` in `Md` ("Only instrumental" reroll).

## Medium Priority — Performance, Memory & Robustness

- [x] ~~**M1** (`server/leaderboard.cjs`): Isolate async vs sync temp filenames in `createStateSaver()`, replace `clearLeaderboardCache()` in `logout()` with `persist()`, add an `ownerRounds` index and rollover `dailyRounds` sweep, serialize evidence once in `saveEvidence()`, and return `null` on `ENOENT` in `readEvidence()`.~~
- [x] ~~**M2** (`server.js`): Remove dead `sheetHtmlCache`, coalesce/invalidate/cap `coverBytes` in `serveCover()`, and enforce upper byte caps on upstream text/image/authority readers.~~
- [x] ~~**M3** (`server.js`): Switch `passwordOk()` to async `crypto.scrypt`, sweep/bound `adminSessions`, add `; Secure` on HTTPS cookies, and handle `aborted`/`close` and 413 cleanly in `readJsonBody()`.~~
- [x] ~~**M4** (`server.js`): Preserve formatted featured artists when clearing `/api/admin/rename`, call `stemCatalog.invalidate()` on `/api/admin/rename` and `/api/admin/hide`, and write curation JSON atomically.~~
- [x] ~~**M5** (`server/client-signals.cjs`, `server/live-control.cjs`): Expire `createRateLimiter()` keys by window with a 50k cap, and clear SSE `heartbeat` in `stop(res)` with a `maxClients` cap in `createActiveSongFeed()`.~~
- [x] ~~**M6** (`desktop/stem-downloads.cjs`): Coordinate startup `cleanupStale()` with active downloads, and serialize per-id `replace()`/`cancel()` operations with rollback on failure.~~
- [x] ~~**M7** (`desktop/main.cjs`): Keep `openBrowser()` errors non-fatal, destroy failed utility windows, allow reopening `gameWindow`, re-check `quitting` after startup, bound `before-quit` cleanup, handle child exit/`send` errors in `rescanServer()`, buffer log writes via async stream, and enforce origin checks on `will-navigate`, `will-redirect`, and `yeatle:open-mic-settings`.~~
- [x] ~~**M8** (`desktop/updates.cjs`): Add `busy` re-entrancy guard and `readyUpdater` null check in `installReady()`.~~
- [x] ~~**M9** (`scripts/merge-curation.cjs`): Target `data/<name>` consistently in `resolveTarget()`, use `Object.hasOwn()` in `mergeMaps()`, and preserve ID insertion order in `mergeLists()`.~~
- [x] ~~**M10** (`build/assets/karaoke.js`): Pause rAF when paused, cache canvas gradients and HUD/lyric DOM refs, update `#players .meter em` markers in place during `#sensitivity` drags, avoid permanently caching empty lyrics failures (preserving `lookUpLyrics` 8000ms timer contract), serialize `enableMics()`, check song state after `trackFailures`, handle `AudioContext` promises safely, and wire `pagehide` teardown.~~
- [x] ~~**M11** (`build/assets/stem-cache.mjs`): Clear cached DB on `db.onclose`, close late `onsuccess` handles after `onblocked`, track reservation ownership before `erase()`, and tolerate non-fatal `lastUsed` write errors.~~
- [x] ~~**M12** (`build/assets/separator.worker.js`): Add a cancelled flag so timed-out 20s WebGPU `ch()` probes immediately release late sessions (without changing STFT math).~~
- [x] ~~**M13** (`build/assets/stems-download.js`): Guard `update(null)`, clear stale `#list` on `catalog.error` with retry, and catch button IPC rejections.~~
- [x] ~~**M14 (leaderboard.mjs)** (`build/assets/leaderboard.mjs`): Guard `localStorage` access against blocked storage, short-circuit unchanged values in `Storage.prototype.setItem`, and check `roundTicket` on round actions.~~
- [ ] **M14 (yeatle.js)** (`build/assets/yeatle.js`): Invalidate `YeatleRounds.ticket()` at the start of `al()` and defer `YeatleRetry` until the song commits, stabilize `active-song` SSE `useEffect` dependencies via refs, clamp short-track `snipTimer` end times to `lead.duration`/`lead.ended`, and hide failed Eras modal `<img>` via `style.visibility="hidden"` instead of `.replaceWith()`.
- [x] ~~**M15** (`build/assets/wrapped.mjs`): Clear failed `api/songs` promises so retries work, skip finalizing archives without song metadata, and fix the Jan 1–7 `yearsPlayed` year boundary.~~
- [x] ~~**M16** (`build/assets/daily.mjs`, `build/assets/leaderboard.mjs`, `build/assets/wrapped.mjs`): Re-init Daily on persisted `pageshow`, reload Daily on HTTP 409, and wire `yeatle:banned` teardown for active audio and Wrapped overlays/listeners.~~

## Low Priority — Minor Edge Cases, Dead Code & Script Hygiene

- [ ] **L1** (`server/stem-catalog.cjs`): Write `stems-hashes.json` atomically (`tmp` + `rename`) and prune stale hashes for deleted folders.
- [ ] **L2** (`server.js`): Use `Object.create(null)` / `Map` in inline admin HTML `markDuplicates` and `eras` helpers.
- [ ] **L3** (`desktop/stem-downloads.cjs`): Add a generation check to concurrent `loadCatalog()`, block HTTPS-to-HTTP redirect downgrades, guard `!res.body`, prevent `received` underflow on mid-chunk errors, and remove the dead `"verifying"` check.
- [ ] **L4** (`desktop/update-core.cjs`, `scripts/prepare-release.cjs`): Normalize `v`-prefixed version strings and tighten `asset.name` matching.
- [ ] **L5** (`scripts/review-leaderboard.cjs`, `scripts/desktop-stems-smoke.cjs`, `scripts/daily-ui-smoke.cjs`, `scripts/answer-groups-check.cjs`, `scripts/test-1.11.cjs`): Remove unused variables (`banned`, `BrowserWindow`, unused `daily` param) and harden child-process cleanup/watchdogs.
- [ ] **L6** (`build/assets/karaoke.js`, `build/assets/karaoke-scoring.mjs`): Clamp `mergeSkips()` end >= 0 on positive `lyricShift`, fix `tick()` cutoff at `micDelay > 300ms`, guard stale `submitRankedRun()` DOM updates, handle `#lane` resize on wrapped lyrics, preserve leading text before first `<mm:ss.xx>` and parse `<mm:ss:cc>` in `parseLrc()`, check `res.ok` in `loadSongs()`, call `job.check()` before `decode(bytes)`, and remove dead `MAX_TRACE_PHRASES` / `note.phrase` / `totalDur` / `stage.dataset.players`.
- [ ] **L7** (`build/assets/separator.worker.js`, *optional / skip unless needed*): Skip unused `C["vocals"]`/`A["vocals"]` mask writes and precompute `xt2` while keeping outputs bit-identical to `tests/fixtures/separation-reference.cjs`.
- [ ] **L8** (`build/assets/stems-download.js`): Skip allocating unused progress `bar` element when `status === "installing"`.
- [ ] **L9** (`build/assets/leaderboard.mjs`, `build/assets/song-suggestions.mjs`): Stop 4s/10s timers and `MutationObserver` after `reported`/`yeatle:banned`, avoid 3x `document.body.textContent` serialization per tick, preserve login draft across `renderModal()`, and reset `interacting = false` on `pointerup`/`pointercancel`.
- [ ] **L10** (`build/assets/daily.mjs`, `build/assets/wrapped.mjs`): Check `item.cover` in `coverForSong`, check `r.ok` in `songsPromise`, separate `JSON.parse` vs `localStorage` errors in `readRound`, skip `#reset` writes while hidden, and guard `!blob` in `wrapped.mjs`'s `getBlob()`.
- [ ] **L11** (`build/assets/yeatle.js`): Check `separationStopped` after IDB miss in `xm.start`, check `res.ok` in `ul`, use relative `api/active-song*` URLs, and align prestige icon asset path.

## Verification

- **Phase 1 (Windows, Node.js `v24.15.0`):** `node --test tests/*.test.cjs` -> 276 tests, 273 passed, 0 failed, 3 skipped (POSIX-gated `SIGTERM`, symlink, and `/proc` FD checks); `node --test tests/separation.test.cjs tests/playback.test.cjs tests/optimization.test.cjs tests/interface-motion.test.cjs` -> 25/25 passed; `.\node_modules\.bin\electron.cmd scripts/desktop-smoke.cjs` -> passed (`{"passed":true,...}`); `.\node_modules\.bin\electron.cmd scripts/desktop-stems-smoke.cjs` -> passed (`{"passed":true,...}`); `.\node_modules\.bin\electron.cmd scripts/daily-smoke.cjs` -> passed prior to the `#players .meter em` sensitivity tweak in `build/assets/karaoke.js`. Not run locally: `scripts/catalog-smoke.cjs` and `scripts/snippet-rounds-smoke.cjs` (`playwright` / `playwright-core` not installed).
