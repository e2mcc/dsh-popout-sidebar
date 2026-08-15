/**
 * 具有独立标签页的侧边栏 · Standalone Tab Sidebar — Client half
 *
 * This file is the plain-JavaScript **function body** consumed by DeepSeek
 * Harness's dynamic Cordis plugin loader. Pass this exact text (from the
 * `return { ... }` below) as `code.client` to `cordis_define`.
 *
 * Responsibilities (runs in the browser):
 *  - Register the「产物」trigger button in `conversation.session.header.utilities`.
 *  - Render the floating sidebar panel in `shell.overlay`.
 *  - Pull data from the Host via `host.call`, and pass the active theme scheme
 *    to the standalone tab via `?scheme=`.
 */

return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    const basename = (p) => {
      const parts = String(p).split('/')
      return parts[parts.length - 1] || p
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
  position: fixed; top: 0; right: 0; bottom: 0; width: 380px; max-width: 92vw;
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
.artifacts-body { flex: 1 1 45%; min-height: 0; overflow-y: auto; border-bottom: 1px solid var(--dsw-alias-border-l2); }
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
`)

    const PANEL_PATH = 'M9.67272 0.522841C10.8339 0.522841 11.76 0.522714 12.4963 0.602493C13.2453 0.683657 13.8789 0.854248 14.4264 1.25197C14.7504 1.48739 15.0355 1.77247 15.2709 2.0965C15.6686 2.64394 15.8392 3.27758 15.9204 4.02655C16.0002 4.7629 16 5.68895 16 6.85014V9.14986C16 10.3111 16.0002 11.2371 15.9204 11.9735C15.8392 12.7224 15.6686 13.3561 15.2709 13.9035C15.0355 14.2275 14.7504 14.5126 14.4264 14.748C13.8789 15.1458 13.2453 15.3163 12.4963 15.3975C11.76 15.4773 10.8339 15.4772 9.67272 15.4772H6.3273C5.16611 15.4772 4.24006 15.4773 3.50371 15.3975C2.75474 15.3163 2.1211 15.1458 1.57366 14.748C1.24963 14.5126 0.964549 14.2275 0.729131 13.9035C0.331407 13.3561 0.160817 12.7224 0.0796529 11.9735C-0.000126137 11.2371 1.25338e-09 10.3111 1.25338e-09 9.14986V6.85014C1.25329e-09 5.68895 -0.000126137 4.7629 0.0796529 4.02655C0.160817 3.27758 0.331407 2.64394 0.729131 2.0965C0.964549 1.77247 1.24963 1.48739 1.57366 1.25197C2.1211 0.854248 2.75474 0.683657 3.50371 0.602493C4.24006 0.522714 5.16611 0.522841 6.3273 0.522841H9.67272ZM5.54303 1.88715V14.1118C5.78636 14.1128 6.04709 14.1169 6.3273 14.1169H9.67272C10.8639 14.1169 11.7032 14.1164 12.3493 14.0465C12.9824 13.9779 13.3497 13.8494 13.6268 13.6482C13.8354 13.4966 14.0195 13.3125 14.1711 13.1039C14.3723 12.8268 14.5007 12.4595 14.5693 11.8264C14.6393 11.1803 14.6398 10.341 14.6398 9.14986V6.85014C14.6398 5.65896 14.6393 4.81967 14.5693 4.1736C14.5007 3.54048 14.3723 3.17318 14.1711 2.89609C14.0195 2.68747 13.8354 2.50337 13.6268 2.35179C13.3497 2.1506 12.9824 2.02212 12.3493 1.95353C11.7032 1.88358 10.8639 1.88307 9.67272 1.88307H6.3273C6.04709 1.88307 5.78636 1.8862 5.54303 1.88715ZM4.1828 1.91166C3.99125 1.9216 3.8148 1.93577 3.65076 1.95353C3.01764 2.02212 2.65034 2.1506 2.37325 2.35179C2.16463 2.50337 1.98052 2.68747 1.82895 2.89609C1.62776 3.17318 1.49928 3.54048 1.43069 4.1736C1.36074 4.81967 1.36023 5.65896 1.36023 6.85014V9.14986C1.36023 10.341 1.36074 11.1803 1.43069 11.8264C1.49928 12.4595 1.62776 12.8268 1.82895 13.1039C1.98052 13.3125 2.16463 13.4966 2.37325 13.6482C2.65034 13.8494 3.01764 13.9779 3.65076 14.0465C3.81478 14.0642 3.99127 14.0774 4.1828 14.0873V1.91166Z'

    const PanelIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    }, React.createElement('path', { fillRule: 'evenodd', clipRule: 'evenodd', d: PANEL_PATH, fill: 'currentColor' }))

    const renderPreview = (p) => {
      if (p.loading) return React.createElement('div', { className: 'artifacts-hint' }, '加载中…')
      if (p.ok === false) return React.createElement('div', { className: 'artifacts-error' }, p.error || '读取失败')
      if (p.ok === true) return React.createElement('pre', { className: 'artifacts-pre' }, p.content)
      return React.createElement('div', { className: 'artifacts-hint' }, '加载中…')
    }

    const ArtifactsPanel = () => {
      const open = useOpen()
      const [items, setItems] = React.useState([])
      const [error, setError] = React.useState(null)
      const [preview, setPreview] = React.useState(null)

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
        const dispose = ctx.interval(load, 2000)
        return () => { alive = false; dispose() }
      }, [open])

      if (!open) return null

      const popoutHref = '/artifacts-panel?scheme=' + popoutScheme()

      const clear = () => {
        host.call('artifacts.clear').then(() => { setItems([]); setPreview(null) }).catch(() => {})
      }

      const select = (it) => {
        setPreview({ path: it.path, loading: true })
        host.call('artifacts.read', { path: it.path }).then((res) => {
          setPreview(Object.assign({ path: it.path, loading: false }, res))
        }).catch((e) => {
          setPreview({ path: it.path, loading: false, ok: false, error: String(e && e.message ? e.message : e) })
        })
      }

      const listChildren = []
      if (!items.length) {
        listChildren.push(React.createElement('div', { key: 'empty', className: 'artifacts-empty' }, '暂无产物 — 代理创建/编辑的文件会出现在这里。'))
      }
      items.forEach((it) => {
        listChildren.push(React.createElement('button', {
          key: it.id || it.path,
          type: 'button',
          className: 'artifacts-item' + (preview && preview.path === it.path ? ' is-active' : ''),
          onClick: () => select(it),
        },
          React.createElement('div', { className: 'artifacts-item-row' },
            React.createElement('span', { className: 'artifacts-badge artifacts-badge-' + it.kind }, it.kind === 'create' ? '新建' : '编辑'),
            React.createElement('span', { className: 'artifacts-item-base' }, basename(it.path)),
          ),
          React.createElement('div', { className: 'artifacts-item-full' }, it.path),
        ))
      })

      return React.createElement('div', { className: 'artifacts-panel', role: 'dialog', 'aria-label': 'Artifacts' },
        React.createElement('div', { className: 'artifacts-head' },
          React.createElement('span', { className: 'artifacts-title' }, '产物 Artifacts'),
          React.createElement('span', { className: 'artifacts-count' }, String(items.length)),
          React.createElement('span', { className: 'artifacts-spacer' }),
          React.createElement('a', {
            className: 'artifacts-link',
            href: popoutHref,
            target: '_blank',
            rel: 'noreferrer noopener',
            title: '在新标签页打开（可拖到另一块显示器）',
          }, '↗'),
          React.createElement('button', { type: 'button', className: 'artifacts-iconbtn', title: '清空', onClick: clear }, '清空'),
          React.createElement('button', { type: 'button', className: 'artifacts-iconbtn', title: '关闭', onClick: () => store.setOpen(false) }, '×'),
        ),
        React.createElement('div', { className: 'artifacts-body' }, listChildren),
        React.createElement('div', { className: 'artifacts-preview' },
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

    slots.inject('conversation.session.header.utilities', () => slots.register(
      { name: 'conversation.session.header.utilities', id: 'artifacts-sidebar', order: 50, label: 'Artifacts' },
      HeaderAction,
    ))

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'artifacts-sidebar-panel', order: 50, label: 'Artifacts Panel' },
      () => React.createElement(ArtifactsPanel),
    ))
  },
}
