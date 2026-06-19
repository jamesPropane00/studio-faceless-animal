/**
 * Signal Phone — Server-DM Backend (Incognito Mode)
 * Routes messaging and call signaling through the server proxy.
 * Same interface as matrix-backend.js for hot-swapping.
 */

import { supabase, SUPABASE_READY } from './supabase-client.js'
import { getSession } from './member-db.js'

const CALL_SIGNAL_ENDPOINT = '/api/dm/call-signal'

export class ServerDMBackend {
  constructor() {
    this._session = null
    this._myUsername = ''
    this._ph = ''
    this._initialized = false
    this._onMessage = null
    this._onCallEvent = null
    this._pollTimers = {}
    this._syncRunning = false
    this._threadsCache = []
    this._roomsCache = {}
  }

  get isConnected() { return this._initialized }
  get userId() { return `@${this._myUsername}` }
  get backendName() { return 'incognito' }

  async init() {
    const sess = getSession()
    if (!sess || !sess.username || !sess.ph) return false
    this._session = sess
    this._myUsername = String(sess.username).toLowerCase()
    this._ph = sess.ph
    this._initialized = true
    return true
  }

  async resolveSignalCode(code) {
    try {
      const r = await fetch(`/api/dm/resolve-by-code?code=${encodeURIComponent(code)}`)
      if (!r.ok) return null
      const d = await r.json()
      if (!d.ok) return null
      return { username: d.username, displayName: d.display_name, matrixId: d.matrix_user_id, signalCode: code }
    } catch { return null }
  }

  async getContacts() {
    try {
      const r = await fetch(`/api/dm/threads?username=${encodeURIComponent(this._myUsername)}`, {
        headers: { Authorization: `Bearer ${this._ph}`, 'X-FAS-Username': this._myUsername }
      })
      if (!r.ok) return []
      const d = await r.json()
      const threads = d.threads || []
      return threads.map(t => ({
        username: t.username,
        displayName: t.display_name || t.username,
        signalCode: t.platform_id,
        roomId: t.username,
        type: 'dm',
        lastMessage: t.last_message,
        unread: t.unread || 0
      }))
    } catch { return [] }
  }

  async sendMessage(contactUsername, text) {
    try {
      const r = await fetch('/api/dm/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this._myUsername, ph: this._ph, recipient: contactUsername.toLowerCase(), message: text })
      })
      const d = await r.json()
      if (!r.ok) return { error: d.error || 'Send failed' }
      return { ok: true }
    } catch { return { error: 'Network error' } }
  }

  async getMessages(contactUsername, limit = 30) {
    try {
      const r = await fetch(`/api/dm/messages?me=${encodeURIComponent(this._myUsername)}&other=${encodeURIComponent(contactUsername.toLowerCase())}`, {
        headers: { Authorization: `Bearer ${this._ph}`, 'X-FAS-Username': this._myUsername }
      })
      if (!r.ok) return []
      const d = await r.json()
      return (d.messages || []).map(m => ({
        id: m.id,
        sender: m.sender === this._myUsername ? `@${this._myUsername}` : `@${contactUsername}`,
        body: m.message || '',
        ts: m.created_at,
        roomId: contactUsername.toLowerCase()
      }))
    } catch { return [] }
  }

  async getRoomIdForUser(username) {
    return username.toLowerCase()
  }

  async startSync(onMessage, onCallEvent) {
    this._onMessage = onMessage
    this._onCallEvent = onCallEvent
    this._syncRunning = true
    this._pollLoop()
  }

  async _pollLoop() {
    while (this._syncRunning) {
      try {
        const r = await fetch(`/api/dm/threads?username=${encodeURIComponent(this._myUsername)}`, {
          headers: { Authorization: `Bearer ${this._ph}`, 'X-FAS-Username': this._myUsername }
        })
        if (r.ok) {
          const d = await r.json()
          const threads = d.threads || []
          for (const t of threads) {
            const key = t.username?.toLowerCase()
            const prev = this._threadsCache.find(x => x.username?.toLowerCase() === key)
            const prevMsg = prev?.last_message || ''
            if (key && t.last_message && t.last_message !== prevMsg) {
              const msgs = await this.getMessages(key, 1)
              for (const m of msgs) {
                if (this._onMessage && m.sender !== `@${this._myUsername}`) {
                  this._onMessage(m)
                }
              }
            }
          }
          this._threadsCache = threads
        }
      } catch {}
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  stopSync() {
    this._syncRunning = false
  }

  async sendCallSignal(type, data) {
    try {
      await fetch(CALL_SIGNAL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          data,
          username: this._myUsername,
          ph: this._ph
        })
      })
    } catch {}
  }

  setCallContext(roomId, callId) {
    // not needed for server-dm
  }

  async listenForCallSignals(callId) {
    if (!SUPABASE_READY || !supabase) return
    const channel = supabase.channel(`webrtc-audio-${callId}`)
    channel.on('broadcast', { event: 'signal' }, payload => {
      if (!this._onCallEvent) return
      const { type: sigType, data } = payload
      if (sigType === 'webrtc_offer') {
        this._onCallEvent({ type: 'call_invite', callId, offer: data.offer, sender: data.sender, roomId: data.sender })
      } else if (sigType === 'webrtc_answer') {
        this._onCallEvent({ type: 'call_answer', callId, answer: data.answer, sender: data.sender, roomId: data.sender })
      } else if (sigType === 'ice_candidate') {
        this._onCallEvent({ type: 'ice_candidate', callId, candidate: data.candidate, sender: data.sender, roomId: data.sender })
      } else if (sigType === 'webrtc_hangup') {
        this._onCallEvent({ type: 'call_hangup', callId, sender: data.sender, roomId: data.sender })
      }
    })
    channel.subscribe()
    this._callChannel = channel
  }

  stopListeningForCallSignals() {
    if (this._callChannel && supabase) {
      supabase.removeChannel(this._callChannel)
      this._callChannel = null
    }
  }
}
