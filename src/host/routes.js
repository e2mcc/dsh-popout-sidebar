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
      // pdf.js assets for the sidebar's custom PDF renderer. Served from the
      // embedded (vendored) copies so the plugin works fully offline. Long
      // cache lifetime: the bytes are versioned with the plugin itself.
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/popout-sidebar/pdfjs/pdf.min.js',
        handler(req, res) {
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=31536000' })
          res.end(PDFJS_LIB)
        },
      }), 'artifacts: pdf.js lib route')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/popout-sidebar/pdfjs/pdf.worker.min.js',
        handler(req, res) {
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=31536000' })
          res.end(PDFJS_WORKER)
        },
      }), 'artifacts: pdf.js worker route')