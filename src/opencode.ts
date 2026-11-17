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
import { getViaProxy } from "./proxy";

export const OPENCODE_VERSION: string = pinned.version;
// sha512 of each platform tarball, pinned together with the version.
const INTEGRITY: Record<string, string> = pinned.integrity;

function isMusl(): boolean {
  if (process.platform !== "linux") return false;
  const arch = process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : null;
  if (!arch) return false;
  // The dynamic loaders are the ground truth for what the kernel can exec here:
  // glibc systems (Mint, Ubuntu, RHEL, ...) carry the glibc loader, musl systems
  // (Alpine) carry the musl loader. A binary whose interpreter is missing fails
  // with "execvp (3) failed: No such file or directory" - so this decides which
  // platform package to download.
  const muslLoader = `/lib/ld-musl-${arch}.so.1`;
  const glibcLoaders = [
    `/lib/${arch}-linux-gnu/ld-linux-${arch}.so.2`, // Debian/Ubuntu/Mint
    `/lib64/ld-linux-${arch}.so.2`, // RHEL/Fedora/openSUSE
    `/lib/ld-linux-${arch}.so.2`,
  ];
  const hasMusl = fs.existsSync(muslLoader);
  const hasGlibc = glibcLoaders.some((p) => fs.existsSync(p));
  if (hasMusl !== hasGlibc) return hasMusl;
  // Both or neither (unusual): ask Node which libc it was linked against, then
  // assume glibc - the common case.
  try {
    const report = (process as any).report?.getReport?.();
    if (report?.header?.glibcVersionRuntime !== undefined) return !report.header.glibcVersionRuntime;
  } catch {
    /* assume glibc */
  }
  return false;
}

/** The other libc variant for this machine (Linux only): glibc <-> musl. */
export function siblingPackage(pkg: string): string | undefined {
  if (!pkg.startsWith("opencode-linux-")) return undefined;
  return pkg.endsWith("-musl") ? pkg.slice(0, -"-musl".length) : `${pkg}-musl`;
}

/** The older-CPU build for this x64 package (no baseline exists for ARM64). */
export function baselinePackage(pkg: string): string | undefined {
  if (!pkg.includes("-x64")) return undefined;
  return pkg.endsWith("-musl") ? `${pkg.slice(0, -"-musl".length)}-baseline-musl` : `${pkg}-baseline`;
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

/** The binary of one platform package, once downloaded. */
export function packageBinPath(storageDir: string, pkg: string): string {
  return path.join(storageDir, "opencode", `${OPENCODE_VERSION}-${pkg}`, "bin", binaryName());
}

/**
 * Where the pinned binary lives once downloaded - does not touch the network.
 * Prefers the detected variant, but falls back to a previously verified sibling
 * (the glibc/musl guess was wrong) or baseline (the CPU is older than the
 * standard build's instruction set) variant.
 */
export function opencodePath(storageDir: string): string {
  const pkg = platformPackage();
  const bin = packageBinPath(storageDir, pkg);
  if (fs.existsSync(bin)) return bin;
  for (const alt of [siblingPackage(pkg), baselinePackage(pkg)]) {
    if (!alt) continue;
    const p = packageBinPath(storageDir, alt);
    if (fs.existsSync(p)) return p;
  }
  return bin;
}

function get(url: string, redirects = 5, proxy = ""): Promise<import("node:http").IncomingMessage> {
  return new Promise((resolve, reject) => {
    const onResponse = (res: import("node:http").IncomingMessage) => {
      const code = res.statusCode ?? 0;
      if (code >= 300 && code < 400 && res.headers.location && redirects > 0) {
        res.resume();
        resolve(get(new URL(res.headers.location, url).toString(), redirects - 1, proxy));
      } else if (code !== 200) {
        res.resume();
        reject(new Error(`Download failed (${code}) for ${url}`));
      } else {
        resolve(res);
      }
    };
    const headers = { "User-Agent": "token-factory-vscode" };
    if (proxy) getViaProxy(url, headers, proxy).then(onResponse, reject);
    else https.get(url, { headers }, onResponse).on("error", reject);
  });
}

/** Removes other versions' directories, keeping the sibling libc and baseline variants. */
function cleanOldVersions(storageDir: string, pkg: string, keepDir: string) {
  const root = path.join(storageDir, "opencode");
  if (!fs.existsSync(root)) return;
  const keep = new Set([keepDir]);
  for (const alt of [siblingPackage(pkg), baselinePackage(pkg)]) {
    if (alt) keep.add(path.join(root, `${OPENCODE_VERSION}-${alt}`));
  }
  for (const name of fs.readdirSync(root)) {
    if (keep.has(path.join(root, name)) || name.includes(".part-")) continue;
    fs.rmSync(path.join(root, name), { recursive: true, force: true });
  }
}

/**
 * Returns the path of the opencode binary, downloading it on first use.
 * Binaries are cached per version under the extension's global storage,
 * so bumping OPENCODE_VERSION fetches the new one automatically.
 */
export async function ensureOpencode(
  storageDir: string,
  onProgress?: (pct: number, seen: number, total: number) => void,
  proxy = "",
  pkg = platformPackage(),
): Promise<string> {
  const dir = path.join(storageDir, "opencode", `${OPENCODE_VERSION}-${pkg}`);
  const bin = path.join(dir, "bin", binaryName());
  if (fs.existsSync(bin)) {
    // Current binary is in place: reclaim older versions. When it is not, leave
    // them alone - a failed download must not delete the last working copy.
    cleanOldVersions(storageDir, pkg, dir);
    return bin;
  }

  const tmp = `${dir}.part-${process.pid}`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  const url = `https://registry.npmjs.org/${pkg}/-/${pkg}-${OPENCODE_VERSION}.tgz`;
  const res = await get(url, 5, proxy);
  const total = Number(res.headers["content-length"] ?? 0);
  let seen = 0;
  let lastPct = -1;
  res.on("data", (chunk: Buffer) => {
    seen += chunk.length;
    const pct = total ? Math.floor((seen / total) * 100) : 0;
    if (pct !== lastPct) {
      lastPct = pct;
      onProgress?.(pct, seen, total);
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

  cleanOldVersions(storageDir, pkg, dir);
  return bin;
}
