import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  AgentInfo,
  NO_AGENT_INFO,
  isBrokenDb,
  opencodeDataDir,
  opencodeDbPath,
  prewarmBinary,
  readAgentInfo,
} from "./agentinfo";
import { checkKey } from "./api";
import {
  API_KEY_ENV,
  buildOpencodeConfig,
  DEFAULT_MODEL,
  FALLBACK_MODELS,
  PLATFORM_IDS,
  PLATFORMS,
  PlatformId,
  PROVIDER_ID,
  PROVIDER_NAME,
  resolvePlatform,
} from "./defaults";
import { clearedSecretEnv, inheritedEnv } from "./env";
import { LANG_NAMES, LANGS, Lang, resolveLang, STRINGS } from "./i18n";
import {
  baselinePackage,
  ensureOpencode,
  OPENCODE_VERSION,
  opencodePath,
  packageBinPath,
  platformPackage,
  siblingPackage,
} from "./opencode";
import { renderPanel } from "./panel";
import { applyProxyEnv, normalizeProxy, terminalProxyEnv } from "./proxy";

const SECRET_KEY = "tokenFactory.apiKey";
// Stored in SecretStorage because it can carry user:password. Older builds kept it in
// globalState under the same key; loadProxy() migrates that value and deletes it.
const PROXY_KEY = "tokenFactory.proxy";
const MODELS_KEY = "tokenFactory.models";
const PLATFORM_KEY = "tokenFactory.platform";

export function activate(context: vscode.ExtensionContext) {
  const panel = new Panel(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("tokenFactory.panel", panel, {
      // Keep the panel (and anything typed in it) alive while another view is focused.
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("tokenFactory.openAgent", () => panel.openAgent()),
    vscode.commands.registerCommand("tokenFactory.setApiKey", () => panel.promptKey()),
    vscode.commands.registerCommand("tokenFactory.signOut", () => panel.signOut()),
    vscode.commands.registerCommand("tokenFactory.showPaths", () => panel.showPaths()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("tokenFactory")) panel.refresh();
    }),
  );
}

export function deactivate() {}

class Panel implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private terminal?: vscode.Terminal;
  private preparing?: Promise<string>;
  private proxyUrl = "";
  private info?: { at: number; value: AgentInfo };
  private infoBusy = false;
  private infoTimer?: ReturnType<typeof setInterval>;
  private lastHtml = "";
  private lastRenderAt = 0;
  private renderTimer?: ReturnType<typeof setTimeout>;
  private viewVisible = true;
  private warmed = false;
  private launchedAt = 0;
  private dbWarned = false;
  private readonly out = vscode.window.createOutputChannel("Token Factory");
  /** True while the key form is open, even if a key is supplied by the environment. */
  private showKeyForm = false;
  /** Resolves once the proxy has been read from secure storage. */
  private proxyReady: Promise<void>;

  constructor(private readonly ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(this.out);
    this.log(`activated v${(ctx as any).extension?.packageJSON?.version ?? "?"}`); // Output -> "Token Factory"
    this.proxyReady = this.loadProxy().catch(() => {}); // a broken secret store must not block the panel
    vscode.window.onDidCloseTerminal((t) => {
      if (t !== this.terminal) return;
      const code = t.exitStatus?.code;
      const lived = this.launchedAt ? Date.now() - this.launchedAt : 0;
      this.terminal = undefined;
      this.log(`agent terminal closed (exit ${code ?? "?"} after ${lived}ms)`);
      // opencode prints the reason and exits: make sure the user sees it.
      if (lived > 0 && lived < 8000 && code) {
        // The "execvp (3) failed" signature: the binary was gone by exec time
        // (antivirus quarantine). Re-download it in the background so a retry is instant.
        const bin = opencodePath(this.ctx.globalStorageUri.fsPath);
        const problem = this.binaryProblem(bin);
        const retry = this.t().retryAgent;
        if (problem) {
          this.log(`binary unusable after crash (${problem}): re-downloading`);
          fs.rmSync(path.dirname(path.dirname(bin)), { recursive: true, force: true });
          this.preparing = undefined;
          this.warmed = false;
          void this.prepare().catch(() => {});
        }
        void vscode.window
          .showWarningMessage(
            `Token Factory: the agent exited right after starting (code ${code}). See Output -> "Token Factory" for details.`,
            ...(problem ? [retry] : []),
            "Show log",
          )
          .then((pick) => {
            if (pick === retry) void this.openAgent();
            else if (pick === "Show log") this.out.show(true);
          });
      }
      void this.refresh(); // back to "Open agent"
    });
  }

  private get cfg() {
    return vscode.workspace.getConfiguration("tokenFactory");
  }

  private lang(): Lang {
    return resolveLang(this.cfg.get<string>("language", "auto"), vscode.env.language);
  }

  private t() {
    return STRINGS[this.lang()];
  }

  /** Key from secure storage, or from the FPT_API_KEY env var (for IT-managed machines). */
  private async apiKey(): Promise<string | undefined> {
    return (await this.ctx.secrets.get(SECRET_KEY)) || process.env[API_KEY_ENV] || undefined;
  }

  /** True when the key can only come from the environment: the panel cannot delete it. */
  private envKey(): boolean {
    return !!process.env[API_KEY_ENV];
  }

  private platform(): PlatformId {
    return resolvePlatform(this.ctx.globalState.get<string>(PLATFORM_KEY));
  }

  /**
   * Reads the proxy from secure storage (it can carry user:password), migrating a
   * value left in globalState by an older build.
   */
  private async loadProxy(): Promise<void> {
    let saved = await this.ctx.secrets.get(PROXY_KEY);
    const legacy = this.ctx.globalState.get<string>(PROXY_KEY, "");
    if (!saved && legacy) {
      await this.ctx.secrets.store(PROXY_KEY, legacy);
      saved = legacy;
    }
    if (legacy) await this.ctx.globalState.update(PROXY_KEY, undefined);
    this.proxyUrl = saved ?? "";
  }

  /** Normalized proxy URL, or "" when "Use a proxy" is off. */
  private proxy(): string {
    return this.proxyUrl;
  }

  /** The panel only shows host:port, so re-attach stored credentials when the host is unchanged. */
  private keepProxyCredentials(input: string): string {
    if (!input || new URL(input).username) return input;
    const saved = this.proxy();
    if (!saved) return input;
    const prev = new URL(saved);
    return prev.username && prev.host === new URL(input).host ? saved : input;
  }

  private models(): string[] {
    const saved = this.ctx.globalState.get<string[]>(MODELS_KEY, []);
    return saved.length ? saved : FALLBACK_MODELS;
  }

  private model(): string {
    const chosen = this.cfg.get<string>("model", "");
    const list = this.models();
    if (chosen && list.includes(chosen)) return chosen;
    return list.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : list[0];
  }

  resolveWebviewView(view: vscode.WebviewView) {
    // Anything thrown here makes VS Code show "Error loading webview" and no panel at all,
    // so setup is defensive: a failure is surfaced as a message instead.
    try {
      this.setupWebviewView(view);
    } catch (err: any) {
      this.log(`webview setup failed: ${err?.stack ?? err}`);
      this.out.show(true);
      void vscode.window.showErrorMessage(`Token Factory: ${err?.message ?? err}`);
    }
  }

  private setupWebviewView(view: vscode.WebviewView) {
    this.view = view;
    this.lastHtml = "";
    this.lastRenderAt = 0;
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = undefined;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((msg) => this.onMessage(msg));
    // Usage and sessions move while the agent runs, so keep them fresh while visible.
    // VS Code fails to register its webview service worker if html is replaced while the
    // view is still hidden, so rendering waits until the view is actually visible.
    this.viewVisible = view.visible !== false;
    view.onDidChangeVisibility?.(() => {
      this.viewVisible = view.visible !== false;
      if (this.viewVisible) {
        void this.refresh();
        void this.refreshInfo(true);
        this.startInfoTimer();
      } else {
        this.stopInfoTimer();
      }
    });
    view.onDidDispose?.(() => {
      this.stopInfoTimer();
      if (this.renderTimer) clearTimeout(this.renderTimer);
    });
    if (this.viewVisible) this.startInfoTimer();
    void this.refresh();
    // First document load must finish before anything reloads it again.
    setTimeout(() => void this.refreshInfo(true), 800);
    void this.ensureAgent();
    void this.syncModels();
  }

  /**
   * Gets the agent ready before the user asks for it: downloads the binary if it is missing
   * (common for FPT_API_KEY machines, which never go through Connect) and warms it up.
   */
  private async ensureAgent() {
    if (!(await this.apiKey())) return;
    if (!fs.existsSync(opencodePath(this.ctx.globalStorageUri.fsPath))) {
      void this.prepare().catch(() => {});
      return;
    }
    void this.prewarm();
  }

  /**
   * `execvp ... No such file or directory` from VS Code means the binary cannot be executed:
   * deleted by antivirus, truncated extraction, or a noexec mount. Check before spawning.
   */
  private binaryProblem(bin: string): string | undefined {
    try {
      const st = fs.statSync(bin);
      if (!st.isFile()) return "not a file";
      if (st.size < 1024) return "empty or truncated";
      if (process.platform !== "win32") fs.accessSync(bin, fs.constants.X_OK);
      return undefined;
    } catch (err: any) {
      if (!fs.existsSync(bin)) return "missing";
      return err?.code === "EACCES" ? "not executable" : String(err?.message ?? err);
    }
  }

  /** Environment for every opencode process: config, key and the panel's proxy decision. */
  private agentEnv(key?: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...inheritedEnv() };
    env.OPENCODE_CONFIG_CONTENT = buildOpencodeConfig(this.models(), this.model(), this.platform());
    // The extension supplies the whole config: a repository must never be able to add MCP
    // servers (arbitrary command execution) or override the provider baseURL (key theft).
    env.OPENCODE_DISABLE_PROJECT_CONFIG = "1";
    env.OPENCODE_CALLER = "vscode";
    if (key) env[API_KEY_ENV] = key;
    else delete env[API_KEY_ENV];
    return applyProxyEnv(env, this.proxy());
  }

  /** Warms the binary once per session so the first "Open agent" is not a cold start. */
  /** Workspace folder for the agent, only when it still exists on disk. */
  private workspaceCwd(): vscode.Uri | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return undefined;
    try {
      return fs.existsSync(folder.uri.fsPath) ? folder.uri : undefined;
    } catch {
      return undefined;
    }
  }

  private async prewarm() {
    if (this.warmed) return;
    const bin = opencodePath(this.ctx.globalStorageUri.fsPath);
    if (!fs.existsSync(bin)) return;
    this.warmed = true;
    const key = await this.apiKey();
    const failure = await prewarmBinary(bin, this.agentEnv(key), this.workspaceCwd()?.fsPath);
    if (failure) this.log(`binary cannot run: ${failure} (${bin})`);
  }

  /** Everything the extension fails at lands here: Output -> "Token Factory". */
  private log(message: string) {
    this.out.appendLine(`[${new Date().toISOString()}] ${message}`);
  }

  private startInfoTimer() {
    if (this.infoTimer) return;
    this.infoTimer = setInterval(() => void this.refreshInfo(true), 45000);
    this.infoTimer.unref?.();
  }

  private stopInfoTimer() {
    if (this.infoTimer) clearInterval(this.infoTimer);
    this.infoTimer = undefined;
  }

  async refresh() {
    if (!this.view || !this.viewVisible) return;
    // Replace the document at most every 250ms: back-to-back assignments are what breaks
    // VS Code's service-worker registration ("The document is in an invalid state").
    const wait = 250 - (Date.now() - this.lastRenderAt);
    if (wait > 0) {
      if (!this.renderTimer) {
        this.renderTimer = setTimeout(() => {
          this.renderTimer = undefined;
          void this.refresh();
        }, wait);
      }
      return;
    }
    await this.proxyReady;
    const connected = !this.showKeyForm && !!(await this.apiKey());
    const info = connected ? (this.info?.value ?? NO_AGENT_INFO) : NO_AGENT_INFO;
    try {
      const html = renderPanel({
        cspSource: this.view.webview.cspSource,
        lang: this.lang(),
        langs: LANGS.map((code) => ({ code, name: LANG_NAMES[code] })),
        t: this.t(),
        connected,
        envKey: this.envKey(),
        agentRunning: !!this.terminal,
        models: this.models(),
        model: this.model(),
        platforms: PLATFORM_IDS.map((id) => ({ id, name: PLATFORMS[id].name })),
        platform: this.platform(),
        platformName: PLATFORMS[this.platform()].name,
        agentVersion: OPENCODE_VERSION,
        brandName: PROVIDER_NAME,
        sessions: info.sessions,
        usage: info.usage,
        shortcut: process.platform === "darwin" ? "\u2318Esc" : "Ctrl+Esc",
        proxy: this.proxy(),
      });
      if (html === this.lastHtml) return; // same document: do not reload it
      this.lastHtml = html;
      this.lastRenderAt = Date.now();
      this.view.webview.html = html;
    } catch (err: any) {
      this.log(`panel render failed: ${err?.stack ?? err}`);
      // Never leave the panel frozen: show the failure instead of the previous screen.
      this.view.webview.html = `<!DOCTYPE html><html><body style="font-family:var(--vscode-font-family);padding:12px">${err?.message ?? err}</body></html>`;
    }
  }

  /**
   * A key supplied by IT through FPT_API_KEY never went through connect(), so the live
   * model list was never read. Fetch it once so the panel isn't stuck on the fallback.
   */
  private async syncModels() {
    if (this.ctx.globalState.get<string[]>(MODELS_KEY, []).length) return;
    const key = await this.apiKey();
    if (!key) return;
    const result = await checkKey(key, this.platform(), this.proxy());
    if (!result.ok || !result.models.length) return;
    await this.ctx.globalState.update(MODELS_KEY, result.models);
    await this.refresh();
  }

  /** Re-reads usage/sessions and re-renders only when something actually changed. */
  private async refreshInfo(force = false) {
    if (this.infoBusy || !this.view) return;
    // Never re-render the key form underneath the user's fingers.
    if (this.showKeyForm || !(await this.apiKey())) return;
    const age = this.info ? Date.now() - this.info.at : Number.POSITIVE_INFINITY;
    if (!force && age < 20000) return;
    this.infoBusy = true;
    try {
      const value = await this.loadAgentInfo();
      const changed = JSON.stringify(value) !== JSON.stringify(this.info?.value);
      this.info = { at: Date.now(), value };
      if (changed) await this.refresh();
    } finally {
      this.infoBusy = false;
    }
  }

  /**
   * Recent sessions and token/cost totals, read with the bundled CLI.
   */
  private async loadAgentInfo(): Promise<AgentInfo> {
    const bin = opencodePath(this.ctx.globalStorageUri.fsPath);
    if (!fs.existsSync(bin)) return NO_AGENT_INFO;
    // The TUI initialises its database on first run; running our CLI commands before that
    // (or while it starts) can leave a half-migrated file ("Database is not empty and has no
    // session table"). So: never touch it before it exists, and not right after a launch.
    if (Date.now() - this.launchedAt < 10000) return this.info?.value ?? NO_AGENT_INFO;
    if (!this.launchedAt && !fs.existsSync(opencodeDbPath())) return this.info?.value ?? NO_AGENT_INFO;
    const key = await this.apiKey();
    const value = await readAgentInfo(
      bin,
      this.agentEnv(key),
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    ).catch((err: any) => {
      this.log(`session/usage read failed: ${err?.message ?? err}`);
      return NO_AGENT_INFO;
    });
    if (value.errors?.length) this.log(`session/usage: ${value.errors.join(" | ")}`);
    if (isBrokenDb(value.errors ?? [])) {
      // Ask the CLI rather than guessing: Windows puts the data one level deeper.
      const dir = await opencodeDataDir(bin, this.agentEnv());
      const folder = dir ?? path.dirname(opencodeDbPath());
      this.log(`opencode database not migrated (${(value.errors ?? []).join(" | ")}); data folder: ${folder}`);
      if (!this.dbWarned) {
        this.dbWarned = true;
        void this.offerDbRepair(folder);
      }
    }
    return value;
  }

  /**
   * opencode refuses a database that exists without the expected tables. There is nothing to
   * recover from it, so offer a one-click reset: rename the files (not delete) and retry.
   */
  /** The folder comes from CLI stdout: only opencode's own data folder may be touched. */
  private dbFolderAllowed(folder: string): boolean {
    try {
      const resolved = fs.realpathSync(folder);
      const expected = fs.realpathSync(path.dirname(opencodeDbPath()));
      return resolved === expected || resolved.startsWith(expected + path.sep);
    } catch {
      return false;
    }
  }

  private async offerDbRepair(folder: string) {
    if (!this.dbFolderAllowed(folder)) {
      this.log(`refusing to reset a database outside opencode's data folder: ${folder}`);
      void vscode.window.showErrorMessage(
        `Token Factory: refusing to reset files in an unexpected folder: ${folder}`,
      );
      return;
    }
    const fix = "Fix now";
    const choice = await vscode.window.showWarningMessage(
      `Token Factory: opencode's local database is in a bad state (no session table). Reset it in "${folder}"? Your local session history is kept as a .broken file.`,
      fix,
    );
    if (choice !== fix) return;
    this.terminal?.dispose();
    this.terminal = undefined;
    const moved: string[] = [];
    try {
      for (const name of fs.readdirSync(folder)) {
        if (!/\.db(-wal|-shm)?$/.test(name)) continue;
        const from = path.join(folder, name);
        fs.renameSync(from, `${from}.broken-${Date.now()}`);
        moved.push(name);
      }
    } catch (err: any) {
      this.log(`database reset failed: ${err?.message ?? err}`);
      void vscode.window.showErrorMessage(`Token Factory: could not reset the database - ${err?.message ?? err}`);
      return;
    }
    this.info = undefined;
    this.dbWarned = false;
    this.log(`database reset: moved ${moved.join(", ") || "(nothing)"} out of ${folder}`);
    void vscode.window.showInformationMessage(
      moved.length
        ? `Token Factory: reset ${moved.length} database file(s). Open the agent again.`
        : `Token Factory: no database files found in ${folder}. The agent will create a new one.`,
    );
  }

  /** Diagnostics: prints where the binary, the database and opencode's own paths live. */
  async showPaths() {
    this.out.show(true);
    const storage = this.ctx.globalStorageUri.fsPath;
    const bin = opencodePath(storage);
    this.log(`extension storage: ${storage}`);
    this.log(`database (expected): ${opencodeDbPath()}`);
    this.log(`binary: ${bin} (exists: ${fs.existsSync(bin)})`);
    if (!fs.existsSync(bin)) {
      this.log("binary is not downloaded yet - open the agent once");
      return;
    }
    const key = await this.apiKey();
    const dir = await opencodeDataDir(bin, this.agentEnv(key), vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
    if (!dir) {
      this.log("could not read `opencode debug paths`");
      return;
    }
    this.log(`opencode data: ${dir}`);
    try {
      this.log(`files: ${fs.readdirSync(dir).join(", ") || "(empty)"}`);
    } catch (err: any) {
      this.log(`cannot list ${dir}: ${err?.message ?? err}`);
    }
  }

  private post(msg: unknown) {
    this.view?.webview.postMessage(msg);
  }

  /**
   * A running opencode process keeps the model and proxy it was started with (they are
   * env/argv), so a change only takes effect in a new terminal.
   */
  private async restartAgent() {
    if (!this.terminal) return;
    this.terminal.dispose();
    this.terminal = undefined;
    await this.openAgent();
  }

  private async onMessage(msg: any) {
    switch (msg?.type) {
      case "connect":
        // A rejected check must still answer the panel, or the Connect button stays disabled.
        return this.connect(String(msg.key ?? "").trim(), resolvePlatform(msg.platform), msg.proxy).catch(() =>
          this.post({ type: "error", text: this.t().errNetwork }),
        );
      case "platform": {
        await this.ctx.globalState.update(PLATFORM_KEY, resolvePlatform(msg.platform));
        return this.restartAgent();
      }
      case "lang":
        if (msg.lang !== "auto" && !LANGS.includes(msg.lang)) return;
        return this.cfg.update("language", msg.lang, vscode.ConfigurationTarget.Global);
      case "model": {
        if (!this.models().includes(msg.model)) return;
        await this.cfg.update("model", msg.model, vscode.ConfigurationTarget.Global);
        return this.restartAgent();
      }
      case "open":
        return this.openAgent();
      case "resume":
        return this.resumeSession(msg.id);
      case "restart":
        return this.restartAgent();
      case "refreshModels":
        return this.refreshModels();
      case "changeKey":
        return this.signOut();
      case "link":
        return vscode.env.openExternal(vscode.Uri.parse(PLATFORMS[resolvePlatform(msg.platform)].getKeyUrl));
    }
  }

  /** `proxyInput` is what the panel sent ("" = off); undefined keeps the saved proxy (command palette flow). */
  private async connect(key: string, platform: PlatformId, proxyInput?: unknown) {
    await this.proxyReady;
    const t = this.t();
    if (!key) return this.post({ type: "error", text: t.errEmpty });
    const parsed = proxyInput === undefined ? this.proxy() : normalizeProxy(proxyInput);
    if (parsed === null) return this.post({ type: "error", text: t.errProxy });
    const proxy = this.keepProxyCredentials(parsed);
    const result = await checkKey(key, platform, proxy);
    if (!result.ok) {
      const text = result.reason === "invalid" ? t.errInvalid : result.reason === "proxy" ? t.errProxyNet : t.errNetwork;
      return this.post({ type: "error", text });
    }
    await this.ctx.secrets.store(SECRET_KEY, key);
    await this.ctx.secrets.store(PROXY_KEY, proxy);
    this.showKeyForm = false;
    this.proxyUrl = proxy;
    await this.ctx.globalState.update(PLATFORM_KEY, platform);
    this.terminal?.dispose(); // a running agent keeps its old proxy env
    // Always replace: a stale list from the other platform must not linger.
    await this.ctx.globalState.update(MODELS_KEY, result.models);
    this.info = undefined;
    await this.refresh();
    void this.refreshInfo(true);
    // The key works but the model list didn't — say so instead of quietly shrinking the catalog.
    if (result.warning) void vscode.window.showWarningMessage(`Token Factory: ${t.warnModels}`);
    this.prepare().catch(() => {}); // download in the background so "Open agent" is instant
    void this.prewarm();
  }

  /** Re-opens the agent on an existing session, so old work is one click away. */
  private async resumeSession(id: unknown) {
    if (typeof id !== "string" || !/^ses_[A-Za-z0-9]+$/.test(id)) return;
    // A session can disappear (database reset, other project). Launching with a dead id
    // makes opencode exit immediately, so check first.
    const bin = opencodePath(this.ctx.globalStorageUri.fsPath);
    if (fs.existsSync(bin)) {
      const known = await readAgentInfo(bin, this.agentEnv(), this.workspaceCwd()?.fsPath).catch(
        () => NO_AGENT_INFO,
      );
      if (known.sessions.length && !known.sessions.some((s) => s.id === id)) {
        this.info = undefined;
        this.post({ type: "error", text: this.t().sessionGone });
        await this.refreshInfo(true);
        return;
      }
    }
    this.terminal?.dispose();
    this.terminal = undefined;
    await this.openAgent(id);
  }

  /** Re-reads the model list with the stored key, e.g. after a new model was granted to it. */
  private async refreshModels() {
    const t = this.t();
    try {
      const key = await this.apiKey();
      if (!key) return this.post({ type: "error", text: t.errEmpty });
      const result = await checkKey(key, this.platform(), this.proxy());
      if (!result.ok) {
        const text = result.reason === "invalid" ? t.errInvalid : result.reason === "proxy" ? t.errProxyNet : t.errNetwork;
        return this.post({ type: "error", text });
      }
      await this.ctx.globalState.update(MODELS_KEY, result.models);
      await this.refresh();
      if (result.warning) void vscode.window.showWarningMessage(`Token Factory: ${t.warnModels}`);
    } finally {
      this.post({ type: "refreshed" }); // always release the button, error or not
    }
  }

  async promptKey() {
    const picked = await vscode.window.showQuickPick(
      PLATFORM_IDS.map((id) => ({ label: PLATFORMS[id].name, id, picked: id === this.platform() })),
      { title: "Token Factory", placeHolder: this.t().platform, ignoreFocusOut: true },
    );
    if (!picked) return;
    const key = await vscode.window.showInputBox({
      title: "Token Factory",
      prompt: this.t().title,
      password: true,
      ignoreFocusOut: true,
    });
    if (key !== undefined) await this.connect(key.trim(), picked.id);
  }

  async signOut() {
    this.info = undefined;
    this.warmed = false;
    await this.ctx.secrets.delete(SECRET_KEY);
    // Drop the model list and platform too, so a stale catalog from the other platform can't resurface.
    await this.ctx.globalState.update(MODELS_KEY, undefined);
    await this.ctx.globalState.update(PLATFORM_KEY, undefined);
    this.terminal?.dispose();
    // Always reach the key form: with FPT_API_KEY set there is nothing to delete, and
    // re-rendering from apiKey() alone would leave the panel looking unchanged.
    this.showKeyForm = true;
    await this.refresh();
    // A key typed here now overrides the environment one, so say where the old key came from.
    if (this.envKey()) void vscode.window.showInformationMessage(`Token Factory: ${this.t().envKeyNote}`);
  }

  /**
   * Proves the binary is usable, not just present. A stat check passes for a file that
   * antivirus quarantines milliseconds later, and the terminal then dies with
   * "execvp (3) failed: No such file or directory" - only a real exec settles it.
   */
  private async verifyBinary(bin: string, key?: string): Promise<string | undefined> {
    const problem = this.binaryProblem(bin);
    if (problem) return problem;
    if (process.platform === "win32") {
      // A file that arrived from the internet is "blocked" (Mark of the Web); some
      // security policies refuse to run blocked executables.
      try {
        fs.rmSync(`${bin}:Zone.Identifier`, { force: true });
      } catch {
        /* not blocked */
      }
    }
    // Long timeout on purpose: a first-run antivirus scan of the 50MB binary can be slow.
    const execError = await prewarmBinary(bin, this.agentEnv(key), this.workspaceCwd()?.fsPath, 30000);
    if (execError) {
      // A timeout means the process ran for 30s: the kernel exec'd it fine, it is just
      // slow (first-run antivirus scan). The terminal will start once the scan finishes.
      if (/timeout/.test(execError)) {
        this.log(`binary check timed out (slow first run, e.g. antivirus scan): ${bin}`);
        this.warmed = true;
        return undefined;
      }
      this.log(`binary check failed: ${execError} (${bin})`);
      return `cannot execute: ${execError}`;
    }
    this.warmed = true; // it just ran: the separate prewarm is unnecessary
    return undefined;
  }

  /** Downloads (or reuses) an alternative variant and proves it runs. */
  private async tryAltVariant(pkg: string, key?: string): Promise<string | undefined> {
    const alt = packageBinPath(this.ctx.globalStorageUri.fsPath, pkg);
    this.log(`binary unusable - trying variant ${pkg} (${alt})`);
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `${this.t().downloading}`,
          cancellable: false,
        },
        (progress) => {
          let last = 0;
          return ensureOpencode(
            this.ctx.globalStorageUri.fsPath,
            (pct, seen, total) => {
              const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
              progress.report({
                increment: pct - last,
                message: total ? `${pct}% · ${mb(seen)}/${mb(total)} MB` : `${pct}%`,
              });
              last = pct;
              this.post({ type: "download", pct, seen, total });
            },
            this.proxy(),
            pkg,
          );
        },
      );
    } catch (err: any) {
      this.log(`variant ${pkg} download failed: ${err?.message ?? err}`);
      return undefined;
    }
    const problem = await this.verifyBinary(alt, key);
    if (problem) {
      this.log(`variant ${pkg} unusable (${problem}): ${alt}`);
      return undefined;
    }
    this.log(`variant ${pkg} verified: ${alt}`);
    return alt;
  }

  /** SIGILL (Unix) or 0xC000001D (Windows): the CPU lacks the binary's instruction set. */
  private isIllegalInstruction(problem: string): boolean {
    return /SIGILL|exit 3221225485/.test(problem);
  }

  /** Downloads if needed, then proves the binary really runs before the terminal is spawned. */
  private async ensureBinary(): Promise<string> {
    const key = await this.apiKey();
    let bin = await this.prepare();
    let problem = await this.verifyBinary(bin, key);
    if (!problem) return bin;

    // Two different "cannot execute" causes, two different fixes:
    // - missing interpreter (wrong glibc/musl guess) -> the sibling libc variant
    // - illegal instruction (CPU older than the build) -> the baseline variant
    if (problem.startsWith("cannot execute")) {
      const pkg = platformPackage();
      const alt = this.isIllegalInstruction(problem) ? baselinePackage(pkg) : siblingPackage(pkg);
      if (alt) {
        const fixed = await this.tryAltVariant(alt, key);
        if (fixed) return fixed;
      }
    }

    this.log(`binary unusable (${problem}): ${bin} - re-downloading once`);
    fs.rmSync(path.dirname(path.dirname(bin)), { recursive: true, force: true });
    this.preparing = undefined;
    bin = await this.prepare();
    problem = await this.verifyBinary(bin, key);
    if (problem) {
      const hint = this.isIllegalInstruction(problem)
        ? `This CPU may be too old for opencode ${OPENCODE_VERSION}.`
        : `If antivirus quarantined it, add an exclusion for that folder and retry.`;
      throw new Error(`${this.t().downloading} - ${problem}: ${bin}. ${hint}`);
    }
    return bin;
  }

  private prepare(): Promise<string> {
    if (!this.preparing) {
      const run = Promise.resolve(
        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `${this.t().downloading}`,
            cancellable: false,
          },
          (progress) => {
            let last = 0;
            return ensureOpencode(
              this.ctx.globalStorageUri.fsPath,
              (pct, seen, total) => {
                const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
                progress.report({
                  increment: pct - last,
                  message: total ? `${pct}% · ${mb(seen)}/${mb(total)} MB` : `${pct}%`,
                });
                last = pct;
                this.post({ type: "download", pct, seen, total });
              },
              this.proxy(),
            );
          },
        ),
      );
      run.then(
        () => this.post({ type: "downloaded" }),
        () => {
          this.preparing = undefined; // allow a retry after a failed download
          this.post({ type: "downloaded" });
        },
      );
      this.preparing = run;
    }
    return this.preparing;
  }

  async openAgent(sessionId?: string) {
    const key = await this.apiKey();
    if (!key) {
      this.post({ type: "error", text: this.t().errEmpty }); // releases the button
      await vscode.commands.executeCommand("tokenFactory.panel.focus");
      return;
    }
    if (this.terminal && !sessionId) {
      this.terminal.show();
      return;
    }
    await this.proxyReady;
    let bin: string;
    try {
      bin = await this.ensureBinary();
    } catch (err: any) {
      this.log(`agent launch failed: ${err?.stack ?? err}`);
      this.post({ type: "error", text: err?.message ?? String(err) });
      vscode.window.showErrorMessage(`Token Factory: ${err?.message ?? err}`);
      return;
    }
    const media = vscode.Uri.joinPath(this.ctx.extensionUri, "media");
    this.log(`agent env: proxy ${this.proxy() ? "configured" : "none (inherited HTTP(S)_PROXY cleared)"}`);
    this.log(`launch: ${bin} -m ${PROVIDER_ID}/${this.model()}${sessionId ? ` -s ${sessionId}` : ""}`);
    this.terminal = vscode.window.createTerminal({
      name: "Token Factory",
      shellPath: bin,
      // Pinned on the command line too: opencode otherwise resumes the model it used last.
      shellArgs: ["-m", `${PROVIDER_ID}/${this.model()}`, ...(sessionId ? ["-s", sessionId] : [])],
      // A folder that no longer exists makes the spawn fail with ENOENT too.
      cwd: this.workspaceCwd(),
      location: { viewColumn: vscode.ViewColumn.Beside },
      // Same FPT AI Factory mark as the panel and the activity bar, not a generic sparkle.
      iconPath: {
        light: vscode.Uri.joinPath(media, "mark.png"),
        dark: vscode.Uri.joinPath(media, "mark-dark.png"),
      },
      env: {
        // createTerminal merges into the inherited env: undefined removes a variable.
        ...clearedSecretEnv(),
        OPENCODE_CONFIG_CONTENT: buildOpencodeConfig(this.models(), this.model(), this.platform()),
        // A repository's opencode.json must not run MCP servers or repoint the provider.
        OPENCODE_DISABLE_PROJECT_CONFIG: "1",
        [API_KEY_ENV]: key,
        OPENCODE_CALLER: "vscode",
        ...terminalProxyEnv(this.proxy()),
      },
    });
    this.launchedAt = Date.now();
    this.terminal.show();
    void this.refresh(); // "Open agent" -> "Show agent"
  }
}
