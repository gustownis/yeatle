# Optional HQ stems

You can play Yeatle without downloading extra audio packs: **Real stems** automatically downloads the built-in ONNX model and separates streamed songs locally, and **Light** mode uses audio filters. Installing local HQ stem folders skips AI separation for those songs and gives cleaner isolation in both Stems and Karaoke.

## Download inside the desktop app

1. Open **Settings → Desktop App → Optional HQ Stems → Download from server…**.
2. Search or scroll, then click **Download** on individual songs or tick several and click **Download selected**. (**Check all** selects every available match in your current search; **Clear** deselects everything.)
3. Downloads are verified against SHA-256 checksums and appear in your song list as soon as they finish without restarting.

Cancelled or failed downloads leave no partial folders behind and can be retried with **Retry**. If your `Songs/` folder already has a different folder with the same name, Yeatle leaves it untouched and lets you choose **Replace mine** (which moves your old folder into `.yeatle-replaced` inside `Songs/`).

By default, downloads come from `https://playyeatle.duckdns.org`. You can point `stemsHost` in `config.json` to another HTTPS Yeatle server that has `stemDownloads` enabled.

## Manual installation (MEGA)

Download songs from the [MEGA stem folder](https://mega.nz/folder/Kkh3WIyQ#xnMG5aidP0AGWQas0bur4g) and extract one folder per song directly into your `Songs` directory (do not nest `Songs/Songs/`):

- **Desktop app:** open **Settings → Desktop App → Songs folder**. This directory sits outside the installed app so updates keep your stems.
- **Local browser server:** place song folders in `build/Songs/` inside the Yeatle directory.

### Required folder layout

```text
Songs/
└── Lyfe Stealer/
    ├── drums.mp3
    ├── bass.mp3
    ├── other.mp3
    ├── vocals.mp3
    ├── lyrics.lrc        (optional, synced Karaoke lyrics)
    └── info.txt          (optional, disambiguates duplicate titles)
```

All four stem MP3s (`drums.mp3`, `bass.mp3`, `other.mp3`, `vocals.mp3`) are required for a folder to load as HQ stems. From version 1.11 onward, capitalized names (`Drums.mp3`, `Bass.mp3`, `Other.mp3`, `Vocals.mp3`) also work on case-sensitive Linux filesystems.

Folder names match tracker titles after accent and punctuation normalization. Adding an optional `info.txt` helps when two songs share a title:

```text
Album: Lyfë
Year: 2022
Producer(s): Example producer
```

Restart Yeatle or refresh the song list after adding folders by hand. Song stems are not stored in Git or bundled in desktop installers, and separate audio packs remain subject to their original rights and host terms.
