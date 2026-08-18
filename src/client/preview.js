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

    // Map file extensions to DSH's Shiki language ids (mirrors the client UI's
    // LANG_ALIASES so the Shiki-powered CodeBlock resolves the same grammars).
    const LANG_BY_EXT = {
      js: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx', ts: 'ts', tsx: 'tsx', mts: 'ts', cts: 'ts',
      json: 'json', jsonc: 'jsonc', json5: 'js',
      py: 'py', pyw: 'py', rb: 'rb', ruby: 'rb', go: 'go', rs: 'rust', rust: 'rust',
      java: 'java', c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', cs: 'cs',
      kotlin: 'kotlin', kt: 'kotlin', swift: 'swift', php: 'php',
      yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'ini', conf: 'ini', properties: 'ini', env: 'ini',
      md: 'md', markdown: 'md', mdx: 'mdx', html: 'html', htm: 'html', xhtml: 'html', vue: 'html',
      css: 'css', scss: 'scss', less: 'less', sql: 'sql', xml: 'xml', svg: 'xml', lua: 'lua',
      sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', fish: 'sh',
    }
    const LANG_NAMES = {
      js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', tsx: 'TSX', json: 'JSON', jsonc: 'JSON',
      py: 'Python', rb: 'Ruby', go: 'Go', rust: 'Rust', java: 'Java', c: 'C', cpp: 'C++',
      cs: 'C#', kotlin: 'Kotlin', swift: 'Swift', php: 'PHP', yaml: 'YAML', toml: 'TOML',
      ini: 'INI', md: 'Markdown', mdx: 'MDX', html: 'HTML', css: 'CSS', scss: 'SCSS',
      less: 'Less', sql: 'SQL', xml: 'XML', lua: 'Lua', sh: 'Shell',
    }
    const langFromExt = (path) => LANG_BY_EXT[fileExt(path)] || ''

    // Code preview with syntax highlighting. Uses DSH's own Shiki `CodeBlock`
    // component when available (native look + copy button + language banner);
    // otherwise falls back to a plain code view with line numbers + label.
    const CodeView = (props) => {
      const hl = (typeof primitives !== 'undefined' && primitives) ? primitives : null
      const CodeBlockCmp = hl && typeof hl.CodeBlock === 'function' ? hl.CodeBlock : null
      const code = String(props.code || '')
      const lang = props.lang || ''
      if (CodeBlockCmp) {
        return React.createElement(CodeBlockCmp, { code, lang: lang || undefined })
      }
      const srcLines = code.replace(/\n$/, '').split('\n')
      const gutter = srcLines.map((_, i) => String(i + 1)).join('\n')
      return React.createElement('div', { className: 'artifacts-code' },
        React.createElement('div', { className: 'artifacts-code-head' },
          React.createElement('span', { className: 'artifacts-code-lang' }, LANG_NAMES[lang] || (lang || 'Text')),
        ),
        React.createElement('div', { className: 'artifacts-code-scroll' },
          React.createElement('pre', { className: 'artifacts-code-gutter', 'aria-hidden': true }, gutter),
          React.createElement('pre', { className: 'artifacts-code-pre' },
            React.createElement('code', null, code),
          ),
        ),
      )
    }

    // ── PDF preview (sidebar): custom pdf.js renderer ─────────────────────
    // No native viewer toolbar; fit-to-width by default with zoom / page
    // controls. Loads the vendored pdf.js served by the host (offline-safe).
    let _pdfjsPromise = null
    const loadPdfjs = () => {
      if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
      if (window.pdfjsLib) {
        try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/popout-sidebar/pdfjs/pdf.worker.min.js' } catch (e) {}
        return Promise.resolve(window.pdfjsLib)
      }
      if (_pdfjsPromise) return _pdfjsPromise
      _pdfjsPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = '/popout-sidebar/pdfjs/pdf.min.js'
        s.async = true
        s.onload = () => {
          try {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/popout-sidebar/pdfjs/pdf.worker.min.js'
            resolve(window.pdfjsLib)
          } catch (e) { reject(e) }
        }
        s.onerror = () => { _pdfjsPromise = null; reject(new Error('pdf.js 加载失败')) }
        document.head.appendChild(s)
      })
      return _pdfjsPromise
    }

    const PdfView = (props) => {
      const path = props.path || ''
      const [phase, setPhase] = React.useState('loading') // loading | ready | error
      const [error, setError] = React.useState(null)
      const [pageCount, setPageCount] = React.useState(0)
      const [pageNo, setPageNo] = React.useState(1)
      const [zoom, setZoom] = React.useState(1) // multiplier over fit-width
      const [fitScale, setFitScale] = React.useState(null)
      const scrollRef = React.useRef(null)
      const canvasRef = React.useRef(null)
      const docRef = React.useRef(null)
      const taskRef = React.useRef(null)

      // Load the document once per path.
      React.useEffect(() => {
        let alive = true
        setPhase('loading'); setError(null); setPageCount(0); setPageNo(1); setZoom(1); setFitScale(null)
        loadPdfjs().then((lib) => {
          const url = '/popout-sidebar/media?path=' + encodeURIComponent(path)
          return lib.getDocument({ url }).promise
        }).then((doc) => {
          if (!alive) { try { doc.destroy() } catch (e) {} return }
          docRef.current = doc
          setPageCount(doc.numPages || 0)
          setPhase('ready')
        }).catch((e) => {
          if (alive) { setError(String((e && e.message) ? e.message : e)); setPhase('error') }
        })
        return () => {
          alive = false
          if (taskRef.current) { try { taskRef.current.cancel() } catch (e) {} }
          if (docRef.current) { try { docRef.current.destroy() } catch (e) {} docRef.current = null }
        }
      }, [path])

      // Measure the scroll area once to derive the fit-to-width scale (so the
      // page exactly fills the visible width — no horizontal scrollbar).
      React.useEffect(() => {
        if (phase !== 'ready' || fitScale != null) return
        const scroll = scrollRef.current
        const doc = docRef.current
        if (!scroll || !doc) return
        let w = scroll.clientWidth
        if (typeof window.getComputedStyle === 'function') {
          try {
            const cs = window.getComputedStyle(scroll)
            w -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
          } catch (e) {}
        }
        if (!w) return
        doc.getPage(1).then((pageObj) => {
          const vp = pageObj.getViewport({ scale: 1 })
          if (vp && vp.width > 0) setFitScale(w / vp.width)
        }).catch(() => {})
      }, [phase, fitScale])

      // Render the current page into the canvas.
      React.useEffect(() => {
        if (phase !== 'ready' || fitScale == null) return
        const canvas = canvasRef.current
        const doc = docRef.current
        if (!canvas || !doc) return
        let alive = true
        doc.getPage(pageNo).then((pageObj) => {
          if (!alive) return
          const scale = fitScale * zoom
          const viewport = pageObj.getViewport({ scale })
          const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
          canvas.width = Math.floor(viewport.width * dpr)
          canvas.height = Math.floor(viewport.height * dpr)
          canvas.style.width = Math.floor(viewport.width) + 'px'
          canvas.style.height = Math.floor(viewport.height) + 'px'
          const ctx = canvas.getContext('2d')
          if (taskRef.current) { try { taskRef.current.cancel() } catch (e) {} }
          taskRef.current = pageObj.render({
            canvasContext: ctx,
            viewport,
            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
          })
        }).catch(() => {})
        return () => { alive = false }
      }, [phase, pageNo, zoom, fitScale])

      const clampPage = (n) => Math.max(1, Math.min(pageCount || 1, n))
      const goPage = (n) => setPageNo(clampPage(n))
      const zoomBy = (f) => setZoom((z) => Math.max(0.25, Math.min(4, Math.round(z * f * 100) / 100)))

      if (phase === 'loading') {
        return React.createElement('div', { className: 'artifacts-pdfview' },
          React.createElement('div', { className: 'artifacts-hint' }, '加载 PDF…'))
      }
      if (phase === 'error') {
        // Fall back to the browser's native viewer if pdf.js cannot load.
        return React.createElement('embed', {
          className: 'artifacts-pdf',
          src: '/popout-sidebar/media?path=' + encodeURIComponent(path),
          type: 'application/pdf', title: path,
        })
      }

      const disabled = pageCount <= 0
      return React.createElement('div', { className: 'artifacts-pdfview' },
        React.createElement('div', { className: 'artifacts-pdfview-bar' },
          React.createElement('button', { type: 'button', className: 'artifacts-pdfview-btn', title: '缩小', disabled, onClick: () => zoomBy(0.8) }, '−'),
          React.createElement('span', { className: 'artifacts-pdfview-zoom' }, Math.round(zoom * 100) + '%'),
          React.createElement('button', { type: 'button', className: 'artifacts-pdfview-btn', title: '放大', disabled, onClick: () => zoomBy(1.25) }, '＋'),
          React.createElement('span', { className: 'artifacts-pdfview-spacer' }),
          React.createElement('button', { type: 'button', className: 'artifacts-pdfview-btn', title: '上一页', disabled: disabled || pageNo <= 1, onClick: () => goPage(pageNo - 1) }, '‹'),
          React.createElement('span', { className: 'artifacts-pdfview-page' }, pageNo + ' / ' + pageCount),
          React.createElement('button', { type: 'button', className: 'artifacts-pdfview-btn', title: '下一页', disabled: disabled || pageNo >= pageCount, onClick: () => goPage(pageNo + 1) }, '›'),
        ),
        React.createElement('div', { className: 'artifacts-pdfview-scroll', ref: scrollRef },
          React.createElement('canvas', { ref: canvasRef, className: 'artifacts-pdfview-canvas' }),
        ),
      )
    }

    const renderPreview = (p) => {
      if (p.loading) return React.createElement('div', { className: 'artifacts-hint' }, '加载中…')
      if (p.ok === false) return React.createElement('div', { className: 'artifacts-error' }, p.error || '读取失败')
      const type = p.type || 'text'
      const body = []
      if (type === 'image') {
        body.push(React.createElement('img', {
          key: 'img', className: 'artifacts-img',
          src: '/popout-sidebar/media?path=' + encodeURIComponent(p.path || ''),
          alt: p.path || '',
        }))
      } else if (type === 'html') {
        body.push(React.createElement('iframe', {
          key: 'iframe', className: 'artifacts-iframe',
          sandbox: 'allow-scripts', srcDoc: p.content || '', title: p.path || '',
        }))
      } else if (type === 'pdf') {
        body.push(React.createElement(PdfView, { key: 'pdf', path: p.path || '' }))
      } else if (type === 'markdown') {
        body.push(React.createElement('div', {
          key: 'md', className: 'artifacts-markdown',
          dangerouslySetInnerHTML: { __html: mdToHtml(p.content) },
        }))
      } else {
        body.push(React.createElement(CodeView, { key: 'code', code: p.content, lang: langFromExt(p.path) }))
        if (p.truncated) body.push(React.createElement('div', { key: 'trunc', className: 'artifacts-diff-label' }, '(truncated preview)'))
      }
      if (p.diff) body.unshift(renderDiff(p.diff))
      return React.createElement('div', { className: 'artifacts-preview-body' }, body)
    }

    // Inline SVG icons replicating the DSH primitives icons better-sidebar uses
    // (IconFolderClose16 / IconFolderOpen16 / IconCodeOutline16 /
    // IconRefreshOutline16), drawn with `currentColor` so they follow the theme.
