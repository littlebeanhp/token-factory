import type { STRINGS } from "./i18n";

type Props = {
  cspSource: string;
  lang: string;
  langs: { code: string; name: string }[];
  t: (typeof STRINGS)["en"];
  connected: boolean;
  models: string[];
  model: string;
  platforms: { id: string; name: string }[];
  platform: string;
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function nonce() {
  let s = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function renderPanel(p: Props): string {
  const n = nonce();
  const { t } = p;
  const options = (items: string[], selected: string, label = (x: string) => x) =>
    items.map((v) => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(label(v))}</option>`).join("");
  const langName = (code: string) => p.langs.find((l) => l.code === code)?.name ?? code;

  const onboarding = `
    <h2>${esc(t.title)}</h2>
    <label for="platform">${esc(t.platform)}</label>
    <select id="platform">${p.platforms.map((x) => `<option value="${esc(x.id)}"${x.id === p.platform ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
    <label for="key">${esc(t.keyLabel)}</label>
    <input id="key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-…" />
    <p id="err" class="err" role="alert"></p>
    <button id="connect" class="primary">${esc(t.connect)}</button>
    <p class="muted">${esc(t.noKey)} <a href="#" id="getkey">${esc(t.getKey)}</a></p>
    <ul class="ticks">
      <li>${esc(t.tick1)}</li>
      <li>${esc(t.tick2)}</li>
      <li>${esc(t.tick3)}</li>
    </ul>`;

  const ready = `
    <p class="badge">✓ ${esc(t.connected)}</p>
    <label for="model">${esc(t.model)}</label>
    <select id="model">${options(p.models, p.model)}</select>
    <button id="open" class="primary">${esc(t.openAgent)}</button>
    <button id="change" class="link">${esc(t.changeKey)}</button>`;

  return `<!DOCTYPE html>
<html lang="${esc(p.lang)}">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${p.cspSource} 'unsafe-inline'; script-src 'nonce-${n}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 4px 12px 16px; }
  h2 { font-size: 14px; font-weight: 600; margin: 8px 0 14px; }
  label { display: block; font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
  input, select { width: 100%; box-sizing: border-box; padding: 5px 7px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; font: inherit; }
  input:focus, select:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  select { margin-bottom: 12px; }
  button { width: 100%; padding: 6px; border: none; border-radius: 2px; font: inherit; cursor: pointer; }
  .primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  .primary:hover { background: var(--vscode-button-hoverBackground); }
  .primary:disabled { opacity: .6; cursor: default; }
  .link { background: none; color: var(--vscode-textLink-foreground); margin-top: 8px; }
  .link:hover { text-decoration: underline; }
  a { color: var(--vscode-textLink-foreground); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .err { color: var(--vscode-errorForeground); font-size: 12px; min-height: 16px; margin: 4px 0 6px; }
  .muted { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 12px 0 0; }
  .ticks { list-style: none; padding: 12px 0 0; margin: 16px 0 0; border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); font-size: 12px; line-height: 1.6; }
  .ticks li { position: relative; padding-left: 20px; margin-bottom: 6px; }
  .ticks li::before { content: "✓"; position: absolute; left: 2px; color: var(--vscode-testing-iconPassed, #3fb950); }
  .badge { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 10px; margin: 8px 0 14px; color: var(--vscode-testing-iconPassed, #3fb950); border: 1px solid currentColor; }
  .top { display: flex; justify-content: flex-end; }
  .top select { width: auto; margin: 0; padding: 2px 4px; font-size: 12px; }
</style>
</head>
<body>
  <div class="top">
    <select id="lang" aria-label="${esc(t.language)}">${options(p.langs.map((l) => l.code), p.lang, langName)}</select>
  </div>
  ${p.connected ? ready : onboarding}
<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  $("lang").onchange = (e) => vscode.postMessage({ type: "lang", lang: e.target.value });
  if ($("connect")) {
    const go = () => {
      const key = $("key").value.trim();
      if (!key) { $("err").textContent = ${JSON.stringify(t.errEmpty)}; return; }
      $("connect").disabled = true;
      $("connect").textContent = ${JSON.stringify(t.checking)};
      vscode.postMessage({ type: "connect", key, platform: $("platform").value });
    };
    $("connect").onclick = go;
    $("key").onkeydown = (e) => { if (e.key === "Enter") go(); };
    $("key").oninput = () => { $("err").textContent = ""; };
    $("getkey").onclick = (e) => { e.preventDefault(); vscode.postMessage({ type: "link", platform: $("platform").value }); };
    $("platform").onchange = (e) => { $("err").textContent = ""; vscode.postMessage({ type: "platform", platform: e.target.value }); };
    window.addEventListener("message", (e) => {
      if (e.data?.type === "error") {
        $("err").textContent = e.data.text;
        $("connect").disabled = false;
        $("connect").textContent = ${JSON.stringify(t.connect)};
      }
    });
    $("key").focus();
  } else {
    $("model").onchange = (e) => vscode.postMessage({ type: "model", model: e.target.value });
    $("open").onclick = () => vscode.postMessage({ type: "open" });
    $("change").onclick = () => vscode.postMessage({ type: "changeKey" });
  }
</script>
</body>
</html>`;
}
