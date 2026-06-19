/**
 * Signal Phone — Main Application
 * Smartphone-style communication shell for Faceless Animal Studios.
 * Handles calls, messages, contacts, dialer, recents, and settings.
 */

import { getSession } from './member-db.js'
import { CallManager } from './call-manager.js'
import { MatrixBackend } from './matrix-backend.js'
import { ServerDMBackend } from './server-dm-backend.js'
import { notifs } from './notification-manager.js'

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
let callHistoryWiped = false

const CONTACTS_KEY = 'fas_phone_contacts_v1'
const CALL_HISTORY_KEY = 'fas_phone_call_history'
const SETTINGS_KEY = 'fas_phone_settings_v1'

/* ── Helpers ── */
const $ = id => document.getElementById(id)
const esc = str => String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const sigCodeRegex = /^SIG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/i
const normalizeCode = raw => String(raw || '').trim().replace(/\s+/g, '').toUpperCase()
const normalizeUser = raw => String(raw || '').trim().replace(/^@+/, '').toLowerCase()

function loadJSON(key, def) { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v != null ? v : def } catch { return def } }
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)) }

/* ── Initialization ── */
async function init() {
  session = getSession()
  if (!session || !session.username) {
    $('phone-loading').style.display = 'none'
    $('phone-gate').style.display = ''
    return
  }
  myUsername = String(session.username).toLowerCase()

  const settings = loadJSON(SETTINGS_KEY, {})
  incognitoMode = settings.incognito || false
  callHistory = loadJSON(CALL_HISTORY_KEY, [])

  notifs.requestPermission()

  callManager = new CallManager({
    localName: myUsername,
    onStateChange: onCallStateChange,
    onRemoteStream: onRemoteStream
  })

  if (incognitoMode) {
    backend = new ServerDMBackend()
  } else {
    backend = new MatrixBackend()
  }

  const ok = await backend.init()
  if (!ok && !incognitoMode) {
    const guestOk = await backend.guestLogin()
    if (!guestOk) {
      backend = new ServerDMBackend()
      await backend.init()
    }
  }

  $('phone-loading').style.display = 'none'
  $('phone-shell').style.display = ''

  updateStatusBar()
  updateModeBadge()
  bindDock()
  bindCallUI()

  await refreshContacts()
  await refreshThreads()
  showScreen('home')

  backend.startSync(onBackendMessage, onBackendCallEvent)
  startStatusBarClock()

  const params = new URLSearchParams(window.location.search)
  const openChat = params.get('chat')
  if (openChat) {
    showScreen('messages')
    openConversation(normalizeUser(openChat))
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
  $('phone-statusbar-mode').textContent = incognitoMode ? 'Private' : 'Matrix'
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
        <p>@${esc(myUsername)}</p>
      </div>

      <div class="phone-section-title">${missed > 0 ? `Missed Calls (${missed})` : 'Recent Calls'}</div>
      ${recentCalls.length === 0 ? '<div class="phone-empty">No recent calls</div>' :
        recentCalls.map(c => `
          <div class="phone-item" data-action="call" data-contact="${esc(c.contact)}">
            <div class="phone-item-avatar ${c.type === 'missed' ? 'phone-item-avatar--call' : ''}">${esc((c.displayName || c.contact || '?')[0].toUpperCase())}</div>
            <div class="phone-item-body">
              <strong>${esc(c.displayName || c.contact)}</strong>
              <small>${c.type === 'missed' ? 'Missed call' : c.type === 'incoming' ? 'Incoming call' : 'Outgoing call'} · ${c.duration ? callManager.formatTime(c.duration) : 'No answer'}</small>
            </div>
            <span class="phone-item-time">${fmtTime(c.ts)}</span>
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
      if (action === 'call') showScreen('dialer')
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
              <small>${c.signalCode ? esc(c.signalCode) : '@' + esc(c.username || '')} ${c.matrixId ? '· Matrix' : ''}</small>
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
        <p style="margin:4px 0 0;font-size:0.75rem;color:var(--phone-text-dim);">${c.signalCode ? esc(c.signalCode) : ''}</p>
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
        try { await navigator.clipboard.writeText(contact); notifs.showToast({ title: 'Copied', message: 'Matrix ID copied', type: 'info', duration: 2000 }) } catch {}
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

/* ── Dialer Screen ── */
function renderDialerScreen(screen) {
  const dialValue = screen.dataset.dialValue || ''
  screen.innerHTML = `
    <div class="phone-dialer">
      <input class="phone-dialer-input" id="phone-dial-input" type="text" placeholder="SIG-XXXX-XXXX" value="${esc(dialValue)}" maxlength="19" />
      <div class="phone-dialer-grid">
        ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(k => {
          const letters = { '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ' }[k] || ''
          return `<button class="phone-dial-key" data-key="${k}">${k}${letters ? `<small>${letters}</small>` : ''}</button>`
        }).join('')}
        <button class="phone-dial-key phone-dial-key--delete" id="phone-dial-delete">⌫</button>
        <button class="phone-dial-key phone-dial-key--call" id="phone-dial-call">📞</button>
        <button class="phone-dial-key phone-dial-key--action" id="phone-dial-video">📹</button>
      </div>
      <div class="phone-dialer-suggestions" id="phone-dial-suggestions"></div>
    </div>
  `

  const input = $('phone-dial-input')
  if (input) {
    input.addEventListener('input', () => {
      screen.dataset.dialValue = input.value
      showDialSuggestions(input.value)
    })
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const code = normalizeCode(input.value)
        if (sigCodeRegex.test(code)) startCall(code, false)
      }
    })
  }

  screen.querySelectorAll('[data-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key
      if (!input) return
      const val = input.value
      if (val.length >= 19) return
      const pos = input.selectionStart || val.length
      const newVal = val.slice(0, pos) + key + val.slice(pos)
      input.value = newVal
      screen.dataset.dialValue = newVal
      showDialSuggestions(newVal)
      input.focus()
      input.setSelectionRange(pos + 1, pos + 1)
    })
  })

  $('phone-dial-delete')?.addEventListener('click', () => {
    if (!input) return
    const val = input.value
    const pos = input.selectionStart || val.length
    if (pos === 0) return
    const newVal = val.slice(0, pos - 1) + val.slice(pos)
    input.value = newVal
    screen.dataset.dialValue = newVal
    showDialSuggestions(newVal)
    input.focus()
    input.setSelectionRange(pos - 1, pos - 1)
  })

  $('phone-dial-call')?.addEventListener('click', () => {
    const code = normalizeCode(input?.value || '')
    if (sigCodeRegex.test(code)) startCall(code, false)
    else notifs.showToast({ title: 'Invalid', message: 'Enter a valid Signal Code (SIG-XXXX-XXXX)', type: 'error', duration: 3000 })
  })

  $('phone-dial-video')?.addEventListener('click', () => {
    const code = normalizeCode(input?.value || '')
    if (sigCodeRegex.test(code)) startCall(code, true)
    else notifs.showToast({ title: 'Invalid', message: 'Enter a valid Signal Code (SIG-XXXX-XXXX)', type: 'error', duration: 3000 })
  })

  showDialSuggestions(dialValue)
}

async function showDialSuggestions(query) {
  const el = $('phone-dial-suggestions')
  if (!el) return
  const code = normalizeCode(query)
  if (!sigCodeRegex.test(code) || code.length < 14) {
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
        </span>
      </div>
    `
    el.querySelector('[data-action="quick-call"]')?.addEventListener('click', () => startCall(code, false))
    el.querySelector('[data-action="quick-message"]')?.addEventListener('click', () => {
      showScreen('messages')
      openConversation(resolved.username)
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
          <div class="phone-item" data-action="call" data-contact="${esc(c.contact)}">
            <div class="phone-item-avatar ${c.type === 'missed' ? 'phone-item-avatar--call' : ''}">${esc(initial)}</div>
            <div class="phone-item-body">
              <strong>${esc(c.displayName || c.contact)}</strong>
              <small><span style="color:${typeColor}">${typeIcon}</span> ${c.type} ${c.duration ? '· ' + callManager.formatTime(c.duration) : ''}</small>
            </div>
            <span class="phone-item-time">${fmtTime(c.ts)}</span>
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

  screen.querySelectorAll('[data-action="call"]')?.forEach(el => {
    el.addEventListener('click', () => showScreen('dialer'))
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

  const roomId = await backend.getRoomIdForUser(info?.username || contact)
  if (roomId) backend.setCallContext(roomId, `call_${Date.now()}`)

  await callManager.startCall(displayName, isVideo)
  showCallOverlay('dialing', displayName)
  notifs.vibrate([100])
}

async function answerCall(isVideo) {
  if (!callManager) return
  await callManager.acceptCall(isVideo)
  notifs.stopRingtone()
  notifs.vibrate()
}

function declineCall() {
  if (!callManager) return
  callManager.declineCall()
  notifs.stopRingtone()
  hideCallOverlay()
  addToCallHistory(callManager.remoteName || 'Unknown', 'missed', 0)
}

function endCall() {
  if (!callManager) return
  const dur = callManager.elapsed
  const name = callManager.remoteName || 'Unknown'
  callManager.end()
  notifs.stopRingtone()
  hideCallOverlay()
  addToCallHistory(name, dur > 0 ? 'outgoing' : 'missed', dur)
}

function addToCallHistory(contact, type, duration) {
  const info = contactsCache.find(c => normalizeUser(c.username || '') === normalizeUser(contact) || normalizeUser(c.displayName || '') === normalizeUser(contact))
  callHistory.push({
    contact: normalizeUser(contact),
    displayName: info?.displayName || contact,
    type,
    duration,
    ts: new Date().toISOString()
  })
  saveJSON(CALL_HISTORY_KEY, callHistory)
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
}

function onRemoteStream(stream) {
  let audio = document.getElementById('phone-call-remote-audio')
  if (!audio) {
    audio = document.createElement('audio')
    audio.id = 'phone-call-remote-audio'
    audio.autoplay = true
    document.body.appendChild(audio)
  }
  audio.srcObject = stream
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
}

/* ── Call UI Bindings ── */
function bindCallUI() {
  // Incoming call buttons
  $('phone-call-decline')?.addEventListener('click', declineCall)
  $('phone-call-answer-audio')?.addEventListener('click', () => answerCall(false))
  $('phone-call-msg')?.addEventListener('click', () => {
    declineCall()
    if (callManager?.remoteName) {
      showScreen('messages')
      openConversation(callManager.remoteName)
    }
  })

  // Active call buttons
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
      // minimize call to bar, open chat
      showScreen('messages')
      openConversation(callManager.remoteName)
    }
  })

  // Minibar
  $('phone-minibar-expand')?.addEventListener('click', () => {
    if (callManager) showCallOverlay(callManager.state, callManager.remoteName, callManager.elapsed)
  })

  // Update timer during connected call
  setInterval(() => {
    if (callManager?.state === 'connected') {
      const timerEl = $('phone-call-timer')
      if (timerEl && timerEl.style.display !== 'none') {
        timerEl.textContent = callManager.formatTime()
      }
    }
  }, 1000)
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
    const senderName = event.sender?.replace('@', '').split(':')[0] || 'Unknown'
    if (callManager && callManager.state === 'idle') {
      callManager.handleIncoming(event.offer, event.callId, senderName)
    }
  } else if (event.type === 'call_answer') {
    if (callManager) callManager.handleAnswer(event)
  } else if (event.type === 'ice_candidate') {
    if (callManager) callManager.handleIceCandidate(event)
  } else if (event.type === 'call_hangup') {
    if (callManager && callManager.state !== 'idle') {
      callManager.handleHangup()
      notifs.showToast({ title: 'Call Ended', message: `${callManager.remoteName} ended the call`, type: 'info', duration: 3000 })
    }
  }
}

/* ── Refresh Data ── */
async function refreshContacts() {
  try {
    const local = loadJSON(CONTACTS_KEY, [])
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
    if (incognitoMode) {
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
