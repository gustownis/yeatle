# Configuration, hosting, and admin panel

## Settings (`config.json`)

For **local browser mode**, copy [config.example.json](../config.example.json) to `config.json` next to `server.js`, edit it, and restart the server.

```json
{
  "port": 3093,
  "desktopPort": 3094,
  "openBrowser": true,
  "refreshMinutes": 30,
  "artist": "Yeat",
  "sheetId": "1FUzAZyTCgFTVxQ--qbCAS2bUk4dsAw6ASxwjURPHbyI",
  "tabs": [
    { "name": "Released", "gid": "1617341558" },
    { "name": "Unreleased", "gid": "1241081326" }
  ],
  "googleApiKey": ""
}
```

### Desktop data directories

The desktop app creates `config.json`, `admin.json`, and its writable caches outside the installed app folder so updates do not overwrite them. Use **Game → Open Settings and Logs Folder** to open the exact directory, which also stores `desktop.log` for troubleshooting.

| OS | Default desktop data folder |
| --- | --- |
| Windows | `%APPDATA%\Yeatle` |
| macOS | `~/Library/Application Support/Yeatle` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/Yeatle` |

### All `config.json` options

| Setting | Default | Purpose |
| --- | --- | --- |
| `port` | `3093` | Browser server port. |
| `desktopPort` | `3094` | Desktop local server port (kept constant so `localStorage` progress stays on the same origin). |
| `openBrowser` | `true` | Opens your browser automatically when running `node server.js` (ignored in desktop mode). |
| `refreshMinutes` | `30` | Tracker sync interval in minutes (`0` disables periodic refresh). |
| `artist` | `"Yeat"` | Artist name used for preview lookups. |
| `sheetId`, `tabs` | Yeat tracker | Google Sheet ID and tab GIDs (`Released`, `Unreleased`). |
| `googleApiKey` | `""` | Optional Google Sheets API key for reading links hidden behind display text. |
| `liveControl` | `true` | Lets the admin panel's **Play in game** switch connected players' active song; set `false` on public sites. |
| `stemsHost` | `"https://playyeatle.duckdns.org"` | Desktop stem downloader server URL. |
| `stemDownloads` | `false` | Serves complete HQ stem sets from this server's `Songs/` folder (symlinks skipped; hashes cached in `stems-hashes.json`; max 4 concurrent file transfers). |
| `dailyAuthority` | `"https://playyeatle.duckdns.org"` | Shared Daily and leaderboard host. Only the authoritative website (or an explicit local test) sets `""`; clients refuse to invent local Daily songs if unreachable. |
| `dailyPublicUrl` | `""` | Canonical `/daily` URL shared by an authoritative Daily host. |
| `dailyFromEra` | `"Alive"` | Authoritative Daily only picks songs from this era onward (`""` includes every era). |
| `dailyHideAnswer` | `false` | Authoritative website only: keeps today's Daily answer on the server and checks guesses server-side. |
| `trustedProxies` | `[]` | Reverse proxy IPs (such as `["127.0.0.1", "::1"]` for local Caddy/nginx) whose right-most `X-Forwarded-For` entry is trusted. Leaving this empty behind a local proxy disables IP rate limits and logs a warning. |
| `ipRestrictionDays` | `30` | Number of days recent IPs of a banned account cannot register or sign in. |
| `bannedJobsUrl` | `"https://www.indeed.com/"` | `http(s)` link shown on the banned notice screen. |
| `antiCheatModule`, `antiCheat` | `""`, `{}` | Website-only path (absolute or relative to the data folder) to an external CommonJS moderation module and its options object. Startup fails if a named module cannot load. |

## Hosting updates and curation merges

When updating a hosted server from Git, pull the full repository (including `server.js`, `server/`, `data/`, and `build/assets/`) and restart the server. Tracked default song curation files live in `data/` (`hidden-songs.json`, `song-edits.json`, `song-renames.json`, `song-splits.json`, `era-covers.json`). If your hosted server modified curation files via the admin panel, use `scripts/merge-curation.cjs` to keep local admin edits while applying upstream updates:

```sh
node scripts/merge-curation.cjs BASE_DIR LOCAL_DIR TARGET_DIR
```

Runtime caches and account files (`config.json`, `admin.json`, `songs-cache.json`, `preview-cache.json`, `daily-challenges.json`, `leaderboard-users.json`, `leaderboard-bans.json`, `leaderboard-secret.json`, `username-filters.json`, `stems-hashes.json`, `joke-photos.json`, `cheat-evidence/`, `models/`) stay in `DATA_DIR` (`YEATLE_DATA_DIR`, or the repo root when unset) and are gitignored.

## Admin panel

The admin panel lives at `/admin` (`http://127.0.0.1:3093/admin` in browser/server mode). It is not exposed inside the desktop app UI.

- **Browser setup:** create `admin.json` next to `server.js` with `{ "password": "garlic" }` (or pick your own password) and restart. On first startup, the server hashes the plaintext password with salted `scrypt`. Never commit or share `admin.json`.
- **Desktop setup:** enabled by default with password `garlic`; existing custom passwords are preserved across updates.

Available tools in `/admin`:

- **Song curation:** search songs (100 per page, with **Select all matches**), hide/show eligible songs, rename display titles, split/edit rows, and trigger **Play in game** when `liveControl` is enabled. Catalog-excluded songs cannot be unhidden or forced into rounds.
- **Authoritative host tools** (active only when `dailyAuthority` is `""`):
  - **Replace today's Daily:** picks a new eligible song for the current day and gives players a fresh Daily round without picking the replaced song again that day.
  - **Filtered usernames & player rename:** block substrings in new/edited usernames (ignoring case, `.`, `_`, `-`; matching existing accounts display as `Blocked username` until changed), or rename any player directly.
  - **Players & bans:** view registered accounts (newest first), inspect client-submitted page integrity reports in `cheat-evidence/`, and ban or unban accounts (with an option to restore pre-ban progress snapshots).

## Privacy and network behavior

The local server binds only to `127.0.0.1` (loopback). Outbound requests go only to your configured Google Sheet tracker, audio hosts, Apple preview search, artwork hosts, Hugging Face (ONNX model downloads), [lrclib.net](https://lrclib.net) / [lyrics.ovh](https://lyrics.ovh) (Karaoke lyrics), and GitHub (desktop update checks). No separate project analytics are included.

Player progress and settings are saved in the browser/webview `localStorage` for that origin (`http://127.0.0.1:3093` or `3094`), or synced to an account on the `dailyAuthority` server if signed in. On the `dailyAuthority` server, IP addresses and random device IDs (`x-yeatle-device`) are stored only as keyed HMAC hashes using `leaderboard-secret.json`.
