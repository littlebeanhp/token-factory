# Token Factory

A ready-to-use Code / Cowork agent for VS Code, powered by [opencode](https://opencode.ai) and preconfigured for **FPT Token Factory**.

## Get started

1. Install the extension.
2. Click the Token Factory icon in the activity bar.
3. Enter your FPT Token API key and click **Connect**.
4. Click **Open agent** (or press `Ctrl+Esc` / `Cmd+Esc`).

There's nothing else to install or configure. On first use the extension downloads the official opencode binary for your system, and every session already points at FPT Token Factory with the latest models (GLM-5.3, DeepSeek).

## Features

- Code / Cowork agent, wrapped with opencode
- FPT Token Factory as the default provider
- Latest models, with the list read live from your account
- Panel in English, Tiếng Việt, Bahasa Melayu, Русский and 日本語

## Settings

| Setting | Description |
| --- | --- |
| `tokenFactory.language` | Panel language: `auto`, `en`, `vi`, `ms`, `ru`, `ja` |
| `tokenFactory.model` | Model ID. Leave empty for the default |

## Privacy

Your API key is stored in VS Code's secure storage (your OS keychain). It's passed only to the local opencode process and sent only to FPT Token Factory.

For managed machines, IT can set the `FPT_API_KEY` environment variable instead and users skip the key step.

## Credits

The agent is [opencode](https://github.com/anomalyco/opencode) (MIT license), used unmodified.
