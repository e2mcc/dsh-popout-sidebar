/**
 * Assembles the single-file bundles the DSH loader actually consumes
 * (`src/host.js` and `src/client.js`) from the modular source under
 * `src/shared/`, `src/host/` and `src/client/`.
 *
 *   node scripts/build.js
 *
 * The `@@name@@` markers in the body skeletons are replaced with the module
 * contents. Shared modules (`src/shared/*.js`) are written in portable JS (no
 * template literals) and are indented to match each insertion point; the
 * host/client modules already carry their own indentation and are inlined
 * verbatim. No transpilation — plain string assembly.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const write = (p, s) => writeFileSync(join(root, p), s)

const indent = (text, n) => {
  const pad = ' '.repeat(n)
  return text.split('\n').map((line) => (line.length ? pad + line : line)).join('\n')
}

const replaceAll = (text, marker, content) => text.split(marker).join(content)

const assertNoMarkers = (text, label) => {
  const leftover = text.match(/@@[A-Za-z]+@@/g)
  if (leftover) throw new Error(`${label}: unresolved markers ${[...new Set(leftover)].join(', ')}`)
}

// ── Shared (portable) ───────────────────────────────────────────────────
const ext = read('src/shared/ext.js')
const markdown = read('src/shared/markdown.js')
const highlight = read('src/shared/highlight.js')

// ── Host ────────────────────────────────────────────────────────────────
let host = read('src/host/body.js')
const core = read('src/host/core.js')
let page = read('src/host/page.js')
const routes = read('src/host/routes.js')

// The page's inline script references the same shared helpers.
page = replaceAll(page, '@@ext@@', indent(ext, 4))
page = replaceAll(page, '@@highlight@@', indent(highlight, 4))
page = replaceAll(page, '@@markdown@@', indent(markdown, 4))

host = replaceAll(host, '@@ext@@', indent(ext, 4))
host = replaceAll(host, '@@core@@', core)
host = replaceAll(host, '@@page@@', page)
host = replaceAll(host, '@@routes@@', routes)
assertNoMarkers(host, 'host.js')
write('src/host.js', host)

// ── Client ──────────────────────────────────────────────────────────────
let client = read('src/client/body.js')
client = replaceAll(client, '@@ext@@', indent(ext, 4))
client = replaceAll(client, '@@highlight@@', indent(highlight, 4))
client = replaceAll(client, '@@markdown@@', indent(markdown, 4))
client = replaceAll(client, '@@core@@', read('src/client/core.js'))
client = replaceAll(client, '@@styles@@', read('src/client/styles.js'))
client = replaceAll(client, '@@icons@@', read('src/client/icons.js'))
client = replaceAll(client, '@@preview@@', read('src/client/preview.js'))
client = replaceAll(client, '@@components@@', read('src/client/components.js'))
assertNoMarkers(client, 'client.js')
write('src/client.js', client)

console.log('built src/host.js and src/client.js')
