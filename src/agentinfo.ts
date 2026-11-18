// Reads what the bundled opencode CLI knows about this machine: recent sessions and
// token/cost totals. Both commands print human-readable tables (no JSON flag), so the
// parsers stay defensive and simply return nothing when the shape changes.
import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export type Session = { id: string; title: string; updated: string };

/** Where opencode keeps its SQLite file (its own `debug paths` layout). */
export function opencodeDbPath(): string {
  // Mirrors opencode's own layout (env-paths): Windows keeps an extra "Data" folder.
  const data =
    process.platform === "win32"
      ? path.join(process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Local"), "opencode", "Data")
      : process.platform === "darwin"
        ? path.join(process.env.HOME ?? "", "Library", "Application Support", "opencode")
        : path.join(process.env.XDG_DATA_HOME || path.join(process.env.HOME ?? "", ".local", "share"), "opencode");
  return path.join(data, "opencode.db");
}

/**
 * Asks the CLI where it keeps its data. Windows layouts differ from ours (env-paths adds a
 * `Data` folder), so guessing the database path is not good enough for a "delete this" warning.
 */
export async function opencodeDataDir(
  bin: string,
  env: NodeJS.ProcessEnv,
  cwd?: string,
): Promise<string | undefined> {
  const out = await output(bin, ["debug", "paths"], env, cwd, 8000).catch(() => "");
  const line = /^data[ \t]+(.+)$/m.exec(out);
  return line?.[1].trim() || undefined;
}

/** True when the CLI says its database exists but was never migrated (corrupt/partial file). */
export function isBrokenDb(errors: string[]): boolean {
  return errors.some((e) => /no session table/i.test(e));
}
export type Usage = { cost: string; input: string; output: string };
export type AgentInfo = { sessions: Session[]; usage?: Usage; errors?: string[] };

const EMPTY: AgentInfo = { sessions: [] };

async function output(
  bin: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd: string | undefined,
  timeout: number,
): Promise<string> {
  const { stdout } = await run(bin, args, { env, cwd, timeout, maxBuffer: 256 * 1024, windowsHide: true });
  return stdout;
}

/** `ses_…  title  updated` rows, separated by two or more spaces. */
export function parseSessions(stdout: string, limit = 4): Session[] {
  const sessions: Session[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("ses_")) continue;
    const [id, title, updated] = trimmed.split(/\s{2,}/);
    if (!id) continue;
    sessions.push({ id, title: title ?? "", updated: updated ?? "" });
    if (sessions.length >= limit) break;
  }
  return sessions;
}

/** Values out of the box-drawn tables: `│Total Cost          $0.00 │`. */
export function parseUsage(stdout: string): Usage | undefined {
  const value = (label: string) => {
    const m = new RegExp(`[│|]\\s*${label}\\s{2,}([^│|]+?)\\s*[│|]`).exec(stdout);
    return m?.[1].trim();
  };
  const cost = value("Total Cost");
  const input = value("Input");
  const outputValue = value("Output");
  if (!cost || input === undefined || outputValue === undefined) return undefined;
  return { cost, input, output: outputValue };
}

export async function readAgentInfo(
  bin: string,
  env: NodeJS.ProcessEnv,
  cwd?: string,
): Promise<AgentInfo> {
  // Sequential on purpose: two opencode processes starting at once can race on a brand-new
  // database ("database is empty" / locked) on a fresh machine.
  const errors: string[] = [];
  let sessions: Session[] = [];
  try {
    sessions = parseSessions(await output(bin, ["session", "list"], env, cwd, 20000));
  } catch (err: any) {
    errors.push(`session list: ${(err?.stderr || err?.message || "").toString().trim()}`);
  }

  let usage: Usage | undefined;
  try {
    // Today only: all-time totals are rounded to 1 significant decimal and look frozen.
    usage = parseUsage(await output(bin, ["stats", "--days", "1"], env, cwd, 30000));
  } catch (err: any) {
    errors.push(`stats: ${(err?.stderr || err?.message || "").toString().trim()}`);
  }

  return errors.length ? { sessions, usage, errors } : { sessions, usage };
}

/**
 * Runs the binary once so the OS has it in cache (Windows Defender/SuperFetch scan a 50MB+
 * executable on first run). Makes the first real launch noticeably quicker.
 */
export async function prewarmBinary(
  bin: string,
  env: NodeJS.ProcessEnv,
  cwd?: string,
  timeout = 8000,
): Promise<string | undefined> {
  try {
    await output(bin, ["--version"], env, cwd, timeout);
    return undefined;
  } catch (err: any) {
    const detail = (err?.stderr || err?.message || "").toString().trim();
    // A missing CPU feature set shows up as a signal, not an error message:
    // SIGILL on Unix, exit 3221225485 (0xC000001D) on Windows. A timeout kill
    // (our own SIGTERM after `timeout` ms) is marked explicitly: Node's error
    // message does not say "timed out".
    const why =
      err?.killed && err?.signal === "SIGTERM"
        ? " [timeout]"
        : err?.signal
          ? ` [${err.signal}]`
          : typeof err?.code === "number"
            ? ` [exit ${err.code}]`
            : "";
    return `${detail || String(err?.code ?? err)}${why}`;
  }
}

export const NO_AGENT_INFO = EMPTY;
