# Yeatle Wrapped

A yearly recap of each player's own Yeatle year, in the style of Spotify Wrapped. It lives in `build/assets/wrapped.mjs` and `build/assets/wrapped.css` and is loaded on the Stems/Snippets, Daily and Karaoke pages. It opens in a pop-up window over the current page, never a new tab.

## When it shows

- Every year it opens on November 16 and stays viewable through January 7 (the player's local time). Change `OPENS` and `CLOSES` at the top of `wrapped.mjs` to move the window.
- From November 16 through December 31 it shows the current year and keeps updating as the player plays until December 31 ends. January 1-7 shows the finished year.
- The first page load in the window shows a one-time announcement. After that a small "Wrapped" button with the Yeatle icon in the bottom-right corner reopens it; its × shrinks it to just the icon. Wrapped uses no emoji anywhere, including the copied text.
- Add `?wrapped=preview` to any page's address to open the current year's Wrapped outside the window, for testing.

## What it counts

Each year has its own record in the browser's storage (`yeatle:wrapped:<year>`), so a year's Wrapped never includes play from another year. Play on January 1-7 counts towards the new year only.

- Stems and Snippets rounds are recorded when they finish (leaderboard.mjs announces round saves with a `yeatle:round-saved` event). Totals come from how much the game's saved stats grew during the year.
- Daily results come from the game's own dated Daily saves, so Dailies played before Wrapped existed still count in their year. daily.mjs sends the song name of a finished Daily with a `yeatle:wrapped-record` event.
- Karaoke runs sung into a mic are sent by karaoke.js with the same event.
- 2026 is the launch year: progress saved before Wrapped existed counts towards 2026 only.

## Next year

When a year is over its Wrapped is archived as a short summary (`yeatle:wrapped:archive:<year>`). The next year's Wrapped compares against it: songs guessed and accuracy versus last year, top era changes, Daily streaks, last year's Yeatle type, songs solved for the first time ever, and "revenge" songs that were missed the year before and finally solved.

## Sharing

The last slide has **Copy text** (six short lines, so pasting it doesn't flood a chat), **Save image** (a 1080x1350 summary card) and, where the device supports it, **Share image**.

Wrapped is kept per browser or device; it isn't synced to accounts.
