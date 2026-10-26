# Token Factory

Source for the **Token Factory** VS Code extension: a Code / Cowork agent powered by [opencode](https://opencode.ai) and preconfigured for FPT Token Factory. This repo builds the `.vsix` package.

## Build the .vsix

Requires Node.js 22+.

```bash
npm ci
npm run package
```

This runs the typecheck, bundles the extension with esbuild, and writes `token-factory-<version>.vsix` in the repo root.

## Install

```bash
code --install-extension token-factory-0.1.0.vsix
```

Or in VS Code: Extensions view → `…` → **Install from VSIX…**

## Development

```bash
npm run build       # bundle to dist/
npm run watch       # rebuild on change
npm run typecheck   # tsc --noEmit
```

Press `F5` in VS Code to launch an Extension Development Host.

## Usage

1. Click the Token Factory icon in the activity bar.
2. Enter your FPT Token API key and click **Connect**.
3. Click **Open agent** (`Ctrl+Esc` / `Cmd+Esc`).

For managed machines, set the `FPT_API_KEY` environment variable to skip the key step.

## Security notes

- The API key is kept in VS Code SecretStorage. It is sent only to the fixed FPT endpoints in `src/defaults.ts`, and passed to the local opencode process through the `FPT_API_KEY` environment variable. It is never written to a config file or logged.
- The opencode binary is downloaded from the npm registry on first use. Its sha512 is pinned per platform in `opencode.version.json` and checked before it is extracted or run. To upgrade, change the version and the hashes (`npm view opencode-<os>-<arch>@<version> dist.integrity`), then run `node scripts/smoke.mjs`.
- opencode runs with `autoupdate: false` and `share: "disabled"`.
- The webview uses a strict CSP (nonce-only scripts) and validates every message it receives.
- Residual risk: the agent can run shell commands in its terminal, so a command such as `env` run by the agent exposes `FPT_API_KEY` to the model. Use a key with limited scope.
- There is no CI that publishes or holds secrets. Releases are uploaded manually.

## Credits

The agent is [opencode](https://github.com/anomalyco/opencode) (MIT license), used unmodified.
