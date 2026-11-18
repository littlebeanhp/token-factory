import { randomBytes } from "node:crypto";
import type { STRINGS } from "./i18n";
import { LOGO_URI } from "./logo";
import { proxyHost } from "./proxy";

type Props = {
  cspSource: string;
  lang: string;
  langs: { code: string; name: string }[];
  t: (typeof STRINGS)["en"];
  connected: boolean;
  envKey: boolean;
  agentRunning: boolean;
  models: string[];
  model: string;
  platforms: { id: string; name: string }[];
  platform: string;
  platformName: string;
  agentVersion: string;
  proxy: string;
  brandName: string;
  shortcut: string;
  sessions: { id: string; title: string; updated: string }[];
  usage?: { cost: string; input: string; output: string };
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function nonce() {
  return randomBytes(24).toString("base64url");
}

const LOCALES: Record<string, string> = {
  en: "en-GB",
  vi: "vi-VN",
  id: "id-ID",
  ms: "ms-MY",
  ja: "ja-JP",
  ko: "ko-KR",
  "zh-cn": "zh-CN",
  es: "es-ES",
  "pt-br": "pt-BR",
  ru: "ru-RU",
};

export function renderPanel(p: Props): string {
  const n = nonce();
  const { t } = p;
  const locale = LOCALES[p.lang] ?? "en-GB";
  const options = (items: string[], selected: string, label = (x: string) => x) =>
    items.map((v) => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(label(v))}</option>`).join("");
  const langName = (code: string) => p.langs.find((l) => l.code === code)?.name ?? code;

  // opencode already prints compact values ("2.4K"); keep those, compact only plain numbers.
  const compact = (value: string) => {
    const raw = String(value).trim();
    if (!raw) return raw;
    if (/[a-zA-Z]/.test(raw)) return raw;
    const num = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(num)) return raw;
    if (num >= 1_000_000) return `${+(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${+(num / 1_000).toFixed(1)}K`;
    return String(num);
  };

  /** `New session - 2026-11-04T19:32:02.184Z` reads like a log line; make it a label. */
  const humanTitle = (raw: string) => {
    const iso = /(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/.exec(raw);
    if (!iso) return raw;
    const date = new Date(iso[1]);
    if (Number.isNaN(date.getTime())) return raw;
    const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
    const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
    const prefix = raw.slice(0, iso.index).replace(/[\s\-–]+$/, "");
    return `${prefix || t.sessions} · ${day}, ${time}`;
  };

  const header = `
    <header class="brand">
      <img class="logo" src="${LOGO_URI}" alt="" />
      <span class="brand-text">
        <span class="brand-name">${esc(p.brandName)}</span>
        <span class="brand-sub">Token Factory</span>
      </span>
      <select id="lang" aria-label="${esc(t.language)}">${options(p.langs.map((l) => l.code), p.lang, langName)}</select>
    </header>`;

  const onboarding = `
    <h2>${esc(t.title)}</h2>
    <div class="field">
      <label for="platform">${esc(t.platform)}</label>
      <select id="platform">${p.platforms.map((x) => `<option value="${esc(x.id)}"${x.id === p.platform ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
    </div>
    <div class="field">
      <label for="key">${esc(t.keyLabel)}</label>
      <input id="key" type="password" autocomplete="off" spellcheck="false" placeholder="${esc(t.keyPlaceholder)}" />
    </div>
    <div class="check-row">
      <label class="check"><input id="useProxy" type="checkbox"${p.proxy ? " checked" : ""} /> ${esc(t.useProxy)}</label>
      <span class="tip" tabindex="0" role="note" aria-label="${esc(t.proxyHelpMore)}" title="${esc(t.proxyHelpMore)}">ⓘ</span>
    </div>
    <p class="help">${esc(t.proxyHelp)}</p>
    <div class="field" id="proxyBox"${p.proxy ? "" : " hidden"}>
      <label for="proxy">${esc(t.proxyLabel)}</label>
      <input id="proxy" type="text" autocomplete="off" spellcheck="false" placeholder="10.0.0.1:8080" value="${esc(p.proxy ? proxyHost(p.proxy) : "")}" />
    </div>
    <p id="err" class="err" role="alert"></p>
    <button id="connect" class="primary">${esc(t.connect)}</button>
    <p class="muted">${esc(t.noKey)} <a href="#" id="getkey">${esc(t.getKey)}</a></p>
    <footer class="foot">
      <span>opencode ${esc(p.agentVersion)} · ${esc(t.bundled)}</span>
      ${p.envKey ? `<span>${esc(t.envKeyNote)}</span>` : ""}
    </footer>`;

  const sessionRows = p.sessions.length
    ? `<div class="sessions">${p.sessions
        .map(
          (s) =>
            `<button class="sess" data-id="${esc(s.id)}" title="${esc(s.title)}"><span class="sess-ic" aria-hidden="true">↳</span><span class="sess-title">${esc(humanTitle(s.title))}</span><span class="sess-when">${esc(s.updated)}</span></button>`,
        )
        .join("")}</div>`
    : `<p class="empty">${esc(t.noSessions)}</p>`;

  const ready = `
    <section class="card">
      <div class="status-row">
        <span class="status"><span class="dot" aria-hidden="true"></span>${esc(t.connected)}</span>
        <span class="endpoint" title="${esc(t.platform)}">${esc(p.platformName)}</span>
      </div>
      ${
        p.proxy || p.envKey
          ? `<div class="card-notes">${p.proxy ? `<span>${esc(t.viaProxy)}: ${esc(proxyHost(p.proxy))}</span>` : ""}${p.envKey ? `<span>${esc(t.envKeyNote)}</span>` : ""}</div>`
          : ""
      }
    </section>

    <div class="row">
      <label for="model">${esc(t.model)}</label>
      <button id="refresh" class="icon-btn" title="${esc(t.refreshModels)}" aria-label="${esc(t.refreshModels)}">↻</button>
    </div>
    <select id="model">${options(p.models, p.model)}</select>
    <p id="err" class="err" role="alert"></p>

    <button id="open" class="primary" title="${esc(t.emptyHint)}"><span id="openLabel">${esc(p.agentRunning ? t.showAgent : t.openAgent)}</span><span class="hint" aria-hidden="true">${esc(p.shortcut)}</span></button>
    <div id="dl" class="dl" hidden>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <span id="dlbar"></span>
      </div>
      <p id="dltext" class="dl-text" aria-live="polite"></p>
    </div>
    <div class="actions">
      ${p.agentRunning ? `<button id="restart" class="secondary">${esc(t.restart)}</button>` : ""}
      <button id="change" class="secondary">${esc(t.changeKey)}</button>
    </div>

    <div class="section">${esc(t.sessions)}</div>
    ${sessionRows}

    ${
      p.usage
        ? `<div class="usage"><span class="k">${esc(t.usage)}</span><span class="stat" title="input / output tokens">↑ ${esc(compact(p.usage.input))}</span><span class="stat" title="input / output tokens">↓ ${esc(compact(p.usage.output))}</span></div>`
        : ""
    }
    <footer class="foot${p.usage ? "" : " sep"}"><span>opencode ${esc(p.agentVersion)}</span></footer>`;

  return `<!DOCTYPE html>
<html lang="${esc(p.lang)}">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${p.cspSource} 'unsafe-inline'; script-src 'nonce-${n}'; base-uri 'none'; form-action 'none';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  /* Type scale: 13 title · 12 value · 11 label/meta · 9.5 eyebrow. Spacing on a 4px grid. */
  body { font-family: var(--vscode-font-family); font-size: 13px; line-height: 1.45; color: var(--vscode-foreground); padding: 10px 12px 16px; }
  body.vscode-dark, body.vscode-high-contrast { color-scheme: dark; }
  body.vscode-light, body.vscode-high-contrast-light { color-scheme: light; }
  [hidden] { display: none !important; }

  /* ---------- brand ---------- */
  .brand { display: flex; align-items: center; gap: 8px; padding-bottom: 10px; margin-bottom: 14px; border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); }
  .logo { width: 22px; height: 22px; object-fit: contain; flex: none; }
  body.vscode-dark .logo, body.vscode-high-contrast .logo { filter: brightness(1.55); }
  .brand-text { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
  .brand-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .brand-sub { font-size: 9.5px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
  #lang { width: auto; max-width: 46%; padding: 1px 4px; font-size: 11px; }

  /* ---------- form ---------- */
  h2 { font-size: 13px; font-weight: 600; margin: 0 0 12px; }
  .field { margin-bottom: 12px; }
  label { display: block; font-size: 10.5px; font-weight: 500; text-transform: uppercase; letter-spacing: .07em; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
  input, select { width: 100%; box-sizing: border-box; padding: 5px 7px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; font: inherit; }
  input:focus, select:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }

  /* ---------- buttons ---------- */
  button { width: 100%; padding: 6px; border: none; border-radius: 2px; font: inherit; font-size: 12px; cursor: pointer; }
  .primary { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  .primary:hover { background: var(--vscode-button-hoverBackground); }
  .primary:disabled { opacity: .6; cursor: default; }
  .hint { font-size: 9.5px; font-weight: 400; line-height: 1.6; padding: 0 4px; border: 1px solid currentColor; border-radius: 3px; opacity: .5; }
  .actions { display: flex; gap: 8px; margin-top: 8px; }
  .dl { margin-top: 10px; }
  .bar { height: 4px; border-radius: 2px; overflow: hidden; background: color-mix(in srgb, var(--vscode-progressBar-background, #0e70c0) 25%, transparent); }
  .bar span { display: block; height: 100%; width: 0; background: var(--vscode-progressBar-background, #0e70c0); transition: width .2s ease; }
  .dl-text { margin: 6px 0 0; font-size: 10.5px; color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
  .secondary { color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); background: var(--vscode-button-secondaryBackground, transparent); border: 1px solid var(--vscode-button-border, var(--vscode-widget-border, transparent)); }
  .secondary:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground, rgba(127,127,127,.12))); }
  button:focus-visible, a:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  a { color: var(--vscode-textLink-foreground); text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* ---------- connection card ---------- */
  .card { padding: 10px 12px; margin-bottom: 16px; border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); border-radius: 4px; background: var(--vscode-editorWidget-background, transparent); }
  .status-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--vscode-testing-iconPassed, #3fb950); }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: none; }
  .endpoint { font-size: 11px; color: var(--vscode-descriptionForeground); overflow-wrap: anywhere; }
  .card-notes { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); font-size: 10.5px; color: var(--vscode-descriptionForeground); }

  /* ---------- model ---------- */
  .row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .row label { margin: 0; }
  .row + select { margin-bottom: 10px; }
  .icon-btn { width: auto; padding: 0 4px; background: none; border-radius: 3px; color: var(--vscode-descriptionForeground); font-size: 13px; line-height: 1; }
  .icon-btn:hover:not(:disabled) { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground, rgba(127,127,127,.12)); }
  .icon-btn:disabled { opacity: .5; cursor: default; }
  @keyframes tf-spin { to { transform: rotate(360deg); } }
  .icon-btn.busy { animation: tf-spin 1s linear infinite; color: var(--vscode-foreground); }

  /* ---------- sessions ---------- */
  .section { margin: 20px 0 6px; font-size: 10.5px; font-weight: 500; text-transform: uppercase; letter-spacing: .07em; color: var(--vscode-descriptionForeground); }
  .sessions { display: grid; gap: 1px; margin: 0 -6px; }
  .sess { display: flex; align-items: baseline; gap: 6px; padding: 5px 6px; margin: 0; background: none; color: var(--vscode-foreground); font-size: 12px; text-align: left; border-radius: 3px; }
  .sess:hover { background: var(--vscode-list-hoverBackground, rgba(127,127,127,.12)); }
  .sess:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .sess-ic { flex: none; color: var(--vscode-descriptionForeground); font-size: 11px; }
  .sess-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sess-when { flex: none; font-size: 10.5px; color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
  .empty { margin: 0; font-size: 11px; color: var(--vscode-descriptionForeground); }

  /* ---------- usage, footer ---------- */
  .usage { display: flex; align-items: baseline; gap: 10px; margin-top: 16px; padding-top: 10px; border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); font-size: 11px; }
  .usage .k { text-transform: uppercase; letter-spacing: .07em; font-size: 10.5px; color: var(--vscode-descriptionForeground); }
  .usage .stat { color: var(--vscode-foreground); font-variant-numeric: tabular-nums; }
  .foot { display: flex; flex-direction: column; gap: 2px; margin-top: 12px; font-size: 10px; color: var(--vscode-descriptionForeground); }
  .foot.sep { margin-top: 16px; padding-top: 10px; border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); }
  .muted { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 12px 0 0; }
  .meta { color: var(--vscode-descriptionForeground); font-size: 10.5px; margin: 8px 0 0; }
  .err { color: var(--vscode-errorForeground); font-size: 11px; margin: 6px 0; }
  .err:empty { display: none; }
  .check-row { display: flex; align-items: center; gap: 6px; margin: 10px 0 0; }
  .check-row .check { margin: 0; }
  .tip { font-size: 11px; color: var(--vscode-descriptionForeground); cursor: help; }
  .tip:focus-visible { outline: 1px solid var(--vscode-focusBorder); border-radius: 3px; }
  .help { margin: 4px 0 10px; font-size: 10.5px; color: var(--vscode-descriptionForeground); }
  .check { display: flex; align-items: center; gap: 6px; margin: 10px 0; font-size: 12px; text-transform: none; letter-spacing: 0; color: var(--vscode-foreground); cursor: pointer; }
  .check input { width: auto; margin: 0; accent-color: var(--vscode-focusBorder); }

  @media (max-width: 340px) {
    .status-row { flex-direction: column; gap: 2px; }
  }
</style>
</head>
<body>
${header}
${p.connected ? ready : onboarding}
<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  let watchdog;
  $("lang").onchange = (e) => vscode.postMessage({ type: "lang", lang: e.target.value });
  if ($("connect")) {
    const go = () => {
      const key = $("key").value.trim();
      if (!key) { $("err").textContent = ${JSON.stringify(t.errEmpty)}; return; }
      $("connect").disabled = true;
      $("connect").textContent = ${JSON.stringify(t.checking)};
      // Never leave the button dead: if the check stalls, report it and re-enable.
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        if (!$("connect") || !$("connect").disabled) return;
        $("connect").disabled = false;
        $("connect").textContent = ${JSON.stringify(t.connect)};
        $("err").textContent = $("useProxy").checked
          ? ${JSON.stringify(t.errProxyNet)}
          : ${JSON.stringify(t.errNetwork)};
      }, 20000);
      const useProxy = $("useProxy").checked, proxy = $("proxy").value.trim();
      if (useProxy && !proxy) { $("err").textContent = ${JSON.stringify(t.errProxy)}; $("proxy").focus(); return; }
      vscode.postMessage({ type: "connect", key, platform: $("platform").value, proxy: useProxy ? proxy : "" });
    };
    $("connect").onclick = go;
    $("key").onkeydown = (e) => { if (e.key === "Enter") go(); };
    $("key").oninput = () => { $("err").textContent = ""; };
    $("useProxy").onchange = (e) => { $("proxyBox").hidden = !e.target.checked; $("err").textContent = ""; if (e.target.checked) $("proxy").focus(); };
    $("proxy").onkeydown = (e) => { if (e.key === "Enter") go(); };
    $("proxy").oninput = () => { $("err").textContent = ""; };
    $("getkey").onclick = (e) => { e.preventDefault(); vscode.postMessage({ type: "link", platform: $("platform").value }); };
    $("platform").onchange = (e) => { $("err").textContent = ""; vscode.postMessage({ type: "platform", platform: e.target.value }); };
    $("key").focus();
  } else {
    const start = () => {
      if ($("open").disabled) return;
      $("open").disabled = true;
      $("openLabel").textContent = ${JSON.stringify(t.starting)};
      vscode.postMessage({ type: "open" });
    };
    $("open").onclick = start;
    $("model").onchange = (e) => vscode.postMessage({ type: "model", model: e.target.value });
    $("change").onclick = () => vscode.postMessage({ type: "changeKey" });
    if ($("restart")) $("restart").onclick = () => vscode.postMessage({ type: "restart" });
    document.querySelectorAll(".sess").forEach((el) => {
      el.onclick = () => vscode.postMessage({ type: "resume", id: el.dataset.id });
    });
    // Re-reads GET /v1/models with the stored key, so a newly granted model shows up
    // without re-entering the key.
    $("refresh").onclick = () => {
      $("refresh").disabled = true;
      $("refresh").classList.add("busy");
      $("model").disabled = true;
      $("err").textContent = "";
      vscode.postMessage({ type: "refreshModels" });
    };
  }
  window.addEventListener("message", (e) => {
    if (e.data?.type === "error") {
      clearTimeout(watchdog);
      $("err").textContent = e.data.text;
      if ($("connect")) { $("connect").disabled = false; $("connect").textContent = ${JSON.stringify(t.connect)}; }
      if ($("refresh")) { $("refresh").disabled = false; $("refresh").classList.remove("busy"); }
      if ($("open") && $("openLabel")) { $("open").disabled = false; $("openLabel").textContent = ${JSON.stringify(t.openAgent)}; }
    }
    if (e.data?.type === "download") {
      const box = $("dl");
      if (box) {
        box.hidden = false;
        const pct = Math.max(0, Math.min(100, Number(e.data.pct) || 0));
        $("dlbar").style.width = pct + "%";
        const bar = box.querySelector(".bar");
        if (bar) bar.setAttribute("aria-valuenow", String(pct));
        const mb = (n) => (Number(n) / (1024 * 1024)).toFixed(1);
        $("dltext").textContent = e.data.total
          ? pct + "% · " + mb(e.data.seen) + "/" + mb(e.data.total) + " MB"
          : pct + "%";
        if ($("open") && $("openLabel")) {
          $("open").disabled = true;
          $("openLabel").textContent = ${JSON.stringify(t.starting)};
        }
      }
    }
    if (e.data?.type === "downloaded") {
      if ($("dl")) $("dl").hidden = true;
      if ($("dlbar")) $("dlbar").style.width = "0%";
    }
    if (e.data?.type === "refreshed") {
      if ($("refresh")) { $("refresh").disabled = false; $("refresh").classList.remove("busy"); }
      if ($("model")) $("model").disabled = false;
    }
  });
</script>
</body>
</html>`;
}
