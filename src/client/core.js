    const basename = (p) => {
      const parts = String(p).split('/')
      return parts[parts.length - 1] || p
    }

    // The current session id, read from the client sessions store. The file
    // tree passes it to the host so it can root at the session's workspace.
    const currentSessionId = () => {
      try {
        const sessions = ctx.get('sessions')
        const list = sessions && sessions.list
        if (list && typeof list.getSnapshot === 'function') {
          const snap = list.getSnapshot()
          const id = snap && (snap.current != null ? snap.current : snap.active)
          return typeof id === 'string' ? id : ''
        }
      } catch (e) {}
      return ''
    }

    // Write `@path` into the current session's composer draft. Returns true on
    // success, false when the input API is unavailable (caller then falls back
    // to clipboard copy).
    const quoteToComposer = (path) => {
      try {
        const sessions = ctx.get('sessions')
        const conversation = ctx.get('conversation')
        if (!sessions || !conversation) return false
        const list = sessions.list
        let sessionId
        if (list && typeof list.getSnapshot === 'function') {
          const snap = list.getSnapshot()
          sessionId = snap && (snap.current != null ? snap.current : snap.active)
        }
        if (sessionId == null) return false
        const actx = typeof sessions.scope === 'function' ? sessions.scope(sessionId) : undefined
        if (!actx) return false
        const input = conversation.input && typeof conversation.input.for === 'function' ? conversation.input.for(actx) : undefined
        if (!input || typeof input.setDraft !== 'function') return false
        let draft = ''
        try {
          if (input.state && typeof input.state.getSnapshot === 'function') draft = input.state.getSnapshot().draft || ''
        } catch (e) {}
        const text = '@' + path
        input.setDraft(draft && draft.trim() !== '' ? draft + ' ' + text : text)
        return true
      } catch (e) {
        return false
      }
    }

    const fallbackCopy = (text) => {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch (e) {}
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

    // Feature settings, persisted in localStorage so they survive reloads.
    const SETTINGS_KEY = 'dsh-popout-sidebar:settings'
    const DEFAULT_SETTINGS = {
      autoRefresh: true,       // poll the artifact list while the panel is open
      minPanelWidth: 20,       // minimum panel width as % of window width
      showFileTree: true,      // show the 文件树 (file tree) tab in the panel
      defaultOpen: true,       // expand the sidebar by default on load
    }

    function loadSettings() {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') return Object.assign({}, DEFAULT_SETTINGS, parsed)
        }
      } catch (e) {}
      return Object.assign({}, DEFAULT_SETTINGS)
    }

    const settingsStore = {
      data: loadSettings(),
      listeners: [],
      get() { return this.data },
      set(key, value) {
        const next = Object.assign({}, this.data, { [key]: value })
        this.data = next
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)) } catch (e) {}
        this.listeners.forEach((fn) => { try { fn(next) } catch (e) {} })
      },
      subscribe(fn) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter((f) => f !== fn) }
      },
    }

    // Apply the "默认展开" preference once at startup, before any component
    // mounts so the initial open/closed state matches the persisted setting.
    store.open = !!settingsStore.get().defaultOpen

    const useSettings = () => {
      const [s, setS] = React.useState(settingsStore.get())
      React.useEffect(() => settingsStore.subscribe(setS), [])
      return s
    }

