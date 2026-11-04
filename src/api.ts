import { PLATFORMS, PlatformId } from "./defaults";
import { getViaProxy } from "./proxy";

export type CheckResult =
  | { ok: true; models: string[] }
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
    return { ok: true, models: [] };
  }
  try {
    return { ok: true, models: modelIds(await res.json()) };
  } catch {
    return { ok: true, models: [] };
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
    return { ok: true, models: [] };
  }
  try {
    let text = "";
    res.setEncoding("utf8");
    for await (const chunk of res) text += chunk;
    return { ok: true, models: modelIds(JSON.parse(text)) };
  } catch {
    return { ok: true, models: [] };
  }
}

function modelIds(body: unknown): string[] {
  const data = (body as { data?: { id?: string }[] }).data ?? [];
  return data.map((m) => m.id).filter((id): id is string => !!id);
}
