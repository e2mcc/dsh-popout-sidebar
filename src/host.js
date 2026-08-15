/**
 * 具有独立标签页的侧边栏 · Standalone Tab Sidebar — Host half
 *
 * This file is the plain-JavaScript **function body** consumed by DeepSeek
 * Harness's dynamic Cordis plugin loader. Pass this exact text (from the
 * `return { ... }` below) as `code.host` to `cordis_define`.
 *
 * Responsibilities (runs in the DSH Node.js process):
 *  - Track files created/edited by the `write` / `edit` tools via `tools/result`.
 *  - Expose Package-private RPC: `artifacts.list` / `artifacts.read` / `artifacts.clear`.
 *  - Serve the standalone web tab and its JSON endpoints via `webServer.register`.
 */

return {
  apply(ctx) {
    let artifacts = []
    let seq = 0

    const snapshot = () => artifacts.slice().sort((a, b) => b.seq - a.seq)

    const recordFile = (path, kind, sessionId) => {
      seq += 1
      const at = Date.now()
      const existing = artifacts.find((a) => a.path === path)
      if (existing) {
        existing.kind = kind
        existing.sessionId = sessionId
        existing.at = at
        existing.seq = seq
      } else {
        artifacts.push({ id: 'a' + seq, path: path, kind: kind, sessionId: sessionId, at: at, seq: seq })
        if (artifacts.length > 1000) artifacts = artifacts.slice(-1000)
      }
    }

    ctx.on('tools/result', (exec, result) => {
      try {
        if (!exec || !result || result.isError === true) return
        const name = exec.name
        if (name !== 'write' && name !== 'edit') return
        const args = exec.arguments
        const path = args && typeof args.file_path === 'string' ? args.file_path : ''
        if (!path) return
        let sessionId
        const agent = exec.agent
        if (agent && agent.session && agent.session.id != null) sessionId = String(agent.session.id)
        recordFile(path, name === 'write' ? 'create' : 'edit', sessionId)
      } catch (e) {
        console.error('[artifacts] track failed', e)
      }
    })

    const readFile = async (path) => {
      const fs = ctx.get('fs')
      if (!fs) return { ok: false, error: 'filesystem unavailable' }
      if (typeof path !== 'string' || !path) return { ok: false, error: 'missing path' }
      try {
        const policy = ctx.get('sandboxPolicy')
        const cwd = policy && typeof policy.workspaceRoot === 'string' ? policy.workspaceRoot : undefined
        const target = await fs.resolve(path, cwd ? { cwd: cwd } : undefined)
        const info = await fs.stat(target)
        if (!info || info.type !== 'file') return { ok: false, error: 'not a readable file' }
        const text = await fs.readText(target)
        const cap = 200000
        return { ok: true, content: text.slice(0, cap), truncated: text.length > cap, size: info.size }
      } catch (e) {
        return { ok: false, error: e && e.message ? String(e.message) : 'read failed' }
      }
    }

    harness.handle('artifacts.list', () => ({ artifacts: snapshot() }))
    harness.handle('artifacts.clear', () => { artifacts = []; seq = 0; return { ok: true } })
    harness.handle('artifacts.read', (args) => readFile(args && args.path))

    const webServer = ctx.get('webServer')
    if (webServer) {
      const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Artifacts · 产物</title>
<script>
  (function () {
    var m = /[?&]scheme=([^&]+)/.exec(location.search);
    var scheme = m ? m[1] : 'dark';
    if (scheme === 'dark') document.documentElement.setAttribute('data-ds-dark-theme', '');
  })();
</script>
<style>
  :root {
    color-scheme: light;
    --p-bg: rgb(255, 255, 255);
    --p-bg-layer-1: rgb(255, 255, 255);
    --p-border-l1: rgba(0, 0, 0, 0.04);
    --p-border-l2: rgba(0, 0, 0, 0.1);
    --p-text: rgb(15, 17, 21);
    --p-text-secondary: rgb(97, 102, 107);
    --p-text-tertiary: rgb(129, 133, 140);
    --p-text-caption: rgb(173, 178, 184);
    --p-hover: rgba(38, 49, 72, 0.06);
    --p-accent: rgb(65, 118, 230);
    --p-success-fg: rgb(34, 197, 94);
    --p-success-bg: rgb(230, 250, 237);
    --p-warn-fg: rgb(221, 134, 41);
    --p-warn-bg: rgb(254, 245, 231);
    --p-error: rgb(236, 19, 19);
    --p-code-bg: rgb(250, 250, 250);
    --p-code-fg: rgb(97, 102, 107);
    --p-shadow: 0 4px 12px 0 rgba(0,0,0,0.02), 0 2px 8px 0 rgba(0,0,0,0.04);
  }
  :root[data-ds-dark-theme] {
    color-scheme: dark;
    --p-bg: rgb(21, 21, 23);
    --p-bg-layer-1: rgb(35, 35, 36);
    --p-border-l1: rgba(255, 255, 255, 0.06);
    --p-border-l2: rgba(255, 255, 255, 0.12);
    --p-text: rgb(249, 250, 251);
    --p-text-secondary: rgb(207, 211, 214);
    --p-text-tertiary: rgb(173, 178, 184);
    --p-text-caption: rgb(129, 133, 140);
    --p-hover: rgba(255, 255, 255, 0.08);
    --p-accent: rgb(103, 158, 254);
    --p-success-fg: rgb(34, 197, 94);
    --p-success-bg: rgb(35, 60, 44);
    --p-warn-fg: rgb(221, 134, 41);
    --p-warn-bg: rgb(39, 36, 31);
    --p-error: rgb(242, 90, 90);
    --p-code-bg: rgb(27, 27, 28);
    --p-code-fg: rgb(207, 211, 214);
    --p-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: var(--p-bg); color: var(--p-text);
    display: flex; flex-direction: column;
  }
  header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--p-border-l2); background: var(--p-bg-layer-1); flex: none; }
  header h1 { font-size: 15px; margin: 0; font-weight: 600; }
  header .count { color: var(--p-text-caption); font-size: 12px; }
  header .spacer { flex: 1; }
  header .status { font-size: 12px; color: var(--p-success-fg); }
  main { flex: 1; display: flex; min-height: 0; }
  .list { width: 340px; flex: none; overflow-y: auto; border-right: 1px solid var(--p-border-l2); }
  .list .empty { padding: 32px 20px; color: var(--p-text-tertiary); text-align: center; }
  .item { display: block; width: 100%; text-align: left; padding: 10px 14px; border: none; border-bottom: 1px solid var(--p-border-l1); background: transparent; color: inherit; cursor: pointer; font: inherit; }
  .item:hover { background: var(--p-hover); }
  .item.active { background: var(--p-hover); }
  .item .row { display: flex; align-items: center; gap: 8px; }
  .badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; flex: none; }
  .badge.create { background: var(--p-success-bg); color: var(--p-success-fg); }
  .badge.edit { background: var(--p-warn-bg); color: var(--p-warn-fg); }
  .item .base { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .full { color: var(--p-text-tertiary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .item .time { color: var(--p-text-caption); font-size: 11px; flex: none; }
  .preview { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .preview .bar { padding: 8px 16px; border-bottom: 1px solid var(--p-border-l2); color: var(--p-text-secondary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preview .bar .path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .preview pre { flex: 1; margin: 0; overflow: auto; padding: 16px; background: var(--p-code-bg); font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; color: var(--p-code-fg); }
  .preview .hint { padding: 32px; color: var(--p-text-tertiary); text-align: center; }
  .preview .err { padding: 24px; color: var(--p-error); font-family: ui-monospace, monospace; }
</style>
</head>
<body>
  <header>
    <h1>Artifacts · 产物</h1>
    <span class="count" id="count">0</span>
    <span class="spacer"></span>
    <span class="status" id="status">connecting…</span>
  </header>
  <main>
    <div class="list" id="list"></div>
    <div class="preview">
      <div class="bar" id="bar">Select a file to preview</div>
      <div class="hint" id="hint">← 点击左侧文件预览内容</div>
      <pre id="preview" style="display:none"></pre>
    </div>
  </main>
  <script>
    var DATA_URL = '/artifacts-panel/data';
    var CONTENT_URL = '/artifacts-panel/content';
    var items = [];
    var selectedPath = null;

    function el(tag, className, text) {
      var n = document.createElement(tag);
      if (className) n.className = className;
      if (text != null) n.textContent = text;
      return n;
    }
    function basename(p) {
      var parts = String(p).split('/');
      return parts[parts.length - 1] || p;
    }
    function timeAgo(ts) {
      if (!ts) return '';
      var s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      return Math.floor(s / 86400) + 'd ago';
    }
    function render() {
      var list = document.getElementById('list');
      var count = document.getElementById('count');
      list.textContent = '';
      count.textContent = String(items.length);
      if (!items.length) {
        list.appendChild(el('div', 'empty', 'No artifacts yet — files created/edited by the agent will appear here.'));
        return;
      }
      items.forEach(function (it) {
        var btn = el('button', 'item');
        if (it.path === selectedPath) btn.className += ' active';
        var row = el('div', 'row');
        var badge = el('span', 'badge ' + (it.kind === 'create' ? 'create' : 'edit'), it.kind === 'create' ? '新建' : '编辑');
        var base = el('span', 'base', basename(it.path));
        var time = el('span', 'time', timeAgo(it.at));
        row.appendChild(badge);
        row.appendChild(base);
        row.appendChild(time);
        var full = el('div', 'full', it.path);
        btn.appendChild(row);
        btn.appendChild(full);
        btn.addEventListener('click', function () { select(it.path); });
        list.appendChild(btn);
      });
    }
    function select(path) {
      selectedPath = path;
      render();
      var bar = document.getElementById('bar');
      var hint = document.getElementById('hint');
      var pre = document.getElementById('preview');
      hint.style.display = 'none';
      pre.style.display = 'none';
      pre.className = '';
      bar.textContent = 'loading…';
      var url = CONTENT_URL + '?path=' + encodeURIComponent(path);
      fetch(url).then(function (r) { return r.json(); }).then(function (data) {
        if (!data || data.ok !== true) {
          bar.textContent = path;
          pre.style.display = 'block';
          pre.className = 'err';
          pre.textContent = data && data.error ? data.error : 'read failed';
          return;
        }
        bar.textContent = path + (data.truncated ? '  (truncated preview)' : '');
        pre.style.display = 'block';
        pre.textContent = data.content;
      }).catch(function (e) {
        bar.textContent = path;
        pre.style.display = 'block';
        pre.className = 'err';
        pre.textContent = String(e && e.message ? e.message : e);
      });
    }
    function load() {
      fetch(DATA_URL).then(function (r) { return r.json(); }).then(function (data) {
        items = data && Array.isArray(data.artifacts) ? data.artifacts : [];
        render();
        var st = document.getElementById('status');
        st.textContent = 'live';
        st.style.color = getComputedStyle(document.documentElement).getPropertyValue('--p-success-fg').trim() || '#34c55e';
      }).catch(function () {
        var st = document.getElementById('status');
        st.textContent = 'offline';
        st.style.color = getComputedStyle(document.documentElement).getPropertyValue('--p-error').trim() || '#ef4444';
      });
    }
    load();
    setInterval(load, 1500);
  </script>
</body>
</html>`

      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/artifacts-panel',
        handler(req, res) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(page)
        },
      }), 'artifacts: page route')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/artifacts-panel/data',
        handler(req, res) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify({ artifacts: snapshot() }))
        },
      }), 'artifacts: data route')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/artifacts-panel/content',
        handler: async (req, res) => {
          const qs = (req.url || '').split('?')[1] || ''
          let path = ''
          const parts = qs.split('&')
          for (let i = 0; i < parts.length; i += 1) {
            const pair = parts[i]
            const eq = pair.indexOf('=')
            const k = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq))
            if (k === 'path') path = decodeURIComponent(eq < 0 ? '' : pair.slice(eq + 1))
          }
          const out = await readFile(path)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(out))
        },
      }), 'artifacts: content route')
    }
  },
}
