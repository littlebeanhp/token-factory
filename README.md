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

## Credits

The agent is [opencode](https://github.com/anomalyco/opencode) (MIT license), used unmodified.
