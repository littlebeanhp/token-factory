# Changelog

## 0.8.6

Security fixes (see `docs/sec-audit/report-20261109_092057.md`):

- **A repository can no longer execute code through the agent.** opencode was started with the workspace as its working directory and merged the repo's `opencode.json`, which could start an MCP server (arbitrary command execution) or repoint the provider `baseURL` (API key theft) as soon as the agent opened. Project config is now disabled for every opencode process (`OPENCODE_DISABLE_PROJECT_CONFIG=1`), verified to block both paths
- The extension now declares `capabilities.untrustedWorkspaces.supported: false`, so VS Code does not run it in Restricted Mode at all
- The agent no longer inherits the whole shell environment: a minimal allow-list is passed to opencode, and secret-named variables (`*_TOKEN`, `*_SECRET`, `*_API_KEY`, `AWS_*`, …) are cleared from the agent terminal
- The database reset now refuses any folder outside opencode's own data directory (the path is read from CLI output)
- Panel CSP gains `base-uri 'none'` and `form-action 'none'`


## 0.8.5

- Now supports **all 12 platform packages** opencode publishes: when the binary dies with an illegal instruction (SIGILL on Unix, 0xC000001D on Windows) because the CPU is older than the standard x64 build's instruction set, the extension automatically downloads and verifies the matching **`-baseline`** variant (Linux glibc + musl, macOS, Windows)
- The four baseline tarballs are pinned with sha512 integrity hashes like the other eight platform packages
- The binary path resolution and the version cleanup now also account for a verified baseline variant
- A slow first run (first-run antivirus scan) no longer triggers a pointless re-download: the launch check treats a 30s timeout as "the binary runs, it is just slow"
- Stale version directories are reclaimed on every launch, not only after a new-version download - and never while the current binary is the only working copy


## 0.8.4

- Linux now supports **both glibc and musl systems** (Mint/Ubuntu vs Alpine): the libc variant is detected from the system's actual dynamic loaders (`/lib/ld-musl-*.so.1` vs the glibc loader), not only from Node's report
- If the chosen binary cannot be executed - the classic "wrong libc" case, where the kernel reports `execvp (3) failed: No such file or directory` because the binary's interpreter is missing - the extension automatically downloads and verifies the **other libc variant** (glibc <-> musl) instead of opening a dead terminal
- The binary path resolution now falls back to a previously verified sibling variant, so all panel features (sessions, usage, paths) keep working after such a fallback


## 0.8.3

- Fixed `execvp (3) failed: No such file or directory` for good: the binary is now **executed for real** (`--version`) right before the terminal is spawned, not just stat-checked. A file that antivirus quarantines between the check and the spawn can no longer produce a dead terminal - it is re-downloaded and re-verified first, and if it still cannot run the panel shows the exact OS error, the path and the antivirus-exclusion advice instead of opening a terminal that closes itself
- When the agent still dies within 8 seconds of launch and the binary is missing or broken, the extension re-downloads it in the background and the warning gains a **Retry** button (all 10 languages) that re-opens the agent with the fresh binary
- Windows: the Mark-of-the-Web "blocked" flag is stripped from the binary before the launch check, so a security policy refusing blocked executables can no longer break the launch
- The launch check allows 30s for a first-run antivirus scan of the 50MB binary instead of failing it


## 0.8.2

- A crash right after launch is no longer silent: the extension watches the terminal, logs `exit <code> after <ms>` plus the exact command line, and shows a warning with a "Show log" button when the agent dies within 8 seconds
- Resuming a session that no longer exists (database reset, another project) is caught before launching: the panel says so and refreshes the list instead of opening a terminal that exits immediately
- New string `sessionGone` in all 10 languages


## 0.8.1

- The proxy setting now explains itself: an ⓘ next to "Use a proxy" carries the full rule (off = direct, environment HTTP_PROXY is ignored; on = enter ip:port, optionally user:pass@), and a short line under the checkbox says when you need it and when you don't
- Both strings are translated into all 10 languages


## 0.8.0

- Fixed `execvp (3) failed: No such file or directory` when opening the agent: the binary is verified right before the terminal is spawned (missing / truncated / not executable). A broken copy is re-downloaded once, and if it still cannot run the panel explains the path and suggests an antivirus exclusion
- The working directory is only passed when it still exists on disk, so a moved workspace folder cannot break the spawn either
- `--version` prewarm failures are now logged instead of being swallowed, so Output -> Token Factory shows why a binary cannot run
- Download progress is visible in two places: the VS Code notification now shows `47% · 19.6/42.5 MB`, and the panel renders its own progress bar with the same numbers while the button reads "Starting…"


## 0.7.1

- Fixed "Cannot connect to API: ECONNREFUSED" in the agent when no proxy is configured: the panel is now the only source of truth for proxying, so the agent process no longer inherits a machine-wide `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` (a stopped Clash/V2Ray client) that Node's fetch ignores but opencode honours
- `NO_PROXY`/`no_proxy` always includes localhost, so opencode never proxies its own local server calls
- All spawned opencode processes (terminal, session list, stats, prewarm, debug paths) use one shared environment builder


## 0.7.0

Panel redesign, product-grade:

- Brand lockup: mark + "FPT AI Factory" with a "TOKEN FACTORY" eyebrow, language picker demoted to the right
- Connection is now one bordered card: status dot + platform endpoint, with proxy / key-source as footnotes inside it
- Actions split into a primary (Open/Show agent, with shortcut chip) and a secondary row (Restart when running, Change key) instead of a centred text link
- Recent sessions are real rows: ↳ affordance, humanised titles (`New session · 4 Nov, 19:32`), right-aligned time, hover/focus states, and an empty state
- Usage moved into its own aligned footer row above a hairline; version line sits under it
- Removed the duplicate hint line (the empty state says it), it is now the button tooltip
- New strings `restart` and `noSessions` in all 10 languages


## 0.6.4

- New command **Token Factory: Show data paths** - writes the extension storage folder, the expected database path, the binary path and opencode's real data folder (`opencode debug paths`) plus its files to the Token Factory output channel


## 0.6.3

- **One-click database repair**: when opencode reports a damaged database, the panel now offers "Fix now" - it closes the agent, renames the `.db` (plus `-wal`/`-shm`) files to `*.broken-<timestamp>` in the folder reported by `opencode debug paths`, and asks you to open the agent again. Nothing is deleted
- The resolved data folder is always written to the Token Factory output channel


## 0.6.2

- The "database is in a bad state" warning now asks opencode for its real data folder (`opencode debug paths`) instead of guessing - on Windows the database lives in `%LOCALAPPDATA%\opencode\Data\opencode.db`, one level deeper than before
- The built-in fallback path matches opencode's own layout (extra `Data` folder on Windows)


## 0.6.1

- Fixed "Database is not empty and has no session table" on fresh machines: the panel no longer runs opencode's CLI against a database that does not exist yet, and waits 10s after a launch. A slow first-run migration could be killed by our timeout and leave a half-migrated file
- CLI timeouts raised (session list 20s, stats 30s) so a migration is never interrupted
- If the database is already broken, the panel explains it and logs the exact file to delete (`...\opencode\opencode.db`)


## 0.6.0

- Faster "Open agent": the bundled binary is warmed with a `--version` run once per session, so the first launch is not a cold start (matters most on Windows, where a 50MB executable is scanned on first run)
- The agent is prepared as soon as the panel opens: on `FPT_API_KEY` machines - which never use Connect - the binary is now downloaded ahead of the first click instead of during it
- The primary button turns into "Starting…" and disables itself while the terminal is created, and is released again if the launch fails
- Launch failures (including a missing key) now report back to the panel instead of leaving the button disabled


## 0.5.6

- Usage now shows **today's** tokens (`opencode stats --days 1`) and is labelled "Usage today" in all 10 languages - the all-time totals are rounded to one decimal (`2.5M`) and looked frozen while chatting
- The cost is hidden while it is `$0.00` (FPT AI Factory returns no pricing), so the line reads `↑12.3K ↓4.1K`
- Background refresh every 45s instead of 60s


## 0.5.5

- Restored `retainContextWhenHidden`, so the panel keeps its content (and anything typed) while another view has focus
- Note: the "Could not register service worker / document is in an invalid state" error is a VS Code bug (microsoft/vscode#125993), not this extension - it breaks every webview in the window. Fix: quit VS Code fully, delete `%APPDATA%\Code\Service Worker`, start again


## 0.5.4

- Dropped `retainContextWhenHidden`: VS Code now creates a fresh webview each time the panel is shown, so no document is ever replaced while its service worker is registering
- Re-rendering is tracked per webview, so the panel is drawn again after being hidden and shown


## 0.5.3

- Fixed "Error loading webview: Could not register service worker ... The document is in an invalid state": the panel no longer replaces its document right after the first load
  - exactly one document load at startup, usage/sessions arrive afterwards
  - renders are coalesced to at most one per 250ms and skipped when the HTML is unchanged
  - nothing is rendered while the view is hidden (VS Code cannot register its worker then)


## 0.5.2

- New **Token Factory** output channel: activation, panel setup, session/usage reads and agent launch failures are logged there (Output panel -> "Token Factory")
- Setup errors also open that channel, so a broken panel now comes with a readable trace instead of only a VS Code toast


## 0.5.1

- Fixed: the panel could fail with "Error loading webview" - the logo is now inlined as a data URI instead of going through the webview resource API (no localResourceRoots / asWebviewUri at render time)
- Webview setup is defensive: a failure during setup now shows a message instead of taking the whole panel down


## 0.5.0

- New FPT AI Factory logo everywhere: marketplace/extension icon (full lockup), activity bar, panel header and the agent's terminal tab (all generated from the supplied artwork)
- Panel and terminal use the square mark; the wordmark stays as text in the panel header so it stays legible at 20px
- Old brand asset `media/logo 01.svg` no longer ships in the package


## 0.4.0

- Panel now ships 10 languages: English, Tiếng Việt, Bahasa Indonesia, Bahasa Melayu, 日本語, 한국어, 简体中文, Español, Português (Brasil), Русский
- `auto` maps regional VS Code locales onto the right panel: `zh-TW`/`zh-CN` -> 简体中文, `pt-PT` -> Português (Brasil), plus any other region variant of a shipped language


## 0.3.2

- Usage and sessions now update on their own: re-read in the background every 60s while the panel is visible, and whenever the view becomes visible again
- The panel renders instantly from cache instead of waiting for the CLI, so a slow `stats` scan never freezes it
- Token counts keep opencode's own compact format (`12.4K` stays `12.4K` instead of becoming `12.4`)
- `stats` gets a 20s budget (it scans the whole history); the session list keeps 5s
- Background refresh never touches the panel while the key form is open


## 0.3.1

- The agent's terminal tab now uses the FPT AI Factory mark instead of a generic sparkle icon (light/dark variants)
- The panel mark is drawn in the FPT indigo (#203bd9 / #6b82ff on dark), so panel, terminal tab and activity bar share one mark
- Dropped the extra underline accent now that the mark itself carries the brand colour


## 0.3.0

- Brand: the panel uses the same mark as the activity bar (inlined, follows the theme) with one FPT-blue accent tick; the logo is no longer a bitmap
- Usage: total cost and input/output tokens from the bundled CLI, shown as `Usage: $0.42 · ↑128.4k ↓9.3k`
- Recent sessions: the four latest opencode sessions in the project, one click to reopen with `-s <id>`
- Empty state: a line explaining the agent opens in a terminal, plus the shortcut on the primary button
- Narrow panels (<=340px): connection facts stack label over value instead of breaking hostnames mid-word
- Session ids are validated before being passed to the CLI


## 0.2.0

- New panel design: FPT AI Factory brand header (logo + name) and a consistent type scale (14 title / 13 value / 11 label & meta / 10 hint)
- Status is a dot + "Connected" line, with Platform and Via proxy as aligned key–value rows
- The primary button shows the Ctrl+Esc / Cmd+Esc shortcut, and reads "Show agent" while the agent is already running
- Field labels are quiet uppercase micro-labels, so the title and the action keep the hierarchy
- FPT brand logo is served through the webview's local resource root (CSP img-src added)

## 0.1.9

- Fixed: a proxy that accepts the CONNECT request and then never tunnels left Connect stuck on "Checking…" forever. The proxy check now has a single 15s deadline covering TCP, CONNECT, TLS and the response
- Fixed: the Connect button could stay disabled after a stalled check — a 20s watchdog restores it with an error message, so unchecking "Use a proxy" and retrying always works
- A rejected check now always answers the panel instead of failing silently

## 0.1.8

- Bundled opencode updated to 1.19.5 (new sha512 pins for all 8 platforms, smoke-tested)
- The panel labels the version as `opencode 1.19.5 · bundled` so it is clear it is the pinned build, not "latest"

## 0.1.7

- "Get one from FPT AI Factory" opens the page of the selected platform: neo.fpt.ai or marketplace.fptcloud.com/en

## 0.1.6

- The connected panel shows which platform it talks to (`Platform: neo.fpt.ai`), next to the proxy line

## 0.1.5

- The "key from FPT_API_KEY" note now sits with the Connected badge instead of looking like a caption for the model list
- Replaced the stale marketing bullets (GLM-5.3 …) with the agent version, and dropped the OpenAI-style `sk-…` placeholder
- The model-refresh button spins while the list is loading
- The proxy checkbox and native controls follow the dark theme
- Keyboard focus ring on buttons and links; no phantom gap where the error line is empty

## 0.1.4

- Picking a model now switches the running agent: opencode is relaunched pinned to that model (`-m provider/model`) instead of keeping the model it was started with
- Same for changing the platform

## 0.1.3

- **Change key** now always opens the key form, including when the key comes from `FPT_API_KEY`
- The model list is fetched automatically for keys supplied through `FPT_API_KEY`, instead of staying on the built-in list
- The panel states when the key comes from the environment
- The proxy is kept in the OS keychain (SecretStorage) and shown as `host:port` only

## 0.1.2

- Refresh button next to **Model** to re-read the live catalog
- Warning when the key works but the model list can't be read

## 0.1.1

- Optional HTTP proxy: tick **Use a proxy** and enter the proxy server's IP and port
- Renamed to FPT AI Factory

## 0.1.0

- First release
- One-step setup: enter your FPT AI Factory API key and go
- Bundles opencode 1.19.4, downloaded on first use
- Panel in English, Vietnamese, Malay, Russian and Japanese
