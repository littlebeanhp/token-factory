import { PLATFORMS, PlatformId } from "./defaults";
import { getViaProxy } from "./proxy";

/** Why an otherwise valid key came back without a model list. */
export type ModelsWarning = "http" | "shape";

export type CheckResult =
  | { ok: true; models: string[]; warning?: ModelsWarning }
  | { ok: false; reason: "invalid" | "network" | "proxy" };

/** Validates the key and reads the live model list in one call. */
export async function checkKey(apiKey: string, platform: PlatformId, proxy = ""): Promise<CheckResult> {
  if (proxy) return checkKeyViaProxy(apiKey, platform, proxy);
  let res: Response;
  try {
    res = await fetch(`${PLATFORMS[platform].baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ok: false, reason: "network" };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: "invalid" };
  if (!res.ok) {
    // Gateway reachable but no model list (e.g. 404): keep the key, use fallback models.
    return { ok: true, models: [], warning: "http" };
  }
  try {
    const models = modelIds(await res.json());
    return models.length ? { ok: true, models } : { ok: true, models, warning: "shape" };
  } catch {
    return { ok: true, models: [], warning: "shape" };
  }
}

async function checkKeyViaProxy(apiKey: string, platform: PlatformId, proxy: string): Promise<CheckResult> {
  let res: import("node:http").IncomingMessage;
  try {
    res = await getViaProxy(`${PLATFORMS[platform].baseUrl}/models`, { Authorization: `Bearer ${apiKey}` }, proxy, 15000);
  } catch {
    return { ok: false, reason: "proxy" };
  }
  const code = res.statusCode ?? 0;
  if (code === 401 || code === 403) {
    res.resume();
    return { ok: false, reason: "invalid" };
  }
  if (code < 200 || code >= 300) {
    res.resume();
    return { ok: true, models: [], warning: "http" };
  }
  try {
    let text = "";
    res.setEncoding("utf8");
    for await (const chunk of res) text += chunk;
    const models = modelIds(JSON.parse(text));
    return models.length ? { ok: true, models } : { ok: true, models, warning: "shape" };
  } catch {
    return { ok: true, models: [], warning: "shape" };
  }
}

/**
 * Reads model ids out of whatever the gateway returns. The documented shape is the
 * OpenAI one (`{ data: [{ id }] }`), but forks also answer with `{ models: [...] }`,
 * a bare array, or objects that carry only `name` / `model` — all accepted here so a
 * working key never silently degrades to the built-in fallback list.
 */
function modelIds(body: unknown): string[] {
  const idOf = (entry: unknown): string | undefined => {
    if (typeof entry === "string") return entry.trim() || undefined;
    if (!entry || typeof entry !== "object") return undefined;
    const e = entry as { id?: unknown; name?: unknown; model?: unknown };
    for (const candidate of [e.id, e.name, e.model]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return undefined;
  };

  const rows: unknown[] = [];
  const push = (value: unknown) => {
    if (Array.isArray(value)) rows.push(...value);
  };
  if (Array.isArray(body)) {
    push(body);
  } else if (body && typeof body === "object") {
    const b = body as { data?: unknown; models?: unknown; result?: unknown };
    push(b.data);
    push(b.models);
    if (b.result && typeof b.result === "object") push((b.result as { data?: unknown }).data);
  }

  const ids = rows.map(idOf).filter((id): id is string => !!id);
  return [...new Set(ids)];
}
