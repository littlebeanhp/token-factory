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

/** host:port only, safe to show (no credentials). Accepts a value without a scheme too. */
export function proxyHost(proxy: string): string {
  if (!proxy) return "";
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(proxy) ? proxy : `http://${proxy}`;
    return new URL(withScheme).host;
  } catch {
    return "";
  }
}

export const PROXY_KEYS = ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"];
export const NO_PROXY_VALUE = "localhost,127.0.0.1,::1";

/**
 * The panel is the only source of truth for proxying.
 *
 * A machine can carry HTTP_PROXY/ALL_PROXY for a local client (Clash, V2Ray, ...) that is not
 * running. Our own checks use Node's fetch, which ignores those variables and connects
 * directly, while opencode (Bun) honours them - that mismatch is what showed up as
 * "Cannot connect to API: ECONNREFUSED". So with no proxy configured we strip them, and we
 * always keep localhost out of the proxy (opencode talks to its own local server).
 */
/**
 * Same decision, expressed for `createTerminal`, which merges into the inherited env: a
 * `undefined` value is what removes an inherited variable.
 */
export function terminalProxyEnv(proxy: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const key of PROXY_KEYS) env[key] = proxy || undefined;
  env.NO_PROXY = NO_PROXY_VALUE;
  env.no_proxy = NO_PROXY_VALUE;
  return env;
}

export function applyProxyEnv(env: NodeJS.ProcessEnv, proxy: string): NodeJS.ProcessEnv {
  for (const key of PROXY_KEYS) delete env[key];
  env.NO_PROXY = NO_PROXY_VALUE;
  env.no_proxy = NO_PROXY_VALUE;
  if (proxy) {
    env.HTTP_PROXY = proxy;
    env.http_proxy = proxy;
    env.HTTPS_PROXY = proxy;
    env.https_proxy = proxy;
  }
  return env;
}

/**
 * HTTPS GET through an HTTP proxy (CONNECT tunnel).
 *
 * One deadline covers the whole exchange - TCP connect, the CONNECT reply, the TLS
 * handshake and the response - because real proxies happily answer "200 Connection
 * established" and then never tunnel, which used to hang the caller forever.
 */
export function getViaProxy(
  url: string,
  headers: Record<string, string>,
  proxy: string,
  timeoutMs = 15000,
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

    let settled = false;
    let req: http.ClientRequest | undefined;
    let secure: tls.TLSSocket | undefined;
    let get: http.ClientRequest | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (err?: Error, res?: http.IncomingMessage) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) {
        req?.destroy();
        secure?.destroy();
        get?.destroy();
        reject(err);
      } else {
        // Keep the tunnel from hanging mid-response too.
        res?.setTimeout(timeoutMs, () => res.destroy(new Error("Proxy timeout")));
        resolve(res!);
      }
    };

    timer = setTimeout(() => finish(new Error("Proxy timeout")), timeoutMs);

    req = http.request({
      host: p.hostname,
      port: p.port || 80,
      method: "CONNECT",
      path: authority,
      headers: connectHeaders,
    });

    req.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        finish(new Error(`Proxy CONNECT failed (${res.statusCode})`));
        return;
      }
      socket.on("error", (err) => finish(err));
      socket.on("close", () => finish(new Error("Proxy closed the tunnel")));
      secure = tls.connect({ socket, servername: target.hostname });
      secure.on("error", (err) => finish(err));
      secure.once("secureConnect", () => {
        get = https.get(target, { headers, agent: false, createConnection: () => secure! }, (r) => finish(undefined, r));
        get.on("error", (err) => finish(err));
      });
    });
    req.on("error", (err) => finish(err));
    req.end();
  });
}
