// Downloads the official, unmodified opencode binary for this machine.
// Source: the platform packages that the `opencode-ai` npm package itself uses.
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as https from "node:https";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import * as tar from "tar";
import pinned from "../opencode.version.json";

export const OPENCODE_VERSION: string = pinned.version;
// sha512 of each platform tarball, pinned together with the version.
const INTEGRITY: Record<string, string> = pinned.integrity;

function isMusl(): boolean {
  if (process.platform !== "linux") return false;
  try {
    // glibc systems report a glibc version here; musl systems don't.
    const report = (process as any).report?.getReport?.();
    return !report?.header?.glibcVersionRuntime;
  } catch {
    return fs.existsSync("/etc/alpine-release");
  }
}

/** npm package name for this OS/CPU, e.g. opencode-darwin-arm64. */
export function platformPackage(): string {
  const os = process.platform === "win32" ? "windows" : process.platform;
  if (!["windows", "darwin", "linux"].includes(os)) {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
  const arch = process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : null;
  if (!arch) throw new Error(`Unsupported CPU: ${process.arch}`);
  return `opencode-${os}-${arch}${isMusl() ? "-musl" : ""}`;
}

function binaryName(): string {
  return process.platform === "win32" ? "opencode.exe" : "opencode";
}

function get(url: string, redirects = 5): Promise<import("node:http").IncomingMessage> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "token-factory-vscode" } }, (res) => {
        const code = res.statusCode ?? 0;
        if (code >= 300 && code < 400 && res.headers.location && redirects > 0) {
          res.resume();
          resolve(get(new URL(res.headers.location, url).toString(), redirects - 1));
        } else if (code !== 200) {
          res.resume();
          reject(new Error(`Download failed (${code}) for ${url}`));
        } else {
          resolve(res);
        }
      })
      .on("error", reject);
  });
}

/**
 * Returns the path of the opencode binary, downloading it on first use.
 * Binaries are cached per version under the extension's global storage,
 * so bumping OPENCODE_VERSION fetches the new one automatically.
 */
export async function ensureOpencode(storageDir: string, onProgress?: (pct: number) => void): Promise<string> {
  const pkg = platformPackage();
  const dir = path.join(storageDir, "opencode", `${OPENCODE_VERSION}-${pkg}`);
  const bin = path.join(dir, "bin", binaryName());
  if (fs.existsSync(bin)) return bin;

  const tmp = `${dir}.part-${process.pid}`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  const url = `https://registry.npmjs.org/${pkg}/-/${pkg}-${OPENCODE_VERSION}.tgz`;
  const res = await get(url);
  const total = Number(res.headers["content-length"] ?? 0);
  let seen = 0;
  let lastPct = -1;
  res.on("data", (chunk: Buffer) => {
    seen += chunk.length;
    const pct = total ? Math.floor((seen / total) * 100) : 0;
    if (pct !== lastPct) {
      lastPct = pct;
      onProgress?.(pct);
    }
  });

  try {
    // Fail closed: the binary receives the API key, so only run a tarball whose
    // hash matches the one pinned in opencode.version.json.
    const expected = INTEGRITY[pkg];
    if (!expected?.startsWith("sha512-")) throw new Error(`No pinned integrity for ${pkg}`);
    const hash = crypto.createHash("sha512");
    const tgz = path.join(tmp, "package.tgz");
    await pipeline(
      res,
      new Transform({
        transform(chunk, _enc, cb) {
          hash.update(chunk);
          cb(null, chunk);
        },
      }),
      fs.createWriteStream(tgz),
    );
    if (`sha512-${hash.digest("base64")}` !== expected) {
      throw new Error(`Integrity check failed for ${pkg}@${OPENCODE_VERSION}`);
    }
    await tar.x({ file: tgz, cwd: tmp, strip: 1 });
    fs.rmSync(tgz, { force: true });
    const extracted = path.join(tmp, "bin", binaryName());
    if (!fs.existsSync(extracted)) throw new Error(`Binary not found in ${pkg}`);
    if (process.platform !== "win32") fs.chmodSync(extracted, 0o755);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw err;
  }

  // Remove binaries of older versions to save disk space.
  const root = path.join(storageDir, "opencode");
  for (const name of fs.readdirSync(root)) {
    if (path.join(root, name) !== dir && !name.includes(".part-")) {
      fs.rmSync(path.join(root, name), { recursive: true, force: true });
    }
  }
  return bin;
}
