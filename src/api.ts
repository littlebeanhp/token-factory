import { PLATFORMS, PlatformId } from "./defaults";

export type CheckResult =
  | { ok: true; models: string[] }
  | { ok: false; reason: "invalid" | "network" };

/** Validates the key and reads the live model list in one call. */
export async function checkKey(apiKey: string, platform: PlatformId): Promise<CheckResult> {
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
    const body = (await res.json()) as { data?: { id?: string }[] };
    const models = (body.data ?? []).map((m) => m.id).filter((id): id is string => !!id);
    return { ok: true, models };
  } catch {
    return { ok: true, models: [] };
  }
}
