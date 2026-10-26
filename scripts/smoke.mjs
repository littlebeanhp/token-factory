// Smoke test: download the pinned opencode binary for this machine and check
// that it loads the FPT Token Factory config. Run it manually after changing opencode.version.json.
// Usage: node scripts/smoke.mjs   (set FPT_API_KEY to also send a real prompt)
import * as esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const work = fs.mkdtempSync(path.join(os.tmpdir(), "tf-smoke-"));
const out = path.join(work, "lib.mjs");
await esbuild.build({
  stdin: {
    contents: `export * from "./src/opencode"; export * from "./src/defaults";`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  logLevel: "error",
});
const lib = await import(pathToFileURL(out).href);

console.log(`opencode ${lib.OPENCODE_VERSION} (${lib.platformPackage()})`);
const bin = await lib.ensureOpencode(path.join(work, "storage"));
console.log(`binary: ${bin}`);

const env = {
  ...process.env,
  OPENCODE_CONFIG_CONTENT: lib.buildOpencodeConfig(lib.FALLBACK_MODELS, lib.DEFAULT_MODEL),
  FPT_API_KEY: process.env.FPT_API_KEY || "smoke-test",
  XDG_CONFIG_HOME: path.join(work, "config"),
  XDG_DATA_HOME: path.join(work, "data"),
  XDG_CACHE_HOME: path.join(work, "cache"),
  XDG_STATE_HOME: path.join(work, "state"),
};

const version = execFileSync(bin, ["--version"], { env, encoding: "utf8" }).trim();
console.log(`version: ${version}`);

const models = execFileSync(bin, ["models", lib.PROVIDER_ID], { env, encoding: "utf8", timeout: 120000 });
for (const id of lib.FALLBACK_MODELS) {
  if (!models.includes(`${lib.PROVIDER_ID}/${id}`)) {
    console.error(models);
    throw new Error(`opencode did not load model ${id} from the FPT config`);
  }
}
console.log("config: FPT provider and models loaded");

if (process.env.FPT_API_KEY) {
  const answer = execFileSync(bin, ["run", "Reply with the single word: pong"], {
    env,
    encoding: "utf8",
    timeout: 180000,
    cwd: work,
  });
  console.log(`live prompt: ${answer.trim().slice(0, 200)}`);
}

fs.rmSync(work, { recursive: true, force: true });
console.log("smoke test passed");
