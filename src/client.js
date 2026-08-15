/**
 * 具有独立标签页的侧边栏 · Standalone Tab Sidebar — Client bundle
 *
 * Static client bundle for the DSH web profile, served by the web app at
 * `/plugins/dsh-standalone-tab-sidebar/client.js` and registered through the
 * browser `window.__ModuleLoader__`. The `factory` provides the closure
 * symbols the dynamic runner injects (`React`, `styles`, `host`) so the
 * canonical plugin body below works unchanged in both modes: as this bundle,
 * or extracted (the `return { ... }` inside) and passed to `cordis_define`
 * as `code.client`.
 *
 * Responsibilities (runs in the browser):
 *  - Register the「产物」trigger button in `conversation.session.header.utilities`.
 *  - Render the floating sidebar panel in `shell.overlay`.
 *  - Pull data from the Host through the `host.call` façade below, which maps
 *    the dynamic RPC methods onto the host's `/artifacts-panel/*` routes.
 */

window.__ModuleLoader__.load({
  id: 'dsh-standalone-tab-sidebar',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // Closure symbols — the same names the dynamic runner injects.
    const React = require('react')

    const styles = {
      insert(css) {
        if (typeof document === 'undefined') return
        const id = 'dsh-standalone-tab-sidebar-styles'
        if (document.getElementById(id)) return
        const el = document.createElement('style')
        el.id = id
        el.textContent = css
        document.head.appendChild(el)
      },
    }

    const host = {
      call(method, args) {
        if (method === 'artifacts.list') {
          return fetch('/artifacts-panel/data').then((r) => r.json())
        }
        if (method === 'artifacts.read') {
          const path = args && typeof args.path === 'string' ? args.path : ''
          return fetch('/artifacts-panel/content?path=' + encodeURIComponent(path)).then((r) => r.json())
        }
        if (method === 'artifacts.remove') {
          const path = args && typeof args.path === 'string' ? args.path : ''
          return fetch('/artifacts-panel/remove?path=' + encodeURIComponent(path), { method: 'POST' }).then((r) => r.json())
        }
        return Promise.reject(new Error('standalone-tab-sidebar: unknown host method ' + method))
      },
    }

    // Canonical plugin body — extract this `return { ... }` for cordis_define.
    const plugin = (() => {
      return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    const basename = (p) => {
      const parts = String(p).split('/')
      return parts[parts.length - 1] || p
    }

    const fallbackCopy = (text) => {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch (e) {}
    }

    // Shared open/close state between the header trigger and the floating panel.
    const store = {
      open: false,
      listeners: [],
      setOpen(v) {
        if (this.open === v) return
        this.open = v
        this.listeners.forEach((fn) => { try { fn(v) } catch (e) {} })
      },
      toggle() { this.setOpen(!this.open) },
      subscribe(fn) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter((f) => f !== fn) }
      },
    }

    const useOpen = () => {
      const [open, setOpen] = React.useState(store.open)
      React.useEffect(() => store.subscribe(setOpen), [])
      return open
    }

    // Feature settings, persisted in localStorage so they survive reloads.
    const SETTINGS_KEY = 'dsh-standalone-tab-sidebar:settings'
    const DEFAULT_SETTINGS = {
      autoRefresh: true,       // poll the artifact list while the panel is open
      minPanelWidth: 30,       // minimum panel width as % of window width
    }

    function loadSettings() {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') return Object.assign({}, DEFAULT_SETTINGS, parsed)
        }
      } catch (e) {}
      return Object.assign({}, DEFAULT_SETTINGS)
    }

    const settingsStore = {
      data: loadSettings(),
      listeners: [],
      get() { return this.data },
      set(key, value) {
        const next = Object.assign({}, this.data, { [key]: value })
        this.data = next
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)) } catch (e) {}
        this.listeners.forEach((fn) => { try { fn(next) } catch (e) {} })
      },
      subscribe(fn) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter((f) => f !== fn) }
      },
    }

    const useSettings = () => {
      const [s, setS] = React.useState(settingsStore.get())
      React.useEffect(() => settingsStore.subscribe(setS), [])
      return s
    }

    const popoutScheme = () => {
      const theme = ctx.get('theme')
      if (theme && theme.getTheme) {
        const snap = theme.getTheme()
        if (snap && snap.active && snap.active.colorScheme) return snap.active.colorScheme
      }
      return 'dark'
    }

    styles.insert(`
.artifacts-panel {
  position: fixed; top: 0; right: var(--dsh-sidebar-width, 0px); bottom: 0; width: 30vw; max-width: calc(100vw - 24px); min-width: 0;
  display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  border-left: 1px solid var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-shadow-lv2);
  pointer-events: auto; z-index: 9999;
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif);
  font-size: 13px; line-height: 1.5;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
.artifacts-head {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px; flex: none;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
}
.artifacts-title { font-weight: 600; font-size: 13px; color: var(--dsw-alias-label-primary); }
.artifacts-count { color: var(--dsw-alias-label-caption); font-size: 12px; }
.artifacts-spacer { flex: 1; }
.artifacts-link { color: var(--dsw-alias-state-business-primary); text-decoration: none; font-size: 15px; padding: 2px 8px; border-radius: 6px; }
.artifacts-link:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-iconbtn {
  background: transparent; border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary); border-radius: 6px; padding: 2px 8px;
  cursor: pointer; font-size: 12px;
}
.artifacts-iconbtn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-body { flex: 1 1 45%; min-height: 0; overflow-y: auto; }
.artifacts-empty { padding: 28px 16px; color: var(--dsw-alias-label-tertiary); text-align: center; }
.artifacts-item {
  display: block; width: 100%; text-align: left; padding: 9px 12px;
  border: none; border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: inherit; cursor: pointer; font: inherit;
}
.artifacts-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-item.is-active { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-item-row { display: flex; align-items: center; gap: 8px; }
.artifacts-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; flex: none; }
.artifacts-badge-create { background: var(--dsw-alias-state-success-tertiary); color: var(--dsw-alias-state-success-primary); }
.artifacts-badge-edit { background: var(--dsw-alias-state-warn-tertiary); color: var(--dsw-alias-state-warn-label); }
.artifacts-item-base { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifacts-item-full {
  color: var(--dsw-alias-label-tertiary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  margin-top: 2px; font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
.artifacts-preview { flex: 1 1 55%; min-height: 0; display: flex; flex-direction: column; }
.artifacts-pre {
  flex: 1; margin: 0; overflow: auto; padding: 12px;
  font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px; line-height: 1.55; white-space: pre;
  color: var(--dsw-alias-label-secondary);
}
.artifacts-hint { padding: 24px 16px; color: var(--dsw-alias-label-tertiary); text-align: center; }
.artifacts-error { padding: 16px; color: var(--dsw-alias-state-error-primary); font-family: var(--dsh-font-mono, monospace); word-break: break-all; }
.artifacts-headbtn {
  border: 1px solid var(--dsw-alias-border-l2);
  height: 32px; color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family); cursor: pointer; background: transparent;
  border-radius: 18px; align-items: center; gap: 4px; padding: 6px 12px;
  font-size: 13px; line-height: 20px; display: inline-flex;
}
.artifacts-headbtn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-headbtn.is-open { color: var(--dsw-alias-state-business-primary); border-color: var(--dsw-alias-state-business-primary); }
.artifacts-item { display: flex; align-items: stretch; padding: 0; cursor: default; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-item.is-active { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-item-main { flex: 1; min-width: 0; text-align: left; padding: 9px 12px; border: none; background: transparent; color: inherit; cursor: pointer; font: inherit; }
.artifacts-item-actions { display: flex; align-items: center; gap: 2px; padding-right: 6px; opacity: 0; }
.artifacts-item:hover .artifacts-item-actions { opacity: 1; }
.artifacts-minibtn { border: none; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; font-size: 12px; padding: 2px 6px; border-radius: 4px; }
.artifacts-minibtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-notice { color: var(--dsw-alias-state-business-primary); font-size: 12px; }
.artifacts-preview-body { flex: 1; min-height: 0; overflow-y: auto; }
.artifacts-img { display: block; max-width: 100%; max-height: 70vh; object-fit: contain; margin: 12px; }
.artifacts-iframe { width: 100%; height: 100%; min-height: 360px; border: 0; background: #fff; }
.artifacts-markdown { padding: 12px 14px; line-height: 1.6; word-wrap: break-word; font-size: 13px; }
.artifacts-markdown h1, .artifacts-markdown h2, .artifacts-markdown h3, .artifacts-markdown h4, .artifacts-markdown h5, .artifacts-markdown h6 { margin: 14px 0 8px; line-height: 1.3; }
.artifacts-markdown h1 { font-size: 1.45em; border-bottom: 1px solid var(--dsw-alias-border-l2); padding-bottom: 6px; }
.artifacts-markdown h2 { font-size: 1.25em; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 4px; }
.artifacts-markdown code { background: var(--dsw-alias-bg-layer-1); padding: 1px 5px; border-radius: 4px; font-family: var(--dsh-font-mono, ui-monospace, monospace); font-size: 0.9em; }
.artifacts-markdown pre { background: var(--dsw-alias-bg-layer-1); padding: 10px 12px; border-radius: 6px; overflow: auto; }
.artifacts-markdown pre code { background: transparent; padding: 0; }
.artifacts-markdown img { max-width: 100%; }
.artifacts-markdown blockquote { border-left: 3px solid var(--dsw-alias-border-l2); margin: 8px 0; padding: 2px 12px; color: var(--dsw-alias-label-secondary); }
.artifacts-markdown ul, .artifacts-markdown ol { padding-left: 24px; }
.artifacts-markdown a { color: var(--dsw-alias-state-business-primary); }
.artifacts-diff { border-top: 1px solid var(--dsw-alias-border-l2); }
.artifacts-diff-block { border-bottom: 1px solid var(--dsw-alias-border-l1); }
.artifacts-diff-label { font-size: 11px; padding: 4px 12px; font-weight: 600; }
.artifacts-diff-del .artifacts-diff-label { color: var(--dsw-alias-state-error-primary); background: rgba(236,19,19,0.06); }
.artifacts-diff-add .artifacts-diff-label { color: var(--dsw-alias-state-success-primary); background: rgba(34,197,94,0.08); }
.artifacts-diff-pre { margin: 0; padding: 8px 12px; font: 12px/1.5 var(--dsh-font-mono, ui-monospace, monospace); white-space: pre-wrap; word-break: break-word; color: var(--dsw-alias-label-secondary); }
.artifacts-diff-del .artifacts-diff-pre { background: rgba(236,19,19,0.05); }
.artifacts-diff-add .artifacts-diff-pre { background: rgba(34,197,94,0.06); }
.artifacts-panel { transition: right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease); }
.artifacts-panel.artifacts-resizing { transition: none; user-select: none; }

/* Resize handle on the panel's left edge */
.artifacts-resize { position: absolute; left: -4px; top: 0; bottom: 0; width: 8px; cursor: col-resize; z-index: 3; touch-action: none; }
.artifacts-resize::after { content: ''; position: absolute; left: 3px; top: 0; bottom: 0; width: 2px; background: transparent; transition: background .15s; }
.artifacts-resize:hover::after, .artifacts-resize:active::after { background: var(--dsw-alias-interactive-bg-hover-accent); }

/* Divider between the artifact list and the preview (drag to resize) */
.artifacts-splitter { flex: none; height: 6px; cursor: row-resize; position: relative; z-index: 2; touch-action: none; background: transparent; border-top: 1px solid var(--dsw-alias-border-l2); }
.artifacts-splitter::after { content: ''; position: absolute; left: 0; right: 0; top: 2px; height: 2px; background: transparent; transition: background .15s; }
.artifacts-splitter:hover::after, .artifacts-splitter.artifacts-splitting::after { background: var(--dsw-alias-interactive-bg-hover-accent); }
.artifacts-splitter.artifacts-splitting { user-select: none; }

/* Settings section */
.artifacts-settings { display: flex; flex-direction: column; gap: 14px; width: 100%; height: 100%; min-height: 0; overflow-y: auto; padding-bottom: 24px; }
.artifacts-setintro { color: var(--dsw-alias-label-tertiary); margin: 0; padding: 0 2px; font-size: 13px; line-height: 20px; }
.artifacts-setgroup { border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-3); border-radius: 16px; padding: 6px 20px; display: flex; flex-direction: column; flex: none; }
.artifacts-setrow { border-bottom: 1px solid var(--dsw-alias-border-l2); justify-content: space-between; align-items: center; gap: 16px; padding: 12px 2px; display: flex; }
.artifacts-setrow:last-child { border-bottom: none; }
.artifacts-settext { flex-direction: column; gap: 4px; min-width: 0; display: flex; }
.artifacts-settitle { color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 22px; }
.artifacts-setdesc { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.artifacts-switch { cursor: pointer; flex: none; display: inline-flex; position: relative; }
.artifacts-switch input { opacity: 0; width: 1px; height: 1px; margin: 0; position: absolute; }
.artifacts-switch-track { box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); border-radius: 10px; align-items: center; width: 36px; height: 20px; padding: 2px; transition: background .15s, border-color .15s; display: inline-flex; }
.artifacts-switch-thumb { background: var(--dsw-alias-label-secondary); border-radius: 50%; width: 14px; height: 14px; transition: transform .15s, background .15s; display: block; }
.artifacts-switch:hover .artifacts-switch-track { border-color: var(--dsw-alias-label-dimmed); }
.artifacts-switch input:checked + .artifacts-switch-track { border-color: var(--dsw-alias-button-primary-fill); background: var(--dsw-alias-button-primary-fill); }
.artifacts-switch input:checked + .artifacts-switch-track .artifacts-switch-thumb { background: var(--dsw-alias-bg-layer-3); transform: translate(16px); }
.artifacts-switch input:focus-visible + .artifacts-switch-track { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.artifacts-setcontrol { flex: none; align-items: center; gap: 6px; display: flex; }
.artifacts-widthinput { width: 76px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; border-radius: 6px; padding: 4px 8px; }
.artifacts-suffix { color: var(--dsw-alias-label-secondary); font-size: 14px; line-height: 22px; }

/* Delete mode */
.artifacts-delete-hint { padding: 6px 12px; font-size: 12px; color: var(--dsw-alias-state-error-primary); background: rgba(236,19,19,0.08); border-bottom: 1px solid var(--dsw-alias-border-l2); flex: none; }
.artifacts-iconbtn.artifacts-delete-on { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); background: rgba(236,19,19,0.08); }
.artifacts-item.is-delete-marked { outline: 2px solid var(--dsw-alias-state-error-primary); outline-offset: -2px; background: rgba(236,19,19,0.06); }
.artifacts-item.is-delete-marked .artifacts-item-actions { opacity: 1; }
.artifacts-delete-x { color: var(--dsw-alias-state-error-primary); font-size: 16px; font-weight: 700; line-height: 1; }
.artifacts-delete-x:hover { background: rgba(236,19,19,0.12); color: var(--dsw-alias-state-error-primary); }
`)

    const PANEL_PATH = 'M9.67272 0.522841C10.8339 0.522841 11.76 0.522714 12.4963 0.602493C13.2453 0.683657 13.8789 0.854248 14.4264 1.25197C14.7504 1.48739 15.0355 1.77247 15.2709 2.0965C15.6686 2.64394 15.8392 3.27758 15.9204 4.02655C16.0002 4.7629 16 5.68895 16 6.85014V9.14986C16 10.3111 16.0002 11.2371 15.9204 11.9735C15.8392 12.7224 15.6686 13.3561 15.2709 13.9035C15.0355 14.2275 14.7504 14.5126 14.4264 14.748C13.8789 15.1458 13.2453 15.3163 12.4963 15.3975C11.76 15.4773 10.8339 15.4772 9.67272 15.4772H6.3273C5.16611 15.4772 4.24006 15.4773 3.50371 15.3975C2.75474 15.3163 2.1211 15.1458 1.57366 14.748C1.24963 14.5126 0.964549 14.2275 0.729131 13.9035C0.331407 13.3561 0.160817 12.7224 0.0796529 11.9735C-0.000126137 11.2371 1.25338e-09 10.3111 1.25338e-09 9.14986V6.85014C1.25329e-09 5.68895 -0.000126137 4.7629 0.0796529 4.02655C0.160817 3.27758 0.331407 2.64394 0.729131 2.0965C0.964549 1.77247 1.24963 1.48739 1.57366 1.25197C2.1211 0.854248 2.75474 0.683657 3.50371 0.602493C4.24006 0.522714 5.16611 0.522841 6.3273 0.522841H9.67272ZM5.54303 1.88715V14.1118C5.78636 14.1128 6.04709 14.1169 6.3273 14.1169H9.67272C10.8639 14.1169 11.7032 14.1164 12.3493 14.0465C12.9824 13.9779 13.3497 13.8494 13.6268 13.6482C13.8354 13.4966 14.0195 13.3125 14.1711 13.1039C14.3723 12.8268 14.5007 12.4595 14.5693 11.8264C14.6393 11.1803 14.6398 10.341 14.6398 9.14986V6.85014C14.6398 5.65896 14.6393 4.81967 14.5693 4.1736C14.5007 3.54048 14.3723 3.17318 14.1711 2.89609C14.0195 2.68747 13.8354 2.50337 13.6268 2.35179C13.3497 2.1506 12.9824 2.02212 12.3493 1.95353C11.7032 1.88358 10.8639 1.88307 9.67272 1.88307H6.3273C6.04709 1.88307 5.78636 1.8862 5.54303 1.88715ZM4.1828 1.91166C3.99125 1.9216 3.8148 1.93577 3.65076 1.95353C3.01764 2.02212 2.65034 2.1506 2.37325 2.35179C2.16463 2.50337 1.98052 2.68747 1.82895 2.89609C1.62776 3.17318 1.49928 3.54048 1.43069 4.1736C1.36074 4.81967 1.36023 5.65896 1.36023 6.85014V9.14986C1.36023 10.341 1.36074 11.1803 1.43069 11.8264C1.49928 12.4595 1.62776 12.8268 1.82895 13.1039C1.98052 13.3125 2.16463 13.4966 2.37325 13.6482C2.65034 13.8494 3.01764 13.9779 3.65076 14.0465C3.81478 14.0642 3.99127 14.0774 4.1828 14.0873V1.91166Z'

    const PanelIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    }, React.createElement('path', { fillRule: 'evenodd', clipRule: 'evenodd', d: PANEL_PATH, fill: 'currentColor' }))

    const mdEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const mdInline = (s) => {
      s = s.replace(/`([^`]+)`/g, (m, c) => '<code>' + c + '</code>')
      s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">')
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      return s
    }
    const mdToHtml = (src) => {
      const lines = String(src || '').replace(/\r\n/g, '\n').split('\n')
      const out = []
      let i = 0
      while (i < lines.length) {
        const line = lines[i]
        if (/^\s*```/.test(line)) {
          const buf = []
          i += 1
          while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i += 1 }
          i += 1
          out.push('<pre><code>' + mdEscape(buf.join('\n')) + '</code></pre>')
          continue
        }
        const h = /^(#{1,6})\s+(.*)$/.exec(line)
        if (h) { const lv = h[1].length; out.push('<h' + lv + '>' + mdInline(mdEscape(h[2])) + '</h' + lv + '>'); i += 1; continue }
        if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { out.push('<hr>'); i += 1; continue }
        if (/^\s*>\s?/.test(line)) {
          const q = []
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i += 1 }
          out.push('<blockquote>' + mdInline(mdEscape(q.join(' '))) + '</blockquote>')
          continue
        }
        if (/^\s*[-*+]\s+/.test(line)) {
          const lis = []
          while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { lis.push(mdInline(mdEscape(lines[i].replace(/^\s*[-*+]\s+/, '')))); i += 1 }
          out.push('<ul>' + lis.map((x) => '<li>' + x + '</li>').join('') + '</ul>')
          continue
        }
        if (/^\s*\d+\.\s+/.test(line)) {
          const lis2 = []
          while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { lis2.push(mdInline(mdEscape(lines[i].replace(/^\s*\d+\.\s+/, '')))); i += 1 }
          out.push('<ol>' + lis2.map((x) => '<li>' + x + '</li>').join('') + '</ol>')
          continue
        }
        if (line.trim() === '') { i += 1; continue }
        out.push('<p>' + mdInline(mdEscape(line)) + '</p>')
        i += 1
      }
      return out.join('\n')
    }

    const renderDiff = (diff) => {
      const children = []
      if (diff && diff.before != null && diff.before !== '') {
        children.push(React.createElement('div', { key: 'del', className: 'artifacts-diff-block artifacts-diff-del' },
          React.createElement('div', { className: 'artifacts-diff-label' }, '- 删除'),
          React.createElement('pre', { className: 'artifacts-diff-pre' }, diff.before),
        ))
      }
      children.push(React.createElement('div', { key: 'add', className: 'artifacts-diff-block artifacts-diff-add' },
        React.createElement('div', { className: 'artifacts-diff-label' }, '+ 新增'),
        React.createElement('pre', { className: 'artifacts-diff-pre' }, diff && diff.after != null ? diff.after : ''),
      ))
      return React.createElement('div', { className: 'artifacts-diff' }, children)
    }

    const renderPreview = (p) => {
      if (p.loading) return React.createElement('div', { className: 'artifacts-hint' }, '加载中…')
      if (p.ok === false) return React.createElement('div', { className: 'artifacts-error' }, p.error || '读取失败')
      const type = p.type || 'text'
      const body = []
      if (type === 'image') {
        body.push(React.createElement('img', {
          key: 'img', className: 'artifacts-img',
          src: '/artifacts-panel/media?path=' + encodeURIComponent(p.path || ''),
          alt: p.path || '',
        }))
      } else if (type === 'html') {
        body.push(React.createElement('iframe', {
          key: 'iframe', className: 'artifacts-iframe',
          sandbox: 'allow-scripts', srcDoc: p.content || '', title: p.path || '',
        }))
      } else if (type === 'markdown') {
        body.push(React.createElement('div', {
          key: 'md', className: 'artifacts-markdown',
          dangerouslySetInnerHTML: { __html: mdToHtml(p.content) },
        }))
      } else {
        body.push(React.createElement('pre', { key: 'pre', className: 'artifacts-pre' }, p.content))
        if (p.truncated) body.push(React.createElement('div', { key: 'trunc', className: 'artifacts-diff-label' }, '(truncated preview)'))
      }
      if (p.diff) body.unshift(renderDiff(p.diff))
      return React.createElement('div', { className: 'artifacts-preview-body' }, body)
    }

    const ArtifactsPanel = () => {
      const open = useOpen()
      const settings = useSettings()
      const [items, setItems] = React.useState([])
      const [error, setError] = React.useState(null)
      const [preview, setPreview] = React.useState(null)
      const [notice, setNotice] = React.useState('')
      const [deleteMode, setDeleteMode] = React.useState(false)
      const [deleteTarget, setDeleteTarget] = React.useState(null)
      const [panelWidth, setPanelWidth] = React.useState(null) // null = use min
      const [resizing, setResizing] = React.useState(false)
      const [split, setSplit] = React.useState(0.45) // list/preview split ratio
      const [splitting, setSplitting] = React.useState(false)
      const bodyRef = React.useRef(null)
      const previewRef = React.useRef(null)
      const noticeTimer = React.useRef(null)

      React.useEffect(() => {
        if (!open) return
        let alive = true
        const load = () => {
          host.call('artifacts.list').then((res) => {
            if (!alive) return
            setItems(res && Array.isArray(res.artifacts) ? res.artifacts : [])
            setError(null)
          }).catch((e) => {
            if (alive) setError(e && e.message ? String(e.message) : String(e))
          })
        }
        load()
        let dispose
        if (settings.autoRefresh) dispose = ctx.interval(load, 2000)
        return () => { alive = false; if (dispose) dispose() }
      }, [open, settings.autoRefresh])

      if (!open) return null

      const popoutHref = '/artifacts-panel?scheme=' + popoutScheme()

      // Panel width: at least `minPanelWidth`% of the window, wider via dragging
      // the left edge. `panelWidth` holds the drag result (px); null → use the
      // configured minimum.
      const minWidthPx = Math.max(80, Math.round(window.innerWidth * (settings.minPanelWidth || 0) / 100))
      const widthPx = panelWidth != null ? Math.max(panelWidth, minWidthPx) : minWidthPx

      const startResize = (e) => {
        e.preventDefault()
        setResizing(true)
        const rightOffset = (() => {
          const v = document.documentElement.style.getPropertyValue('--dsh-sidebar-width')
          const n = parseFloat(v)
          return Number.isFinite(n) ? n : 0
        })()
        const onMove = (ev) => {
          const w = window.innerWidth - ev.clientX - rightOffset
          setPanelWidth(Math.max(minWidthPx, Math.min(w, window.innerWidth - rightOffset - 24)))
        }
        const onUp = () => {
          setResizing(false)
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      }

      const startSplit = (e) => {
        e.preventDefault()
        setSplitting(true)
        const bodyEl = bodyRef.current
        const previewEl = previewRef.current
        if (!bodyEl || !previewEl) return
        const top = bodyEl.getBoundingClientRect().top
        const bottom = previewEl.getBoundingClientRect().bottom
        const onMove = (ev) => {
          const ratio = (ev.clientY - top) / (bottom - top)
          setSplit(Math.max(0.15, Math.min(0.85, ratio)))
        }
        const onUp = () => {
          setSplitting(false)
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      }

      const flash = (msg) => {
        setNotice(msg)
        clearTimeout(noticeTimer.current)
        noticeTimer.current = setTimeout(() => setNotice(''), 1600)
      }
      const copyText = (text, msg) => {
        const done = () => flash(msg)
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done() })
        } else { fallbackCopy(text); done() }
      }
      const quoteToComposer = (path) => {
        try {
          const sessions = ctx.get('sessions')
          const conversation = ctx.get('conversation')
          if (!sessions || !conversation) return false
          let sessionId
          const list = sessions.list
          if (list && typeof list.getSnapshot === 'function') {
            const snap = list.getSnapshot()
            sessionId = snap && (snap.current != null ? snap.current : snap.active)
          }
          if (sessionId == null) return false
          const actx = typeof sessions.scope === 'function' ? sessions.scope(sessionId) : undefined
          if (!actx) return false
          const input = conversation.input && typeof conversation.input.for === 'function' ? conversation.input.for(actx) : undefined
          if (!input || typeof input.setDraft !== 'function') return false
          let draft = ''
          try {
            if (input.state && typeof input.state.getSnapshot === 'function') draft = input.state.getSnapshot().draft || ''
          } catch (e) {}
          const text = '@' + path
          input.setDraft(draft && draft.trim() !== '' ? draft + ' ' + text : text)
          return true
        } catch (e) {
          return false
        }
      }
      const quotePath = (path) => {
        if (quoteToComposer(path)) { flash('已插入输入框'); return }
        copyText('@' + path, '已复制 @引用（未能写入输入框）')
      }

      const remove = (path) => {
        host.call('artifacts.remove', { path }).then((res) => {
          if (res && res.ok) {
            setItems((prev) => prev.filter((x) => x.path !== path))
            if (preview && preview.path === path) setPreview(null)
            setDeleteTarget(null)
            flash('已删除')
          } else {
            flash((res && res.error) || '删除失败')
          }
        }).catch(() => flash('删除失败'))
      }

      const select = (it) => {
        const base = { path: it.path, type: it.type || 'text', diff: it.diff }
        if (base.type === 'image') {
          setPreview(Object.assign({}, base, { loading: false }))
          return
        }
        setPreview(Object.assign({}, base, { loading: true }))
        host.call('artifacts.read', { path: it.path }).then((res) => {
          setPreview(Object.assign({}, base, { loading: false }, res))
        }).catch((e) => {
          setPreview(Object.assign({}, base, { loading: false, ok: false, error: String(e && e.message ? e.message : e) }))
        })
      }

      const listChildren = []
      if (!items.length) {
        listChildren.push(React.createElement('div', { key: 'empty', className: 'artifacts-empty' }, '暂无产物 — 代理创建/编辑的文件会出现在这里。'))
      }
      items.forEach((it) => {
        const isDeleteMarked = deleteMode && deleteTarget === it.path
        listChildren.push(React.createElement('div', {
          key: it.id || it.path,
          className: 'artifacts-item' +
            (preview && preview.path === it.path ? ' is-active' : '') +
            (isDeleteMarked ? ' is-delete-marked' : ''),
        },
          React.createElement('button', {
            type: 'button',
            className: 'artifacts-item-main',
            onClick: () => {
              if (deleteMode) setDeleteTarget(isDeleteMarked ? null : it.path)
              else select(it)
            },
          },
            React.createElement('div', { className: 'artifacts-item-row' },
              React.createElement('span', { className: 'artifacts-badge artifacts-badge-' + it.kind }, it.kind === 'create' ? '新建' : '编辑'),
              React.createElement('span', { className: 'artifacts-item-base' }, basename(it.path)),
            ),
            React.createElement('div', { className: 'artifacts-item-full' }, it.path),
          ),
          React.createElement('div', { className: 'artifacts-item-actions' },
            isDeleteMarked ? React.createElement('button', {
              type: 'button',
              className: 'artifacts-minibtn artifacts-delete-x',
              title: '删除该产物',
              onClick: () => remove(it.path),
            }, '×') : null,
            deleteMode ? null : React.createElement('button', { type: 'button', className: 'artifacts-minibtn', title: '复制路径', onClick: () => copyText(it.path, '已复制路径') }, '⧉'),
            deleteMode ? null : React.createElement('button', { type: 'button', className: 'artifacts-minibtn', title: '@引用到输入框', onClick: () => quotePath(it.path) }, '@'),
          ),
        ))
      })

      return React.createElement('div', {
        className: 'artifacts-panel' + (resizing ? ' artifacts-resizing' : ''),
        style: { width: widthPx },
        role: 'dialog', 'aria-label': 'Artifacts',
      },
        React.createElement('div', {
          className: 'artifacts-resize',
          title: '拖动调整宽度',
          onMouseDown: startResize,
        }),
        React.createElement('div', { className: 'artifacts-head' },
          React.createElement('span', { className: 'artifacts-title' }, '产物 Artifacts'),
          React.createElement('span', { className: 'artifacts-count' }, String(items.length)),
          notice ? React.createElement('span', { className: 'artifacts-notice' }, notice) : null,
          React.createElement('span', { className: 'artifacts-spacer' }),
          React.createElement('a', {
            className: 'artifacts-link',
            href: popoutHref,
            target: '_blank',
            rel: 'noreferrer noopener',
            title: '在新标签页打开（可拖到另一块显示器）',
          }, '↗'),
          React.createElement('button', {
            type: 'button',
            className: 'artifacts-iconbtn' + (deleteMode ? ' artifacts-delete-on' : ''),
            title: deleteMode ? '退出删除模式' : '删除模式',
            onClick: () => { setDeleteMode(!deleteMode); setDeleteTarget(null) },
          }, '删除'),
          React.createElement('button', { type: 'button', className: 'artifacts-iconbtn', title: '关闭', onClick: () => store.setOpen(false) }, '×'),
        ),
        React.createElement('div', {
          className: 'artifacts-body',
          ref: bodyRef,
          style: { flex: '0 0 ' + (split * 100) + '%' },
        },
          deleteMode ? React.createElement('div', { className: 'artifacts-delete-hint' }, '删除模式：点击产物标记，再点红色 × 删除') : null,
          listChildren,
        ),
        React.createElement('div', {
          className: 'artifacts-splitter' + (splitting ? ' artifacts-splitting' : ''),
          title: '拖动调整产物列表与预览的分界',
          onMouseDown: startSplit,
        }),
        React.createElement('div', {
          className: 'artifacts-preview',
          ref: previewRef,
          style: { flex: '1 1 0%' },
        },
          preview ? renderPreview(preview) : React.createElement('div', { className: 'artifacts-hint' }, '← 点击左侧文件预览内容'),
        ),
      )
    }

    const HeaderAction = () => {
      const open = useOpen()
      return React.createElement('button', {
        type: 'button',
        className: 'artifacts-headbtn' + (open ? ' is-open' : ''),
        title: 'Artifacts · 产物',
        onClick: () => store.toggle(),
      },
        PanelIcon(16),
        React.createElement('span', null, '产物'),
      )
    }

    const SettingsToggle = (props) =>
      React.createElement('div', { className: 'artifacts-setrow' },
        React.createElement('div', { className: 'artifacts-settext' },
          React.createElement('div', { className: 'artifacts-settitle' }, props.label),
          React.createElement('div', { className: 'artifacts-setdesc' }, props.desc),
        ),
        React.createElement('label', { className: 'artifacts-switch' },
          React.createElement('input', {
            type: 'checkbox',
            checked: props.value,
            'aria-label': props.label,
            onChange: (e) => props.onToggle(e.currentTarget.checked),
          }),
          React.createElement('span', { className: 'artifacts-switch-track', 'aria-hidden': 'true' },
            React.createElement('span', { className: 'artifacts-switch-thumb' }),
          ),
        ),
      )

    const SettingsSection = () => {
      const settings = useSettings()
      const set = (key, value) => settingsStore.set(key, value)

      return React.createElement('div', { className: 'artifacts-settings' },
        React.createElement('p', { className: 'artifacts-setintro' }, '管理「单页侧卡」的显示与行为。'),
        React.createElement('div', { className: 'artifacts-setgroup' },
          React.createElement(SettingsToggle, {
            label: '自动刷新',
            desc: '面板打开时定时拉取最新产物列表。',
            value: settings.autoRefresh,
            onToggle: (v) => set('autoRefresh', v),
          }),
          React.createElement('div', { className: 'artifacts-setrow' },
            React.createElement('div', { className: 'artifacts-settext' },
              React.createElement('div', { className: 'artifacts-settitle' }, '最短面板宽度'),
              React.createElement('div', { className: 'artifacts-setdesc' }, '面板的最小宽度（占窗口宽度的百分比，20–60）；更宽可通过拖动面板左边缘调整。'),
            ),
            React.createElement('div', { className: 'artifacts-setcontrol' },
              React.createElement('input', {
                type: 'number',
                className: 'artifacts-widthinput',
                min: 20,
                max: 60,
                value: settings.minPanelWidth,
                onChange: (e) => {
                  const n = parseInt(e.currentTarget.value, 10)
                  if (Number.isNaN(n)) return
                  set('minPanelWidth', Math.max(20, Math.min(60, n)))
                },
              }),
              React.createElement('span', { className: 'artifacts-suffix' }, '%'),
            ),
          ),
        ),
      )
    }

    slots.inject('conversation.session.header.utilities', () => slots.register(
      { name: 'conversation.session.header.utilities', id: 'artifacts-sidebar', order: 50, label: 'Artifacts' },
      HeaderAction,
    ))

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'artifacts-sidebar-panel', order: 50, label: 'Artifacts Panel' },
      () => React.createElement(ArtifactsPanel),
    ))

    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'artifacts-sidebar', order: 90, label: '单页侧卡' },
      SettingsSection,
    ))
  },
  }})()
  exports.inject = plugin.inject
  exports.apply = plugin.apply
    return module.exports
  },
})
