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
            setChildren((prev) => Object.assign({}, prev, { [path]: res && res.ok ? { entries: res.entries } : { error: (res && res.error) || t('loadFailed') } }))
          }).catch(() => {
            setChildren((prev) => Object.assign({}, prev, { [path]: { error: t('loadFailed') } }))
          })
        }
      }

      const copyRef = (path) => {
        const text = '@' + path
        let label = t('copied')
        const done = () => {
          setCopiedPath(path)
          setCopiedLabel(label)
          clearTimeout(copyTimer.current)
          copyTimer.current = setTimeout(() => { setCopiedPath(null); setCopiedLabel('') }, 1600)
        }
        // Prefer writing into the composer; fall back to clipboard copy.
        if (quoteToComposer(path)) {
          label = t('insertedToInput')
          done()
          return
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done() })
        } else { fallbackCopy(text); done() }
      }

      const rowActions = (entry) => (copiedPath === entry.path
        ? React.createElement('span', { className: 'artifacts-tree-copied' }, copiedLabel || t('copied'))
        : React.createElement('button', {
          type: 'button',
          className: 'artifacts-tree-ref',
          title: t('quoteIntoInputTip'),
          onClick: (e) => { e.stopPropagation(); copyRef(entry.path) },
        }, t('quoteBadge')))

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
                ? React.createElement('div', { className: 'artifacts-tree-row artifacts-tree-loading', style: { paddingLeft: 6 + (depth + 1) * 20 + 20 } }, t('loading'))
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
          React.createElement('button', { type: 'button', className: 'artifacts-tree-refresh', title: t('refresh'), onClick: loadRoot }, RefreshIcon(14)),
        ),
        React.createElement('div', { className: 'artifacts-tree-body' },
          !root
            ? React.createElement('div', { className: 'artifacts-hint' }, t('loadingFileTree'))
            : (!root.entries || !root.entries.length)
              ? React.createElement('div', { className: 'artifacts-hint' }, t('emptyDir'))
              : root.entries.map((e) => renderNode(e, 0)),
        ),
      )
    }

    const ArtifactsPanel = () => {
      useLocaleRevision()
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
      // (split = the list/tree area's height ratio; preview takes the rest).
      // The user can still drag the splitter to override at runtime; that
      // override is discarded whenever the preview is re-expanded, returning
      // the divider to the configured default height.
      const [split, setSplit] = React.useState(() => (100 - (settings.previewHeight ?? 70)) / 100)
      const [splitting, setSplitting] = React.useState(false)
      const [collapsed, setCollapsed] = React.useState(false) // preview collapsed to the bottom
      const [activeView, setActiveView] = React.useState('artifacts') // 'artifacts' | 'tree'
      const mainRef = React.useRef(null)
      const noticeTimer = React.useRef(null)

      // The list/tree area can be dragged between 10% and 90% of the split
      // area so the divider moves freely (never pinned to content or default).
      const MIN_SPLIT = 0.1
      const MAX_SPLIT = 0.9

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
      // Carry the active language into the host-rendered popout tab so it
      // speaks the same language as the sidebar; DSH locales other than
      // Chinese fall back to English there.
      const activeLocale = locale.getSnapshot().active
      const popoutLang = /^zh/i.test(activeLocale) ? 'zh' : 'en'
      const popoutQuery = []
      if (sid) popoutQuery.push('sessionId=' + encodeURIComponent(sid))
      popoutQuery.push('lang=' + popoutLang)
      const popoutHref = '/popout-sidebar?' + popoutQuery.join('&')

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
        const mainEl = mainRef.current
        if (!mainEl) return
        const top = mainEl.getBoundingClientRect().top
        const height = mainEl.getBoundingClientRect().height
        if (height <= 0) return
        const onMove = (ev) => {
          const ratio = (ev.clientY - top) / height
          setSplit(Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, ratio)))
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
        if (quoteToComposer(path)) { flash(t('insertedToInput')); return }
        copyText('@' + path, t('copiedRefFailed'))
      }

      const remove = (path) => {
        host.call('artifacts.remove', { path }).then((res) => {
          if (res && res.ok) {
            setItems((prev) => prev.filter((x) => x.path !== path))
            if (preview && preview.path === path) setPreview(null)
            setDeleteTarget(null)
            flash(t('cleared'))
          } else {
            flash((res && res.error) || t('clearFailed'))
          }
        }).catch(() => flash(t('clearFailed')))
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
        listChildren.push(React.createElement('div', { key: 'empty', className: 'artifacts-empty' }, t('emptyArtifacts')))
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
              React.createElement('span', { className: 'artifacts-badge artifacts-badge-' + it.kind }, it.kind === 'create' ? t('createBadge') : t('editBadge')),
              React.createElement('span', { className: 'artifacts-item-base' }, basename(it.path)),
            ),
            React.createElement('div', { className: 'artifacts-item-full' }, it.path),
          ),
          React.createElement('div', { className: 'artifacts-item-actions' },
            isDeleteMarked ? React.createElement('button', {
              type: 'button',
              className: 'artifacts-minibtn artifacts-delete-x',
              title: t('clearThisArtifact'),
              onClick: () => remove(it.path),
            }, '×') : null,
            deleteMode ? null : React.createElement('button', { type: 'button', className: 'artifacts-minibtn', title: t('copyPath'), onClick: () => copyText(it.path, t('copiedPath')) }, '⧉'),
            deleteMode ? null : React.createElement('button', { type: 'button', className: 'artifacts-minibtn', title: t('quoteIntoInput'), onClick: () => quotePath(it.path) }, '@'),
          ),
        ))
      })

      return React.createElement('div', {
        className: 'artifacts-panel' + (resizing ? ' artifacts-resizing' : ''),
        style: { width: widthPx },
        role: 'dialog', 'aria-label': t('artifacts'),
      },
        React.createElement('div', {
          className: 'artifacts-resize',
          title: t('resizeWidth'),
          onMouseDown: startResize,
        }),
        React.createElement('div', { className: 'artifacts-head' },
          React.createElement('div', { className: 'artifacts-head-left' },
            React.createElement('button', {
              type: 'button',
              className: 'artifacts-toggle',
              title: t('collapseSidebar'),
              onClick: () => store.setOpen(false),
            }, PanelIcon(16)),
            React.createElement('a', {
              className: 'artifacts-link',
              href: popoutHref,
              target: '_blank',
              rel: 'noreferrer noopener',
              title: t('openInTab'),
            }, '↖'),
          ),
          React.createElement('span', { className: 'artifacts-title' }, t('sidebarTitle')),
          React.createElement('span', { className: 'artifacts-spacer' }),
          notice ? React.createElement('span', { className: 'artifacts-notice' }, notice) : null,
          activeView === 'artifacts' ? React.createElement('button', {
            type: 'button',
            className: 'artifacts-iconbtn' + (deleteMode ? ' artifacts-delete-on' : ''),
            title: deleteMode ? t('exitClearMode') : t('clearMode'),
            onClick: () => { setDeleteMode(!deleteMode); setDeleteTarget(null) },
          }, t('clear')) : null,
        ),
        settings.showFileTree ? React.createElement('div', { className: 'artifacts-tabs' },
          React.createElement('button', {
            type: 'button',
            className: 'artifacts-tab' + (activeView === 'artifacts' ? ' is-active' : ''),
            onClick: () => setActiveView('artifacts'),
          }, t('artifacts')),
          React.createElement('button', {
            type: 'button',
            className: 'artifacts-tab' + (activeView === 'tree' ? ' is-active' : ''),
            onClick: () => { setActiveView('tree'); setDeleteMode(false); setDeleteTarget(null) },
          }, t('fileTree')),
        ) : null,
        React.createElement('div', {
          className: 'artifacts-main',
          ref: mainRef,
        },
          React.createElement('div', {
            className: 'artifacts-body',
            // The body takes exactly `split` of the split area, so the divider
            // freely divides list/tree from preview in BOTH tabs (its position
            // follows the pointer, never the content height). When collapsed
            // the list fills the whole area (preview hidden).
            style: collapsed ? { flex: '1 1 auto' } : { flex: '0 0 auto', height: (split * 100) + '%' },
          },
            (activeView === 'tree' && settings.showFileTree)
              ? React.createElement(FileTree, { onOpen: openFile, selectedPath: preview ? preview.path : null })
              : [
                  deleteMode ? React.createElement('div', { className: 'artifacts-delete-hint' }, t('clearModeHint')) : null,
                  listChildren,
                ],
          ),
          React.createElement('div', {
            className: 'artifacts-splitter' + (splitting ? ' artifacts-splitting' : '') + (collapsed ? ' artifacts-collapsed' : ''),
            title: t('resizeDivider'),
            onMouseDown: startSplit,
          },
            React.createElement('button', {
              type: 'button',
              className: 'artifacts-collapse-btn',
              title: collapsed ? t('expandPreview') : t('collapsePreview'),
              'aria-expanded': !collapsed,
              onMouseDown: (e) => e.stopPropagation(),
              onClick: () => { if (collapsed) expandPreview(); else setCollapsed(true) },
            }, React.createElement('span', { className: 'artifacts-collapse-icon' }, ChevronIcon(10))),
          ),
          React.createElement('div', {
            className: 'artifacts-preview',
            style: collapsed ? { flex: '0 0 0%', display: 'none' } : { flex: '1 1 auto', minHeight: 0 },
          },
            preview ? renderPreview(preview) : React.createElement('div', { className: 'artifacts-hint' }, t('previewHint')),
          ),
        ),
      )
    }

    // DSH ≥0.1.7 ships a built-in right sidebar whose controls share the
    // screen's top-right corner with this panel's trigger: its tab-strip
    // buttons while expanded (push mode), and a header expand control while
    // collapsed (cleared by the styles' header reservation). Its width lives
    // in a --dsh-sidebar-width set on its own panel subtree — invisible to
    // this plugin's overlay — so measure the panel here and publish the
    // occupied width as --dsh-rightbar-occlusion on <html> for the trigger's
    // `right` calc. Fullscreen mode covers the trigger's stacking layer
    // entirely, so it counts as no occlusion.
    const RIGHTBAR_OCC_VAR = '--dsh-rightbar-occlusion'
    let rightbarOccFrame = 0
    const measureRightbar = () => {
      rightbarOccFrame = 0
      let occ = 0
      for (const panel of document.querySelectorAll('[data-sidebar-right-panel]')) {
        if (panel.getAttribute('data-sidebar-right-panel') !== 'push') continue
        if (!panel.hasAttribute('data-sidebar-right-open')) continue
        if (panel.offsetParent === null) continue // a retained but hidden session view
        const rect = panel.getBoundingClientRect()
        if (rect.width > 0) { occ = Math.round(rect.width); break }
      }
      const next = occ + 'px'
      if (document.documentElement.style.getPropertyValue(RIGHTBAR_OCC_VAR) !== next) {
        document.documentElement.style.setProperty(RIGHTBAR_OCC_VAR, next)
      }
    }
    const scheduleRightbarMeasure = () => {
      if (rightbarOccFrame) return
      rightbarOccFrame = requestAnimationFrame(measureRightbar)
    }
    // One tracker per page even if the plugin body is applied twice.
    if (!window.__dshPopoutSidebarRightbarTracker) {
      window.__dshPopoutSidebarRightbarTracker = true
      try {
        const seen = new WeakSet()
        const ro = new ResizeObserver(scheduleRightbarMeasure)
        const watch = () => {
          for (const panel of document.querySelectorAll('[data-sidebar-right-panel]')) {
            if (!seen.has(panel)) { seen.add(panel); ro.observe(panel) }
          }
        }
        // childList catches the panel mounting/unmounting (per-session seats);
        // attributes catch open/close and push/fullscreen flips; the resize
        // observer catches width drags of the built-in panel.
        new MutationObserver(() => { scheduleRightbarMeasure(); watch() })
          .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-sidebar-right-open', 'data-sidebar-right-panel'] })
        watch()
      } catch (e) {}
      window.addEventListener('resize', scheduleRightbarMeasure, { passive: true })
      measureRightbar()
    }

    // Persistent trigger pinned to the top-right corner. Registered into the
    // root-scoped `shell.overlay` list so it stays visible with no conversation;
    // the fixed CSS position keeps it at the corner, offset left by the right
    // sidebar(s) so it never gets covered. Icon-only by design.
    const CornerButton = () => {
      useLocaleRevision()
      const open = useOpen()
      if (open) return null
      return React.createElement('button', {
        type: 'button',
        className: 'artifacts-corner-btn',
        title: t('sidebarTitle'),
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
      useLocaleRevision()
      const settings = useSettings()
      const set = (key, value) => settingsStore.set(key, value)

      return React.createElement('div', { className: 'artifacts-settings' },
        React.createElement('p', { className: 'artifacts-setintro' }, t('settingsIntro')),
        React.createElement('div', { className: 'artifacts-setgroup' },
          React.createElement(SettingsToggle, {
            label: t('defaultOpen'),
            desc: t('defaultOpenDesc'),
            value: settings.defaultOpen,
            onToggle: (v) => set('defaultOpen', v),
          }),
          React.createElement(SettingsToggle, {
            label: t('autoRefresh'),
            desc: t('autoRefreshDesc'),
            value: settings.autoRefresh,
            onToggle: (v) => set('autoRefresh', v),
          }),
          React.createElement(SettingsToggle, {
            label: t('fileTree'),
            desc: t('fileTreeDesc'),
            value: settings.showFileTree,
            onToggle: (v) => set('showFileTree', v),
          }),
          React.createElement('div', { className: 'artifacts-setrow' },
            React.createElement('div', { className: 'artifacts-settext' },
              React.createElement('div', { className: 'artifacts-settitle' }, t('minWidth')),
              React.createElement('div', { className: 'artifacts-setdesc' }, t('minWidthDesc')),
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
              React.createElement('div', { className: 'artifacts-settitle' }, t('previewHeight')),
              React.createElement('div', { className: 'artifacts-setdesc' }, t('previewHeightDesc')),
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

