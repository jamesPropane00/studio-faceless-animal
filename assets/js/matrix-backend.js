/**
 * Signal Phone — Matrix Backend
 * Provides messaging, contacts, and VoIP signaling via Matrix.org.
 * Same interface as server-dm-backend.js for hot-swapping.
 */

const MATRIX_BASE = 'https://matrix.org'
const MATRIX_SESSION_KEY = 'fas_matrix_session'

export class MatrixBackend {
  constructor() {
    this._session = null
    this._userId = null
    this._accessToken = null
    this._deviceId = null
    this._syncToken = null
    this._roomsCache = {}
    this._knownUsers = {}
    this._onMessage = null
    this._onCallEvent = null
    this._syncRunning = false
    this._syncAbort = null
    this._initialized = false
  }

  get isConnected() { return !!this._accessToken }
  get userId() { return this._userId }
  get backendName() { return 'matrix' }

  async init() {
    try {
      const raw = localStorage.getItem(MATRIX_SESSION_KEY)
      if (!raw) return false
      const sess = JSON.parse(raw)
      if (!sess.access_token || !sess.user_id) return false
      this._accessToken = sess.access_token
      this._userId = sess.user_id
      this._deviceId = sess.device_id || null
      this._initialized = true
      await this._syncOnce()
      return true
    } catch { return false }
  }

  async guestLogin() {
    try {
      const r = await fetch(`${MATRIX_BASE}/_matrix/client/v3/register?kind=guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initial_device_display_name: 'Signal Phone' })
      })
      if (!r.ok) return false
      const d = await r.json()
      this._accessToken = d.access_token
      this._userId = d.user_id
      this._deviceId = d.device_id
      const sess = { access_token: d.access_token, user_id: d.user_id, device_id: d.device_id, ts: Date.now() }
      localStorage.setItem(MATRIX_SESSION_KEY, JSON.stringify(sess))
      this._initialized = true
      return true
    } catch { return false }
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
    const contacts = []
    try {
      const r = await fetch(`${MATRIX_BASE}/_matrix/client/v3/account_data/m.direct`, {
        headers: { Authorization: `Bearer ${this._accessToken}` }
      })
      if (r.ok) {
        const d = await r.json()
        if (d && typeof d === 'object') {
          for (const [userId, roomIds] of Object.entries(d)) {
            if (!Array.isArray(roomIds) || !roomIds.length) continue
            contacts.push({
              matrixId: userId,
              displayName: this._knownUsers[userId] || userId.split(':')[0].replace('@', ''),
              roomId: roomIds[0],
              type: 'dm'
            })
          }
        }
      }
    } catch {}
    return contacts
  }

  async sendMessage(roomId, text) {
    if (!this._accessToken) return { error: 'Not connected' }
    const txn = `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`
    try {
      const r = await fetch(`${MATRIX_BASE}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txn}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this._accessToken}` },
        body: JSON.stringify({ msgtype: 'm.text', body: text })
      })
      if (!r.ok) return { error: 'Send failed' }
      return { ok: true }
    } catch { return { error: 'Network error' } }
  }

  async getMessages(roomId, limit = 30) {
    if (!this._accessToken) return []
    try {
      const r = await fetch(`${MATRIX_BASE}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=${limit}`, {
        headers: { Authorization: `Bearer ${this._accessToken}` }
      })
      if (!r.ok) return []
      const d = await r.json()
      return (d.chunk || []).filter(m => m.type === 'm.room.message').map(m => ({
        id: m.event_id,
        sender: m.sender,
        body: m.content?.body || '',
        ts: new Date(m.origin_server_ts).toISOString(),
        roomId
      }))
    } catch { return [] }
  }

  async getRoomIdForUser(userId) {
    if (!this._accessToken) return null
    try {
      const r = await fetch(`${MATRIX_BASE}/_matrix/client/v3/account_data/m.direct`, {
        headers: { Authorization: `Bearer ${this._accessToken}` }
      })
      if (!r.ok) return null
      const d = await r.json()
      if (d && d[userId] && d[userId].length > 0) return d[userId][0]
      const createR = await fetch(`${MATRIX_BASE}/_matrix/client/v3/createRoom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this._accessToken}` },
        body: JSON.stringify({ invite: [userId], is_direct: true, preset: 'trusted_private_chat' })
      })
      if (!createR.ok) return null
      const createD = await createR.json()
      return createD.room_id
    } catch { return null }
  }

  async startSync(onMessage, onCallEvent) {
    this._onMessage = onMessage
    this._onCallEvent = onCallEvent
    this._syncRunning = true
    this._syncLoop()
  }

  async _syncLoop() {
    while (this._syncRunning) {
      try {
        await this._syncOnce()
      } catch {}
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  async _syncOnce() {
    if (!this._accessToken) return
    const controller = new AbortController()
    this._syncAbort = controller
    try {
      const url = `${MATRIX_BASE}/_matrix/client/v3/sync?timeout=30000${this._syncToken ? `&since=${this._syncToken}` : ''}`
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${this._accessToken}` },
        signal: controller.signal
      })
      if (!r.ok) return
      const d = await r.json()
      this._syncToken = d.next_batch
      this._processSync(d)
    } catch {} finally {
      this._syncAbort = null
    }
  }

  stopSync() {
    this._syncRunning = false
    if (this._syncAbort) this._syncAbort.abort()
  }

  _processSync(data) {
    if (!data.rooms?.join) return
    for (const [roomId, room] of Object.entries(data.rooms.join)) {
      if (room.timeline?.events) {
        for (const ev of room.timeline.events) {
          if (ev.type === 'm.room.message' && this._onMessage) {
            this._onMessage({
              id: ev.event_id,
              sender: ev.sender,
              body: ev.content?.body || '',
              ts: new Date(ev.origin_server_ts).toISOString(),
              roomId
            })
          }
          if (ev.type === 'm.call.invite' && this._onCallEvent) {
            this._onCallEvent({
              type: 'call_invite',
              callId: ev.content?.call_id,
              sender: ev.sender,
              roomId,
              offer: ev.content?.offer,
              ts: new Date(ev.origin_server_ts).toISOString()
            })
          }
          if (ev.type === 'm.call.hangup' && this._onCallEvent) {
            this._onCallEvent({
              type: 'call_hangup',
              callId: ev.content?.call_id,
              sender: ev.sender,
              roomId,
              ts: new Date(ev.origin_server_ts).toISOString()
            })
          }
          if (ev.type === 'm.call.answer' && this._onCallEvent) {
            this._onCallEvent({
              type: 'call_answer',
              callId: ev.content?.call_id,
              sender: ev.sender,
              roomId,
              answer: ev.content?.answer,
              ts: new Date(ev.origin_server_ts).toISOString()
            })
          }
          if (ev.type === 'm.call.candidates' && this._onCallEvent) {
            for (const c of ev.content?.candidates || []) {
              this._onCallEvent({
                type: 'ice_candidate',
                callId: ev.content?.call_id,
                sender: ev.sender,
                roomId,
                candidate: c.candidate,
                ts: new Date(ev.origin_server_ts).toISOString()
              })
            }
          }
        }
      }
    }
  }

  async sendCallSignal(type, data) {
    if (!this._session) return
    try {
      switch (type) {
        case 'webrtc_offer':
          await fetch(`${MATRIX_BASE}/_matrix/client/v3/rooms/${encodeURIComponent(this._currentRoomId)}/send/m.call.invite/${Date.now()}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this._accessToken}` },
            body: JSON.stringify({
              call_id: data.callId || this._currentCallId,
              offer: data.offer,
              version: '1',
              lifetime: 30000
            })
          })
          break
        case 'webrtc_answer':
          await fetch(`${MATRIX_BASE}/_matrix/client/v3/rooms/${encodeURIComponent(this._currentRoomId)}/send/m.call.answer/${Date.now()}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this._accessToken}` },
            body: JSON.stringify({
              call_id: data.callId || this._currentCallId,
              answer: data.answer,
              version: '1'
            })
          })
          break
        case 'ice_candidate':
          await fetch(`${MATRIX_BASE}/_matrix/client/v3/rooms/${encodeURIComponent(this._currentRoomId)}/send/m.call.candidates/${Date.now()}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this._accessToken}` },
            body: JSON.stringify({
              call_id: data.callId || this._currentCallId,
              candidates: [data.candidate]
            })
          })
          break
        case 'webrtc_hangup':
          await fetch(`${MATRIX_BASE}/_matrix/client/v3/rooms/${encodeURIComponent(this._currentRoomId)}/send/m.call.hangup/${Date.now()}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this._accessToken}` },
            body: JSON.stringify({ call_id: data.callId || this._currentCallId, version: '1' })
          })
          break
      }
    } catch {}
  }

  setCallContext(roomId, callId) {
    this._currentRoomId = roomId
    this._currentCallId = callId
  }
}
