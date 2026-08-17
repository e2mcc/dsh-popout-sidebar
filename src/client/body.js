/**
 * 可弹出侧边栏 · Popout Sidebar — Client body
 *
 * Assembled by `scripts/build.js` into `src/client.js` (the static browser
 * bundle served at `/plugins/dsh-popout-sidebar/client.js` and registered
 * through `window.__ModuleLoader__`).
 *
 * The placeholder tokens in this skeleton are replaced at build time by:
 *   ext        → src/shared/ext.js
 *   highlight  → src/shared/highlight.js
 *   markdown   → src/shared/markdown.js
 *   core       → src/client/core.js       (state/store/settings helpers)
 *   styles     → src/client/styles.js     (the injected CSS)
 *   icons      → src/client/icons.js      (inline SVG icons)
 *   preview    → src/client/preview.js    (renderDiff/renderPreview/CodeView)
 *   components → src/client/components.js (FileTree/ArtifactsPanel/…)
 */
window.__ModuleLoader__.load({
  id: 'dsh-popout-sidebar',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // Closure symbols — the same names the dynamic runner injects.
    const React = require('react')

    // DSH's built-in Shiki syntax highlighter. Optional: gracefully degrades to
    // a plain code view when unavailable (e.g. under the dynamic runner, which
    // does not inject this module).
    let primitives = null
    try { primitives = require('@deepseek-ai/dsh-client-ui-primitives') } catch (e) { primitives = null }

    const styles = {
      insert(css) {
        if (typeof document === 'undefined') return
        const id = 'dsh-popout-sidebar-styles'
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
          return fetch('/popout-sidebar/data').then((r) => r.json())
        }
        if (method === 'artifacts.read') {
          const path = args && typeof args.path === 'string' ? args.path : ''
          return fetch('/popout-sidebar/content?path=' + encodeURIComponent(path)).then((r) => r.json())
        }
        if (method === 'artifacts.remove') {
          const path = args && typeof args.path === 'string' ? args.path : ''
          return fetch('/popout-sidebar/remove?path=' + encodeURIComponent(path), { method: 'POST' }).then((r) => r.json())
        }
        if (method === 'artifacts.listDir') {
          const path = args && typeof args.path === 'string' ? args.path : ''
          const sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : ''
          return fetch('/popout-sidebar/listdir?path=' + encodeURIComponent(path) + '&sessionId=' + encodeURIComponent(sessionId)).then((r) => r.json())
        }
        return Promise.reject(new Error('dsh-popout-sidebar: unknown host method ' + method))
      },
    }

    // Canonical plugin body — extract this `return { ... }` for cordis_define.
    const plugin = (() => {
      return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

@@ext@@
@@highlight@@
@@markdown@@

@@core@@

    styles.insert(`
@@styles@@
`)

@@icons@@

@@preview@@

@@components@@

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'artifacts-sidebar-trigger', order: 40, label: 'Artifacts' },
      CornerButton,
    ))

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'artifacts-sidebar-panel', order: 50, label: 'Artifacts Panel' },
      () => React.createElement(ArtifactsPanel),
    ))

    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'artifacts-sidebar', order: 90, label: 'Popout Sidebar' },
      SettingsSection,
    ))
  },
  }})()
  exports.inject = plugin.inject
  exports.apply = plugin.apply
    return module.exports
  },
})
