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
