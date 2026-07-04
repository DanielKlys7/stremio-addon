import { AddonConfig, ADDON_NAME } from "./config";

function esc(v: string | undefined): string {
  return (v ?? "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function configurePage(config: AddonConfig | null): string {
  const cfg = config ?? { torboxApiKey: "" };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${ADDON_NAME} — configuration</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: #0f1115; color: #e7e9ee; padding: 24px;
  }
  .card {
    width: 100%; max-width: 520px; background: #181b22; border: 1px solid #262a34;
    border-radius: 16px; padding: 28px;
  }
  h1 { margin: 0 0 4px; font-size: 22px; }
  p.sub { margin: 0 0 24px; color: #9aa2b1; }
  label { display: block; margin: 16px 0 6px; font-weight: 600; font-size: 13px; }
  label small { font-weight: 400; color: #9aa2b1; }
  input, select {
    width: 100%; padding: 11px 13px; border-radius: 10px; border: 1px solid #2d323d;
    background: #0f1115; color: #e7e9ee; font: inherit;
  }
  input:focus, select:focus { outline: none; border-color: #6f8cff; }
  .btn {
    display: block; width: 100%; margin-top: 24px; padding: 13px; border: 0; border-radius: 10px;
    background: #6f8cff; color: #fff; font-weight: 700; font-size: 15px; cursor: pointer;
  }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  .btn.secondary { background: #2d323d; color: #e7e9ee; margin-top: 10px; }
  .url {
    margin-top: 18px; padding: 12px; border-radius: 10px; background: #0f1115;
    border: 1px solid #2d323d; font-family: ui-monospace, monospace; font-size: 12px;
    word-break: break-all; color: #9aa2b1;
  }
  a { color: #6f8cff; }
</style>
</head>
<body>
<div class="card">
  <h1>${ADDON_NAME}</h1>
  <p class="sub">Enter your keys to generate a private Stremio install link.</p>

  <label>TorBox API key <small>(required)</small></label>
  <input id="torbox" type="text" spellcheck="false" placeholder="e.g. 3eb9055d-..." value="${esc(cfg.torboxApiKey)}" />

  <label>OpenAI API key <small>(optional — nicer names)</small></label>
  <input id="openai" type="text" spellcheck="false" placeholder="sk-..." value="${esc(cfg.openaiApiKey)}" />

  <label>OpenAI model <small>(optional)</small></label>
  <select id="model">
    <option value="">gpt-5-nano (default, cheaper)</option>
    <option value="gpt-5.4-nano">gpt-5.4-nano (more accurate)</option>
  </select>

  <button class="btn" id="install">Install in Stremio</button>
  <button class="btn secondary" id="copy">Copy install URL</button>
  <div class="url" id="url"></div>

  <p class="sub" style="margin-top:20px; font-size:13px;">
    Your link embeds your API keys — treat it like a password and don't share it publicly.
  </p>
</div>
<script>
  var preset = ${JSON.stringify(cfg.openaiModel ?? "")};
  var modelEl = document.getElementById('model');
  if (preset) modelEl.value = preset;

  function toB64Url(str) {
    var b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  }
  function build() {
    var torbox = document.getElementById('torbox').value.trim();
    var openai = document.getElementById('openai').value.trim();
    var model = modelEl.value.trim();
    if (!torbox) return null;
    var cfg = { torboxApiKey: torbox };
    if (openai) cfg.openaiApiKey = openai;
    if (model) cfg.openaiModel = model;
    return toB64Url(JSON.stringify(cfg));
  }
  function manifestUrl(enc) {
    return window.location.origin + '/' + enc + '/manifest.json';
  }
  function refresh() {
    var enc = build();
    var urlEl = document.getElementById('url');
    var installBtn = document.getElementById('install');
    if (!enc) {
      urlEl.textContent = 'Enter your TorBox API key…';
      installBtn.disabled = true;
      return;
    }
    installBtn.disabled = false;
    urlEl.textContent = manifestUrl(enc);
  }
  ['torbox','openai','model'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', refresh);
    document.getElementById(id).addEventListener('change', refresh);
  });
  document.getElementById('install').addEventListener('click', function() {
    var enc = build();
    if (!enc) return;
    window.location.href = manifestUrl(enc).replace(/^https?:/, 'stremio:');
  });
  document.getElementById('copy').addEventListener('click', function() {
    var enc = build();
    if (!enc) return;
    navigator.clipboard.writeText(manifestUrl(enc));
    var b = document.getElementById('copy');
    var t = b.textContent; b.textContent = 'Copied ✔';
    setTimeout(function(){ b.textContent = t; }, 1500);
  });
  refresh();
</script>
</body>
</html>`;
}
