    const FileTree = (props) => {
      const [root, setRoot] = React.useState(null)
      const [children, setChildren] = React.useState({})
      const [expanded, setExpanded] = React.useState({})
      const [copiedPath, setCopiedPath] = React.useState(null)
      const [copiedLabel, setCopiedLabel] = React.useState('')
      const copyTimer = React.useRef(null)
      const rootTimer = React.useRef(null)

      // Track the active session so the tree re-roots automatically when the
      // workspace changes (no manual refresh needed).
      const [sessionId, setSessionId] = React.useState(currentSessionId())
      React.useEffect(() => {
        let list
        try { list = ctx.get('sessions') && ctx.get('sessions').list } catch (e) {}
        if (!list || typeof list.subscribe !== 'function') return
        return list.subscribe(() => setSessionId(currentSessionId()))
      }, [])

      const loadRoot = () => {
        setChildren({})
        setExpanded({})
        setRoot(null)
        clearTimeout(rootTimer.current)
        // A freshly switched-to workspace may not be resolvable on the host for
        // a beat (its session is still loading/persisting). Retry briefly so the
        // tree self-corrects instead of sitting on a stale or empty root.
        const attempt = (tries) => {
          host.call('artifacts.listDir', { sessionId: currentSessionId() }).then((res) => {
            if (res && res.ok) {
              setRoot({ path: res.path, entries: res.entries })
            } else if (tries > 0) {
              rootTimer.current = setTimeout(() => attempt(tries - 1), 400)
            }
          }).catch(() => {
            if (tries > 0) rootTimer.current = setTimeout(() => attempt(tries - 1), 400)
          })
        }
        attempt(3)
      }

      React.useEffect(() => { loadRoot() }, [sessionId])
      React.useEffect(() => () => clearTimeout(rootTimer.current), [])

      const toggle = (path) => {
        const nextExpanded = Object.assign({}, expanded, { [path]: !expanded[path] })
        setExpanded(nextExpanded)
        if (nextExpanded[path] && !children[path]) {
          setChildren(Object.assign({}, children, { [path]: { loading: true } }))
          host.call('artifacts.listDir', { path, sessionId: currentSessionId() }).then((res) => {
            setChildren((prev) => Object.assign({}, prev, { [path]: res && res.ok ? { entries: res.entries } : { error: (res && res.error) || '读取失败' } }))
          }).catch(() => {
            setChildren((prev) => Object.assign({}, prev, { [path]: { error: '读取失败' } }))
          })
        }
      }

      const copyRef = (path) => {
        const text = '@' + path
        let label = '已复制'
        const done = () => {
          setCopiedPath(path)
          setCopiedLabel(label)
          clearTimeout(copyTimer.current)
          copyTimer.current = setTimeout(() => { setCopiedPath(null); setCopiedLabel('') }, 1600)
        }
        // Prefer writing into the composer; fall back to clipboard copy.
        if (quoteToComposer(path)) {
          label = '已插入输入框'
          done()
          return
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done() })
        } else { fallbackCopy(text); done() }
      }

      const rowActions = (entry) => (copiedPath === entry.path
        ? React.createElement('span', { className: 'artifacts-tree-copied' }, copiedLabel || '已复制')
        : React.createElement('button', {
          type: 'button',
          className: 'artifacts-tree-ref',
          title: '引用到输入框（失败则复制 @path）',
          onClick: (e) => { e.stopPropagation(); copyRef(entry.path) },
        }, '@引用'))

      const renderNode = (entry, depth) => {
        const pad = { paddingLeft: 6 + depth * 20 }
        const isSelected = props.selectedPath === entry.path
        const rowClass = 'artifacts-tree-row' +
          (entry.hidden ? ' artifacts-tree-hidden' : '') +
          (isSelected ? ' is-selected' : '')
        if (entry.isDir) {
          const isExpanded = !!expanded[entry.path]
          const node = children[entry.path]
          return React.createElement('div', { key: entry.path },
            React.createElement('div', {
              role: 'button',
              tabIndex: 0,
              className: rowClass + ' artifacts-tree-dir',
              style: pad,
              onClick: () => toggle(entry.path),
              onKeyDown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(entry.path) } },
              title: entry.path,
            },
              isExpanded ? FolderOpenIcon(14) : FolderClosedIcon(14),
              React.createElement('span', { className: 'artifacts-tree-name' }, entry.name),
              rowActions(entry),
            ),
            isExpanded
              ? (node && node.loading
                ? React.createElement('div', { className: 'artifacts-tree-row artifacts-tree-loading', style: { paddingLeft: 6 + (depth + 1) * 20 + 20 } }, '加载中…')
                : node && node.error
                  ? React.createElement('div', { className: 'artifacts-tree-row artifacts-tree-error', style: { paddingLeft: 6 + (depth + 1) * 20 + 20 } }, node.error)
                  : node && node.entries
                    ? node.entries.map((c) => renderNode(c, depth + 1))
                    : null)
              : null,
          )
        }
        return React.createElement('div', {
          role: 'button',
          tabIndex: 0,
          className: rowClass,
          style: pad,
          onClick: () => { if (props.onOpen) props.onOpen(entry.path) },
          onKeyDown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (props.onOpen) props.onOpen(entry.path) } },
          title: entry.path,
        },
          FileCodeIcon(14),
          React.createElement('span', { className: 'artifacts-tree-name' }, entry.name),
          rowActions(entry),
        )
      }

      return React.createElement('div', { className: 'artifacts-tree' },
        React.createElement('div', { className: 'artifacts-tree-header' },
          React.createElement('span', { className: 'artifacts-tree-root', title: root ? root.path : '' }, root ? basename(root.path) : '…'),
          React.createElement('button', { type: 'button', className: 'artifacts-tree-refresh', title: '刷新', onClick: loadRoot }, RefreshIcon(14)),
        ),
        React.createElement('div', { className: 'artifacts-tree-body' },
          !root
            ? React.createElement('div', { className: 'artifacts-hint' }, '加载文件树…')
            : (!root.entries || !root.entries.length)
              ? React.createElement('div', { className: 'artifacts-hint' }, '（空目录）')
              : root.entries.map((e) => renderNode(e, 0)),
        ),
      )
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
      // The divider's initial position comes from the "预览区高度" setting
      // (split = the list's max-height ratio; preview takes the rest). The
      // user can still drag the splitter to override at runtime.
      const [split, setSplit] = React.useState(() => (100 - (settings.previewHeight ?? 70)) / 100)
      const [splitting, setSplitting] = React.useState(false)
      const [collapsed, setCollapsed] = React.useState(false) // preview collapsed to the bottom
      const [activeView, setActiveView] = React.useState('artifacts') // 'artifacts' | 'tree'
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

      // Publish the current session id to localStorage so the standalone
      // popout tab (which has no client session store) can root its file tree
      // at the active workspace and follow workspace switches in real time.
      React.useEffect(() => {
        const KEY = 'dsh-popout-sidebar:session'
        const write = () => {
          try {
            const sid = currentSessionId()
            if (localStorage.getItem(KEY) !== sid) localStorage.setItem(KEY, sid || '')
          } catch (e) {}
        }
        write()
        let list
        try { list = ctx.get('sessions') && ctx.get('sessions').list } catch (e) {}
        if (!list || typeof list.subscribe !== 'function') return
        return list.subscribe(write)
      }, [])

      // Panel width (px): at least `minPanelWidth`% of the window, wider via
      // dragging the left edge. `panelWidth` holds the drag result (px); null →
      // use the configured minimum.
      const minWidthPx = Math.max(80, Math.round(window.innerWidth * (settings.minPanelWidth || 0) / 100))
      const widthPx = panelWidth != null ? Math.max(panelWidth, minWidthPx) : minWidthPx

      // Reserve layout space for the panel while open: shrink the app frame by
      // the panel's live width so the conversation column yields instead of
      // being covered (see the `html #root` rule in styles).
      React.useEffect(() => {
        const root = document.documentElement
        root.style.setProperty('--dsh-popout-sidebar-width', open ? widthPx + 'px' : '0px')
        return () => { root.style.setProperty('--dsh-popout-sidebar-width', '0px') }
      }, [open, widthPx])

      // Disable the layout transition while dragging so the frame tracks the
      // pointer instead of lagging (mirrors body[data-dsh-popout-dragging]).
      React.useEffect(() => {
        if (resizing) document.body.setAttribute('data-dsh-popout-dragging', '')
        else document.body.removeAttribute('data-dsh-popout-dragging')
        return () => { document.body.removeAttribute('data-dsh-popout-dragging') }
      }, [resizing])

      if (!open) return null

      const sid = currentSessionId()
      const popoutHref = '/popout-sidebar' + (sid ? '?sessionId=' + encodeURIComponent(sid) : '')

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

      // Expand the preview and reset the divider to the configured default
      // height ("预览区默认高度") — applied on every re-expansion, regardless
      // of any runtime drag override.
      const expandPreview = () => {
        setCollapsed(false)
        setSplit((100 - (settings.previewHeight ?? 70)) / 100)
      }

      const startSplit = (e) => {
        e.preventDefault()
        // Dragging the splitter while collapsed just re-expands the preview
        // (at the default height); drag-to-resize applies once visible again.
        if (collapsed) { expandPreview(); return }
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
            flash('已清除')
          } else {
            flash((res && res.error) || '清除失败')
          }
        }).catch(() => flash('清除失败'))
      }

      const openFile = (path, diff) => {
        // Opening any previewable file re-expands a collapsed preview (at the
        // default height).
        if (collapsed) expandPreview()
        const type = extType(path)
        const base = { path, type, diff: diff || null }
        // Images and PDFs are served as binary media — no text read needed.
        if (type === 'image' || type === 'pdf') {
          setPreview(Object.assign({}, base, { loading: false }))
          return
        }
        setPreview(Object.assign({}, base, { loading: true }))
        host.call('artifacts.read', { path }).then((res) => {
          setPreview(Object.assign({}, base, { loading: false }, res))
        }).catch((e) => {
          setPreview(Object.assign({}, base, { loading: false, ok: false, error: String(e && e.message ? e.message : e) }))
        })
      }

      const select = (it) => openFile(it.path, it.diff)

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
              title: '清除该产物',
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
          React.createElement('div', { className: 'artifacts-head-left' },
            React.createElement('button', {
              type: 'button',
              className: 'artifacts-toggle',
              title: '收起侧边栏',
              onClick: () => store.setOpen(false),
            }, PanelIcon(16)),
            React.createElement('a', {
              className: 'artifacts-link',
              href: popoutHref,
              target: '_blank',
              rel: 'noreferrer noopener',
              title: '在新标签页打开（可拖到另一块显示器）',
            }, '↖'),
          ),
          React.createElement('span', { className: 'artifacts-title' }, '弹出式侧边栏'),
          React.createElement('span', { className: 'artifacts-spacer' }),
          notice ? React.createElement('span', { className: 'artifacts-notice' }, notice) : null,
          activeView === 'artifacts' ? React.createElement('button', {
            type: 'button',
            className: 'artifacts-iconbtn' + (deleteMode ? ' artifacts-delete-on' : ''),
            title: deleteMode ? '退出清除模式' : '清除模式',
            onClick: () => { setDeleteMode(!deleteMode); setDeleteTarget(null) },
          }, '清除') : null,
        ),
        settings.showFileTree ? React.createElement('div', { className: 'artifacts-tabs' },
          React.createElement('button', {
            type: 'button',
            className: 'artifacts-tab' + (activeView === 'artifacts' ? ' is-active' : ''),
            onClick: () => setActiveView('artifacts'),
          }, '产物'),
          React.createElement('button', {
            type: 'button',
            className: 'artifacts-tab' + (activeView === 'tree' ? ' is-active' : ''),
            onClick: () => { setActiveView('tree'); setDeleteMode(false); setDeleteTarget(null) },
          }, '文件树'),
        ) : null,
        React.createElement('div', {
          className: 'artifacts-body',
          ref: bodyRef,
          // Auto-size to content (up to the split cap) so a short file tree /
          // artifact list doesn't leave a big empty gap above the splitter.
          // When collapsed the list fills the whole panel (preview hidden).
          style: collapsed ? { flex: '1 1 auto' } : { flex: '0 1 auto', maxHeight: (split * 100) + '%' },
        },
          (activeView === 'tree' && settings.showFileTree)
            ? React.createElement(FileTree, { onOpen: openFile, selectedPath: preview ? preview.path : null })
            : [
                deleteMode ? React.createElement('div', { className: 'artifacts-delete-hint' }, '清除模式：点击产物标记，再点红色 × 清除（仅清除内存记录，不删除磁盘文件）') : null,
                listChildren,
              ],
        ),
        React.createElement('div', {
          className: 'artifacts-splitter' + (splitting ? ' artifacts-splitting' : '') + (collapsed ? ' artifacts-collapsed' : ''),
          title: '拖动调整产物列表与预览的分界',
          onMouseDown: startSplit,
        },
          React.createElement('button', {
            type: 'button',
            className: 'artifacts-collapse-btn',
            title: collapsed ? '展开预览区' : '收起预览区',
            'aria-expanded': !collapsed,
            onMouseDown: (e) => e.stopPropagation(),
            onClick: () => { if (collapsed) expandPreview(); else setCollapsed(true) },
          }, React.createElement('span', { className: 'artifacts-collapse-icon' }, ChevronIcon(10))),
        ),
        React.createElement('div', {
          className: 'artifacts-preview',
          ref: previewRef,
          style: collapsed ? { flex: '0 0 0%', display: 'none' } : { flex: '1 1 0%' },
        },
          preview ? renderPreview(preview) : React.createElement('div', { className: 'artifacts-hint' }, '点击文件预览内容'),
        ),
      )
    }

    // Persistent trigger pinned to the top-right corner. Registered into the
    // root-scoped `shell.overlay` list so it stays visible with no conversation;
    // the fixed CSS position keeps it at the corner, offset left by the right
    // sidebar(s) so it never gets covered. Icon-only by design.
    const CornerButton = () => {
      const open = useOpen()
      if (open) return null
      return React.createElement('button', {
        type: 'button',
        className: 'artifacts-corner-btn',
        title: '弹出式侧边栏',
        'aria-expanded': open,
        onClick: () => store.toggle(),
      }, PanelIcon(18))
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
        React.createElement('p', { className: 'artifacts-setintro' }, '管理「Popout Sidebar」的显示与行为。'),
        React.createElement('div', { className: 'artifacts-setgroup' },
          React.createElement(SettingsToggle, {
            label: '默认展开',
            desc: '页面加载后侧边栏默认展开；关闭则默认收起，点右上角图标再打开。',
            value: settings.defaultOpen,
            onToggle: (v) => set('defaultOpen', v),
          }),
          React.createElement(SettingsToggle, {
            label: '自动刷新',
            desc: '开启后侧边栏展开时将即时同步并更新产物列表',
            value: settings.autoRefresh,
            onToggle: (v) => set('autoRefresh', v),
          }),
          React.createElement(SettingsToggle, {
            label: '文件树',
            desc: '在侧边栏显示「文件树」标签页，浏览工作区目录。',
            value: settings.showFileTree,
            onToggle: (v) => set('showFileTree', v),
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
          React.createElement('div', { className: 'artifacts-setrow' },
            React.createElement('div', { className: 'artifacts-settext' },
              React.createElement('div', { className: 'artifacts-settitle' }, '预览区默认高度'),
              React.createElement('div', { className: 'artifacts-setdesc' }, '预览区占面板高度的百分比（20–80），决定预览区与文件树/产物展示区分界线的位置；仍可拖动分界线临时调整。'),
            ),
            React.createElement('div', { className: 'artifacts-setcontrol' },
              React.createElement('input', {
                type: 'number',
                className: 'artifacts-widthinput',
                min: 20,
                max: 80,
                value: settings.previewHeight,
                onChange: (e) => {
                  const n = parseInt(e.currentTarget.value, 10)
                  if (Number.isNaN(n)) return
                  set('previewHeight', Math.max(20, Math.min(80, n)))
                },
              }),
              React.createElement('span', { className: 'artifacts-suffix' }, '%'),
            ),
          ),
        ),
      )
    }

