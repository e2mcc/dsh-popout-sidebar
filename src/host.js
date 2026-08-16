/**
 * 可弹出侧边栏 · Popout Sidebar — Host half
 *
 * This file is the plain-JavaScript **function body** consumed by DeepSeek
 * Harness's dynamic Cordis plugin loader. Pass this exact text (from the
 * `return { ... }` below) as `code.host` to `cordis_define`.
 *
 * Responsibilities (runs in the DSH Node.js process):
 *  - Track files created/edited by the `write` / `edit` tools via `tools/result`,
 *    tagging each artifact with its preview `type` and, for `edit`, the
 *    `old_string`/`new_string` diff snippet.
 *  - Expose Package-private RPC: `artifacts.list` / `artifacts.read` / `artifacts.remove`.
 *  - Serve the standalone web tab, its JSON endpoints, and a binary media
 *    route via `webServer.register`.
 */

return {
  // Hard dependency: wait for the web server before registering routes
  // (loader entries mount concurrently, so without inject the apply may run
  // before `webServer` is provided and silently skip every route).
  inject: ['webServer'],
  apply(ctx) {
    let artifacts = []
    let seq = 0
    let lastCwd // the most recently seen session working directory (workspace)

    const EXT_IMAGE = { png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, svg: 1, bmp: 1, ico: 1, avif: 1 }
    const EXT_MARKDOWN = { md: 1, markdown: 1, mdx: 1, mdown: 1 }
    const EXT_HTML = { html: 1, htm: 1, xhtml: 1 }
    const MIME = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
    }

    const kindOf = (path) => {
      const p = String(path || '')
      const m = /\.([^.]+)$/.exec(p)
      const ext = m ? m[1].toLowerCase() : ''
      if (EXT_IMAGE[ext]) return 'image'
      if (EXT_MARKDOWN[ext]) return 'markdown'
      if (EXT_HTML[ext]) return 'html'
      return 'text'
    }

    // Clip a diff snippet so the list payload stays bounded even when the
    // agent replaces a huge region in one edit.
    const clip = (s, n) => (s.length > n ? s.slice(0, n) + '\n…' : s)

    const snapshot = () => artifacts.slice().sort((a, b) => b.seq - a.seq)

    const recordFile = (path, kind, sessionId, diff) => {
      seq += 1
      const at = Date.now()
      const existing = artifacts.find((a) => a.path === path)
      if (existing) {
        existing.kind = kind
        existing.sessionId = sessionId
        existing.at = at
        existing.seq = seq
        existing.type = kindOf(path)
        if (diff) existing.diff = diff
      } else {
        const entry = { id: 'a' + seq, path: path, kind: kind, type: kindOf(path), sessionId: sessionId, at: at, seq: seq }
        if (diff) entry.diff = diff
        artifacts.push(entry)
        if (artifacts.length > 1000) artifacts = artifacts.slice(-1000)
      }
    }

    ctx.on('tools/result', (exec, result) => {
      try {
        if (!exec || !result || result.isError === true) return
        // Capture the session working directory on ANY successful tool result,
        // so the file tree roots at the real workspace (not the process cwd).
        const agent = exec.agent
        if (agent && agent.session && agent.session.header && typeof agent.session.header.cwd === 'string' && agent.session.header.cwd) {
          lastCwd = agent.session.header.cwd
        }
        const name = exec.name
        if (name !== 'write' && name !== 'edit') return
        const args = exec.arguments
        const path = args && typeof args.file_path === 'string' ? args.file_path : ''
        if (!path) return
        let sessionId
        if (agent && agent.session && agent.session.id != null) sessionId = String(agent.session.id)
        let diff
        if (name === 'edit') {
          const oldString = args && typeof args.old_string === 'string' ? args.old_string : ''
          const newString = args && typeof args.new_string === 'string' ? args.new_string : ''
          if (oldString !== '' && oldString !== newString) {
            diff = { before: clip(oldString, 8000), after: clip(newString, 8000) }
          }
        }
        recordFile(path, name === 'write' ? 'create' : 'edit', sessionId, diff)
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
        return { ok: true, type: kindOf(path), content: text.slice(0, cap), truncated: text.length > cap, size: info.size }
      } catch (e) {
        return { ok: false, error: e && e.message ? String(e.message) : 'read failed' }
      }
    }

    // Remove a single tracked artifact entry (metadata only — never touches the
    // file on disk).
    const removeFile = (path) => {
      if (typeof path !== 'string' || !path) return { ok: false, error: 'missing path' }
      const idx = artifacts.findIndex((a) => a.path === path)
      if (idx < 0) return { ok: false, error: 'not found' }
      artifacts.splice(idx, 1)
      return { ok: true }
    }

    // Resolve the authoritative working directory for a session (the real
    // workspace). The client passes its current session id; we look it up in the
    // live session store so the tree roots correctly even before any tool runs.
    const sessionCwd = (sessionId) => {
      try {
        const sessions = ctx.get('sessions')
        if (sessions && typeof sessions.get === 'function' && typeof sessionId === 'string' && sessionId) {
          const s = sessions.get(sessionId)
          const c = s && s.header && typeof s.header.cwd === 'string' && s.header.cwd ? s.header.cwd : undefined
          if (c) return c
        }
      } catch (e) {}
      return undefined
    }

    // When the client does not supply a session id (the standalone tab is a
    // separate page with no client store), pick the most recently created live
    // session's working directory.
    const defaultSessionCwd = async () => {
      try {
        const sessions = ctx.get('sessions')
        if (!sessions || typeof sessions.list !== 'function') return undefined
        const live = sessions.list()
        const cands = []
        for (let i = 0; i < live.length; i += 1) {
          const s = live[i]
          const c = s && s.header && typeof s.header.cwd === 'string' && s.header.cwd ? s.header.cwd : undefined
          const at = s && s.header && typeof s.header.createdAt === 'number' ? s.header.createdAt : 0
          if (c) cands.push({ cwd: c, at: at })
        }
        cands.sort((a, b) => b.at - a.at)
        const fs = ctx.get('fs')
        for (let i = 0; i < cands.length; i += 1) {
          const c = cands[i].cwd
          if (!fs || typeof fs.stat !== 'function' || typeof fs.resolve !== 'function') return c
          try {
            const target = await fs.resolve(c)
            const info = await fs.stat(target)
            if (info && info.type === 'directory') return c
          } catch (e) {
            // Directory missing (e.g. the workspace was renamed or deleted);
            // skip this stale candidate and fall through to the next one.
          }
        }
      } catch (e) {}
      return undefined
    }

    // List one directory level for the file-tree (文件树) view: directories
    // first, then files, case-insensitive name order.
    const listDir = async (path, sessionId) => {
      const fs = ctx.get('fs')
      if (!fs) return { ok: false, error: 'filesystem unavailable' }
      try {
        const policy = ctx.get('sandboxPolicy')
        const policyRoot = policy && typeof policy.workspaceRoot === 'string' ? policy.workspaceRoot : undefined
        // `sessionCwd(sessionId)` wins when the client names a session (the
        // in-page sidebar does); the standalone tab passes no session id, so
        // it falls through to defaultSessionCwd() — which must skip stale
        // sessions whose cwd no longer exists (e.g. after a workspace rename).
        const cwd = sessionCwd(sessionId) || (await defaultSessionCwd()) || (typeof lastCwd === 'string' && lastCwd) || policyRoot
        let p = path
        if (typeof p !== 'string' || !p) {
          if (!cwd) return { ok: false, error: 'missing path' }
          p = cwd
        }
        const target = await fs.resolve(p, cwd ? { cwd: cwd } : undefined)
        const entries = await fs.listDir(target)
        const rows = entries
          .map((e) => ({
            name: e.name,
            path: typeof fs.processPath === 'function' ? fs.processPath(e.target) : p.replace(/\/+$/, '') + '/' + e.name,
            isDir: e.type === 'directory',
            hidden: e.name.startsWith('.'),
          }))
          .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : (a.isDir ? -1 : 1)))
        return { ok: true, path: p, entries: rows }
      } catch (e) {
        return { ok: false, error: e && e.message ? String(e.message) : 'list failed' }
      }
    }

    // Package-private RPC (dynamic-plugin transport). Guarded so the same body
    // also runs as a static bundle (no `harness` global there); the static
    // client talks to the /popout-sidebar/* HTTP routes below instead.
    if (typeof harness !== 'undefined') {
      harness.handle('artifacts.list', () => ({ artifacts: snapshot() }))
      harness.handle('artifacts.remove', (args) => removeFile(args && args.path))
      harness.handle('artifacts.read', (args) => readFile(args && args.path))
      harness.handle('artifacts.listDir', (args) => listDir(args && args.path, args && args.sessionId))
    }

    const webServer = ctx.get('webServer')
    if (webServer) {
      const page = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>弹出式侧边栏</title>
<script>
  (function () {
    var m = /[?&]scheme=([^&]+)/.exec(location.search);
    var scheme = m ? m[1] : 'light';
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
  header .spacer { flex: 1; }
  header .status { font-size: 12px; color: var(--p-success-fg); }
  main { flex: 1; display: flex; min-height: 0; }
  .sidebar { width: 340px; flex: none; display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--p-border-l2); }
  .list { flex: 1; min-height: 0; overflow-y: auto; }
  .list .empty { padding: 32px 20px; color: var(--p-text-tertiary); text-align: center; }
  .item { display: flex; align-items: stretch; border-bottom: 1px solid var(--p-border-l1); }
  .item.active { background: var(--p-hover); }
  .item-main { flex: 1; min-width: 0; text-align: left; padding: 10px 14px; border: none; background: transparent; color: inherit; cursor: pointer; font: inherit; }
  .item-main:hover { background: var(--p-hover); }
  .item .row { display: flex; align-items: center; gap: 8px; }
  .badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; flex: none; }
  .badge.create { background: var(--p-success-bg); color: var(--p-success-fg); }
  .badge.edit { background: var(--p-warn-bg); color: var(--p-warn-fg); }
  .item .base { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .full { color: var(--p-text-tertiary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .item .time { color: var(--p-text-caption); font-size: 11px; flex: none; }
  .actions { display: flex; align-items: center; gap: 2px; padding-right: 6px; opacity: 0; }
  .item:hover .actions { opacity: 1; }
  .mini-btn { border: none; background: transparent; color: var(--p-text-tertiary); cursor: pointer; font-size: 12px; padding: 2px 6px; border-radius: 4px; }
  .mini-btn:hover { background: var(--p-hover); color: var(--p-text); }
  .preview { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .preview .bar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid var(--p-border-l2); color: var(--p-text-secondary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preview .bar .path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preview .area { flex: 1; min-height: 0; overflow: auto; }
  .preview pre { margin: 0; padding: 16px; background: var(--p-code-bg); font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; color: var(--p-code-fg); }
  .preview .hint { padding: 32px; color: var(--p-text-tertiary); text-align: center; }
  .preview .err { padding: 24px; color: var(--p-error); font-family: ui-monospace, monospace; }
  .preview-img { display: block; max-width: 100%; max-height: 80vh; object-fit: contain; margin: 16px; }
  .preview-iframe { width: 100%; height: 100%; min-height: 400px; border: 0; background: #fff; }
  .markdown { padding: 16px 20px; line-height: 1.6; word-wrap: break-word; }
  .markdown h1, .markdown h2, .markdown h3, .markdown h4, .markdown h5, .markdown h6 { margin: 16px 0 8px; line-height: 1.3; }
  .markdown h1 { font-size: 1.5em; border-bottom: 1px solid var(--p-border-l2); padding-bottom: 6px; }
  .markdown h2 { font-size: 1.3em; border-bottom: 1px solid var(--p-border-l1); padding-bottom: 4px; }
  .markdown code { background: var(--p-code-bg); color: var(--p-code-fg); padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
  .markdown pre { background: var(--p-code-bg); padding: 12px 14px; border-radius: 6px; overflow: auto; }
  .markdown pre code { background: transparent; padding: 0; }
  .markdown img { max-width: 100%; }
  .markdown blockquote { border-left: 3px solid var(--p-border-l2); margin: 8px 0; padding: 2px 12px; color: var(--p-text-secondary); }
  .markdown ul, .markdown ol { padding-left: 24px; }
  .markdown a { color: var(--p-accent); }
  .markdown hr { border: none; border-top: 1px solid var(--p-border-l2); margin: 16px 0; }
  .diff { border-top: 1px solid var(--p-border-l2); }
  .diff-block { border-bottom: 1px solid var(--p-border-l1); }
  .diff-label { font-size: 11px; padding: 4px 12px; font-weight: 600; }
  .diff-block.del .diff-label { color: var(--p-error); background: rgba(236,19,19,0.06); }
  .diff-block.add .diff-label { color: var(--p-success-fg); background: rgba(34,197,94,0.08); }
  .diff-pre { margin: 0; padding: 8px 12px; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }
  .diff-block.del .diff-pre { background: rgba(236,19,19,0.05); }
  .diff-block.add .diff-pre { background: rgba(34,197,94,0.06); }
  .toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); background: var(--p-bg-layer-1); border: 1px solid var(--p-border-l2); color: var(--p-text); padding: 6px 14px; border-radius: 8px; font-size: 12px; opacity: 0; transition: opacity .18s; pointer-events: none; box-shadow: var(--p-shadow); z-index: 10; }
  .tabs { display: flex; align-items: stretch; height: 34px; border-bottom: 1px solid var(--p-border-l2); background: var(--p-bg-layer-1); flex: none; }
  .tab { flex: 1; border: none; background: var(--p-hover); color: var(--p-text-tertiary); font: inherit; font-size: 12px; cursor: pointer; border-right: 1px solid var(--p-border-l1); }
  .tab:hover { background: var(--p-hover); }
  .tab.is-active { color: var(--p-text); background: transparent; }
  .list.is-hidden { display: none; }
  .tree { flex: 1; min-height: 0; display: none; flex-direction: column; }
  .tree.is-active { display: flex; }
  .tree-head { flex: none; display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 8px 0 12px; border-bottom: 1px solid var(--p-border-l2); }
  .tree-root { flex: 1; min-width: 0; color: var(--p-text-secondary); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tree-refresh { width: 24px; height: 24px; flex: none; display: inline-flex; align-items: center; justify-content: center; color: var(--p-text-secondary); cursor: pointer; background: transparent; border: none; border-radius: 6px; padding: 0; }
  .tree-refresh:hover { background: var(--p-hover); color: var(--p-text); }
  .tree-body { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 6px 8px; }
  .tree .empty { padding: 32px 20px; color: var(--p-text-tertiary); text-align: center; }
  .tree-row { box-sizing: border-box; display: flex; align-items: center; gap: 6px; width: 100%; height: 34px; padding: 0 8px; cursor: pointer; white-space: nowrap; color: var(--p-text); font-size: 14px; border-radius: 8px; }
  .tree-row:hover { background: var(--p-hover); }
  .tree-row.is-selected { background: var(--p-hover); }
  .tree-dir { font-weight: 600; }
  .tree-hidden { opacity: .45; }
  .tree-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .tree-ref { height: 20px; border: 1px solid var(--p-border-l1); background: var(--p-bg-layer-2); color: var(--p-text-tertiary); font-size: 11px; font-weight: 600; cursor: pointer; border-radius: 999px; flex: none; align-items: center; padding: 0 8px; display: none; }
  .tree-ref:hover { background: var(--p-hover); color: var(--p-text); }
  .tree-row:hover .tree-ref, .tree-row:focus-within .tree-ref { display: inline-flex; }
  .tree-copied { font-size: 11px; color: var(--p-text-tertiary); flex: none; }
  .tree-loading { color: var(--p-text-tertiary); cursor: default; font-size: 12px; }
  .tree-error { color: var(--p-error); cursor: default; font-size: 12px; }
</style>
</head>
<body>
  <header>
    <h1>弹出式侧边栏</h1>
    <span class="spacer"></span>
    <span class="status" id="status">connecting…</span>
  </header>
  <main>
    <div class="sidebar">
      <div class="tabs" id="tabs">
        <button class="tab is-active" data-view="artifacts">产物</button>
        <button class="tab" data-view="tree">文件树</button>
      </div>
      <div class="list" id="list"></div>
      <div class="tree" id="tree">
        <div class="tree-head">
          <span class="tree-root" id="treeRoot">…</span>
          <button class="tree-refresh" id="treeRefresh" title="刷新" type="button"></button>
        </div>
        <div class="tree-body" id="treeBody"></div>
      </div>
    </div>
    <div class="preview">
      <div class="bar" id="bar"><span class="path">Select a file to preview</span></div>
      <div class="area" id="previewArea"><div class="hint">← 点击左侧文件预览内容</div></div>
    </div>
  </main>
  <div class="toast" id="toast"></div>
  <script>
    var DATA_URL = '/popout-sidebar/data';
    var CONTENT_URL = '/popout-sidebar/content';
    var MEDIA_URL = '/popout-sidebar/media';
    var LISTDIR_URL = '/popout-sidebar/listdir';
    var items = [];
    var selectedPath = null;
    var selectedItem = null;
    var treeRoot = null;
    var treeChildren = {};
    var treeExpanded = {};
    var currentView = 'artifacts';

    var EXT_IMAGE = { png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, svg: 1, bmp: 1, ico: 1, avif: 1 };
    var EXT_MARKDOWN = { md: 1, markdown: 1, mdx: 1, mdown: 1 };
    var EXT_HTML = { html: 1, htm: 1, xhtml: 1 };
    function extType(path) {
      var m = /\.([^.]+)$/.exec(String(path || ''));
      var ext = m ? m[1].toLowerCase() : '';
      if (EXT_IMAGE[ext]) return 'image';
      if (EXT_MARKDOWN[ext]) return 'markdown';
      if (EXT_HTML[ext]) return 'html';
      return 'text';
    }

    var FOLDER_CLOSE_D = 'M5.05582 0.518756L4.50669 0.86654L5.05582 0.518756ZM13 9.4837L13.65 9.4837L13.65 3.53962L13 3.53962L12.35 3.53962L12.35 9.4837L13 9.4837ZM11.3264 1.86603L11.3264 1.21603L6.52313 1.21603L6.52313 1.86603L6.52313 2.51603L11.3264 2.51603L11.3264 1.86603ZM5.58054 1.34727L6.12968 0.999489L5.60495 0.170972L5.05582 0.518756L4.50669 0.86654L5.03141 1.69506L5.58054 1.34727ZM4.11323 1.23058e-13L4.11323 -0.65L1.67359 -0.65L1.67359 5.00699e-14L1.67359 0.65L4.11323 0.65L4.11323 1.23058e-13ZM0 1.67359L-0.65 1.67359L-0.65 9.4837L0 9.4837L0.65 9.4837L0.65 1.67359L0 1.67359ZM11.3264 11.1573L11.3264 10.5073L1.67359 10.5073L1.67359 11.1573L1.67359 11.8073L11.3264 11.8073L11.3264 11.1573ZM0 9.4837L-0.65 9.4837C-0.65 10.767 0.390308 11.8073 1.67359 11.8073L1.67359 11.1573L1.67359 10.5073C1.10828 10.5073 0.65 10.049 0.65 9.4837L0 9.4837ZM1.67359 5.00699e-14L1.67359 -0.65C0.390307 -0.65 -0.65 0.390309 -0.65 1.67359L0 1.67359L0.65 1.67359C0.65 1.10828 1.10828 0.65 1.67359 0.65L1.67359 5.00699e-14ZM5.05582 0.518756L5.60495 0.170972C5.28121 -0.340193 4.71829 -0.65 4.11323 -0.65L4.11323 1.23058e-13L4.11323 0.65C4.27282 0.65 4.4213 0.731715 4.50669 0.86654L5.05582 0.518756ZM6.52313 1.86603L6.52313 1.21603C6.36354 1.21603 6.21507 1.13431 6.12968 0.999489L5.58054 1.34727L5.03141 1.69506C5.35515 2.20622 5.91808 2.51603 6.52313 2.51603L6.52313 1.86603ZM13 3.53962L13.65 3.53962C13.65 2.25634 12.6097 1.21603 11.3264 1.21603L11.3264 1.86603L11.3264 2.51603C11.8917 2.51603 12.35 2.97431 12.35 3.53962L13 3.53962ZM13 9.4837L12.35 9.4837C12.35 10.049 11.8917 10.5073 11.3264 10.5073L11.3264 11.1573L11.3264 11.8073C12.6097 11.8073 13.65 10.767 13.65 9.4837L13 9.4837Z';
    var FOLDER_OPEN_D1 = 'M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z';
    var FOLDER_OPEN_D2 = 'M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z';
    var CODE_D = 'M12.3368 1.53569L11.931 4.43172H14.8086V5.79673H11.7404L11.1962 9.67859H14.2839V11.0436H11.0056L10.4994 14.6529L9.14873 14.4643L9.62731 11.0436H5.75876L5.25252 14.6529L3.90186 14.4643L4.38043 11.0436H1.69141V9.67859H4.57104L5.11417 5.79673H2.21609V4.43172H5.30581L5.73724 1.34713L7.08995 1.53569L6.68414 4.43172H10.5527L10.9841 1.34713L12.3368 1.53569ZM5.94937 9.67859H9.81791L10.361 5.79673H6.49353L5.94937 9.67859Z';
    var REFRESH_D = 'M7.92136 0.349152C10.3744 0.349234 12.5564 1.5052 13.9557 3.29894L15.1281 2.12759C15.3303 1.92546 15.6767 2.06943 15.6767 2.35538V5.53923C15.6766 5.71626 15.5329 5.85976 15.3559 5.86002H12.171C11.8854 5.8597 11.7426 5.51465 11.9443 5.31249L12.9641 4.29056C11.8237 2.74305 9.98908 1.74106 7.92136 1.74097C4.46436 1.74097 1.66233 4.543 1.66233 8C1.66233 11.457 4.46436 14.259 7.92136 14.259C11.3782 14.2589 14.1804 11.4569 14.1804 8H15.5722C15.5722 12.2251 12.1465 15.6507 7.92136 15.6508C3.69614 15.6508 0.270508 12.2252 0.270508 8C0.270508 3.77478 3.69614 0.349152 7.92136 0.349152Z';

    function svgIcon(paths, size) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', size || 14);
      svg.setAttribute('height', size || 14);
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('fill', 'none');
      (paths || []).forEach(function (spec) {
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', spec.d);
        if (spec.transform) p.setAttribute('transform', spec.transform);
        if (spec.opacity) p.setAttribute('opacity', spec.opacity);
        if (spec.fillRule) p.setAttribute('fill-rule', spec.fillRule);
        if (spec.clipRule) p.setAttribute('clip-rule', spec.clipRule);
        p.setAttribute('fill', 'currentColor');
        svg.appendChild(p);
      });
      return svg;
    }
    function folderClosedIcon() { return svgIcon([{ d: FOLDER_CLOSE_D, transform: 'translate(1.5 2.429)' }]); }
    function folderOpenIcon() { return svgIcon([{ d: FOLDER_OPEN_D1 }, { d: FOLDER_OPEN_D2, opacity: '0.2' }]); }
    function fileCodeIcon() { return svgIcon([{ d: CODE_D, fillRule: 'evenodd', clipRule: 'evenodd' }]); }
    function refreshIcon() { return svgIcon([{ d: REFRESH_D }]); }

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
    function toast(msg) {
      var t = document.getElementById('toast');
      t.textContent = msg;
      t.style.opacity = '1';
      clearTimeout(t._timer);
      t._timer = setTimeout(function () { t.style.opacity = '0'; }, 1600);
    }
    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
    function copyText(text, msg) {
      var done = function () { toast(msg); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      } else { fallbackCopy(text); done(); }
    }
    function mdEscape(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function mdInline(s) {
      s = s.replace(/\`([^\`]+)\`/g, function (m, c) { return '<code>' + c + '</code>'; });
      s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
      return s;
    }
    function mdToHtml(src) {
      var lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
      var out = [];
      var i = 0;
      while (i < lines.length) {
        var line = lines[i];
        if (/^\s*\`\`\`/.test(line)) {
          var buf = [];
          i += 1;
          while (i < lines.length && !/^\s*\`\`\`/.test(lines[i])) { buf.push(lines[i]); i += 1; }
          i += 1;
          out.push('<pre><code>' + mdEscape(buf.join('\n')) + '</code></pre>');
          continue;
        }
        var h = /^(#{1,6})\s+(.*)$/.exec(line);
        if (h) {
          var lv = h[1].length;
          out.push('<h' + lv + '>' + mdInline(mdEscape(h[2])) + '</h' + lv + '>');
          i += 1;
          continue;
        }
        if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { out.push('<hr>'); i += 1; continue; }
        if (/^\s*>\s?/.test(line)) {
          var q = [];
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
          out.push('<blockquote>' + mdInline(mdEscape(q.join(' '))) + '</blockquote>');
          continue;
        }
        if (/^\s*[-*+]\s+/.test(line)) {
          var lis = [];
          while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { lis.push(mdInline(mdEscape(lines[i].replace(/^\s*[-*+]\s+/, '')))); i += 1; }
          out.push('<ul>' + lis.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>');
          continue;
        }
        if (/^\s*\d+\.\s+/.test(line)) {
          var lis2 = [];
          while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { lis2.push(mdInline(mdEscape(lines[i].replace(/^\s*\d+\.\s+/, '')))); i += 1; }
          out.push('<ol>' + lis2.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>');
          continue;
        }
        if (line.trim() === '') { i += 1; continue; }
        out.push('<p>' + mdInline(mdEscape(line)) + '</p>');
        i += 1;
      }
      return out.join('\n');
    }
    function diffNode(d) {
      var wrap = el('div', 'diff');
      if (d && d.before != null && d.before !== '') {
        var del = el('div', 'diff-block del');
        del.appendChild(el('div', 'diff-label', '- 删除'));
        del.appendChild(el('pre', 'diff-pre', d.before));
        wrap.appendChild(del);
      }
      var add = el('div', 'diff-block add');
      add.appendChild(el('div', 'diff-label', '+ 新增'));
      add.appendChild(el('pre', 'diff-pre', d && d.after != null ? d.after : ''));
      wrap.appendChild(add);
      return wrap;
    }
    function errNode(msg) {
      return el('div', 'err', msg || 'read failed');
    }
    function render() {
      var list = document.getElementById('list');
      list.textContent = '';
      if (!items.length) {
        list.appendChild(el('div', 'empty', 'No artifacts yet — files created/edited by the agent will appear here.'));
        return;
      }
      items.forEach(function (it) {
        var item = el('div', 'item');
        if (it.path === selectedPath) item.className += ' active';
        var main = el('button', 'item-main');
        var row = el('div', 'row');
        var badge = el('span', 'badge ' + (it.kind === 'create' ? 'create' : 'edit'), it.kind === 'create' ? '新建' : '编辑');
        var base = el('span', 'base', basename(it.path));
        var time = el('span', 'time', timeAgo(it.at));
        row.appendChild(badge);
        row.appendChild(base);
        row.appendChild(time);
        var full = el('div', 'full', it.path);
        main.appendChild(row);
        main.appendChild(full);
        main.addEventListener('click', function () { select(it); });
        item.appendChild(main);
        var actions = el('div', 'actions');
        var cp = el('button', 'mini-btn', '⧉');
        cp.title = '复制路径';
        cp.addEventListener('click', function (ev) { ev.stopPropagation(); copyText(it.path, '已复制路径'); });
        var qt = el('button', 'mini-btn', '@');
        qt.title = '复制 @path 引用';
        qt.addEventListener('click', function (ev) { ev.stopPropagation(); copyText('@' + it.path, '已复制 @引用'); });
        actions.appendChild(cp);
        actions.appendChild(qt);
        item.appendChild(actions);
        list.appendChild(item);
      });
    }
    function openPath(path, diff) {
      selectedPath = path;
      selectedItem = null;
      render();
      if (treeRoot) renderTree();
      var bar = document.getElementById('bar');
      var area = document.getElementById('previewArea');
      area.textContent = '';
      bar.textContent = '';
      bar.appendChild(el('span', 'path', path));
      var cp = el('button', 'mini-btn', '⧉');
      cp.title = '复制路径';
      cp.addEventListener('click', function () { copyText(path, '已复制路径'); });
      bar.appendChild(cp);
      var qt = el('button', 'mini-btn', '@');
      qt.title = '复制 @path 引用';
      qt.addEventListener('click', function () { copyText('@' + path, '已复制 @引用'); });
      bar.appendChild(qt);

      var type = extType(path);
      if (type === 'image') {
        var img = el('img', 'preview-img');
        img.src = MEDIA_URL + '?path=' + encodeURIComponent(path);
        img.alt = path;
        img.addEventListener('error', function () { area.textContent = ''; area.appendChild(errNode('图片加载失败')); });
        area.appendChild(img);
        if (diff) area.appendChild(diffNode(diff));
        return;
      }
      fetch(CONTENT_URL + '?path=' + encodeURIComponent(path)).then(function (r) { return r.json(); }).then(function (data) {
        if (!data || data.ok !== true) { area.appendChild(errNode(data && data.error)); return; }
        if (diff) area.appendChild(diffNode(diff));
        if (type === 'html') {
          var frame = el('iframe', 'preview-iframe');
          frame.setAttribute('sandbox', 'allow-scripts');
          frame.setAttribute('srcdoc', data.content);
          area.appendChild(frame);
        } else if (type === 'markdown') {
          var md = el('div', 'markdown');
          md.innerHTML = mdToHtml(data.content);
          area.appendChild(md);
        } else {
          var pre = el('pre', null, data.content);
          if (data.truncated) area.appendChild(el('div', 'diff-label', '(truncated preview)'));
          area.appendChild(pre);
        }
      }).catch(function (e) {
        area.appendChild(errNode(String(e && e.message ? e.message : e)));
      });
    }

    function select(it) { openPath(it.path, it.diff); }

    // ── File tree (文件树) ────────────────────────────────────────────────
    function setView(view) {
      currentView = view;
      var tabs = document.querySelectorAll('.tab');
      for (var i = 0; i < tabs.length; i += 1) {
        tabs[i].classList.toggle('is-active', tabs[i].getAttribute('data-view') === view);
      }
      document.getElementById('list').classList.toggle('is-hidden', view !== 'artifacts');
      document.getElementById('tree').classList.toggle('is-active', view === 'tree');
      if (view === 'tree' && !treeRoot) loadTreeRoot();
    }

    function loadTreeRoot() {
      treeRoot = null;
      treeChildren = {};
      treeExpanded = {};
      var rootLabel = document.getElementById('treeRoot');
      if (rootLabel) rootLabel.textContent = '…';
      var bodyEl = document.getElementById('treeBody');
      bodyEl.textContent = '';
      bodyEl.appendChild(el('div', 'tree-loading', '加载文件树…'));
      fetch(LISTDIR_URL, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (res) {
        if (res && res.ok) {
          treeRoot = { path: res.path, entries: res.entries };
          if (rootLabel) rootLabel.textContent = basename(res.path);
        } else {
          treeRoot = { path: null, entries: [] };
        }
        renderTree();
      }).catch(function () {
        treeRoot = { path: null, entries: [] };
        renderTree();
        document.getElementById('treeBody').appendChild(el('div', 'tree-error', '加载失败'));
      });
    }

    function renderTree() {
      var bodyEl = document.getElementById('treeBody');
      bodyEl.textContent = '';
      if (!treeRoot) return;
      if (!treeRoot.entries || !treeRoot.entries.length) {
        bodyEl.appendChild(el('div', 'empty', '（空目录）'));
        return;
      }
      treeRoot.entries.forEach(function (entry) {
        bodyEl.appendChild(renderTreeNode(entry, 0));
      });
    }

    function copyRef(path) {
      copyText('@' + path, '已复制 @引用');
    }

    function renderTreeNode(entry, depth) {
      var wrap = el('div');
      var isSelected = selectedPath === entry.path;
      var row = el('div', 'tree-row' + (entry.isDir ? ' tree-dir' : '') + (entry.hidden ? ' tree-hidden' : '') + (isSelected ? ' is-selected' : ''));
      row.style.paddingLeft = (8 + depth * 20) + 'px';
      row.title = entry.path;

      row.appendChild(entry.isDir ? (treeExpanded[entry.path] ? folderOpenIcon() : folderClosedIcon()) : fileCodeIcon());
      row.appendChild(el('span', 'tree-name', entry.name));

      var refBtn = el('button', 'tree-ref', '@引用');
      refBtn.type = 'button';
      refBtn.title = '复制 @path 引用';
      refBtn.addEventListener('click', function (ev) { ev.stopPropagation(); copyRef(entry.path); });
      row.appendChild(refBtn);

      if (entry.isDir) {
        row.addEventListener('click', function () { toggleTree(entry.path); });
      } else {
        row.addEventListener('click', function () { openPath(entry.path, null); });
      }
      wrap.appendChild(row);

      if (entry.isDir && treeExpanded[entry.path]) {
        var node = treeChildren[entry.path];
        var childPad = 8 + (depth + 1) * 20 + 20;
        if (node && node.loading) {
          var lr = el('div', 'tree-row tree-loading', '加载中…');
          lr.style.paddingLeft = childPad + 'px';
          wrap.appendChild(lr);
        } else if (node && node.error) {
          var er = el('div', 'tree-row tree-error', node.error);
          er.style.paddingLeft = childPad + 'px';
          wrap.appendChild(er);
        } else if (node && node.entries) {
          node.entries.forEach(function (c) { wrap.appendChild(renderTreeNode(c, depth + 1)); });
        }
      }
      return wrap;
    }

    function toggleTree(path) {
      if (treeExpanded[path]) {
        treeExpanded[path] = false;
        renderTree();
        return;
      }
      treeExpanded[path] = true;
      if (!treeChildren[path]) {
        treeChildren[path] = { loading: true };
        renderTree();
        fetch(LISTDIR_URL + '?path=' + encodeURIComponent(path), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (res) {
          treeChildren[path] = res && res.ok ? { entries: res.entries } : { error: (res && res.error) || '读取失败' };
          renderTree();
        }).catch(function () {
          treeChildren[path] = { error: '读取失败' };
          renderTree();
        });
      } else {
        renderTree();
      }
    }

    document.getElementById('tabs').addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('.tab') : null;
      if (!btn) return;
      setView(btn.getAttribute('data-view'));
    });
    var treeRefreshBtn = document.getElementById('treeRefresh');
    if (treeRefreshBtn) {
      treeRefreshBtn.appendChild(refreshIcon());
      treeRefreshBtn.addEventListener('click', function () { loadTreeRoot(); });
    }
    function load() {
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;
      fetch(DATA_URL, controller ? { signal: controller.signal, cache: 'no-store' } : { cache: 'no-store' })
        .then(function (r) { return r.json(); }).then(function (data) {
          if (timer) clearTimeout(timer);
          items = data && Array.isArray(data.artifacts) ? data.artifacts : [];
          if (selectedPath && !items.some(function (x) { return x.path === selectedPath; })) { selectedPath = null; selectedItem = null; }
          render();
          var st = document.getElementById('status');
          st.textContent = 'live';
          st.style.color = getComputedStyle(document.documentElement).getPropertyValue('--p-success-fg').trim() || '#34c55e';
        }).catch(function () {
          if (timer) clearTimeout(timer);
          var st = document.getElementById('status');
          st.textContent = 'offline';
          st.style.color = getComputedStyle(document.documentElement).getPropertyValue('--p-error').trim() || '#ef4444';
        });
    }
    load();
    setInterval(load, 1500);
    // Background tabs throttle setInterval, so a tab left in the background can
    // show stale artifacts for up to a minute. Refresh immediately whenever the
    // user returns to (or focuses) this tab.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) load();
    });
    window.addEventListener('focus', load);
  </script>
</body>
</html>`

      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/popout-sidebar',
        handler(req, res) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(page)
        },
      }), 'artifacts: page route')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/popout-sidebar/data',
        handler(req, res) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Connection': 'close' })
          res.end(JSON.stringify({ artifacts: snapshot() }))
        },
      }), 'artifacts: data route')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/popout-sidebar/content',
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
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/popout-sidebar/media',
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
          const fs = ctx.get('fs')
          if (!fs || typeof path !== 'string' || !path) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('bad request')
            return
          }
          try {
            const policy = ctx.get('sandboxPolicy')
            const cwd = policy && typeof policy.workspaceRoot === 'string' ? policy.workspaceRoot : undefined
            const target = await fs.resolve(path, cwd ? { cwd: cwd } : undefined)
            const info = await fs.stat(target)
            if (!info || info.type !== 'file') {
              res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
              res.end('not found')
              return
            }
            const bytes = await fs.readBytes(target, undefined, 25 * 1024 * 1024)
            const ext = (() => { const m = /\.([^.]+)$/.exec(String(path || '')); return m ? m[1].toLowerCase() : '' })()
            const mime = MIME[ext] || 'application/octet-stream'
            res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'Content-Length': bytes.byteLength })
            res.end(Buffer.from(bytes))
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end(e && e.message ? String(e.message) : 'read failed')
          }
        },
      }), 'artifacts: media route')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/popout-sidebar/remove',
        handler(req, res) {
          const qs = (req.url || '').split('?')[1] || ''
          let path = ''
          const parts = qs.split('&')
          for (let i = 0; i < parts.length; i += 1) {
            const pair = parts[i]
            const eq = pair.indexOf('=')
            const k = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq))
            if (k === 'path') path = decodeURIComponent(eq < 0 ? '' : pair.slice(eq + 1))
          }
          const out = removeFile(path)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(out))
        },
      }), 'artifacts: remove route')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/popout-sidebar/listdir',
        handler: async (req, res) => {
          const qs = (req.url || '').split('?')[1] || ''
          let path = ''
          let sessionId = ''
          const parts = qs.split('&')
          for (let i = 0; i < parts.length; i += 1) {
            const pair = parts[i]
            const eq = pair.indexOf('=')
            const k = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq))
            const v = decodeURIComponent(eq < 0 ? '' : pair.slice(eq + 1))
            if (k === 'path') path = v
            else if (k === 'sessionId') sessionId = v
          }
          const out = await listDir(path || undefined, sessionId || undefined)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Connection': 'close' })
          res.end(JSON.stringify(out))
        },
      }), 'artifacts: listdir route')
    }
  },
}
