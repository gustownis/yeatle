# Shared instructions for coding assistants

This file is tracked in Git and shared by contributors using Codex, Claude,
and other coding assistants on Windows, Linux, and macOS. Keep it focused on
durable project guidance. `CLAUDE.md` imports this file so the instructions
have one maintained source.

## Check for updates and synchronize automatically

At the start of every work session, check whether the GitHub repository has
new commits or a newer regular release. Routine synchronization of the local
checkout is authorized: update the project files on the PC automatically when
it is safe, rather than only telling the user an update exists.

1. Confirm the repository root, branch, recent commits, and working tree with
   `git rev-parse --show-toplevel`, `git branch --show-current`,
   `git log -5 --oneline`, and `git status --short --untracked-files=all`.
   Inspect existing diffs before editing or updating anything.
2. Fetch remote commits and tags, normally with `git fetch --prune --tags origin`,
   then compare the current branch with its configured upstream. If it has no
   upstream, inspect the remote default branch and existing branch history;
   do not guess a new branch relationship or discard local commits.
3. Check the latest published regular GitHub release, for example with
   `gh api repos/gustownis/yeatle/releases/latest`, and compare its tag with
   the version in the root `package.json`. Tags keep three numbers (`v1.12.0`);
   treat `X.Y` as `X.Y.0`. Compare version numbers correctly;
4. If the checkout is clean and its branch is behind its upstream with no
   local-only commits, automatically run `git merge --ff-only '@{upstream}'`.
   This updates tracked
   project files locally without creating a merge commit. No additional
   confirmation is needed for that routine update.
5. If the branch is dirty or diverged, preserve all work. Inspect how the
   incoming changes overlap the current task and reconcile them without
   discarding unrelated edits. If an update cannot be completed safely,
   explain the specific conflict and continue independent work. Never reset
   hard, force-push, delete files, or stash someone else's changes merely to
   force an update through.
6. If the newest release is ahead of the active branch, fetch and inspect its
   tag and the remote default branch. Incorporate it through the appropriate
   Git history when safe; do not switch branches blindly or unpack a desktop
   download over the source checkout. Updating this checkout does not by itself
   update a separately installed desktop application.
7. After synchronization, reread any changed instructions and the relevant
   package files. Refresh dependencies with the root `npm ci` if needed for
   the task because the lockfile changed or the installed binaries belong to
   another OS. Run checks appropriate to the incoming changes and the task.
   Report the version or commit actually reached and any remaining limitations.

If GitHub or the network is unavailable, say the update check could not be
completed and work from the available checkout. Do not claim it is current
without checking. Keep ignored local settings, songs, models, caches, and
private notes intact throughout synchronization.

## Coordinate through the repository

- Different contributors, operating systems, and assistant chats do not share
  conversation history. Use current files, Git history, relevant docs, and the
  user's request to establish what has already changed.
- Preserve unrelated edits. Do not reset, clean away, overwrite, or stash
  another person's work just to make the working tree clean.
- Read the relevant parts of `README.md` and `docs/` for the requested change.
  Treat old verification reports as dated evidence, not checks you just ran.
- When handing off work, state the behavior changed, checks actually run,
  operating system tested, remaining issues, and next useful step. Put lasting
  project decisions in relevant documentation and commit or pull-request
  descriptions. Keep private chat transcripts and machine-specific notes out
  of this shared guide; ignored `.tmp/` can hold local notes.
- Keep commits scoped to the request and review staged filenames and diffs.
  Follow the user's requested delivery through to completion; distinguish
  local changes, committed changes, and changes actually pushed to GitHub.
  Release publication and deployments must stay within the user's request.

## Markdown and release-note formatting

- Let prose wrap naturally to the reader's available page width. Keep each paragraph on one source line instead of manually wrapping at a fixed column count or putting each sentence on a new line. Apply this to release notes, README text, documentation, shared instructions, and release or pull-request descriptions.
- Keep each list item on one source line unless it contains a real nested list, separate paragraph, or code block. Use blank lines for actual paragraph breaks and preserve meaningful structure such as headings, tables, and code; do not add forced line breaks just to shorten a line.
- Release notes (in `docs/releases/` and on GitHub releases) describe what players and admins can see and use. Never mention anti-cheat, bans or how answers are protected, and don't name the rules behind them; describe such changes neutrally (for example "Snippets rounds run on the server") or leave them out. To correct a published release's notes, edit its `docs/releases` file, push it, and run the **Desktop builds** workflow with **notes** set to the release's tag.
- GitHub release descriptions can display source newlines as visible line breaks. When copying notes from Markdown files, join wrapped paragraph and list-continuation lines before publishing, and check the rendered notes for unnecessary breaks.

## Version numbering

- Name releases with two numbers, X.Y (for example 1.12, then 1.13), in GitHub release titles, release notes (`docs/releases/1.13.md`) and README text. Do not add a trailing ".0" there (write 1.12, not 1.12.0).
- Git tags and installer file names keep all three numbers (`v1.13.0`, `Yeatle-Setup-1.13.0-windows-x64.exe`). Installed desktop apps read the latest release's tag and look for assets named with that full version; a tag like `v1.13` or a file named `…-1.13-…` makes every installed app's update check fail. `scripts/builder.cjs` names installers with the full version, and a test checks those names match the updater's.
- `package.json` and `package-lock.json` must keep a valid three-part semver (1.12.0), because npm and electron-builder reject "1.12". Treat X.Y as X.Y.0 when comparing versions.
- Use a third number only for a real patch release (for example 1.12.1).
- Releases are built and published by the **Desktop builds** workflow: run it with **release** ticked to build all five targets and create a draft release (tag `v` + the `package.json` version, notes from `docs/releases/X.Y.md`, all 14 files checked), then run it again with **publish** ticked to make that draft the Latest release.

## Important project constraints

- New game tabs/pages must resemble the existing Stems and Snippets tabs as
  closely as possible. Reuse their layout, proportions, spacing, controls,
  purple accents, song suggestions, and navigation/transition conventions;
  check both desktop and portrait/mobile layouts.
  Keep the tab strip content-sized and put its full-width divider on the
  surrounding mode bar, so desktop transitions do not stretch the tab text.
- Yeatle uses a Node.js browser server (`server.js`) and an Electron desktop
  shell (`desktop/`). The working frontend lives in tracked `build/` files,
  including `build/assets/`. Do not delete `build/` as disposable output.
- `source/` is an incomplete imported Vite project: the original `src/`,
  including `main.jsx`, is missing. Read `source/README.md` before frontend
  build work. Do not overwrite the working `build/` by attempting a routine
  Vite rebuild from the incomplete source.
- Preserve local songs, settings, caches, downloaded models, and any imported
  `Yeatle 1.9 + Mac/` folder. Respect `.gitignore`; do not commit credentials,
  personal configuration, song packs, or generated release artifacts.
- Use the repository root discovered on the current machine. Do not hardcode
  another contributor's drive letter, username, or Linux mount path.
- Match filename case exactly for Linux, quote paths with spaces, and follow
  `.gitattributes` for line endings. Avoid whole-file newline changes.
- Electron and other dependencies can contain platform-specific binaries.
  Do not reuse a `node_modules/` installation from another OS without checking
  it; reinstall from the root lockfile when switching the shared installation
  between operating systems. The root `postinstall` runs Electron's explicit
  binary installer; keep it so `npm ci` also prepares the desktop executable.
- Shared Daily uses the website configured by `dailyAuthority` for its song,
  audio, clip start, and UTC reset. Only the authoritative website (or an
  explicit local test) sets `dailyAuthority` to an empty string. Preserve its
  ignored `daily-challenges.json` during updates; clients must not fall back
  to locally selected songs when the shared host is unavailable.
- Keep playable sources, release status and answer identities separate. Use
  `catalog-policy.cjs`, `catalog-metadata.json` and the documented rules in
  `docs/catalog-answer-policy.md` for verified equivalents and artist credits.
  Yeat vocal features are eligible; confirmed producer-only tracks are excluded
  from future rounds, including Stems only. Preserve existing ids, files and
  pinned challenges when correcting metadata. Shared instrumentals alone do
  not establish equivalent vocal recordings.
- The anti-cheat rules live in a separate private repository that the website loads through `antiCheatModule` in its `config.json`. This repository only calls the judge's hooks (`STAND_IN_JUDGE` in `leaderboard.cjs` is the interface and the no-op default). Don't add detection rules, thresholds or their tests here, and don't document them anywhere in this public repository (docs, README, release notes, commit messages, the admin page's text). If you need the private repository and don't have it, ask the user.
- Admin Hide/Show is manual curation of eligible entries. Catalog exclusions use the same eligibility policy in gameplay, admin status and live control; do not duplicate them in default hidden-song settings or bypass them through Play in game. Clearing an old duplicate manual hide must not restore an excluded recording.

## Run and verify

The package requires Node.js >=22. The README and CI currently use Node.js 24
as the baseline; check the current package files and workflow if this changes.
Run commands from the repository root. In Windows PowerShell, use `npm.cmd`
instead of `npm` if execution policy blocks `npm.ps1`.

| Task | Command / guidance |
| --- | --- |
| Local browser game | `node server.js` or `npm start`; default URL `http://127.0.0.1:3093` |
| Automated checks | `npm test` |
| Install desktop dependencies | `npm ci` on the current OS |
| Desktop development | `npm run desktop` |
| Windows x64 packages | `npm run dist:win -- --x64` on Windows |
| Linux x64 packages | `npm run dist:linux -- --x64` on Linux |
| Other architectures / macOS | See the current README and desktop build workflow |

Browser play does not require installing desktop dependencies. Packaging
outputs go in ignored `release/`; use ignored `.tmp/` for temporary checks.

Run checks appropriate to the change. For browser or desktop behavior, consult
`scripts/browser-smoke.cjs`, `scripts/desktop-smoke.cjs`, and the relevant reports
under `docs/` for prerequisites and limits. `scripts/desktop-stems-smoke.cjs`
covers HQ stem downloads in the desktop app, and `scripts/karaoke-skip-smoke.cjs`
covers Karaoke White people mode with a synthetic microphone. `scripts/bans-browser-smoke.cjs`
covers the banned screen and admin ban panel, and `scripts/snippet-rounds-smoke.cjs` (needs
ffmpeg) checks that Snippets rounds never reveal the song before they end. Verify platform-specific behavior
on that platform, and report anything not exercised. Do not call an unrun check
passed or present a package build as proof of device behavior.

For README screenshot updates, inspect the rendered GitHub README after a
requested push. If an overwritten image stays cached, give the replacement a
new filename and update its link; verifying the file in `docs/` alone does not
establish which image the front page displays.

Update this guide when a durable workflow or project constraint changes.
Keep current task status in Git history and relevant task documentation rather
than appending a session log here.
