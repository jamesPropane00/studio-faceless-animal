/**
 * Signal Phone — Main Application
 * Smartphone-style communication shell for Faceless Animal Studios.
 * Handles calls, messages, contacts, dialer, recents, and settings.
 */

/* getSession inlined — no static import (member-db.js depends on supabase-client which may fail) */
function getSession() {
  try { return JSON.parse(localStorage.getItem('fas_user') || 'null') } catch { return null }
}

let CallManager, ServerDMBackend, notifs

/* ── State ── */
let session = null
let myUsername = ''
let backend = null
let callManager = null
let currentScreen = 'home'
let activeChatPartner = null
let contactsCache = []
let threadsCache = []
let recentsCache = []
let incognitoMode = false
let missedCalls = 0
let callHistory = []
let isOfflineFallback = false
let currentCallInfo = null
let currentCallHistoryId = null
let currentCallDirection = null

/* ── Dialer State ── */
let dialMode = '123'
let dialTapKey = null
let dialTapIndex = 0
let dialTapTimer = null
let dialLastPos = -1

const KEY_LETTERS = {
  '1': '.,!?\'"1',
  '2': 'ABC2',
  '3': 'DEF3',
  '4': 'GHI4',
  '5': 'JKL5',
  '6': 'MNO6',
  '7': 'PQRS7',
  '8': 'TUV8',
  '9': 'WXYZ9',
  '0': ' 0',
  '*': '*',
  '#': '#'
}
const KEY_LETTERS_DISPLAY = {
  '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL',
  '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ'
}

const CONTACTS_KEY = 'fas_phone_contacts_v1'
const CALL_HISTORY_KEY = 'fas_phone_call_history'
const SETTINGS_KEY = 'fas_phone_settings_v1'

/* ── Helpers ── */
const $ = id => document.getElementById(id)
const esc = str => String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const sigCodeRegex = /^SIG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/i
const signalCodeBody = raw => {
  let compact = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (compact.startsWith('SIG')) compact = compact.slice(3)
  return compact.replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 8)
}
const formatSignalCode = raw => {
  const compact = signalCodeBody(raw)
  if (!compact) return ''
  return `SIG-${compact.slice(0, 4)}${compact.length > 4 ? `-${compact.slice(4)}` : ''}`
}
const normalizeCode = raw => formatSignalCode(raw)
const normalizeUser = raw => String(raw || '').trim().replace(/^@+/, '').toLowerCase()

function loadJSON(key, def) { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v != null ? v : def } catch { return def } }
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)) }
function withTimeout(promise, ms, fallback = false) {
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise(resolve => setTimeout(() => resolve(fallback), ms)),
  ])
}

function showError(msg) {
  $('phone-loading').style.display = 'none'
  const errEl = $('phone-error')
  const errMsg = $('phone-error-message')
  if (errEl) errEl.style.display = ''
  if (errMsg) errMsg.textContent = msg || 'The Signal Phone could not start. Check your connection and try again.'
}

/* ── Offline Backend Stub ── */
function createNotificationFallback() {
  return {
    requestPermission: () => {},
    showToast: ({ title, message }) => console.info('[Signal Phone]', title || '', message || ''),
    startRinging: () => {},
    stopRinging: () => {},
    startRingtone: () => {},
    stopRingtone: () => {},
    vibrate: () => {},
    playNotificationSound: () => {},
    showBrowserNotification: () => {},
    notify: () => {},
  }
}

function createOfflineBackend() {
  return {
    init: async () => true,
    startSync: () => {},
    stopSync: () => {},
    getContacts: async () => [],
    getMessages: async () => [],
    sendMessage: async () => ({ ok: false, error: 'Offline mode' }),
    resolveSignalCode: async () => null,
    getRoomIdForUser: async () => null,
    setCallContext: () => {},
    sendCallSignal: async () => {},
    getThreads: async () => []
  }
}

/* ── Initialization ── */
async function init() {
  session = getSession()
  if (!session || !session.username) {
    $('phone-loading').style.display = 'none'
    $('phone-gate').style.display = ''
    window.__phoneReady = true
    return
  }

  try {
    const moduleResults = await withTimeout(Promise.all([
      import('./call-manager.js'),
      import('./notification-manager.js'),
    ]), 8000, null)
    if (!moduleResults) throw new Error('Phone module loading timed out.')
    CallManager = moduleResults[0].CallManager
    notifs = moduleResults[1].notifs || createNotificationFallback()
  } catch (err) {
    console.error('[FAS] Core phone module load failed:', err)
    showError('The core phone controls could not load. Refresh the page and try again.')
    return
  }

  try {
    myUsername = String(session.username).toLowerCase()

    const settings = loadJSON(SETTINGS_KEY, {})
    incognitoMode = settings.incognito || false
    callHistory = loadJSON(CALL_HISTORY_KEY, [])
    callHistory = callHistory.map((record, index) => ({
      ...record,
      id: record.id || `legacy_${index}_${new Date(record.ts || 0).getTime()}`
    }))
    saveJSON(CALL_HISTORY_KEY, callHistory)

    notifs.requestPermission()

    callManager = new CallManager({
      localName: myUsername,
      onStateChange: onCallStateChange,
      onRemoteStream: onRemoteStream
    })

    // Open the phone immediately. Network backends connect below without
    // holding the entire UI behind a loading screen.
    backend = createOfflineBackend()
    isOfflineFallback = true
    $('phone-loading').style.display = 'none'
    $('phone-error').style.display = 'none'
    $('phone-shell').style.display = ''
    window.__phoneReady = true
    updateStatusBar()
    updateModeBadge()
    bindDock()
    bindCallUI()
    bindActionBar()
    showScreen('home')
    startStatusBarClock()

    try {
      const serverModule = await withTimeout(import('./server-dm-backend.js'), 6000, null)
      if (!serverModule) throw new Error('Signal Phone network timed out.')
      ServerDMBackend = serverModule.ServerDMBackend
      backend = new ServerDMBackend()
      const signalReady = await withTimeout(backend.init(), 7000, false)
      if (!signalReady) throw new Error('Signal Phone network could not connect.')
      isOfflineFallback = false
    } catch (err) {
      console.warn('[FAS] Direct Signal Phone backend unavailable:', err)
      backend = createOfflineBackend()
      isOfflineFallback = true
    }

    /* If backend still not ready, fall back to offline mode */
    const backendReady = await (async () => {
      try {
        if (backend.backendName === 'signal') return !isOfflineFallback
        const test = await withTimeout(backend.getContacts(), 6000, null)
        return Array.isArray(test)
      } catch { return false }
    })()
    if (!backendReady && !isOfflineFallback) {
      console.warn('[FAS] No backend available — falling back to offline mode')
      backend = createOfflineBackend()
      isOfflineFallback = true
    }

    if (isOfflineFallback) {
      notifs.showToast({ title: 'Offline Mode', message: 'Phone is offline. Contacts and history from local storage.', type: 'info', duration: 4000 })
    }

    await refreshContacts()
    await refreshThreads()
    showScreen('home')

    if (!isOfflineFallback) {
      backend.startSync(onBackendMessage, onBackendCallEvent)
    }
    const params = new URLSearchParams(window.location.search)
    const openChat = params.get('chat')
    if (openChat) {
      showScreen('messages')
      openConversation(normalizeUser(openChat))
    }
  } catch (err) {
    console.error('[FAS] Phone init error:', err)
    if (window.__phoneReady) {
      backend = createOfflineBackend()
      isOfflineFallback = true
      notifs = notifs || createNotificationFallback()
      notifs.showToast({ title: 'Offline Mode', message: 'Phone opened without network services.', type: 'info', duration: 4000 })
    } else {
      showError(err.message || 'Unknown error during initialization.')
    }
  }
}

/* ── Status Bar ── */
function startStatusBarClock() {
  updateClock()
  setInterval(updateClock, 10000)
}

function updateClock() {
  const now = new Date()
  const h = now.getHours()
  const m = String(now.getMinutes()).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  $('phone-statusbar-time').textContent = `${h12}:${m} ${ampm}`
}

function updateStatusBar() {
  $('phone-statusbar-mode').textContent = 'Signal'
  $('phone-incognito-badge').style.display = incognitoMode ? '' : 'none'
}

function updateModeBadge() {
  const badge = $('phone-incognito-badge')
  if (incognitoMode) {
    badge.style.display = ''
    badge.textContent = 'Incognito'
  } else {
    badge.style.display = 'none'
  }
}

/* ── Screen Navigation ── */
function showScreen(name) {
  currentScreen = name
  document.querySelectorAll('.phone-dock-btn').forEach(btn => {
    btn.classList.toggle('phone-dock-btn--active', btn.dataset.screen === name)
  })
  renderScreen(name)
}

function renderScreen(name) {
  const screen = $('phone-screen')
  switch (name) {
    case 'home': renderHome(screen); break
    case 'contacts': renderContactsScreen(screen); break
    case 'messages': renderMessagesScreen(screen); break
    case 'dialer': renderDialerScreen(screen); break
    case 'recents': renderRecentsScreen(screen); break
    default: renderHome(screen)
  }
}

/* ── Home Screen ── */
function renderHome(screen) {
  const missed = callHistory.filter(c => c.type === 'missed').length
  const recentCalls = callHistory.slice(-5).reverse()
  const recentThreads = (threadsCache || []).slice(0, 5)

  screen.innerHTML = `
    <div class="phone-home">
      <div class="phone-home-header">
        <h2>Signal Phone</h2>
        <p>@${esc(myUsername)}${isOfflineFallback ? ' <span style="color:var(--phone-red);font-size:0.7rem;">OFFLINE</span>' : ''}</p>
      </div>

      <div class="phone-section-title">${missed > 0 ? `Missed Calls (${missed})` : 'Recent Calls'}</div>
      ${recentCalls.length === 0 ? '<div class="phone-empty">No recent calls</div>' :
        recentCalls.map(c => `
          <div class="phone-item">
            <div class="phone-item-avatar ${c.type === 'missed' ? 'phone-item-avatar--call' : ''}">${esc((c.displayName || c.contact || '?')[0].toUpperCase())}</div>
            <div class="phone-item-body">
              <strong>${esc(c.displayName || c.contact)}</strong>
              <small>@${esc(c.username || c.contact)}${c.signalCode ? ` · ${esc(c.signalCode)}` : ''}</small>
              <small>${c.type === 'missed' ? 'Missed call' : c.type === 'incoming' ? 'Incoming call' : 'Outgoing call'} · ${c.duration ? (callManager ? callManager.formatTime(c.duration) : Math.floor(c.duration/60)+'m') : 'No answer'}</small>
            </div>
            <span class="phone-item-time">${fmtTime(c.ts)}</span>
            <div class="phone-recent-actions">
              <button data-action="redial" data-call-id="${esc(c.id || '')}" aria-label="Call again">📞</button>
              <button data-action="add-contact" data-call-id="${esc(c.id || '')}" aria-label="Add to contacts">＋</button>
            </div>
          </div>
        `).join('')
      }

      <div class="phone-section-title">Recent Messages</div>
      ${recentThreads.length === 0 ? '<div class="phone-empty">No recent messages</div>' :
        recentThreads.map(t => `
          <div class="phone-item" data-action="open-chat" data-contact="${esc(t.username)}">
            <div class="phone-item-avatar">${esc((t.display_name || t.username || '?')[0].toUpperCase())}</div>
            <div class="phone-item-body">
              <strong>${esc(t.display_name || t.username)}</strong>
              <small>${esc((t.last_message || '').slice(0, 80))}</small>
            </div>
            <span class="phone-item-time">${fmtTime(t.last_ts)}</span>
            ${(t.unread || 0) > 0 ? `<span class="phone-item-badge">${t.unread}</span>` : ''}
          </div>
        `).join('')
      }
    </div>
  `

  screen.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.dataset.action
      const contact = el.dataset.contact
      if (action === 'redial') {
        const record = callHistory.find(c => c.id === el.dataset.callId)
        const target = record?.signalCode || record?.contact
        if (target) startCall(target, false)
      }
      else if (action === 'add-contact') {
        const record = callHistory.find(c => c.id === el.dataset.callId)
        if (record) savePhoneContact(record)
      }
      else if (action === 'call') showScreen('dialer')
      else if (action === 'open-chat' && contact) {
        showScreen('messages')
        openConversation(contact)
      }
    })
  })
}

/* ── Contacts Screen ── */
function renderContactsScreen(screen) {
  const q = screen.dataset.searchQuery || ''
  const filtered = q ? contactsCache.filter(c =>
    (c.displayName || '').toLowerCase().includes(q) ||
    (c.username || '').toLowerCase().includes(q) ||
    (c.signalCode || '').includes(q.toUpperCase())
  ) : contactsCache

  screen.innerHTML = `
    <div class="phone-contacts-search">
      <input type="text" placeholder="Search contacts..." value="${esc(q)}" id="phone-contacts-search-input" />
    </div>
    ${filtered.length === 0 ? '<div class="phone-empty">No contacts found. Add contacts via Signal Code.</div>' :
      filtered.map(c => {
        const initial = (c.displayName || c.username || '?')[0].toUpperCase()
        return `
          <div class="phone-item" data-contact='${esc(JSON.stringify(c))}'>
            <div class="phone-item-avatar">${esc(initial)}</div>
            <div class="phone-item-body">
              <strong>${esc(c.displayName || c.username)}</strong>
              <small>@${esc(c.username || '')}${c.signalCode ? ` · ${esc(c.signalCode)}` : ''}</small>
            </div>
          </div>
        `
      }).join('')
    }
  `

  const input = $('phone-contacts-search-input')
  if (input) {
    input.addEventListener('input', () => {
      screen.dataset.searchQuery = input.value.toLowerCase()
      renderContactsScreen(screen)
    })
  }

  screen.querySelectorAll('[data-contact]').forEach(el => {
    el.addEventListener('click', () => {
      try {
        const c = JSON.parse(el.dataset.contact)
        showContactActions(c)
      } catch {}
    })
  })
}

/* ── Contact Actions Modal ── */
function showContactActions(c) {
  const screen = $('phone-screen')
  screen.innerHTML = `
    <div style="padding:24px 16px;">
      <div style="text-align:center;margin-bottom:20px;">
        <div class="phone-item-avatar" style="margin:0 auto 12px;width:60px;height:60px;font-size:1.6rem;">${esc((c.displayName || c.username || '?')[0].toUpperCase())}</div>
        <h3 style="margin:0;color:var(--phone-text);font-size:1.1rem;">${esc(c.displayName || c.username)}</h3>
        <p style="margin:4px 0 0;font-size:0.78rem;color:var(--phone-text-dim);">@${esc(c.username || '')}${c.signalCode ? ` · ${esc(c.signalCode)}` : ''}</p>
      </div>
      <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;">
        <button class="phone-call-btn phone-call-btn--answer" data-action="call" data-contact="${esc(c.username || c.signalCode)}" style="width:70px;height:70px;font-size:1.2rem;">
          📞<small style="display:block;font-size:0.6rem;margin-top:2px;">Call</small>
        </button>
        <button class="phone-call-btn" data-action="video-call" data-contact="${esc(c.username || c.signalCode)}" style="width:70px;height:70px;font-size:1.2rem;background:var(--phone-blue);color:white;">
          📹<small style="display:block;font-size:0.6rem;margin-top:2px;">Video</small>
        </button>
        <button class="phone-call-btn" data-action="message" data-contact="${esc(c.username || c.signalCode)}" style="width:70px;height:70px;font-size:1.2rem;background:var(--phone-purple);color:white;">
          💬<small style="display:block;font-size:0.6rem;margin-top:2px;">Message</small>
        </button>
        ${!incognitoMode && c.matrixId ? `
          <button class="phone-call-btn" data-action="copy-matrix" data-contact="${esc(c.matrixId)}" style="width:70px;height:70px;font-size:1.2rem;">
            @<small style="display:block;font-size:0.6rem;margin-top:2px;">Copy ID</small>
          </button>
        ` : ''}
      </div>
      <div style="text-align:center;margin-top:16px;">
        <button class="btn btn-ghost btn-sm" id="phone-contact-back">Back</button>
      </div>
    </div>
  `

  screen.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async () => {
      const action = el.dataset.action
      const contact = el.dataset.contact
      if (action === 'call') {
        if (sigCodeRegex.test(contact)) {
          startCall(contact, false)
        } else {
          showScreen('dialer')
        }
      } else if (action === 'video-call') {
        if (sigCodeRegex.test(contact)) {
          startCall(contact, true)
        } else {
          showScreen('dialer')
        }
      } else if (action === 'message') {
        showScreen('messages')
        openConversation(contact)
      } else if (action === 'copy-matrix') {
        try { await navigator.clipboard.writeText(contact); if(notifs) notifs.showToast({ title: 'Copied', message: 'Matrix ID copied', type: 'info', duration: 2000 }) } catch {}
      }
    })
  })
  $('phone-contact-back')?.addEventListener('click', () => showScreen('contacts'))
}

/* ── Messages Screen ── */
function renderMessagesScreen(screen) {
  if (activeChatPartner) {
    renderChat(screen)
    return
  }
  renderThreadList(screen)
}

function renderThreadList(screen) {
  const threads = threadsCache || []
  screen.innerHTML = `
    <div style="padding:4px 0;">
      <div class="phone-section-title">Messages</div>
      ${threads.length === 0 ? '<div class="phone-empty">No conversations yet</div>' :
        threads.map(t => {
          const initial = (t.display_name || t.username || '?')[0].toUpperCase()
          return `
            <div class="phone-item" data-thread="${esc(t.username)}">
              <div class="phone-item-avatar">${esc(initial)}</div>
              <div class="phone-item-body">
                <strong>${esc(t.display_name || t.username)}</strong>
                <small>${esc((t.last_message || '').slice(0, 80))}</small>
              </div>
              <span class="phone-item-time">${fmtTime(t.last_ts)}</span>
              ${(t.unread || 0) > 0 ? `<span class="phone-item-badge">${t.unread}</span>` : ''}
            </div>
          `
        }).join('')
      }
    </div>
  `

  screen.querySelectorAll('[data-thread]').forEach(el => {
    el.addEventListener('click', () => {
      openConversation(el.dataset.thread)
    })
  })
}

async function openConversation(contact) {
  if (!contact) return
  activeChatPartner = normalizeUser(contact)
  renderScreen('messages')
}

function renderChat(screen) {
  const contact = activeChatPartner
  const contactInfo = contactsCache.find(c => normalizeUser(c.username || '') === contact || normalizeUser(c.displayName || '') === contact)
  const displayName = contactInfo?.displayName || contact
  const initial = (displayName || '?')[0].toUpperCase()

  screen.innerHTML = `
    <div class="phone-chat">
      <div class="phone-chat-header">
        <button class="phone-chat-back" id="phone-chat-back-btn">←</button>
        <div class="phone-item-avatar" style="width:32px;height:32px;font-size:0.7rem;">${esc(initial)}</div>
        <h3>${esc(displayName)}</h3>
        <div class="phone-chat-actions">
          <button id="phone-chat-call" title="Call">📞</button>
          <button id="phone-chat-video" title="Video Call">📹</button>
        </div>
      </div>
      <div class="phone-chat-feed" id="phone-chat-feed">
        <div class="phone-empty">Loading messages...</div>
      </div>
      <div class="phone-chat-input-area">
        <input class="phone-chat-input" id="phone-chat-input" type="text" maxlength="500" placeholder="Message..." autocomplete="off" />
        <button class="phone-chat-send" id="phone-chat-send-btn">→</button>
      </div>
    </div>
  `

  $('phone-chat-back-btn')?.addEventListener('click', () => {
    activeChatPartner = null
    renderScreen('messages')
  })

  $('phone-chat-call')?.addEventListener('click', () => startCall(contact, false))
  $('phone-chat-video')?.addEventListener('click', () => startCall(contact, true))

  loadChatMessages(contact)

  const input = $('phone-chat-input')
  const sendBtn = $('phone-chat-send-btn')
  if (input && sendBtn) {
    const doSend = async () => {
      const text = input.value.trim()
      if (!text) return
      input.disabled = true
      sendBtn.disabled = true
      const r = await backend.sendMessage(contact, text)
      if (r.ok) {
        input.value = ''
        loadChatMessages(contact)
      } else if (isOfflineFallback) {
        input.value = ''
        notifs.showToast({ title: 'Offline', message: 'Message queued locally (backend unavailable)', type: 'info', duration: 3000 })
      } else {
        notifs.showToast({ title: 'Error', message: r.error || 'Send failed', type: 'error', duration: 3000 })
      }
      input.disabled = false
      sendBtn.disabled = false
      input.focus()
    }
    sendBtn.addEventListener('click', doSend)
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend() } })
    input.focus()
  }
}

async function loadChatMessages(contact) {
  const feed = $('phone-chat-feed')
  if (!feed) return
  const msgs = await backend.getMessages(contact)
  if (!msgs || msgs.length === 0) {
    feed.innerHTML = '<div class="phone-empty">No messages yet. Say hello!</div>'
    return
  }
  feed.innerHTML = msgs.map(m => {
    const isSent = m.sender?.includes(myUsername) || m.sender === `@${myUsername}`
    return `
      <div class="phone-chat-bubble ${isSent ? 'phone-chat-bubble--sent' : 'phone-chat-bubble--recv'}">
        ${esc(m.body || '')}
        <small>${fmtTime(m.ts)}</small>
      </div>
    `
  }).join('')
  feed.scrollTop = feed.scrollHeight
}

/* ── Dialer State helpers ── */
function resetDialTap() {
  dialTapKey = null
  dialTapIndex = 0
  dialLastPos = -1
  if (dialTapTimer) { clearTimeout(dialTapTimer); dialTapTimer = null }
}

function toggleDialMode() {
  dialMode = dialMode === '123' ? 'ABC' : '123'
  resetDialTap()
  renderScreen('dialer')
}

function insertDialChar(input, key, screen) {
  const letters = KEY_LETTERS[key] || key
  let body = signalCodeBody(input.value)
  if (body.length >= 8 && !(dialMode === 'ABC' && dialTapKey === key && dialTapTimer)) return

  if (dialMode === 'ABC' && letters.length > 1) {
    if (dialTapKey === key && dialTapTimer) {
      dialTapIndex = (dialTapIndex + 1) % letters.length
      clearTimeout(dialTapTimer)
      dialTapTimer = setTimeout(resetDialTap, 600)
      body = body.slice(0, -1) + letters[dialTapIndex]
    } else {
      dialTapKey = key
      dialTapIndex = 0
      dialLastPos = body.length
      if (dialTapTimer) clearTimeout(dialTapTimer)
      dialTapTimer = setTimeout(resetDialTap, 600)
      body += letters[0]
    }
  } else {
    resetDialTap()
    body += key
  }

  input.value = formatSignalCode(body)
  screen.dataset.dialValue = input.value
  showDialSuggestions(input.value)
  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
}

/* ── Dialer Screen ── */
function renderDialerScreen(screen) {
  const dialValue = screen.dataset.dialValue || ''
  screen.innerHTML = `
    <div class="phone-dialer">
      <input class="phone-dialer-input" id="phone-dial-input" type="text" inputmode="text" placeholder="Type 8 letters/numbers" value="${esc(formatSignalCode(dialValue))}" maxlength="13" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="characters" aria-label="Signal ID; dashes are added automatically" />
      <div class="phone-dialer-mode-switch">
        <button class="phone-dialer-mode-btn${dialMode === '123' ? ' phone-dialer-mode-btn--active' : ''}" id="phone-dial-mode-123">123</button>
        <button class="phone-dialer-mode-btn${dialMode === 'ABC' ? ' phone-dialer-mode-btn--active' : ''}" id="phone-dial-mode-abc">ABC</button>
      </div>
      <div class="phone-dialer-grid">
        ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(k => {
          const letters = KEY_LETTERS_DISPLAY[k] || ''
          return `<button class="phone-dial-key" data-key="${k}">
            <span class="phone-dial-key-num">${k}</span>
            ${letters ? `<span class="phone-dial-key-letters">${letters}</span>` : ''}
          </button>`
        }).join('')}
        <button class="phone-dial-key phone-dial-key--delete" id="phone-dial-delete"><span class="phone-dial-key-num">⌫</span></button>
        <button class="phone-dial-key phone-dial-key--call" id="phone-dial-call"><span class="phone-dial-key-num">📞</span></button>
        <button class="phone-dial-key phone-dial-key--video" id="phone-dial-video"><span class="phone-dial-key-num">📹</span></button>
      </div>
      <div class="phone-dialer-suggestions" id="phone-dial-suggestions"></div>
    </div>
  `

  const input = $('phone-dial-input')
  if (input) {
    const onInput = () => {
      input.value = formatSignalCode(input.value)
      screen.dataset.dialValue = input.value
      showDialSuggestions(input.value)
    }
    input.addEventListener('input', onInput)
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const code = normalizeCode(input.value)
        if (sigCodeRegex.test(code)) startCall(code, false)
      }
    })
  }

  $('phone-dial-mode-123')?.addEventListener('click', () => { dialMode = '123'; resetDialTap(); renderScreen('dialer') })
  $('phone-dial-mode-abc')?.addEventListener('click', () => { dialMode = 'ABC'; resetDialTap(); renderScreen('dialer') })

  screen.querySelectorAll('[data-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key
      if (!input) return
      insertDialChar(input, key, screen)
    })
  })

  $('phone-dial-delete')?.addEventListener('click', () => {
    if (!input) return
    resetDialTap()
    const body = signalCodeBody(input.value)
    if (!body) return
    const newVal = formatSignalCode(body.slice(0, -1))
    input.value = newVal
    screen.dataset.dialValue = newVal
    showDialSuggestions(newVal)
    input.focus()
    input.setSelectionRange(newVal.length, newVal.length)
  })

  $('phone-dial-call')?.addEventListener('click', () => {
    const code = normalizeCode(input?.value || '')
    if (sigCodeRegex.test(code)) startCall(code, false)
    else if(isOfflineFallback) {
      notifs.showToast({ title: 'Offline', message: 'Cannot place calls in offline mode', type: 'info', duration: 3000 })
    } else {
      notifs.showToast({ title: 'Invalid', message: 'Enter a valid Signal Code (SIG-XXXX-XXXX)', type: 'error', duration: 3000 })
    }
  })

  $('phone-dial-video')?.addEventListener('click', () => {
    const code = normalizeCode(input?.value || '')
    if (sigCodeRegex.test(code)) startCall(code, true)
    else if(isOfflineFallback) {
      notifs.showToast({ title: 'Offline', message: 'Cannot place calls in offline mode', type: 'info', duration: 3000 })
    } else {
      notifs.showToast({ title: 'Invalid', message: 'Enter a valid Signal Code (SIG-XXXX-XXXX)', type: 'error', duration: 3000 })
    }
  })

  showDialSuggestions(dialValue)
}

async function showDialSuggestions(query) {
  const el = $('phone-dial-suggestions')
  if (!el) return
  const code = normalizeCode(query)
  if (isOfflineFallback) {
    el.innerHTML = '<div class="phone-empty" style="text-align:left;padding:4px 0;">Offline — dialing unavailable</div>'
    return
  }
  if (!sigCodeRegex.test(code) || code.length < 13) {
    el.innerHTML = query.length >= 3 ? '<div class="phone-empty" style="text-align:left;padding:4px 0;">Enter a full Signal Code to call</div>' : ''
    return
  }
  el.innerHTML = '<div class="phone-empty" style="text-align:left;padding:4px 0;">Resolving...</div>'
  const resolved = await backend.resolveSignalCode(code)
  if (resolved) {
    el.innerHTML = `
      <div class="phone-dialer-suggestion" style="display:flex;justify-content:space-between;align-items:center;">
        <span><strong>${esc(resolved.displayName || resolved.username)}</strong> · ${esc(resolved.signalCode)}</span>
        <span style="display:flex;gap:8px;">
          <button class="phone-call-btn phone-call-btn--answer" data-action="quick-call" data-contact="${esc(code)}" style="width:40px;height:40px;font-size:0.9rem;">📞</button>
          <button class="phone-call-btn" data-action="quick-message" data-contact="${esc(resolved.username)}" style="width:40px;height:40px;font-size:0.9rem;background:var(--phone-purple);color:white;">💬</button>
          <button class="phone-call-btn" data-action="quick-add" style="width:40px;height:40px;font-size:1rem;" aria-label="Add to contacts">＋</button>
        </span>
      </div>
    `
    el.querySelector('[data-action="quick-call"]')?.addEventListener('click', () => startCall(code, false))
    el.querySelector('[data-action="quick-message"]')?.addEventListener('click', () => {
      showScreen('messages')
      openConversation(resolved.username)
    })
    el.querySelector('[data-action="quick-add"]')?.addEventListener('click', () => {
      savePhoneContact({
        username: resolved.username,
        displayName: resolved.displayName || resolved.username,
        signalCode: resolved.signalCode || code,
        matrixId: resolved.matrixId || ''
      })
    })
  } else {
    el.innerHTML = '<div class="phone-empty" style="text-align:left;padding:4px 0;">No member found for this Signal Code</div>'
  }
}

/* ── Recents Screen ── */
function renderRecentsScreen(screen) {
  const history = callHistory.slice().reverse()
  screen.innerHTML = `
    <div class="phone-recents-header">
      <div class="phone-section-title" style="margin:0;">Call History</div>
      ${history.length > 0 ? `<button id="phone-wipe-history">☠ Wipe All</button>` : ''}
    </div>
    ${history.length === 0 ? '<div class="phone-empty">No call history</div>' :
      history.map(c => {
        const initial = (c.displayName || c.contact || '?')[0].toUpperCase()
        const typeIcon = c.type === 'missed' ? '✕' : c.type === 'incoming' ? '←' : '→'
        const typeColor = c.type === 'missed' ? 'var(--phone-red)' : 'var(--phone-text-dim)'
        return `
          <div class="phone-item">
            <div class="phone-item-avatar ${c.type === 'missed' ? 'phone-item-avatar--call' : ''}">${esc(initial)}</div>
            <div class="phone-item-body">
              <strong>${esc(c.displayName || c.contact)}</strong>
              <small>@${esc(c.username || c.contact)}${c.signalCode ? ` · ${esc(c.signalCode)}` : ''}</small>
              <small><span style="color:${typeColor}">${typeIcon}</span> ${c.type} ${c.duration ? '· ' + (callManager ? callManager.formatTime(c.duration) : Math.floor(c.duration/60)+'m') : ''}</small>
            </div>
            <span class="phone-item-time">${fmtTime(c.ts)}</span>
            <div class="phone-recent-actions">
              <button data-action="redial" data-call-id="${esc(c.id || '')}" aria-label="Call again">📞</button>
              <button data-action="add-contact" data-call-id="${esc(c.id || '')}" aria-label="Add to contacts">＋</button>
            </div>
          </div>
        `
      }).join('')
    }
  `

  $('phone-wipe-history')?.addEventListener('click', () => {
    if (confirm('Wipe all call history?')) {
      callHistory = []
      saveJSON(CALL_HISTORY_KEY, callHistory)
      renderRecentsScreen(screen)
      notifs.showToast({ title: 'History Wiped', message: 'Call history cleared', type: 'info', duration: 2000 })
    }
  })

  screen.querySelectorAll('[data-action="redial"]')?.forEach(el => {
    el.addEventListener('click', () => {
      const record = callHistory.find(c => c.id === el.dataset.callId)
      const target = record?.signalCode || record?.contact
      if (target) startCall(target, false)
    })
  })
  screen.querySelectorAll('[data-action="add-contact"]')?.forEach(el => {
    el.addEventListener('click', () => {
      const record = callHistory.find(c => c.id === el.dataset.callId)
      if (record) savePhoneContact(record)
    })
  })
}

/* ── Calling ── */
async function startCall(contact, isVideo) {
  const info = await backend.resolveSignalCode(contact)
  const displayName = info?.displayName || info?.username || contact

  if (!callManager || callManager.state !== 'idle') {
    notifs.showToast({ title: 'Busy', message: 'A call is already in progress', type: 'error', duration: 3000 })
    return
  }

  callManager.setSignalCallback((type, data) => backend.sendCallSignal(type, data))

  const recipientId = backend.backendName === 'matrix'
    ? info?.matrixId
    : (info?.username || contact)
  if (!recipientId) {
    notifs.showToast({
      title: 'Phone unavailable',
      message: `${displayName} needs to open Signal Phone once before receiving calls.`,
      type: 'error',
      duration: 5000
    })
    return
  }

  const roomId = await backend.getRoomIdForUser(recipientId)
  if (!roomId) {
    notifs.showToast({ title: 'Call failed', message: 'Could not open a call connection to this person.', type: 'error', duration: 5000 })
    return
  }
  backend.setCallContext(roomId, '')
  currentCallInfo = {
    username: info?.username || normalizeUser(displayName),
    displayName,
    signalCode: info?.signalCode || (sigCodeRegex.test(contact) ? normalizeCode(contact) : ''),
    matrixId: info?.matrixId || ''
  }
  currentCallDirection = 'outgoing'
  currentCallHistoryId = addToCallHistory(currentCallInfo, 'outgoing', 0)

  try {
    await callManager.startCall(displayName, isVideo)
    showCallOverlay('dialing', displayName)
    notifs.vibrate([100])
  } catch (error) {
    console.error('[FAS] Could not start call:', error)
    callManager.handleHangup()
    notifs.showToast({ title: 'Call failed', message: 'Microphone access or the call network was unavailable.', type: 'error', duration: 5000 })
  }
}

async function answerCall(isVideo) {
  if (!callManager) return
  if (currentCallHistoryId) updateCallHistory(currentCallHistoryId, { type: 'incoming' })
  await callManager.acceptCall(isVideo)
  notifs.stopRingtone()
  notifs.vibrate()
}

function declineCall() {
  if (!callManager) return
  callManager.declineCall()
  notifs.stopRingtone()
  hideCallOverlay()
  if (currentCallHistoryId) updateCallHistory(currentCallHistoryId, { type: 'missed', duration: 0 })
  else addToCallHistory(currentCallInfo || callManager.remoteName || 'Unknown', 'missed', 0)
  currentCallInfo = null
  currentCallHistoryId = null
  currentCallDirection = null
}

function endCall() {
  if (!callManager) return
  const dur = callManager.elapsed
  const name = callManager.remoteName || 'Unknown'
  callManager.end()
  notifs.stopRingtone()
  hideCallOverlay()
  if (currentCallHistoryId) {
    updateCallHistory(currentCallHistoryId, {
      type: dur > 0 ? (currentCallDirection === 'incoming' ? 'incoming' : 'outgoing') : (currentCallDirection === 'incoming' ? 'missed' : 'outgoing'),
      duration: dur
    })
  } else {
    addToCallHistory(currentCallInfo || name, dur > 0 ? 'outgoing' : 'missed', dur)
  }
  currentCallInfo = null
  currentCallHistoryId = null
  currentCallDirection = null
}

function addToCallHistory(contact, type, duration) {
  const supplied = contact && typeof contact === 'object' ? contact : null
  const label = supplied?.username || supplied?.displayName || contact
  const info = supplied || contactsCache.find(c => normalizeUser(c.username || '') === normalizeUser(label) || normalizeUser(c.displayName || '') === normalizeUser(label))
  const record = {
    id: `recent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    contact: info?.signalCode || info?.username || normalizeUser(label),
    username: info?.username || normalizeUser(label),
    displayName: info?.displayName || label,
    signalCode: info?.signalCode || '',
    matrixId: info?.matrixId || '',
    type,
    duration,
    ts: new Date().toISOString()
  }
  callHistory.push(record)
  saveJSON(CALL_HISTORY_KEY, callHistory)
  return record.id
}

function updateCallHistory(id, changes) {
  const record = callHistory.find(c => c.id === id)
  if (!record) return
  Object.assign(record, changes)
  saveJSON(CALL_HISTORY_KEY, callHistory)
}

function savePhoneContact(source) {
  const contact = {
    username: source.username || normalizeUser(source.displayName || source.contact),
    displayName: source.displayName || source.username || source.contact,
    signalCode: source.signalCode || (sigCodeRegex.test(source.contact || '') ? normalizeCode(source.contact) : ''),
    matrixId: source.matrixId || ''
  }
  if (!contact.username && !contact.signalCode) return
  const local = loadJSON(CONTACTS_KEY, [])
  const match = candidate =>
    (contact.username && normalizeUser(candidate.username) === normalizeUser(contact.username)) ||
    (contact.signalCode && candidate.signalCode === contact.signalCode)
  const existing = local.find(match)
  if (existing) Object.assign(existing, contact)
  else local.push(contact)
  saveJSON(CONTACTS_KEY, local)
  const cached = contactsCache.find(match)
  if (cached) Object.assign(cached, contact)
  else contactsCache.push(contact)
  notifs.showToast({
    title: existing ? 'Contact updated' : 'Contact added',
    message: `${contact.displayName} is now in People`,
    type: 'info',
    duration: 3000
  })
}

function onCallStateChange(state, data) {
  if (state === 'dialing') showCallOverlay('dialing', data.remoteName || callManager.remoteName)
  else if (state === 'ringing') {
    showCallOverlay('ringing', data.remoteName || callManager.remoteName)
    notifs.startRingtone(true)
    notifs.vibrate([500, 300, 500])
    notifs.showBrowserNotification({ title: 'Incoming Call', body: `${data.remoteName} is calling`, onClick: () => showCallOverlay('ringing', data.remoteName) })
  }
  else if (state === 'connecting') showCallOverlay('connecting', data.remoteName || callManager.remoteName)
  else if (state === 'connected') {
    showCallOverlay('connected', data.remoteName || callManager.remoteName, data.elapsed)
    notifs.stopRingtone()
  }
  else if (state === 'failed') {
    notifs.stopRingtone()
    hideCallOverlay()
    notifs.showToast({ title: 'Call Failed', message: 'Could not connect', type: 'error', duration: 4000 })
    endCall()
  }
  else if (state === 'idle') {
    notifs.stopRingtone()
    hideCallOverlay()
  }
  updateActionBar()
}

function onRemoteStream(stream) {
  const isVideo = stream.getVideoTracks().length > 0
  const videoContainer = $('phone-call-video-container')
  const videoEl = $('phone-remote-video')

  if (isVideo && videoContainer && videoEl) {
    videoContainer.style.display = 'flex'
    videoEl.srcObject = stream
    videoEl.play().catch(() => {})
    /* also keep audio for the audio track */
    const audioTrack = stream.getAudioTracks()[0]
    if (audioTrack) {
      let audio = document.getElementById('phone-call-remote-audio')
      if (!audio) {
        audio = document.createElement('audio')
        audio.id = 'phone-call-remote-audio'
        audio.autoplay = true
        document.body.appendChild(audio)
      }
      audio.srcObject = new MediaStream([audioTrack])
    }
  } else {
    if (videoContainer) videoContainer.style.display = 'none'
    let audio = document.getElementById('phone-call-remote-audio')
    if (!audio) {
      audio = document.createElement('audio')
      audio.id = 'phone-call-remote-audio'
      audio.autoplay = true
      document.body.appendChild(audio)
    }
    audio.srcObject = stream
  }
  applySpeakerMode(!!callManager?.isSpeaker)
}

/* ── Call Overlay UI ── */
function showCallOverlay(state, name, elapsed) {
  const overlay = $('phone-call-overlay')
  if (!overlay) return
  overlay.classList.add('active')

  const avatar = $('phone-call-avatar')
  const nameEl = $('phone-call-name')
  const statusEl = $('phone-call-status')
  const timerEl = $('phone-call-timer')
  const incomingBtns = $('phone-incoming-buttons')
  const activeBtns = $('phone-active-buttons')
  const minibar = $('phone-call-minibar')

  if (avatar) avatar.textContent = (name || '?')[0].toUpperCase()
  if (avatar) avatar.className = 'phone-call-avatar' + (state === 'ringing' ? ' phone-call-avatar--ringing' : '')
  if (nameEl) nameEl.textContent = name || 'Unknown'
  if (statusEl) {
    const labels = { dialing: 'Calling...', ringing: 'Incoming Call', connecting: 'Connecting...', connected: 'Connected' }
    statusEl.textContent = labels[state] || state
  }
  if (timerEl) {
    if (state === 'connected' && elapsed != null) {
      timerEl.style.display = ''
      timerEl.textContent = callManager.formatTime(elapsed)
    } else {
      timerEl.style.display = 'none'
    }
  }

  if (incomingBtns) incomingBtns.style.display = state === 'ringing' ? '' : 'none'
  if (activeBtns) activeBtns.style.display = state === 'connected' ? '' : 'none'
  if (minibar) minibar.classList.toggle('visible', state === 'connected')

  if ($('phone-minibar-text')) $('phone-minibar-text').textContent = `Call with ${name || 'Unknown'}`
}

function hideCallOverlay() {
  const overlay = $('phone-call-overlay')
  if (overlay) overlay.classList.remove('active')
  const minibar = $('phone-call-minibar')
  if (minibar) minibar.classList.remove('visible')
  const videoContainer = $('phone-call-video-container')
  if (videoContainer) videoContainer.style.display = 'none'
}

/* ── Call UI Bindings ── */
function bindCallUI() {
  $('phone-call-decline')?.addEventListener('click', declineCall)
  $('phone-call-answer-audio')?.addEventListener('click', () => answerCall(false))
  $('phone-call-msg')?.addEventListener('click', () => {
    declineCall()
    if (callManager?.remoteName) {
      showScreen('messages')
      openConversation(callManager.remoteName)
    }
  })

  $('phone-call-end')?.addEventListener('click', endCall)
  $('phone-call-mute')?.addEventListener('click', () => {
    if (callManager) {
      callManager.toggleMute()
      $('phone-call-mute').textContent = callManager.isMuted ? '🔇' : '🔊'
    }
  })
  $('phone-call-speaker')?.addEventListener('click', () => {
    if (callManager) {
      callManager.toggleSpeaker()
      queueMicrotask(() => applySpeakerMode(callManager.isSpeaker))
      $('phone-call-speaker').textContent = callManager.isSpeaker ? '♪' : '♩'
    }
  })
  $('phone-call-video-toggle')?.addEventListener('click', () => {
    if (callManager) {
      callManager.toggleVideo()
      $('phone-call-video-toggle').textContent = callManager.isVideo ? '📹' : '📷'
    }
  })
  $('phone-call-msg-during')?.addEventListener('click', () => {
    if (callManager?.remoteName) {
      showScreen('messages')
      openConversation(callManager.remoteName)
    }
  })
  $('phone-call-add-contact')?.addEventListener('click', () => {
    if (currentCallInfo) savePhoneContact(currentCallInfo)
  })

  $('phone-minibar-expand')?.addEventListener('click', () => {
    if (callManager) showCallOverlay(callManager.state, callManager.remoteName, callManager.elapsed)
  })

  setInterval(() => {
    if (callManager?.state === 'connected') {
      const timerEl = $('phone-call-timer')
      if (timerEl && timerEl.style.display !== 'none') {
        timerEl.textContent = callManager.formatTime()
      }
    }
  }, 1000)
}

function applySpeakerMode(enabled) {
  const button = $('phone-call-speaker')
  if (button) {
    button.classList.toggle('phone-call-btn--active', enabled)
    button.setAttribute('aria-pressed', String(enabled))
    button.innerHTML = `${enabled ? '🔊' : '🔉'}<small>Speaker ${enabled ? 'On' : 'Off'}</small>`
  }
  const audio = document.getElementById('phone-call-remote-audio')
  if (audio) {
    audio.volume = enabled ? 1 : 0.45
    if (enabled && typeof audio.setSinkId === 'function') audio.setSinkId('default').catch(() => {})
  }
}

/* ── Action Bar ── */
function bindActionBar() {
  $('phone-action-call')?.addEventListener('click', onActionCall)
  $('phone-action-chat')?.addEventListener('click', onActionChat)
  $('phone-action-video')?.addEventListener('click', onActionVideo)
}

function updateActionBar() {
  const bar = $('phone-actionbar')
  if (!bar) return
  const inCall = callManager && callManager.state !== 'idle'
  bar.classList.toggle('phone-actionbar--calling', inCall)
  const callBtn = $('phone-action-call')
  const videoBtn = $('phone-action-video')
  if (callBtn) callBtn.querySelector('.action-label').textContent = inCall ? 'End' : 'Call'
  if (videoBtn) videoBtn.querySelector('.action-icon').textContent = inCall ? '🔴' : '📞'
}

function onActionCall() {
  if (callManager && callManager.state !== 'idle') {
    endCall()
  } else {
    showScreen('dialer')
  }
}

function onActionChat() {
  if (callManager && callManager.state === 'connected' && callManager.remoteName) {
    showScreen('messages')
    openConversation(callManager.remoteName)
  } else {
    showScreen('messages')
  }
}

function onActionVideo() {
  if (callManager && callManager.state !== 'idle') {
    callManager.toggleVideo()
  } else {
    showScreen('dialer')
  }
}

/* ── Backend Message Handler ── */
function onBackendMessage(msg) {
  const isFromMe = msg.sender?.includes(myUsername)
  if (isFromMe) return

  const contact = msg.sender?.replace('@', '').split(':')[0] || ''

  notifs.playNotificationSound()
  notifs.showToast({
    title: contact,
    message: msg.body?.slice(0, 80) || 'New message',
    type: 'message',
    duration: 4000,
    onClick: () => {
      showScreen('messages')
      openConversation(contact)
    }
  })

  if (currentScreen === 'home' || currentScreen === 'messages') {
    refreshThreads()
  }
}

/* ── Backend Call Event Handler ── */
function onBackendCallEvent(event) {
  if (event.type === 'call_invite') {
    const senderName = event.displayName || event.username || event.sender?.replace('@', '').split(':')[0] || 'Unknown'
    if (callManager && callManager.state === 'idle') {
      backend.setCallContext(event.roomId, event.callId)
      callManager.setSignalCallback((type, data) => backend.sendCallSignal(type, data))
      currentCallInfo = {
        username: event.username || normalizeUser(senderName),
        displayName: senderName,
        signalCode: event.signalCode || '',
        matrixId: event.sender || ''
      }
      currentCallDirection = 'incoming'
      currentCallHistoryId = addToCallHistory(currentCallInfo, 'missed', 0)
      callManager.handleIncoming(event.offer, event.callId, senderName)
    }
  } else if (event.type === 'call_answer') {
    if (callManager) callManager.handleAnswer(event)
  } else if (event.type === 'ice_candidate') {
    if (callManager) callManager.handleIceCandidate(event)
  } else if (event.type === 'call_hangup') {
    if (callManager && callManager.state !== 'idle') {
      const duration = callManager.elapsed
      if (currentCallHistoryId) {
        updateCallHistory(currentCallHistoryId, {
          type: duration > 0 ? (currentCallDirection === 'incoming' ? 'incoming' : 'outgoing') : (currentCallDirection === 'incoming' ? 'missed' : 'outgoing'),
          duration
        })
      }
      callManager.handleHangup()
      notifs.showToast({ title: 'Call Ended', message: `${callManager.remoteName} ended the call`, type: 'info', duration: 3000 })
      currentCallInfo = null
      currentCallHistoryId = null
      currentCallDirection = null
    }
  }
}

/* ── Refresh Data ── */
async function refreshContacts() {
  try {
    const local = loadJSON(CONTACTS_KEY, [])
    if (isOfflineFallback) {
      contactsCache = local
      return
    }
    const backendContacts = await backend.getContacts()
    const merged = [...local]
    for (const bc of backendContacts) {
      if (!merged.find(m => normalizeUser(m.username || '') === normalizeUser(bc.username || '') || m.signalCode === bc.signalCode)) {
        merged.push(bc)
      }
    }
    contactsCache = merged
  } catch { contactsCache = loadJSON(CONTACTS_KEY, []) }
}

async function refreshThreads() {
  try {
    if (isOfflineFallback) {
      threadsCache = contactsCache.map(c => ({
        username: c.username || '',
        display_name: c.displayName || c.username,
        last_message: '',
        last_ts: null,
        unread: 0
      }))
    } else if (incognitoMode) {
      const r = await fetch(`/api/dm/threads?username=${encodeURIComponent(myUsername)}`, {
        headers: { 'Authorization': 'Bearer ' + (session?.ph || ''), 'X-FAS-Username': myUsername }
      })
      if (r.ok) {
        const d = await r.json()
        threadsCache = d.threads || []
      }
    } else {
      const backendContacts = await backend.getContacts()
      threadsCache = backendContacts.map(c => ({
        username: c.username || c.matrixId,
        display_name: c.displayName,
        last_message: c.lastMessage || '',
        last_ts: null,
        unread: c.unread || 0
      }))
    }
  } catch { threadsCache = [] }
  if (currentScreen === 'home' || currentScreen === 'messages') {
    renderScreen(currentScreen)
  }
}

/* ── Dock Binding ── */
function bindDock() {
  document.querySelectorAll('.phone-dock-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const screen = btn.dataset.screen
      if (screen === 'messages' && activeChatPartner) {
        activeChatPartner = null
      }
      showScreen(screen)
    })
  })
}

/* ── Time Format ── */
function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = (now - d) / 1000
  if (diff < 60) return 'now'
  if (diff < 3600) return Math.floor(diff / 60) + 'm'
  if (diff < 86400) return Math.floor(diff / 3600) + 'h'
  if (diff < 604800) return Math.floor(diff / 86400) + 'd'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/* ── Init ── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
