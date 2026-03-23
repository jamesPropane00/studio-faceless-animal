const MAX_EVENTS = 3
const POLL_MS = 28000
const PULSE_STATE_KEY = 'fas_signal_pulse_expanded'
const PULSE_UNAVAILABLE_KEY = 'fas_signal_pulse_unavailable_paths'
const UNAVAILABLE_PATHS = new Set()

try {
  const saved = JSON.parse(sessionStorage.getItem(PULSE_UNAVAILABLE_KEY) || '[]')
  if (Array.isArray(saved)) {
    saved.forEach((p) => {
      const path = String(p || '').trim()
      if (path) UNAVAILABLE_PATHS.add(path)
    })
  }
} catch {}

function persistUnavailablePaths() {
  try {
    sessionStorage.setItem(PULSE_UNAVAILABLE_KEY, JSON.stringify(Array.from(UNAVAILABLE_PATHS)))
  } catch {}
}

function esc(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function timeAgo(iso) {
  if (!iso) return 'now'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'now'
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  return fetch(url, { ...(options || {}), signal: ctrl.signal }).finally(() => clearTimeout(t))
}

function config() {
  const cfg = window.__FAS_CONFIG || {}
  return {
    url: String(cfg.supabaseUrl || '').trim(),
    key: String(cfg.supabaseAnonKey || '').trim(),
  }
}

function getSession() {
  try {
    const sess = JSON.parse(localStorage.getItem('fas_user') || 'null')
    if (!sess || !sess.username) return null
    return sess
  } catch {
    return null
  }
}

async function fetchRows(path) {
  if (UNAVAILABLE_PATHS.has(path)) {
    return { rows: [], status: 0, skipped: true }
  }

  const cfg = config()
  if (!cfg.url || !cfg.key) return { rows: [], status: 0 }
  const url = `${cfg.url}/rest/v1/${path}`

  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
      },
    }, 5500)

    if (!res.ok) {
      // Cache schema-missing style failures so we do not keep spamming 404/400.
      if (res.status === 404 || res.status === 400) {
        UNAVAILABLE_PATHS.add(path)
        persistUnavailablePaths()
      }
      return { rows: [], status: res.status }
    }

    const data = await res.json()
    return { rows: Array.isArray(data) ? data : [], status: res.status }
  } catch {
    return { rows: [], status: -1 }
  }
}

async function fetchRowsTry(paths) {
  const list = Array.isArray(paths) ? paths : []
  for (const path of list) {
    if (UNAVAILABLE_PATHS.has(path)) continue
    const { rows } = await fetchRows(path)
    // If request succeeds with rows, use it.
    if (Array.isArray(rows) && rows.length) return rows
    // If request succeeds but is empty, keep trying schema fallbacks.
    // This avoids hard-failing when a table exists but is quiet.
  }
  return []
}

async function collectEvents() {
  const [signalsRaw, membersRaw] = await Promise.all([
    fetchRowsTry([
      'signal_board_posts?select=author_username,post_text,created_at,post_type,category&order=created_at.desc&limit=6',
      'signal_posts?select=username,display_name,content,created_at,signal_type,author_username,body_text,post_type&order=created_at.desc&limit=6',
    ]),
    fetchRowsTry([
      'member_accounts?select=username,created_at,last_active_at&order=created_at.desc&limit=8',
      'member_accounts?select=username,created_at,updated_at&order=created_at.desc&limit=8',
      'member_accounts?select=username,created_at,updated_at,page_status&order=created_at.desc&limit=8',
    ]),
  ])

  const signals = (signalsRaw || []).map((row) => {
    if (!row || typeof row !== 'object') return null
    if (row.body_text || row.content || row.username) return row
    // Normalize signal_board_posts fallback rows into signal_posts-like shape.
    return {
      author_username: row.author_username || null,
      username: row.author_username || null,
      body_text: row.post_text || '',
      post_type: row.post_type || 'text',
      created_at: row.created_at || null,
      signal_type: row.category || 'update',
    }
  }).filter(Boolean)

  const members = (membersRaw || []).map((row) => {
    if (!row || typeof row !== 'object') return null
    return {
      username: row.username || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || row.last_active_at || null,
      page_status: row.page_status || null,
    }
  }).filter(Boolean)

  const out = []
  const session = getSession()

  signals.forEach((row) => {
    const username = String(row.username || row.author_username || '').toLowerCase()
    if (!username) return
    const createdAt = row.created_at || null
    out.push({
      type: 'signal_post',
      username,
      created_at: createdAt,
      text: `@${username} dropped a signal`,
      key: `signal_post:${username}:${createdAt || 'none'}`,
    })
  })

  members.forEach((row) => {
    const username = String(row.username || '').toLowerCase()
    if (!username) return
    if (row.created_at) {
      out.push({
        type: 'user_join',
        username,
        created_at: row.created_at,
        text: `@${username} joined the network`,
        key: `user_join:${username}:${row.created_at}`,
      })
    }

    if (row.updated_at) {
      const created = row.created_at ? new Date(row.created_at).getTime() : 0
      const updated = new Date(row.updated_at).getTime()
      if (updated > created + 2 * 60 * 1000) {
        out.push({
          type: row.page_status === 'live' ? 'profile_update' : 'profile_update',
          username,
          created_at: row.updated_at,
          text: row.page_status === 'live'
            ? `@${username} updated their live page`
            : `@${username} updated their profile`,
          key: `profile_update:${username}:${row.updated_at}`,
        })
      }
    }
  })

  if (session && session.username) {
    const sessionUser = String(session.username || '').toLowerCase().trim()
    if (sessionUser) {
      out.push({
        type: 'session_presence',
        username: sessionUser,
        created_at: new Date().toISOString(),
        text: `@${sessionUser} is signed in`,
        key: `session_presence:${sessionUser}`,
      })

      const ownRecentSignal = signals.some((row) => {
        const rowUser = String(row && (row.username || row.author_username) || '').toLowerCase()
        if (rowUser !== sessionUser) return false
        const ts = row && row.created_at ? new Date(row.created_at).getTime() : 0
        if (!ts) return false
        return Date.now() - ts <= (45 * 60 * 1000)
      })

      if (ownRecentSignal) {
        out.push({
          type: 'session_activity',
          username: sessionUser,
          created_at: new Date().toISOString(),
          text: `@${sessionUser} is active now`,
          key: `session_activity:${sessionUser}`,
        })
      }
    }
  }

  const dedup = []
  const seen = new Set()
  out
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .forEach((row) => {
      if (seen.has(row.key)) return
      seen.add(row.key)
      dedup.push(row)
    })

  return dedup.slice(0, MAX_EVENTS)
}

function readExpandedState() {
  try {
    return sessionStorage.getItem(PULSE_STATE_KEY) === '1'
  } catch {
    return false
  }
}

function writeExpandedState(expanded) {
  try {
    sessionStorage.setItem(PULSE_STATE_KEY, expanded ? '1' : '0')
  } catch {}
}

function eventTag(type) {
  if (type === 'signal_post') return 'POST'
  if (type === 'user_join') return 'JOIN'
  if (type === 'connection_created') return 'CONNECT'
  if (type === 'session_presence') return 'YOU'
  if (type === 'session_activity') return 'ACTIVE'
  return 'UPDATE'
}

function eventText(evt) {
  const username = String(evt && evt.username || '').toLowerCase()
  const text = String(evt && evt.text || '').trim()
  if (!username || !text) return ''
  const prefix = `@${username}`
  const action = text.startsWith(prefix) ? text.slice(prefix.length).trim() : text
  return `<strong>${esc(prefix)}</strong> ${esc(action)}`
}

function buildDOM() {
  const root = document.createElement('aside')
  root.id = 'fas-signal-pulse'
  root.className = 'signal-pulse signal-pulse--collapsed'
  root.innerHTML = `
    <button type="button" class="signal-pulse-pill" id="signal-pulse-pill" aria-expanded="false" aria-controls="signal-pulse-panel">
      <span class="signal-pulse-live-dot" aria-hidden="true"></span>
      <span class="signal-pulse-pill-text">Signal Pulse</span>
      <span class="signal-pulse-pill-count" id="signal-pulse-count">0 live</span>
    </button>
    <section class="signal-pulse-panel" id="signal-pulse-panel" aria-live="polite">
      <header class="signal-pulse-head">
        <p class="signal-pulse-title">Signal Pulse</p>
        <p class="signal-pulse-sub">Live activity across the network</p>
      </header>
      <div class="signal-pulse-events" id="signal-pulse-events">
        <p class="signal-pulse-empty">Signal stream is quiet. Movement appears here as the network wakes up.</p>
      </div>
      <footer class="signal-pulse-foot">
        <a href="network.html#posts-feed" class="signal-pulse-link">View Board →</a>
      </footer>
    </section>
  `

  document.body.appendChild(root)
  return root
}

function detectBottomClearance() {
  let maxBottom = 0
  const fixedBottomEls = document.querySelectorAll([
    '.radio-widget',
    '#radio-widget',
    '.fas-radio-widget',
    '#fas-radio-widget',
    '[data-radio-widget]',
    '[data-player-bar]',
    '[data-audio-player]',
  ].join(', '))
  fixedBottomEls.forEach((el) => {
    const style = window.getComputedStyle(el)
    if (style.position !== 'fixed') return
    const rect = el.getBoundingClientRect()
    const overlapHeight = Math.max(0, window.innerHeight - rect.top)
    if (overlapHeight > maxBottom) maxBottom = overlapHeight
  })
  return Math.max(104, maxBottom + 14)
}

function applyPlacement(root) {
  const bottom = detectBottomClearance()
  root.style.setProperty('--signal-pulse-bottom', `${bottom}px`)
}

function renderEvents(root, events) {
  const list = root.querySelector('#signal-pulse-events')
  const count = root.querySelector('#signal-pulse-count')
  const sub = root.querySelector('.signal-pulse-sub')
  if (!list || !count) return

  const session = getSession()
  if (sub) {
    sub.textContent = session && session.username
      ? `You are signed in as @${String(session.username).toLowerCase()}. Live activity across the network`
      : 'Live activity across the network'
  }

  count.textContent = session && session.username
    ? `${events.length} live · signed in`
    : `${events.length} live`

  if (!events.length) {
    list.innerHTML = '<p class="signal-pulse-empty">Signal stream is quiet. Movement appears here as the network wakes up.</p>'
    return
  }

  list.innerHTML = events.map((evt, idx) => {
    const tag = eventTag(evt.type)
    return `
      <article class="signal-pulse-row${idx === 0 ? ' signal-pulse-row--new' : ''}">
        <span class="signal-pulse-row-dot" aria-hidden="true"></span>
        <p class="signal-pulse-row-text">${eventText(evt)}</p>
        <span class="signal-pulse-row-tag">${tag}</span>
        <time class="signal-pulse-row-time">${esc(timeAgo(evt.created_at))}</time>
      </article>`
  }).join('')

  const liveText = document.getElementById('network-live-text')
  const liveCount = document.getElementById('network-live-count')
  if (liveText && events[0]) {
    const sessionSuffix = session && session.username
      ? ` You are signed in as @${esc(String(session.username).toLowerCase())}.`
      : ''
    liveText.innerHTML = `<strong>Signal stream is live</strong> — ${esc(events[0].text)}.${sessionSuffix}`
  }
  if (liveCount) {
    liveCount.textContent = session && session.username
      ? `${events.length} Live · Signed In`
      : `${events.length} Live`
  }
}

function bindToggle(root) {
  const pill = root.querySelector('#signal-pulse-pill')
  if (!pill) return

  if (readExpandedState()) {
    root.classList.remove('signal-pulse--collapsed')
    pill.setAttribute('aria-expanded', 'true')
  } else {
    root.classList.add('signal-pulse--collapsed')
    pill.setAttribute('aria-expanded', 'false')
  }

  pill.addEventListener('click', () => {
    const collapsed = root.classList.toggle('signal-pulse--collapsed')
    pill.setAttribute('aria-expanded', String(!collapsed))
    writeExpandedState(!collapsed)
  })
}

async function refresh(root) {
  const events = await collectEvents()
  renderEvents(root, events)
}

function init() {
  if (document.getElementById('fas-signal-pulse')) return
  const root = buildDOM()
  bindToggle(root)
  applyPlacement(root)
  refresh(root)

  let busy = false
  setInterval(async () => {
    if (busy) return
    busy = true
    await refresh(root)
    applyPlacement(root)
    busy = false
  }, POLL_MS)

  window.addEventListener('resize', () => applyPlacement(root), { passive: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
