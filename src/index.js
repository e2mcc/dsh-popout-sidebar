/**
 * 具有独立标签页的侧边栏 · Standalone Tab Sidebar — Static host entry
 *
 * Static-bundle entry for the DSH web profile. It evaluates the canonical
 * plugin body in `src/host.js` — the very same text you can pass to
 * `cordis_define` as `code.host` — and exports it for the Cordis loader.
 * The body guards its `harness` usage (`typeof harness !== 'undefined'`), so
 * it runs both as a dynamic plugin and as this static bundle.
 */
import { readFileSync } from 'node:fs'

// The body is a `return { ... }` statement; wrap it in a function and call
// it, exactly like the dynamic runner evaluates `code.host`.
// eslint-disable-next-line no-new-func
const makePlugin = new Function(readFileSync(new URL('./host.js', import.meta.url), 'utf8'))
const plugin = makePlugin()

export const name = 'dsh-standalone-tab-sidebar'
export const inject = plugin.inject ?? []
export const apply = plugin.apply
