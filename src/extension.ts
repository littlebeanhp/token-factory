import * as vscode from "vscode";
import { checkKey } from "./api";
import {
  API_KEY_ENV,
  buildOpencodeConfig,
  DEFAULT_MODEL,
  FALLBACK_MODELS,
  PLATFORM_IDS,
  PLATFORMS,
  PlatformId,
  resolvePlatform,
} from "./defaults";
import { LANG_NAMES, LANGS, Lang, resolveLang, STRINGS } from "./i18n";
import { ensureOpencode } from "./opencode";
import { renderPanel } from "./panel";
import { normalizeProxy, proxyEnv } from "./proxy";

const SECRET_KEY = "tokenFactory.apiKey";
const MODELS_KEY = "tokenFactory.models";
const PLATFORM_KEY = "tokenFactory.platform";
const PROXY_KEY = "tokenFactory.proxy";

export function activate(context: vscode.ExtensionContext) {
  const panel = new Panel(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("tokenFactory.panel", panel, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("tokenFactory.openAgent", () => panel.openAgent()),
    vscode.commands.registerCommand("tokenFactory.setApiKey", () => panel.promptKey()),
    vscode.commands.registerCommand("tokenFactory.signOut", () => panel.signOut()),
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

  constructor(private readonly ctx: vscode.ExtensionContext) {
    vscode.window.onDidCloseTerminal((t) => {
      if (t === this.terminal) this.terminal = undefined;
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

  private platform(): PlatformId {
    return resolvePlatform(this.ctx.globalState.get<string>(PLATFORM_KEY));
  }

  /** Normalized proxy URL, or "" when "Use a proxy" is off. */
  private proxy(): string {
    return this.ctx.globalState.get<string>(PROXY_KEY, "");
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
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((msg) => this.onMessage(msg));
    this.refresh();
  }

  async refresh() {
    if (!this.view) return;
    this.view.webview.html = renderPanel({
      cspSource: this.view.webview.cspSource,
      lang: this.lang(),
      langs: LANGS.map((code) => ({ code, name: LANG_NAMES[code] })),
      t: this.t(),
      connected: !!(await this.apiKey()),
      models: this.models(),
      model: this.model(),
      platforms: PLATFORM_IDS.map((id) => ({ id, name: PLATFORMS[id].name })),
      platform: this.platform(),
      proxy: this.proxy(),
    });
  }

  private post(msg: unknown) {
    this.view?.webview.postMessage(msg);
  }

  private async onMessage(msg: any) {
    switch (msg?.type) {
      case "connect":
        return this.connect(String(msg.key ?? "").trim(), resolvePlatform(msg.platform), msg.proxy);
      case "platform":
        return this.ctx.globalState.update(PLATFORM_KEY, resolvePlatform(msg.platform));
      case "lang":
        if (msg.lang !== "auto" && !LANGS.includes(msg.lang)) return;
        return this.cfg.update("language", msg.lang, vscode.ConfigurationTarget.Global);
      case "model":
        if (!this.models().includes(msg.model)) return;
        return this.cfg.update("model", msg.model, vscode.ConfigurationTarget.Global);
      case "open":
        return this.openAgent();
      case "changeKey":
        return this.signOut();
      case "link":
        return vscode.env.openExternal(vscode.Uri.parse(PLATFORMS[resolvePlatform(msg.platform)].getKeyUrl));
    }
  }

  /** `proxyInput` is what the panel sent ("" = off); undefined keeps the saved proxy (command palette flow). */
  private async connect(key: string, platform: PlatformId, proxyInput?: unknown) {
    const t = this.t();
    if (!key) return this.post({ type: "error", text: t.errEmpty });
    const proxy = proxyInput === undefined ? this.proxy() : normalizeProxy(proxyInput);
    if (proxy === null) return this.post({ type: "error", text: t.errProxy });
    const result = await checkKey(key, platform, proxy);
    if (!result.ok) {
      const text = result.reason === "invalid" ? t.errInvalid : result.reason === "proxy" ? t.errProxyNet : t.errNetwork;
      return this.post({ type: "error", text });
    }
    await this.ctx.secrets.store(SECRET_KEY, key);
    await this.ctx.globalState.update(PLATFORM_KEY, platform);
    await this.ctx.globalState.update(PROXY_KEY, proxy);
    this.terminal?.dispose(); // a running agent keeps its old proxy env
    // Always replace: a stale list from the other platform must not linger.
    await this.ctx.globalState.update(MODELS_KEY, result.models);
    await this.refresh();
    this.prepare().catch(() => {}); // download in the background so "Open agent" is instant
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
    await this.ctx.secrets.delete(SECRET_KEY);
    this.terminal?.dispose();
    await this.refresh();
  }

  private prepare(): Promise<string> {
    if (!this.preparing) {
      const run = Promise.resolve(
        vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: this.t().downloading },
          (progress) => {
            let last = 0;
            return ensureOpencode(this.ctx.globalStorageUri.fsPath, (pct) => {
              progress.report({ increment: pct - last, message: `${pct}%` });
              last = pct;
            }, this.proxy());
          },
        ),
      );
      run.catch(() => {
        this.preparing = undefined; // allow a retry after a failed download
      });
      this.preparing = run;
    }
    return this.preparing;
  }

  async openAgent() {
    const key = await this.apiKey();
    if (!key) {
      await vscode.commands.executeCommand("tokenFactory.panel.focus");
      return;
    }
    if (this.terminal) {
      this.terminal.show();
      return;
    }
    let bin: string;
    try {
      bin = await this.prepare();
    } catch (err: any) {
      vscode.window.showErrorMessage(`Token Factory: ${err?.message ?? err}`);
      return;
    }
    this.terminal = vscode.window.createTerminal({
      name: "Token Factory",
      shellPath: bin,
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri,
      location: { viewColumn: vscode.ViewColumn.Beside },
      iconPath: new vscode.ThemeIcon("sparkle"),
      env: {
        OPENCODE_CONFIG_CONTENT: buildOpencodeConfig(this.models(), this.model(), this.platform()),
        [API_KEY_ENV]: key,
        OPENCODE_CALLER: "vscode",
        ...proxyEnv(this.proxy()),
      },
    });
    this.terminal.show();
  }
}
