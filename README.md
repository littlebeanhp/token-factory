# Token Factory

A ready-to-use Code / Cowork agent for VS Code, powered by [opencode](https://opencode.ai) and preconfigured for **FPT AI Factory**.

## Get started

1. Install the extension.
2. Click the Token Factory icon in the activity bar.
3. Enter your FPT AI Factory API key and click **Connect**.
4. Click **Open agent** (or press `Ctrl+Esc` / `Cmd+Esc`).

There's nothing else to install or configure. On first use the extension downloads the official opencode binary for your system, and every session already points at FPT AI Factory with the latest models (GLM-5.3, DeepSeek).

For managed machines, IT can set the `FPT_API_KEY` environment variable instead and users skip the key step.

### Behind a proxy

Tick **Use a proxy** under the API key and enter your proxy server, for example `10.0.0.1:8080` (or `user:password@10.0.0.1:8080`). The key check, the opencode download and the agent all go through it. Leave it unticked to connect directly.

## Features

- Code / Cowork agent, wrapped with opencode
- FPT AI Factory as the default provider
- Latest models, with the list read live from your account
- Panel in English, Tiếng Việt, Bahasa Melayu, Русский and 日本語

## Settings

| Setting | Description |
| --- | --- |
| `tokenFactory.language` | Panel language: `auto`, `en`, `vi`, `ms`, `ru`, `ja` |
| `tokenFactory.model` | Model ID. Leave empty for the default |

## Build the .vsix

Requires Node.js 22+.

```bash
npm ci
npm run package
```

This runs the typecheck, bundles the extension with esbuild, and writes `token-factory-<version>.vsix` in the repo root. Install it with `code --install-extension token-factory-<version>.vsix`, or in VS Code: Extensions view → `…` → **Install from VSIX…**

```bash
npm run build       # bundle to dist/
npm run watch       # rebuild on change
npm run typecheck   # tsc --noEmit
```

Press `F5` in VS Code to launch an Extension Development Host.

## Security notes

- The API key is kept in VS Code SecretStorage (your OS keychain). It is sent only to the fixed FPT AI Factory endpoints in `src/defaults.ts`, and passed to the local opencode process through the `FPT_API_KEY` environment variable. It is never written to a config file or logged.
- The opencode binary is downloaded from the npm registry on first use. Its sha512 is pinned per platform in `opencode.version.json` and checked before it is extracted or run. To upgrade, change the version and the hashes (`npm view opencode-<os>-<arch>@<version> dist.integrity`), then run `node scripts/smoke.mjs`.
- opencode runs with `autoupdate: false` and `share: "disabled"`.
- The webview uses a strict CSP (nonce-only scripts) and validates every message it receives.
- Residual risk: the agent can run shell commands in its terminal, so a command such as `env` run by the agent exposes `FPT_API_KEY` to the model. Use a key with limited scope.
- There is no CI that publishes or holds secrets. Releases are uploaded manually.

## Credits

The agent is [opencode](https://github.com/anomalyco/opencode) (MIT license), used unmodified.
