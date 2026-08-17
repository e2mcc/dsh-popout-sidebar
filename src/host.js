/**
 * 可弹出侧边栏 · Popout Sidebar — Host body
 *
 * Assembled by `scripts/build.js` into `src/host.js`. This is the plain-JS
 * function body consumed by DeepSeek Harness's Cordis plugin loader — the very
 * same text you can pass to `cordis_define` as `code.host`.
 *
 * The placeholder tokens in this skeleton are replaced at build time by:
 *   ext      → src/shared/ext.js (shared preview-type helpers)
 *   core     → src/host/core.js   (constants + artifact tracking + file ops)
 *   page     → src/host/page.js   (standalone web tab HTML)
 *   routes   → src/host/routes.js (the /popout-sidebar/* HTTP routes)
 */
return {
  // Hard dependency: wait for the web server before registering routes
  // (loader entries mount concurrently, so without inject the apply may run
  // before `webServer` is provided and silently skip every route).
  // `sessionQuery` is also required so the file tree can resolve a switched-to
  // session's workspace from the persisted corpus when it is not yet live.
  inject: ['webServer', 'sessionQuery'],
  apply(ctx) {
    // Shared extension → preview-type helpers (portable JS: var/function, no
    // template literals, so this file can be inlined verbatim into the host Node
    // scope, the client bundle, and the standalone page's String.raw inline script).
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

    function fileExt(path) {
      var m = /\.([^.]+)$/.exec(String(path || ''));
      return m ? m[1].toLowerCase() : '';
    }

    let artifacts = []
    let seq = 0
    let lastCwd // the most recently seen session working directory (workspace)

    const MIME = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
    }
    // Shell executors whose filesystem side effects are NOT visible as a
    // `write`/`edit` result. Snapshot-diff the workspace around these tools so
    // files they create or overwrite (e.g. `python3 make_chart.py` emitting a
    // PNG) still land in the artifact list.
    const WATCH_TOOLS = { bash: 1, pwsh: 1 }
    // Directories never walked during a snapshot: VCS / cache / dependency
    // trees that are huge and never contain the artifacts the agent cares about.
    const SKIP_DIRS = new Set([
      'node_modules', 'venv', '.venv', 'env', '__pycache__', '.pytest_cache',
      '.mypy_cache', '.ruff_cache', '.tox', '.cache', '.next', '.nuxt',
      'dist', 'build', 'out', 'target', '.git', '.svn', '.hg', '.idea',
      '.vscode', '.dsh', '.workbuddy',
    ])
    const SNAPSHOT_MAX_FILES = 5000
    const SNAPSHOT_MAX_DEPTH = 16

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
        existing.type = extType(path)
        if (diff) existing.diff = diff
      } else {
        const entry = { id: 'a' + seq, path: path, kind: kind, type: extType(path), sessionId: sessionId, at: at, seq: seq }
        if (diff) entry.diff = diff
        artifacts.push(entry)
        if (artifacts.length > 1000) artifacts = artifacts.slice(-1000)
      }
    }

    // Resolve the workspace root for a specific tool execution: the agent's
    // session cwd wins, then the last-seen cwd, then the sandbox root.
    const execCwd = (exec) => {
      try {
        const agent = exec && exec.agent
        const c = agent && agent.session && agent.session.header && typeof agent.session.header.cwd === 'string' ? agent.session.header.cwd : ''
        if (c) return c
      } catch (e) {}
      if (typeof lastCwd === 'string' && lastCwd) return lastCwd
      try {
        const policy = ctx.get('sandboxPolicy')
        return policy && typeof policy.workspaceRoot === 'string' ? policy.workspaceRoot : undefined
      } catch (e) {}
      return undefined
    }

    // Recursively walk the workspace into a `path -> fingerprint` map. The
    // fingerprint is the fs backend's opaque version token (dev:ino:size:
    // mtime:ctime on the local backend), so any content/metadata change changes
    // the value. Returns null when the filesystem or root is unavailable.
    const snapshotWorkspace = async (cwd) => {
      const fs = ctx.get('fs')
      if (!fs || typeof fs.listDir !== 'function' || typeof fs.resolve !== 'function') return null
      if (typeof cwd !== 'string' || !cwd) return null
      const childPath = (target, parent, name) => (typeof fs.processPath === 'function' ? fs.processPath(target) : parent.replace(/\/+$/, '') + '/' + name)
      const map = new Map()
      let count = 0
      const walk = async (dirPath, depth) => {
        if (count >= SNAPSHOT_MAX_FILES || depth > SNAPSHOT_MAX_DEPTH) return
        let entries
        try {
          const target = await fs.resolve(dirPath)
          entries = await fs.listDir(target)
        } catch (e) {
          return // unreadable directory — skip it, never fatal
        }
        if (!entries) return
        for (const e of entries) {
          if (count >= SNAPSHOT_MAX_FILES) return
          if (e.type === 'directory') {
            if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
            await walk(childPath(e.target, dirPath, e.name), depth + 1)
          } else if (e.type === 'file') {
            count += 1
            map.set(childPath(e.target, dirPath, e.name), e.version !== undefined ? String(e.version) : 'size:' + (e.size ?? ''))
          }
        }
      }
      await walk(cwd, 0)
      return map
    }

    // New or changed files between two snapshots (deletions are irrelevant to
    // an artifact list).
    const diffSnapshot = (before, after) => {
      const changes = []
      for (const [path, fp] of after) {
        const prev = before.get(path)
        if (prev === undefined) changes.push({ path, kind: 'create' })
        else if (prev !== fp) changes.push({ path, kind: 'edit' })
      }
      return changes
    }

    const recordSnapshotDiff = (before, after, exec) => {
      let sessionId
      try {
        const agent = exec && exec.agent
        if (agent && agent.session && agent.session.id != null) sessionId = String(agent.session.id)
      } catch (e) {}
      const changes = diffSnapshot(before, after)
      for (const ch of changes) {
        try { recordFile(ch.path, ch.kind, sessionId, undefined) } catch (e) {}
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

    // Fill the gap the `tools/result` whitelist leaves open: `bash`/`pwsh` write
    // files as a side effect of the shell command, never through a `write`/`edit`
    // result. Snapshot the workspace before and after the body and record the
    // new/changed files. `tools/execute` is the around-dispatch wrapper, so
    // `next()` runs the body — the "before" is taken pre-body, "after" post-body.
    ctx.on('tools/execute', async (exec, next) => {
      if (!exec || !WATCH_TOOLS[exec.name]) return next()
      const cwd = execCwd(exec)
      const before = await snapshotWorkspace(cwd)
      let outcome
      try {
        outcome = await next()
        return outcome
      } finally {
        if (before && outcome && outcome.isError !== true) {
          try {
            const after = await snapshotWorkspace(cwd)
            if (after) recordSnapshotDiff(before, after, exec)
          } catch (e) {
            console.error('[artifacts] snapshot diff failed', e)
          }
        }
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
        return { ok: true, type: extType(path), content: text.slice(0, cap), truncated: text.length > cap, size: info.size }
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

    // Resolve the workspace root for a list request. A named session must
    // resolve to ITS OWN workspace: a freshly switched-to workspace may not be
    // live in the server's session store yet, so we also consult the persisted
    // corpus (sessionQuery) — and never substitute an unrelated "most recent"
    // workspace when the caller named a session. Only an unnamed request (the
    // standalone tab's first load, before its localStorage syncs) falls back to
    // a best-effort default.
    const resolveCwd = async (sessionId) => {
      const live = sessionCwd(sessionId)
      if (live) return live
      if (typeof sessionId === 'string' && sessionId) {
        try {
          const query = ctx.get('sessionQuery')
          if (query && typeof query.listSessions === 'function') {
            const records = await query.listSessions()
            if (records) {
              for (const rec of records) {
                const h = rec && rec.header
                if (h && h.id === sessionId && typeof h.cwd === 'string' && h.cwd) return h.cwd
              }
            }
          }
        } catch (e) {}
        return undefined // named but unresolvable — never substitute another workspace
      }
      const def = await defaultSessionCwd()
      if (def) return def
      if (typeof lastCwd === 'string' && lastCwd) return lastCwd
      try {
        const policy = ctx.get('sandboxPolicy')
        return policy && typeof policy.workspaceRoot === 'string' ? policy.workspaceRoot : undefined
      } catch (e) {}
      return undefined
    }

    // List one directory level for the file-tree (文件树) view: directories
    // first, then files, case-insensitive name order.
    const listDir = async (path, sessionId) => {
      const fs = ctx.get('fs')
      if (!fs) return { ok: false, error: 'filesystem unavailable' }
      try {
        const cwd = await resolveCwd(sessionId)
        let p = path
        if (typeof p !== 'string' || !p) {
          if (!cwd) return { ok: false, error: 'workspace unavailable' }
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
  /* Selected artifact: left accent bar distinguishes it from the file tree. */
  .item.active { background: var(--p-hover); box-shadow: inset 3px 0 0 var(--p-accent); }
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
  .tabs { display: flex; align-items: stretch; height: 34px; border-bottom: 2px solid #fff; background: var(--p-bg-layer-1); flex: none; }
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
  /* Code preview (syntax-highlighted) */
  .codeview { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .codeview-head { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid var(--p-border-l2); }
  .codeview-lang { font-size: 11px; font-weight: 600; color: var(--p-text-secondary); padding: 1px 8px; border-radius: 4px; background: var(--p-hover); }
  .codeview-scroll { flex: 1; min-height: 0; overflow: auto; display: flex; align-items: flex-start; background: var(--p-code-bg); }
  .codeview-gutter { flex: none; min-width: 3em; margin: 0; padding: 16px 10px 16px 12px; text-align: right; color: var(--p-text-caption); background: var(--p-code-bg); border-right: 1px solid var(--p-border-l1); position: sticky; left: 0; user-select: none; font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; }
  .codeview-pre { flex: 1; margin: 0; padding: 16px; background: var(--p-code-bg); font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; }
  .codeview-pre code { font: inherit; }
  .tok-comment { color: #868e96; }
  .tok-string { color: #2f9e44; }
  .tok-number, .tok-bool, .tok-variable, .tok-hex, .tok-attr { color: #e8590c; }
  .tok-keyword, .tok-important, .tok-atrule { color: #d6336c; }
  .tok-function, .tok-decorator { color: #6741d9; }
  .tok-class, .tok-builtin, .tok-tag, .tok-key { color: #1971c2; }
  .tok-property { color: #495057; }
  :root[data-ds-dark-theme] .tok-comment { color: #adb5bd; }
  :root[data-ds-dark-theme] .tok-string { color: #69db7c; }
  :root[data-ds-dark-theme] .tok-number, :root[data-ds-dark-theme] .tok-bool, :root[data-ds-dark-theme] .tok-variable, :root[data-ds-dark-theme] .tok-hex, :root[data-ds-dark-theme] .tok-attr { color: #ffa94d; }
  :root[data-ds-dark-theme] .tok-keyword, :root[data-ds-dark-theme] .tok-important, :root[data-ds-dark-theme] .tok-atrule { color: #faa2c1; }
  :root[data-ds-dark-theme] .tok-function, :root[data-ds-dark-theme] .tok-decorator { color: #b197fc; }
  :root[data-ds-dark-theme] .tok-class, :root[data-ds-dark-theme] .tok-builtin, :root[data-ds-dark-theme] .tok-tag, :root[data-ds-dark-theme] .tok-key { color: #74c0fc; }
  :root[data-ds-dark-theme] .tok-property { color: #ced4da; }
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
    // Shared self-contained syntax highlighter (portable JS, no template literals,
    // no interpolation, no backticks — safe to inline verbatim into the standalone
    // page's String.raw template). Emits span class tok-* tokens; color them in CSS.
    function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    function makeHl(specs, flags) {
      var src = '';
      for (var i = 0; i < specs.length; i += 1) src += (i ? '|' : '') + '(' + specs[i][1] + ')';
      var re = new RegExp(src, flags || 'g');
      return function (code) {
        re.lastIndex = 0;
        var out = '', last = 0, m;
        while ((m = re.exec(code)) !== null) {
          if (m.index > last) out += escHtml(code.slice(last, m.index));
          for (var g = 1; g < m.length; g += 1) {
            if (m[g] !== undefined) {
              out += '<span class="tok-' + specs[g - 1][0] + '">' + escHtml(m[g]) + '</span>';
              break;
            }
          }
          last = re.lastIndex;
          if (m[0].length === 0) { re.lastIndex += 1; last = re.lastIndex; }
        }
        if (last < code.length) out += escHtml(code.slice(last));
        return out;
      };
    }

    var S_DQ = "\"(?:[^\"\\\\\\n]|\\\\.)*\"";
    var S_SQ = "\\x27(?:[^\\x27\\\\\\n]|\\\\.)*\\x27";
    var S_BT = "\\x60(?:[^\\x60\\\\]|\\\\.)*\\x60";
    var NUM = "\\b(?:0[xX][0-9a-fA-F]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b";
    var C_LINE = "//[^\\n]*";
    var C_BLK = "/\\*[\\s\\S]*?\\*/";
    var HASH = "#[^\\n]*";
    var SQL_LINE = "--[^\\n]*";
    var HTML_COMMENT = "<!--[\\s\\S]*?-->";
    var PY_TRI = "(?:\"\"\"[\\s\\S]*?\"\"\"|\\x27\\x27\\x27[\\s\\S]*?\\x27\\x27\\x27)";
    var PY_STR = "(?:[rfbuRFBU]{0,2})(?:\"(?:[^\"\\\\\\n]|\\\\.)*\"|\\x27(?:[^\\x27\\\\\\n]|\\\\.)*\\x27)";
    var CSS_NUM = "\\b\\d+(?:\\.\\d+)?(?:[a-zA-Z%]*)\\b";
    var HEX = "#[0-9a-fA-F]{3,8}\\b";
    var AT = "@[\\w-]+";
    var PROP = "[\\w-]+(?=\\s*:)";
    var TAG = "</?[\\w-]+|/?>";
    var ATTR = "[\\w-]+(?==)";
    var VAR = "\\$(?:\\{[\\w]+\\}|[\\w]+)";
    var VAR_PHP = "\\$\\w+";
    var DECORATOR = "@[\\w.]+";
    var IMPORTANT = "!important\\b";
    var FUNC = "\\b[A-Za-z_$][\\w$]*(?=\\s*\\()";
    var FUNC_PY = "\\b[A-Za-z_][\\w]*(?=\\s*\\()";
    var CLASS = "\\b[A-Z][\\w$]*\\b";
    var YAML_KEY = "^\\s*(?:-\\s+)?[\\w.@-]+(?=\\s*:)";

    function kwWord(kw) { return '\\b(?:' + kw.replace(/\s+/g, '|') + ')\\b'; }

    var JS_KW = 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return static super switch this throw try typeof var void while with yield async await of get set null undefined true false';
    var PY_KW = 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None self';
    var SH_KW = 'if then elif else fi for while do done case esac function select in until return exit set unset export readonly local shift source';
    var SQL_KW = 'select from where insert into update delete create drop alter table index view join left right inner outer full on as and or not null group by order having limit offset union all distinct values set primary key foreign references default like between is in exists asc desc';
    var C_KW = 'auto break case const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while';
    var GO_KW = 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var';
    var RUST_KW = 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type union unsafe use where while';
    var JAVA_KW = 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while';
    var RB_KW = 'begin case class def do else elsif end ensure for if module next nil not or redo rescue retry return self super then true false undef unless until when while yield';
    var PHP_KW = 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global if implements include instanceof insteadof interface isset list namespace new or print private protected public require return static switch throw trait try unset use var while xor yield';

    function cFamily(kw) {
      return makeHl([
        ['comment', C_LINE + '|' + C_BLK],
        ['string', S_BT + '|' + S_DQ + '|' + S_SQ],
        ['number', NUM],
        ['keyword', kwWord(kw)],
        ['function', FUNC],
        ['class', CLASS],
      ]);
    }

    var HL_ENGINES = {
      js: makeHl([
        ['comment', C_LINE + '|' + C_BLK],
        ['string', S_BT + '|' + S_DQ + '|' + S_SQ],
        ['number', NUM],
        ['keyword', kwWord(JS_KW)],
        ['builtin', '\\b(?:console|Math|JSON|Promise|Array|Object|String|Number|Boolean|RegExp|Date|Map|Set|WeakMap|WeakSet|Symbol|BigInt|Infinity|NaN|window|document|process|require|module|exports|setTimeout|clearTimeout|fetch|globalThis)\\b'],
        ['function', FUNC],
        ['class', CLASS],
      ]),
      py: makeHl([
        ['comment', HASH],
        ['string', PY_TRI + '|' + PY_STR],
        ['number', NUM],
        ['keyword', kwWord(PY_KW)],
        ['builtin', '\\b(?:print|len|range|enumerate|zip|map|filter|int|str|float|bool|list|dict|set|tuple|type|isinstance|super|open|input|repr|format|sorted|reversed|sum|min|max|abs|round|any|all|next|iter|dir|vars|getattr|setattr|hasattr|id|hash|bytes|bytearray|complex|frozenset|object|classmethod|staticmethod|property|Exception|ValueError|TypeError|KeyError|IndexError|ImportError|RuntimeError|StopIteration)\\b'],
        ['decorator', DECORATOR],
        ['function', FUNC_PY],
      ]),
      css: makeHl([
        ['comment', C_BLK],
        ['string', S_DQ + '|' + S_SQ],
        ['atrule', AT],
        ['property', PROP],
        ['number', CSS_NUM],
        ['hex', HEX],
        ['important', IMPORTANT],
      ]),
      html: makeHl([
        ['comment', HTML_COMMENT],
        ['string', S_DQ + '|' + S_SQ],
        ['tag', TAG],
        ['attr', ATTR],
      ]),
      sh: makeHl([
        ['comment', HASH],
        ['string', S_DQ + '|' + S_SQ + '|' + S_BT],
        ['variable', VAR],
        ['number', NUM],
        ['keyword', kwWord(SH_KW)],
      ]),
      yaml: makeHl([
        ['comment', HASH],
        ['string', S_DQ + '|' + S_SQ],
        ['number', NUM],
        ['bool', '\\b(?:true|false|null|yes|no|on|off)\\b'],
        ['key', YAML_KEY],
      ], 'gm'),
      sql: makeHl([
        ['comment', SQL_LINE + '|' + C_BLK],
        ['string', S_SQ + '|' + S_DQ],
        ['number', NUM],
        ['keyword', kwWord(SQL_KW)],
        ['function', FUNC_PY],
      ], 'gi'),
      json: makeHl([
        ['string', S_DQ],
        ['number', NUM],
        ['bool', '\\b(?:true|false|null)\\b'],
      ]),
      c: cFamily(C_KW),
      cpp: cFamily(C_KW),
      go: cFamily(GO_KW),
      rust: cFamily(RUST_KW),
      java: cFamily(JAVA_KW),
      rb: makeHl([
        ['comment', HASH],
        ['string', S_DQ + '|' + S_SQ],
        ['number', NUM],
        ['keyword', kwWord(RB_KW)],
        ['function', FUNC_PY],
        ['class', CLASS],
      ]),
      php: makeHl([
        ['comment', C_LINE + '|' + C_BLK + '|' + HASH],
        ['string', S_DQ + '|' + S_SQ],
        ['variable', VAR_PHP],
        ['number', NUM],
        ['keyword', kwWord(PHP_KW)],
        ['function', FUNC_PY],
      ]),
    };

    var HL_LANG_MAP = {
      js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', javascript: 'js',
      ts: 'js', tsx: 'js', mts: 'js', cts: 'js', typescript: 'js',
      json: 'json', jsonc: 'json', json5: 'js',
      py: 'py', python: 'py', pyw: 'py',
      rb: 'rb', ruby: 'rb',
      go: 'go', golang: 'go',
      rs: 'rust', rust: 'rust',
      java: 'java',
      c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', cs: 'c', csharp: 'c',
      kotlin: 'c', kt: 'c', swift: 'c',
      php: 'php',
      yaml: 'yaml', yml: 'yaml', toml: 'sh', ini: 'sh', conf: 'sh', properties: 'sh', env: 'sh',
      md: 'md', markdown: 'md', mdx: 'md',
      html: 'html', htm: 'html', xhtml: 'html', vue: 'html', xml: 'html', svg: 'html',
      css: 'css', scss: 'css', less: 'css',
      sql: 'sql',
      lua: 'c',
      sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', fish: 'sh',
    };

    var HL_LANG_NAMES = {
      js: 'JavaScript', py: 'Python', css: 'CSS', html: 'HTML/XML', sh: 'Shell',
      yaml: 'YAML', sql: 'SQL', c: 'C/C++', cpp: 'C++', go: 'Go', rust: 'Rust',
      java: 'Java', rb: 'Ruby', php: 'PHP', json: 'JSON', plain: 'Text',
    };

    function hlLangOf(hint) {
      var h = String(hint || '').toLowerCase();
      if (h.charAt(0) === '.') h = h.slice(1);
      return HL_LANG_MAP[h] || 'plain';
    }

    function hlLangLabel(hint) { return HL_LANG_NAMES[hlLangOf(hint)] || 'Text'; }

    function highlightCode(src, hint) {
      var fn = HL_ENGINES[hlLangOf(hint)];
      return fn ? fn(String(src)) : escHtml(src);
    }

    var DATA_URL = '/popout-sidebar/data';
    var CONTENT_URL = '/popout-sidebar/content';
    var MEDIA_URL = '/popout-sidebar/media';
    var LISTDIR_URL = '/popout-sidebar/listdir';
    var _sm = /[?&]sessionId=([^&]+)/.exec(location.search);
    var _urlSessionId = _sm ? decodeURIComponent(_sm[1]) : '';
    var SESSION_KEY = 'dsh-popout-sidebar:session';
    function currentSessionId() {
      try {
        var v = localStorage.getItem(SESSION_KEY);
        if (v) return v;
      } catch (e) {}
      return _urlSessionId;
    }
    function listdirUrl(path) {
      var q = [];
      var sid = currentSessionId();
      if (sid) q.push('sessionId=' + encodeURIComponent(sid));
      if (path) q.push('path=' + encodeURIComponent(path));
      return LISTDIR_URL + (q.length ? '?' + q.join('&') : '');
    }
    var items = [];
    var selectedPath = null;
    var selectedItem = null;
    var treeRoot = null;
    var treeChildren = {};
    var treeExpanded = {};
    var currentView = 'artifacts';

    // Shared extension → preview-type helpers (portable JS: var/function, no
    // template literals, so this file can be inlined verbatim into the host Node
    // scope, the client bundle, and the standalone page's String.raw inline script).
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

    function fileExt(path) {
      var m = /\.([^.]+)$/.exec(String(path || ''));
      return m ? m[1].toLowerCase() : '';
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
    // Shared minimal Markdown → HTML renderer (portable JS, no template literals).
    // Backticks are written as \x60 so the file can be inlined verbatim into the
    // standalone page's String.raw template. Fenced code blocks are highlighted via
    // highlightCode from shared/highlight.js.
    function mdEscape(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function mdInline(s) {
      s = s.replace(/\x60([^\x60]+)\x60/g, function (m, c) { return '<code>' + c + '</code>'; });
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
        if (/^\s*\x60\x60\x60/.test(line)) {
          var fence = /^\s*\x60\x60\x60([\w+-]*)/.exec(line);
          var langHint = fence ? fence[1] : '';
          var buf = [];
          i += 1;
          while (i < lines.length && !/^\s*\x60\x60\x60/.test(lines[i])) { buf.push(lines[i]); i += 1; }
          i += 1;
          var codeText = buf.join('\n');
          out.push('<pre><code>' + highlightCode(codeText, langHint) + '</code></pre>');
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
          if (data.truncated) area.appendChild(el('div', 'diff-label', '(truncated preview)'));
          var ext = fileExt(path);
          var codeView = el('div', 'codeview');
          var head = el('div', 'codeview-head');
          head.appendChild(el('span', 'codeview-lang', hlLangLabel(ext)));
          codeView.appendChild(head);
          var scroll = el('div', 'codeview-scroll');
          var gutter = el('pre', 'codeview-gutter');
          gutter.setAttribute('aria-hidden', 'true');
          var lineCount = data.content.split('\n').length;
          var gutterText = '';
          for (var gi = 0; gi < lineCount; gi += 1) gutterText += (gi + 1) + (gi < lineCount - 1 ? '\n' : '');
          gutter.textContent = gutterText;
          var pre = el('pre', 'codeview-pre');
          var code = el('code');
          code.innerHTML = highlightCode(data.content, ext);
          pre.appendChild(code);
          scroll.appendChild(gutter);
          scroll.appendChild(pre);
          codeView.appendChild(scroll);
          area.appendChild(codeView);
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
      fetch(listdirUrl(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (res) {
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
        fetch(listdirUrl(path), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (res) {
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
    // Follow the active session in real time: the main tab publishes the
    // current session id to localStorage (SESSION_KEY) only when it actually
    // changes, so the storage event alone is enough — no polling.
    var _lastTreeSession = currentSessionId();
    function watchSession() {
      var sid = currentSessionId();
      if (sid !== _lastTreeSession) {
        _lastTreeSession = sid;
        if (treeRoot !== null) loadTreeRoot();
      }
    }
    window.addEventListener('storage', function (e) {
      if (e.key === SESSION_KEY) watchSession();
    });
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
