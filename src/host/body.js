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
@@ext@@
@@core@@

    const webServer = ctx.get('webServer')
    if (webServer) {
@@page@@
@@routes@@
    }
  },
}
