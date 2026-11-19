# Setup, updates, and troubleshooting

## Requirements

- **Online ([playyeatle.duckdns.org](https://playyeatle.duckdns.org/)):** any current web browser and an internet connection.
- **Desktop app:** Windows, macOS, or Linux desktop matching your CPU architecture (x64 or ARM64). Node.js is included inside the app.
- **Local browser version:** Node.js **24 LTS** or newer, plus a current browser (Chrome or Edge are good baselines for the ONNX/WebAssembly audio worker). Does not require `npm install`.
- **Network and disk:** internet access is needed to load the tracker sheet, stream songs, fetch covers, and download models. The four ONNX models take roughly 80 MB total; optional HQ stem packs need extra space depending on how many songs you keep.
- **Hardware:** real-time browser stem separation uses local CPU/GPU resources. On low-memory devices or phones, Yeatle lowers its audio cache budget (128 MiB instead of 384 MiB), skips preloading the next song's AI job, and caps waveform drawing around 30 FPS. Using local HQ stems, Light (filtered) mode, or Snippets avoids AI separation work.

## Installing and running

### Windows

**Desktop app:** download `Yeatle-Setup-1.14.3-windows-x64.exe` (installer) or `Yeatle-1.14.3-windows-x64-portable.exe` from the [releases page](https://github.com/gustownis/yeatle/releases/latest). Open **Yeatle** from the Start menu or run the portable executable directly. On first launch, give the tracker a moment to load; Real stems downloads the AI models automatically if they are not already present.

<details>
<summary>Windows browser setup (Node.js + Start Yeatle (Node).bat)</summary>

1. Download and install the **LTS** `.msi` from [nodejs.org](https://nodejs.org/en/download) (**x64** for standard Intel/AMD PCs, **ARM64** for ARM devices). Keep the option to add Node.js to PATH, then reopen your terminal.
2. Extract the Yeatle ZIP into a writable folder and double-click `Start Yeatle (Node).bat`, or run it from PowerShell:

```powershell
cd "C:\Users\YOUR_NAME\Downloads\yeatle-main"
node --version
node server.js
```

3. Open `http://127.0.0.1:3093` if it does not open automatically. Keep the terminal window open while playing; press **Ctrl+C** to stop the server.

</details>

### macOS

**Desktop app:** check **Apple menu → About This Mac** to pick **ARM64** (Apple Silicon) or **x64** (Intel). Open the `.dmg` and drag **Yeatle** into Applications (or extract the `.zip` and move **Yeatle.app** into Applications). Community builds are unsigned and unnotarized; if macOS blocks the app, use the browser version instead.

<details>
<summary>macOS browser setup (Node.js + Start Yeatle.command)</summary>

1. Install Node.js LTS using the macOS `.pkg` installer from [nodejs.org](https://nodejs.org/en/download).
2. Extract Yeatle and run it from Terminal:

```sh
cd "$HOME/Downloads/yeatle-main"
node --version
node server.js
```

To use the Finder launcher, make it executable once with `chmod +x "Start Yeatle.command"`, then double-click it. Open `http://127.0.0.1:3093` and keep Terminal open while playing.

</details>

### Linux

**Desktop app:** pick **x64** (`uname -m` shows `x86_64`) or **ARM64** (`aarch64`).

- **AppImage:** run `chmod +x Yeatle-*.AppImage && ./Yeatle-*.AppImage`. Some distributions need FUSE support for AppImages; if unavailable, use the `.deb` package or the browser version.
- **Debian / Ubuntu (`.deb`):** run `sudo apt install ./Yeatle-1.14.3-linux-x64.deb` (or `-arm64.deb`), then launch **Yeatle** from your application menu.

<details>
<summary>Linux browser setup (Node.js + start-yeatle.sh)</summary>

Install Node.js 24 LTS via your distribution package manager or the standalone tarball from [nodejs.org](https://nodejs.org/en/download). Distro repositories sometimes ship older releases, so verify `node --version` first.

If installing the standalone `.tar.xz` tarball by hand (replace `VERSION` and architecture with your downloaded file):

```sh
mkdir -p "$HOME/.local/lib"
tar -xJf "$HOME/Downloads/node-v24.VERSION-linux-x64.tar.xz" -C "$HOME/.local/lib"
export PATH="$HOME/.local/lib/node-v24.VERSION-linux-x64/bin:$PATH"
node --version
```

Add the `export PATH=...` line to `~/.bashrc` (or your shell's startup file) to keep it across terminals. Then start Yeatle:

```sh
cd "$HOME/Downloads/yeatle-main"
sh ./start-yeatle.sh
```

Or run `node server.js` directly. If `xdg-open` is not installed, open `http://127.0.0.1:3093` manually.

</details>

Note on unsigned desktop builds: Windows and macOS release packages are not code-signed, so the OS may display a warning on first run. Verify your file against `SHA256SUMS.txt` on the release page, or run the local browser server with `node server.js` if your device blocks unsigned apps.

## Updating the desktop app

Desktop builds from 1.9.1 onward check GitHub releases roughly 10 seconds after launch (ignoring drafts and prereleases). You can also run **Help → Check for Updates** at any time. Every download is checked against its release checksum before anything runs, and your settings, `admin.json`, models, stems, and saved progress stay intact.

| Installation | How updates finish |
| --- | --- |
| Windows installer | Choose **Install and Restart**. Yeatle closes, installs into the existing folder, and restarts. |
| Linux AppImage | Choose **Install and Restart** (the folder containing the AppImage must be writable). |
| Windows portable | Choose **Show Download**, quit Yeatle, and replace the old `.exe` with the new one. |
| macOS (`.dmg`) | Choose **Open Installer**, quit Yeatle, and replace **Yeatle.app** in Applications. |
| Linux DEB | Choose **Open Installer**, quit Yeatle, and complete installation in your package installer. |

If you are still on **1.9.0**, install the current release once from GitHub so future updates work automatically. For the **local browser version**, download the latest ZIP (or `git pull`) while keeping your existing `config.json`, `admin.json`, and `build/Songs/` folders.

## Playing tips and details

- **Tracker eras in Released / Unreleased:** the 1.9 tracker overhaul split several album eras. If filtering by **Released** or **Unreleased** instead of **All songs**, include every era tied to that project (for example, **Lyfestyle [V2]**, **LYFESTYLE**, and **LYFESTYLE DIGITAL DELUXE**).
- **Audio fallback:** when a released song lacks a full playable audio link or pre-master, Yeatle falls back to an ~30-second Apple preview.
- **Browser routes:** `/daily` and `/karaoke` open those modes directly; old `.html` URLs redirect automatically.

## AI models and caching

When **Real stems** initializes the AI worker, the server downloads four files (~19.7 MB each) from [Best-Practice/spleeter-4stems-onnx](https://huggingface.co/Best-Practice/spleeter-4stems-onnx) into `models/` (next to `server.js` in browser mode, or inside your [desktop data directory](configuration.md#desktop-data-directories)):

- `drums.fp16.onnx`
- `bass.fp16.onnx`
- `other.fp16.onnx`
- `vocals.fp16.onnx`

Incomplete downloads are discarded instead of saved. If you want to install them manually, download those exact `.fp16.onnx` files into `models/` (do not substitute the full-precision `.onnx` files or rename an archive). Python, TensorFlow, and standalone Spleeter are not required.

Completed AI stems are also kept in a lossless browser IndexedDB cache (capped at 192 MiB total and 100 MiB per song) so reloads do not re-separate the same track. Privacy features that alter audio-buffer readbacks (such as Brave's strict fingerprinting protection) disable this persistent cache automatically.

## Karaoke microphone and calibration

- **Mic permissions:** browsers only grant microphone access on `https://` origins or `localhost` / `127.0.0.1`. On the desktop app, **Developer → Microphone Settings** opens your OS microphone privacy controls.
- **Echo and sensitivity:** use headphones for accurate pitch scoring. When using speakers, tick **Using speakers (reduce echo)** under **Mic & audio settings**, and raise **Mic sensitivity** if quiet singing is missed.
- **Delay calibration:** in **Mic & audio settings**, run **Test audio delay** (tap test, useful for Bluetooth headphones which can add 200+ ms) and **Test mic delay** (clap test), or use **Reset timing** to restore defaults.
- **Lyric timing:** synced lyrics load from [lrclib.net](https://lrclib.net) then [lyrics.ovh](https://lyrics.ovh), or you can paste custom lyrics / add a `lyrics.lrc` file in the song's `Songs/` folder. Press `[` and `]` while singing to shift timing per song.
- **White people mode:** tick **White people mode** under Options before starting to automatically credit sensitive words in the lyrics without requiring you to sing them. Word-timed lyrics skip exact spans; line-timed lyrics estimate the span (**≈ SKIP**). Press **K** or **Mark skip** while singing to add custom skip times for future rounds. White people mode keeps separate best scores.
- **Android USB testing:** plain Wi-Fi HTTP IP addresses block microphone access. Forward port `3095` over USB (`YEATLE_PORT=3095 YEATLE_DESKTOP=1 node server.js`) and open `http://localhost:3095/karaoke` on the phone; see [docs/archive/testing-1.10.1.md](archive/testing-1.10.1.md) for the `adb reverse` steps.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `node` command not found | Install Node.js 24 LTS, reopen your terminal, and verify its `bin/` directory is in PATH (`node --version`). |
| PowerShell blocks `npm` (`npm.ps1`) | Use `npm.cmd` instead of `npm` for dev commands. Browser play only needs `node server.js`. |
| Double-click launcher closes right away | Run `node server.js` inside a terminal to read the error output, and check folder write permissions. |
| Port already in use | Close the other running Yeatle process, or change `port` / `desktopPort` in `config.json`. Changing ports gives the browser a different `localStorage` origin. |
| JSON syntax error on startup | Use double quotes, remove trailing commas, and compare with [config.example.json](../config.example.json). |
| Browser window did not open | Open `http://127.0.0.1:3093` manually while keeping the terminal open. |
| Blank page after updating | Hard-refresh the page, verify `build/index.html`, `build/assets/`, and `build/ort/` are present, and check the browser console. |
| Tracker cannot be reached | Check your internet connection and `sheetId` / `tabs` in `config.json`. Offline setups reuse `songs-cache.json` or list local stem songs only. |
| A song fails to play | The upstream audio host or Apple preview may be unavailable; try another song or install local HQ stems. |
| Model download fails | Check access to Hugging Face and free disk space, then restart. Delete a partially damaged `.fp16.onnx` file to trigger a fresh download. |
| AI separation is slow or noisy | Switch to Light (filtered) mode, Snippets, or install local HQ stems, and close heavy background apps. |
| Local HQ stems do not show up | Ensure folders are directly inside `Songs/` (not `Songs/Songs/`), include all four `.mp3` stems (`drums`, `bass`, `other`, `vocals`), and restart or refresh Yeatle. |
| Desktop app fails to start | Read the startup error box and `desktop.log` in your desktop data folder; verify `desktopPort` and `config.json` syntax. |
| `npm run build` fails in `source/` | Expected: the original `source/src/` React code was not supplied. Use the tracked `build/` files directly. |
