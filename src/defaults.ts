// Everything FPT-specific lives in this one file.
// opencode itself is never modified.

export const PROVIDER_ID = "fpt-token-factory";
export const PROVIDER_NAME = "FPT Token Factory";
export const API_KEY_ENV = "FPT_API_KEY";

export type PlatformId = "marketplace" | "neo";

export const PLATFORMS: Record<PlatformId, { name: string; baseUrl: string; getKeyUrl: string }> = {
  marketplace: {
    name: "marketplace.fptcloud.com",
    baseUrl: "https://mkp-api.fptcloud.com/v1",
    getKeyUrl: "https://marketplace.fptcloud.com",
  },
  neo: {
    name: "neo.fpt.ai",
    baseUrl: "https://token-api.fpt.ai/v1",
    getKeyUrl: "https://token-api.fpt.ai",
  },
};
export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[];
export const DEFAULT_PLATFORM: PlatformId = "neo";

export function resolvePlatform(id: unknown): PlatformId {
  return PLATFORM_IDS.includes(id as PlatformId) ? (id as PlatformId) : DEFAULT_PLATFORM;
}

// Used only when the live model list (GET /v1/models) can't be read.
// Check these IDs against the real catalog before publishing.
export const FALLBACK_MODELS = ["GLM-5.3", "DeepSeek-V4-Flash"];
export const DEFAULT_MODEL = FALLBACK_MODELS[0];

/** The opencode config injected through OPENCODE_CONFIG_CONTENT. */
export function buildOpencodeConfig(models: string[], model: string, platform: PlatformId = DEFAULT_PLATFORM): string {
  const list = models.length ? models : FALLBACK_MODELS;
  const chosen = list.includes(model) ? model : list[0];
  return JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    provider: {
      [PROVIDER_ID]: {
        npm: "@ai-sdk/openai-compatible",
        name: PROVIDER_NAME,
        options: {
          baseURL: PLATFORMS[platform].baseUrl,
          apiKey: `{env:${API_KEY_ENV}}`,
        },
        models: Object.fromEntries(list.map((id) => [id, { name: id }])),
      },
    },
    model: `${PROVIDER_ID}/${chosen}`,
    small_model: `${PROVIDER_ID}/${chosen}`,
    // The binary is pinned and hash-checked; it must not update itself or upload sessions.
    autoupdate: false,
    share: "disabled",
  });
}
