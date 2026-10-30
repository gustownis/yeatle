# Yeatle API

A small read-only API for Discord bots and other sites. It shares the leaderboards and the Daily's timing and previous answer. It never shares today's Daily answer, anyone's progress, or anything about accounts beyond their usernames and leaderboard numbers.

Base address: `https://playyeatle.duckdns.org/api/v1`

- No key or sign-in is needed. Requests are limited to 120 a minute per network; going over returns HTTP 429.
- Every answer is JSON. Errors look like `{ "error": "..." }`.
- Any site may call it from a browser (CORS is open), but it only accepts `GET`.
- Copies of the game (the desktop app's local server) answer the same addresses with the shared website's data.

## `GET /api/v1/leaderboard`

| Parameter | Values | Default |
| --- | --- | --- |
| `board` | `daily`, `stems`, `snippet`, `karaoke` | `daily` |
| `limit` | 1 to 50 | 10 |

```json
{
  "board": "stems",
  "title": "Stems songs solved",
  "updatedAt": "2026-10-30T18:04:11.000Z",
  "totalPlayers": 42,
  "entries": [
    { "rank": 1, "username": "mat", "songs": 381, "prestige": 1 },
    { "rank": 2, "username": "ken", "songs": 240, "prestige": 0 }
  ]
}
```

Each board's entries carry their own numbers:

| Board | Fields |
| --- | --- |
| `daily` | `streak`, `bestStreak`, `wins`, `played` |
| `stems`, `snippet` | `songs`, `prestige` |
| `karaoke` | `totalScore`, `songs`, `bestScore` |

These are the same rankings as the 🏆 window in the game: banned accounts aren't listed, and a username blocked by the admins shows as "Blocked username".

## `GET /api/v1/daily`

```json
{
  "date": "2026-10-30",
  "resetsAt": "2026-10-31T00:00:00.000Z",
  "secondsUntilReset": 21349,
  "yesterday": { "date": "2026-10-29", "answer": "Talk", "era": "2093" }
}
```

The Daily resets at midnight UTC. `yesterday` is `null` if no Daily was played that day.

## `GET /api/v1`

Lists the endpoints above.

## Example: a Discord command

A bot built with [discord.js](https://discord.js.org) could answer `/leaderboard` like this. Creating the bot, its token and hosting are up to whoever runs it.

```js
const res = await fetch("https://playyeatle.duckdns.org/api/v1/leaderboard?board=daily&limit=5");
const board = await res.json();
const lines = board.entries.map(e => `**${e.rank}.** ${e.username} · 🔥 ${e.streak} (${e.wins} wins)`);
await interaction.reply(`${board.title}\n${lines.join("\n")}`);
```
