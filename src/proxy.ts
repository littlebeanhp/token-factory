// Optional HTTP proxy, set from the panel ("Use a proxy").
import * as http from "node:http";
import * as https from "node:https";
import * as tls from "node:tls";

/**
 * Normalizes what the user typed ("10.0.0.1:8080", "user:pass@host:port", "http://host:port").
 * Returns "" for no proxy, null when the address can't be used.
 */
export function normalizeProxy(input: unknown): string | null {
  let s = String(input ?? "").trim();
  if (!s) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" || !u.hostname) return null;
    const auth = u.username ? `${u.username}${u.password ? `:${u.password}` : ""}@` : "";
    return `http://${auth}${u.host}`;
  } catch {
    return null;
  }
}

/** host:port only, safe to show (no credentials). */
export function proxyHost(proxy: string): string {
  return new URL(proxy).host;
}

/** Env vars for the opencode process, so the agent's own requests use the proxy too. */
export function proxyEnv(proxy: string): Record<string, string> {
  if (!proxy) return {};
  return { HTTPS_PROXY: proxy, HTTP_PROXY: proxy, NO_PROXY: "localhost,127.0.0.1,::1" };
}

/** HTTPS GET through an HTTP proxy (CONNECT tunnel). */
export function getViaProxy(
  url: string,
  headers: Record<string, string>,
  proxy: string,
  timeoutMs?: number,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const p = new URL(proxy);
    const authority = `${target.hostname}:${target.port || 443}`;
    const connectHeaders: Record<string, string> = { Host: authority };
    if (p.username) {
      const cred = `${decodeURIComponent(p.username)}:${decodeURIComponent(p.password)}`;
      connectHeaders["Proxy-Authorization"] = `Basic ${Buffer.from(cred).toString("base64")}`;
    }

    const req = http.request({
      host: p.hostname,
      port: p.port || 80,
      method: "CONNECT",
      path: authority,
      headers: connectHeaders,
    });
    const timer = timeoutMs
      ? setTimeout(() => {
          req.destroy();
          reject(new Error("Proxy timeout"));
        }, timeoutMs)
      : undefined;

    req.on("connect", (res, socket) => {
      clearTimeout(timer);
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Proxy CONNECT failed (${res.statusCode})`));
        return;
      }
      const secure = tls.connect({ socket, servername: target.hostname });
      secure.on("error", reject);
      secure.once("secureConnect", () => {
        const get = https.get(target, { headers, agent: false, createConnection: () => secure }, resolve);
        get.on("error", reject);
        if (timeoutMs) get.setTimeout(timeoutMs, () => get.destroy(new Error("timeout")));
      });
    });
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.end();
  });
}
