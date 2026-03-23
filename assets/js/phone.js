import { getSession } from './member-db.js'
import { supabase, SUPABASE_READY } from './supabase-client.js'
import {
  loadThreads,
  loadMessages,
  sendDM,
  connectBySignalCode,
  markRead,
  formatDMTime,
  getConnectionState,
} from './dm.js'

const CONTACTS_KEY = 'fas_phone_contacts_v1'
const SETTINGS_KEY = 'fas_phone_settings_v1'

let session = null
let myUsername = ''
let activeMessagePartner = null
let contactsCache = []

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function signalCodeRegex() {
  return /^SIG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/i
}

function normalizeSignalCode(raw) {
  return String(raw || '').trim().replace(/\s+/g, '').toUpperCase()
}

function normalizeUsername(raw) {
  return String(raw || '').trim().replace(/^@+/, '').toLowerCase()
}

function readContacts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONTACTS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeContacts(rows) {
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(rows || []))
}

function readSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeSettings(next) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next || {}))
}

function setStatus(text, ok) {
  const el = document.getElementById('phone-status')
  if (!el) return
  el.textContent = text || ''
  el.className = 'phone-status' + (ok ? ' phone-status--ok' : ' phone-status--err')
  if (!text) el.className = 'phone-status'
}

function showGate(isOpen) {
  const gate = document.getElementById('phone-gate')
  const app = document.getElementById('phone-app')
  if (!gate || !app) return
  gate.style.display = isOpen ? '' : 'none'
  app.style.display = isOpen ? 'none' : ''
}

function switchTab(tab) {
  const tabs = ['dialer', 'messages', 'contacts', 'recents', 'settings']
  tabs.forEach((name) => {
    const btn = document.querySelector(`[data-phone-tab="${name}"]`)
    const pane = document.getElementById(`phone-pane-${name}`)
    const active = name === tab
    if (btn) {
      btn.setAttribute('aria-pressed', active ? 'true' : 'false')
      btn.classList.toggle('phone-tab-btn--active', active)
    }
    if (pane) pane.style.display = active ? '' : 'none'
  })
}

function initTabs() {
  document.querySelectorAll('[data-phone-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.getAttribute('data-phone-tab') || 'dialer')
    })
  })
}

function dialerValue() {
  return String(document.getElementById('phone-dial-input')?.value || '').trim()
}

function setDialerValue(next) {
  const input = document.getElementById('phone-dial-input')
  if (!input) return
  input.value = next
}

function appendDialerChar(ch) {
  const value = dialerValue()
  if (value.length >= 40) return
  setDialerValue(value + ch)
}

function routeToMessages(target, mode) {
  if (!target) return
  if (mode === 'signal_code') {
    const code = normalizeSignalCode(target)
    const qs = new URLSearchParams({ signal_id: code })
    window.location.href = `messages.html?${qs.toString()}`
    return
  }
  const username = normalizeUsername(target)
  const qs = new URLSearchParams({ with: username })
  window.location.href = `messages.html?${qs.toString()}`
}

function routeToCall(target, mode) {
  if (!target) return
  if (mode === 'signal_code') {
    const code = normalizeSignalCode(target)
    const qs = new URLSearchParams({ signal_id: code, call: '1' })
    window.location.href = `messages.html?${qs.toString()}`
    return
  }
  const username = normalizeUsername(target)
  const qs = new URLSearchParams({ with: username, call: '1' })
  window.location.href = `messages.html?${qs.toString()}`
}

function resolveDialerTarget(raw) {
  const value = String(raw || '').trim()
  if (!value) return { kind: null, value: '', error: 'Enter a Signal Code (SIG-XXXX-XXXX) or select a saved contact.' }

  const signalCode = normalizeSignalCode(value)
  if (signalCodeRegex().test(signalCode)) {
    return { kind: 'signal_code', value: signalCode, error: null }
  }

  return { kind: null, value: '', error: 'Signal Phone accepts Signal Codes only. Format: SIG-XXXX-XXXX. Use the Contacts tab for saved contacts.' }
}

function bindDialer() {
  const pad = document.getElementById('phone-keypad')
  const clearBtn = document.getElementById('phone-dial-clear')
  const backBtn = document.getElementById('phone-dial-back')
  const callBtn = document.getElementById('phone-dial-call')
  const messageBtn = document.getElementById('phone-dial-message')

  pad?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-key]')
    if (!btn) return
    appendDialerChar(btn.getAttribute('data-key') || '')
  })

  clearBtn?.addEventListener('click', () => setDialerValue(''))
  backBtn?.addEventListener('click', () => {
    const value = dialerValue()
    setDialerValue(value.slice(0, -1))
  })

  callBtn?.addEventListener('click', () => {
    const parsed = resolveDialerTarget(dialerValue())
    if (!parsed.kind) {
      setStatus(parsed.error, false)
      return
    }
    routeToCall(parsed.value, parsed.kind)
  })

  messageBtn?.addEventListener('click', () => {
    const parsed = resolveDialerTarget(dialerValue())
    if (!parsed.kind) {
      setStatus(parsed.error, false)
      return
    }
    routeToMessages(parsed.value, parsed.kind)
  })
}

async function resolveIdentity(inputRaw) {
  const raw = String(inputRaw || '').trim()
  if (!raw) return { data: null, error: 'Enter a Signal Code (SIG-XXXX-XXXX).' }

  if (!SUPABASE_READY || !supabase) {
    return { data: null, error: 'Directory is offline right now.' }
  }

  const code = normalizeSignalCode(raw)
  if (!signalCodeRegex().test(code)) {
    return { data: null, error: 'Signal Code required. Format: SIG-XXXX-XXXX.' }
  }

  const { data, error } = await supabase
    .from('member_accounts')
    .select('username, display_name, platform_id, calls_enabled, dms_enabled, veil_level')
    .eq('platform_id', code)
    .maybeSingle()

  if (error || !data || !data.username) {
    return { data: null, error: 'No member found for that Signal Code.' }
  }

  const veilLvl = data.veil_level != null ? Number(data.veil_level) : 4
  if (veilLvl === 0) return { data: null, error: 'This member is not visible in the Signal network.' }
  if (veilLvl === 1) return { data: null, error: 'This member is visible but not accepting contact.' }

  return { data, error: null }
}

function contactDisplayName(row) {
  const alias = String(row.alias || '').trim()
  if (alias) return alias
  return row.display_name || row.username || 'Unknown'
}

function renderContacts() {
  const list = document.getElementById('phone-contacts-list')
  if (!list) return

  contactsCache = readContacts()
  if (!contactsCache.length) {
    list.innerHTML = '<p class="phone-empty">No contacts yet. Add a contact using a Signal Code (SIG-XXXX-XXXX).</p>'
    return
  }

  list.innerHTML = contactsCache.map((row, idx) => {
    const displayName = contactDisplayName(row)
    const username = row.username || ''
    const signalCode = row.signal_code || ''
    const meta = username ? `@${username}` : 'Unlinked'
    return `
      <article class="phone-card phone-card--compact">
        <div class="phone-contact-head">
          <div>
            <p class="phone-card-title">${escHtml(displayName)}</p>
            <p class="phone-card-sub">${escHtml(meta)} · ${escHtml(signalCode || 'No Signal Code')}</p>
          </div>
        </div>
        <div class="phone-contact-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-contact-action="msg" data-idx="${idx}">Message</button>
          <button type="button" class="btn btn-ghost btn-sm" data-contact-action="call" data-idx="${idx}">Call</button>
          <button type="button" class="btn btn-ghost btn-sm" data-contact-action="copy" data-idx="${idx}">Copy Code</button>
          <button type="button" class="btn btn-ghost btn-sm" data-contact-action="delete" data-idx="${idx}">Remove</button>
        </div>
      </article>
    `
  }).join('')

  list.querySelectorAll('[data-contact-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.getAttribute('data-contact-action')
      const idx = Number(btn.getAttribute('data-idx'))
      const row = contactsCache[idx]
      if (!row) return

      if (action === 'msg') {
        if (row.signal_code) routeToMessages(row.signal_code, 'signal_code')
        else setStatus('No Signal Code on this contact. Re-add via Signal Code.', false)
        return
      }
      if (action === 'call') {
        if (row.signal_code) routeToCall(row.signal_code, 'signal_code')
        else setStatus('No Signal Code on this contact. Re-add via Signal Code.', false)
        return
      }
      if (action === 'copy') {
        if (!row.signal_code) {
          setStatus('No Signal Code available for this contact.', false)
          return
        }
        try {
          await navigator.clipboard.writeText(String(row.signal_code))
          setStatus('Signal Code copied.', true)
        } catch {
          setStatus('Copy failed. Try again.', false)
        }
        return
      }
      if (action === 'delete') {
        const next = contactsCache.filter((_, i) => i !== idx)
        writeContacts(next)
        renderContacts()
      }
    })
  })
}

function bindContacts() {
  const addBtn = document.getElementById('phone-contact-add')
  addBtn?.addEventListener('click', async () => {
    const identityInput = document.getElementById('phone-contact-identity')
    const aliasInput = document.getElementById('phone-contact-alias')

    const identityRaw = String(identityInput?.value || '').trim()
    const aliasRaw = String(aliasInput?.value || '').trim()
    if (!identityRaw) {
      setStatus('Enter a Signal Code (SIG-XXXX-XXXX) to add contact.', false)
      return
    }

    const code = normalizeSignalCode(identityRaw)
    if (!signalCodeRegex().test(code)) {
      setStatus('Signal Code required to add a contact. Format: SIG-XXXX-XXXX.', false)
      return
    }

    const { data, error } = await resolveIdentity(identityRaw)
    if (error || !data) {
      setStatus(error || 'Could not resolve contact.', false)
      return
    }

    const username = String(data.username || '').toLowerCase()
    if (username === myUsername) {
      setStatus('You cannot add yourself as a contact.', false)
      return
    }

    const next = readContacts().filter((row) => String(row.username || '').toLowerCase() !== username)
    next.unshift({
      username,
      display_name: data.display_name || username,
      signal_code: data.platform_id || null,
      alias: aliasRaw || null,
      updated_at: new Date().toISOString(),
    })
    writeContacts(next.slice(0, 120))
    identityInput.value = ''
    aliasInput.value = ''
    renderContacts()
    setStatus('Contact added to Signal Phone.', true)
  })
}

function renderRecents(rows) {
  const list = document.getElementById('phone-recents-list')
  if (!list) return
  if (!rows || !rows.length) {
    list.innerHTML = '<p class="phone-empty">No recent conversation activity yet.</p>'
    return
  }

  list.innerHTML = rows.slice(0, 12).map((row) => {
    const username = String(row.username || '').toLowerCase()
    const preview = String(row.last_message || '').slice(0, 120)
    const when = formatDMTime(row.last_ts)
    return `
      <article class="phone-card phone-card--compact">
        <div>
          <p class="phone-card-title">@${escHtml(username)}</p>
          <p class="phone-card-sub">${escHtml(preview || 'Recent Signal activity')}</p>
        </div>
        <div class="phone-row-actions">
          <span class="phone-chip">${escHtml(when)}</span>
          <a class="btn btn-ghost btn-sm" href="messages.html?with=${encodeURIComponent(username)}">Open</a>
          <a class="btn btn-ghost btn-sm" href="messages.html?with=${encodeURIComponent(username)}&call=1">Call</a>
        </div>
      </article>
    `
  }).join('')
}

function renderMessageList(rows) {
  const list = document.getElementById('phone-msg-thread-list')
  if (!list) return
  if (!rows || !rows.length) {
    list.innerHTML = '<p class="phone-empty">No conversations yet.</p>'
    return
  }

  list.innerHTML = rows.slice(0, 14).map((row) => {
    const username = String(row.username || '').toLowerCase()
    const preview = String(row.last_message || '').slice(0, 100)
    const unread = Number(row.unread || 0)
    return `
      <button type="button" class="phone-list-item" data-open-thread="${escHtml(username)}">
        <span class="phone-list-main">
          <strong>@${escHtml(username)}</strong>
          <small>${escHtml(preview || 'Open conversation')}</small>
        </span>
        <span class="phone-list-meta">
          <small>${escHtml(formatDMTime(row.last_ts))}</small>
          ${unread > 0 ? `<span class="phone-badge">${unread}</span>` : ''}
        </span>
      </button>
    `
  }).join('')

  list.querySelectorAll('[data-open-thread]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const username = btn.getAttribute('data-open-thread')
      if (!username) return
      openPhoneConversation(username)
    })
  })
}

function renderConversation(messages, username) {
  const feed = document.getElementById('phone-msg-feed')
  const title = document.getElementById('phone-msg-title')
  if (!feed || !title) return

  title.textContent = username ? `Conversation · @${username}` : 'Conversation'

  if (!messages || !messages.length) {
    feed.innerHTML = '<p class="phone-empty">No messages yet in this conversation.</p>'
    return
  }

  feed.innerHTML = messages.map((msg) => {
    const sent = String(msg.sender || '').toLowerCase() === myUsername
    const bubbleClass = sent ? 'phone-bubble phone-bubble--sent' : 'phone-bubble phone-bubble--recv'
    return `<article class="${bubbleClass}"><p>${escHtml(msg.message || '')}</p><small>${escHtml(formatDMTime(msg.created_at))}</small></article>`
  }).join('')

  feed.scrollTop = feed.scrollHeight
}

async function openPhoneConversation(username) {
  if (!username) return
  activeMessagePartner = String(username).toLowerCase()
  const rows = await loadMessages(myUsername, activeMessagePartner)
  renderConversation(rows, activeMessagePartner)
  markRead(myUsername, activeMessagePartner)
}

async function sendPhoneMessage() {
  const input = document.getElementById('phone-msg-input')
  const text = String(input?.value || '').trim()
  if (!activeMessagePartner || !text) {
    setStatus('Select a conversation and enter a message.', false)
    return
  }

  const { error } = await sendDM(myUsername, activeMessagePartner, text)
  if (error) {
    setStatus(error || 'Message failed.', false)
    return
  }

  if (input) input.value = ''
  const rows = await loadMessages(myUsername, activeMessagePartner)
  renderConversation(rows, activeMessagePartner)
  setStatus('Message sent.', true)
}

async function handleQuickCompose() {
  const targetInput = document.getElementById('phone-compose-target')
  const textInput = document.getElementById('phone-compose-text')
  const targetRaw = String(targetInput?.value || '').trim()
  const textRaw = String(textInput?.value || '').trim()

  if (!targetRaw || !textRaw) {
    setStatus('Enter recipient and message text.', false)
    return
  }

  const { data, error } = await resolveIdentity(targetRaw)
  if (error || !data) {
    setStatus(error || 'Recipient not found.', false)
    return
  }

  const signalCode = normalizeSignalCode(data.platform_id || '')
  if (!signalCodeRegex().test(signalCode)) {
    setStatus('Recipient has no valid Signal Code yet.', false)
    return
  }

  const connect = await connectBySignalCode(myUsername, signalCode)
  if (connect.error || !connect.data || !connect.data.target || !connect.data.target.username) {
    setStatus(connect.error || 'Connection step failed.', false)
    return
  }

  if (String(connect.data.state || 'none') !== 'connected') {
    setStatus('Connection request sent. Messaging unlocks after approval.', false)
    return
  }

  const username = String(connect.data.target.username).toLowerCase()
  const sent = await sendDM(myUsername, username, textRaw)
  if (sent.error) {
    setStatus(sent.error || 'Message failed.', false)
    return
  }

  if (targetInput) targetInput.value = ''
  if (textInput) textInput.value = ''
  await refreshCommsSections()
  await openPhoneConversation(username)
  setStatus('Message sent via Signal identity.', true)
}

async function refreshCommsSections() {
  const threads = await loadThreads(myUsername)
  renderMessageList(threads)
  renderRecents(threads)
}

function bindMessages() {
  document.getElementById('phone-msg-send')?.addEventListener('click', () => {
    sendPhoneMessage()
  })

  document.getElementById('phone-msg-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendPhoneMessage()
    }
  })

  document.getElementById('phone-compose-send')?.addEventListener('click', () => {
    handleQuickCompose()
  })

  document.getElementById('phone-open-full-messages')?.addEventListener('click', () => {
    if (!activeMessagePartner) {
      window.location.href = 'messages.html'
      return
    }
    window.location.href = `messages.html?with=${encodeURIComponent(activeMessagePartner)}`
  })
}

function initSettings() {
  const identityHandle = document.getElementById('phone-id-handle')
  const identityDisplay = document.getElementById('phone-id-display')
  const identityCode = document.getElementById('phone-id-code')
  const privacyMode = document.getElementById('phone-id-privacy')
  const voiceMode = document.getElementById('phone-voice-mode')

  if (identityHandle) identityHandle.textContent = `@${myUsername}`
  if (identityDisplay) identityDisplay.textContent = String(session.display || myUsername)
  if (identityCode) identityCode.textContent = String(session.platform_id || 'Missing Signal Code - run backfill')
    if (identityCode) identityCode.textContent = String(session.platform_id || '—')
  if (privacyMode) privacyMode.textContent = String(session.contact_mode || 'signal_code_only')

  const settings = readSettings()
  if (voiceMode) {
    voiceMode.value = String(settings.voice_mode || 'signal')
    voiceMode.addEventListener('change', () => {
      const next = readSettings()
      next.voice_mode = voiceMode.value
      writeSettings(next)
      setStatus('Voice mode preference saved.', true)
    })
  }

  document.getElementById('phone-copy-code')?.addEventListener('click', async () => {
    const code = String(session.platform_id || '').trim()
    if (!signalCodeRegex().test(code)) {
      setStatus('No valid Signal Code is assigned yet.', false)
      return
    }
    try {
      await navigator.clipboard.writeText(code)
      setStatus('Signal Code copied.', true)
    } catch {
      setStatus('Copy failed. Try again.', false)
    }
  })
}

async function bindContactConnectionCheck() {
  document.getElementById('phone-check-connection')?.addEventListener('click', async () => {
    const input = document.getElementById('phone-check-target')
    const out = document.getElementById('phone-check-result')
    if (!input || !out) return

    const raw = String(input.value || '').trim()
    if (!raw) {
      out.textContent = 'Enter a Signal Code to check connection state.'
      return
    }

    const { data: idData, error: idErr } = await resolveIdentity(raw)
    if (idErr || !idData) {
      out.textContent = idErr || 'Could not resolve Signal identity.'
      return
    }

    const username = String(idData.username || '').toLowerCase()
    const state = await getConnectionState(myUsername, username)
    if (state.error || !state.data) {
      out.textContent = state.error || 'Could not load connection state.'
      return
    }

    out.textContent = `State: ${state.data.state || 'none'} · ${state.data.target && state.data.target.platform_id ? state.data.target.platform_id : 'No Signal Code'}`
  })
}

async function initPhoneApp() {
  session = getSession()
  if (!session || !session.username) {
    showGate(true)
    return
  }

  myUsername = String(session.username || '').toLowerCase().trim()
  showGate(false)

  document.getElementById('phone-session-user').textContent = `@${myUsername}`

  initTabs()
  bindDialer()
  bindContacts()
  bindMessages()
  initSettings()
  bindContactConnectionCheck()

  renderContacts()
  await refreshCommsSections()

  const withParam = new URLSearchParams(window.location.search).get('with')
  if (withParam) {
    switchTab('messages')
    await openPhoneConversation(normalizeUsername(withParam))
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPhoneApp)
} else {
  initPhoneApp()
}
