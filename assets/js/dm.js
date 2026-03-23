/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — PRIVATE MESSAGING MODULE
 *  assets/js/dm.js
 *
 *  Provides server-proxied 1:1 direct messaging.
 *  All DM reads/writes go through /api/dm/* endpoints on the
 *  Express server, which validates identity via password_hash
 *  and uses the Supabase service_role key. The anon key NEVER
 *  accesses the dm_messages table directly.
 *
 *  USAGE (ES module):
 *    import { loadThreads, loadMessages, sendDM, sendDMWithFile,
 *             uploadDMFile, pollThread, formatDMTime } from './dm.js'
 * ============================================================
 */

const MAX_DM_LEN   = 500
const DM_BUCKET    = 'dm-attachments'
const MAX_FILE_MB  = 10
const MAX_FILE_B   = MAX_FILE_MB * 1024 * 1024

// Allowed MIME types for DM file attachments
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/flac', 'audio/mp4',
  'audio/x-m4a', 'audio/aiff',
  'video/mp4', 'video/webm',
  'application/pdf',
  'text/plain',
])

// ── Session helpers ───────────────────────────────────────────

/**
 * Get the password hash from the stored session.
 * Used as an auth credential for server-side DM endpoints.
 * @returns {string|null}
 */
function _getSessionPH() {
  try {
    const sess = JSON.parse(localStorage.getItem('fas_user') || 'null')
    return sess?.ph || null
  } catch {
    return null
  }
}

// ── Thread helpers ────────────────────────────────────────────

/**
 * Build auth headers for server-proxied DM endpoints.
 * ph is sent in the Authorization header (never in the URL).
 */
function _dmHeaders(ph, username) {
  return {
    'Content-Type':    'application/json',
    'Authorization':   'Bearer ' + ph,
    'X-FAS-Username':  username,
  }
}

/**
 * Get all conversation partners for a user.
 * Returns array of { username, last_message, last_ts, unread }
 * Routes through /api/dm/threads — identity validated server-side.
 * ph is sent only in the Authorization header, never in the URL.
 */
export async function loadThreads(myUsername) {
  const ph = _getSessionPH()
  if (!ph) return []
  const u = myUsername.toLowerCase()

  try {
    const res = await fetch(`/api/dm/threads?username=${encodeURIComponent(u)}`, {
      headers: _dmHeaders(ph, u),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.threads || []
  } catch {
    return []
  }
}

/**
 * Load full message history between two users.
 * Routes through /api/dm/messages — identity validated server-side.
 * ph is sent only in the Authorization header, never in the URL.
 */
export async function loadMessages(myUsername, otherUsername) {
  const ph = _getSessionPH()
  if (!ph) return []
  const me    = myUsername.toLowerCase()
  const other = otherUsername.toLowerCase()

  try {
    const res = await fetch(
      `/api/dm/messages?me=${encodeURIComponent(me)}&other=${encodeURIComponent(other)}`,
      { headers: _dmHeaders(ph, me) }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.messages || []
  } catch {
    return []
  }
}

/**
 * Send a text DM.
 * Routes through /api/dm/send — identity validated server-side.
 */
export async function sendDM(sender, recipient, message) {
  const ph = _getSessionPH()
  if (!ph) return { error: 'Session expired — please sign in again.' }
  const text = (message || '').trim()
  if (!text || text.length > MAX_DM_LEN) return { error: 'Invalid message length' }

  try {
    const res = await fetch('/api/dm/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        username:  sender.toLowerCase(),
        ph,
        recipient: recipient.toLowerCase(),
        message:   text,
      }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error || 'Send failed.' }
    return { data: data.message, error: null }
  } catch (e) {
    return { error: 'Network error. Check your connection.' }
  }
}

/**
 * Resolve and connect contact by Signal Code.
 * Returns { data, error } where data includes { state, target }.
 */
export async function connectBySignalCode(sender, signalCode) {
  const ph = _getSessionPH()
  if (!ph) return { data: null, error: 'Session expired — please sign in again.' }

  const code = String(signalCode || '').trim()
  if (!code) return { data: null, error: 'Enter a Signal Code.' }

  try {
    const res = await fetch('/api/dm/connect-by-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: String(sender || '').toLowerCase(),
        ph,
        signal_code: code,
      }),
    })

    const data = await res.json()
    if (!res.ok || !data || data.ok !== true) {
      return { data: null, error: (data && data.error) || 'Could not connect by Signal Code.' }
    }

    return { data, error: null }
  } catch {
    return { data: null, error: 'Network error. Check your connection.' }
  }
}

/**
 * Get connection state + partner identity for current thread header.
 */
export async function getConnectionState(myUsername, otherUsername) {
  const ph = _getSessionPH()
  if (!ph) return { data: null, error: 'Session expired — please sign in again.' }

  const me = String(myUsername || '').toLowerCase().trim()
  const other = String(otherUsername || '').toLowerCase().trim()
  if (!me || !other) return { data: null, error: 'Missing usernames.' }

  try {
    const res = await fetch(
      `/api/dm/connection?username=${encodeURIComponent(me)}&with=${encodeURIComponent(other)}`,
      { headers: _dmHeaders(ph, me) }
    )
    const data = await res.json()
    if (!res.ok || !data || data.ok !== true) {
      return { data: null, error: (data && data.error) || 'Could not load connection state.' }
    }
    return { data, error: null }
  } catch {
    return { data: null, error: 'Network error. Check your connection.' }
  }
}

/**
 * Send a DM with a file attachment.
 * File must already be uploaded via uploadDMFile().
 * @param {string} sender
 * @param {string} recipient
 * @param {string} message      — text body (can be empty if file-only)
 * @param {string} fileUrl      — public/signed URL from Storage
 * @param {string} fileType     — MIME type
 * @param {string} fileName     — original filename
 * @param {number} fileSizeBytes
 */
export async function sendDMWithFile(sender, recipient, message, fileUrl, fileType, fileName, fileSizeBytes) {
  const ph = _getSessionPH()
  if (!ph) return { error: 'Session expired — please sign in again.' }
  const text = (message || '').trim()
  if (text.length > MAX_DM_LEN) return { error: 'Message too long' }

  try {
    const res = await fetch('/api/dm/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        username:        sender.toLowerCase(),
        ph,
        recipient:       recipient.toLowerCase(),
        message:         text || '📎 File attachment',
        file_url:        fileUrl,
        file_type:       fileType || 'application/octet-stream',
        file_name:       fileName || 'attachment',
        file_size_bytes: fileSizeBytes || 0,
      }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error || 'Send failed.' }
    return { data: data.message, error: null }
  } catch (e) {
    return { error: 'Network error. Check your connection.' }
  }
}

/**
 * Upload a file for a DM attachment.
 * Routes through the server-side /api/dm/upload endpoint which uses the
 * Supabase service_role key — the anon key NEVER touches storage.
 *
 * Security model:
 *   1. Server verifies the password hash (proves identity, no anon bypass)
 *   2. Server checks active paid plan before accepting the upload
 *   3. Server writes to the private bucket via service_role
 *   4. Server returns a 24-hour signed URL — no permanent public access
 *
 * PLAN GATE: UI enforces paid-only; server enforces it independently.
 *
 * @param {string} senderUsername
 * @param {File}   file
 */
export async function uploadDMFile(senderUsername, file) {
  if (!file) return { url: null, path: null, error: 'No file selected.' }

  // Client-side pre-checks (fast fail before network call)
  const validationError = validateDMFile(file)
  if (validationError) return { url: null, path: null, error: validationError }

  // Retrieve password hash from session — used server-side to verify identity
  const ph = _getSessionPH()
  if (!ph) {
    return {
      url:   null,
      path:  null,
      error: 'Your session has expired. Please sign in again to send files.',
    }
  }

  // Encode file as base64 for JSON transport (chunked to avoid stack overflow)
  let base64
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    const CHUNK = 8192
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
    }
    base64 = btoa(binary)
  } catch (e) {
    return { url: null, path: null, error: 'Could not read file. Try a smaller file.' }
  }

  let response
  try {
    response = await fetch('/api/dm/upload', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        username:  senderUsername.toLowerCase(),
        ph,
        file_b64:  base64,
        file_type: file.type,
        file_name: file.name,
        file_size: file.size,
      }),
    })
  } catch (e) {
    return { url: null, path: null, error: 'Network error. Check your connection and try again.' }
  }

  let result
  try {
    result = await response.json()
  } catch {
    return { url: null, path: null, error: 'Server returned an unexpected response.' }
  }

  if (!response.ok || result.error) {
    return { url: null, path: null, error: result.error || 'Upload failed (' + response.status + ').' }
  }

  return { url: result.url, path: result.path, error: null }
}

/**
 * Mark all messages in a thread as read.
 * Routes through /api/dm/mark-read — identity validated server-side.
 */
export async function markRead(myUsername, otherUsername) {
  const ph = _getSessionPH()
  if (!ph) return
  try {
    await fetch('/api/dm/mark-read', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        username: myUsername.toLowerCase(),
        ph,
        other:    otherUsername.toLowerCase(),
      }),
    })
  } catch {}
}

/**
 * Poll for new messages in a thread.
 * Replaces Supabase Realtime subscription — secure because all reads
 * go through the server proxy (identity validated each poll cycle).
 *
 * @param {string}   myUsername
 * @param {string}   otherUsername
 * @param {Function} onMessages       — called with the full messages array
 * @param {number}   intervalMs       — poll interval (default 4000ms)
 * @returns {Function} stopPolling    — call to stop the polling loop
 */
export function pollThread(myUsername, otherUsername, onMessages, intervalMs = 4000) {
  let running  = true
  let timerId  = null
  let lastSeen = 0  // track last message count to avoid redundant re-renders

  async function tick() {
    if (!running) return
    try {
      const messages = await loadMessages(myUsername, otherUsername)
      if (messages.length !== lastSeen) {
        lastSeen = messages.length
        onMessages(messages)
      }
    } catch {}
    if (running) timerId = setTimeout(tick, intervalMs)
  }

  // Start immediately
  tick()

  return function stopPolling() {
    running = false
    if (timerId) clearTimeout(timerId)
  }
}

/**
 * Legacy alias — kept for compatibility with any code that calls subscribeThread.
 * Switches to polling instead of Supabase Realtime.
 *
 * IMPORTANT: The first poll is used only to seed the "already seen" baseline — it
 * does NOT fire onMessage for existing messages because openThread() renders full
 * history via renderThread() before subscribing. Only truly new messages (arriving
 * after subscribe) trigger onMessage.
 */
export function subscribeThread(myUsername, otherUsername, onMessage) {
  let lastIds      = new Set()
  let initialized  = false  // baseline established from first poll; no onMessage yet

  return pollThread(myUsername, otherUsername, (messages) => {
    if (!initialized) {
      // Seed lastIds with currently-loaded messages; do NOT call onMessage
      initialized = true
      messages.forEach(row => {
        const id = row.id || row.created_at
        if (id) lastIds.add(id)
      })
      return
    }
    // Subsequent polls: fire onMessage only for genuinely new messages
    messages.forEach(row => {
      const id = row.id || row.created_at
      if (id && !lastIds.has(id)) {
        lastIds.add(id)
        onMessage(row)
      }
    })
  })
}

/**
 * Format a timestamp for display.
 */
export function formatDMTime(ts) {
  if (!ts) return ''
  const d   = new Date(ts)
  const now = new Date()
  const diff = (now - d) / 1000

  if (diff < 60)     return 'just now'
  if (diff < 3600)   return Math.floor(diff / 60) + 'm ago'
  if (diff < 86400)  return Math.floor(diff / 3600) + 'h ago'
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Validate a file for DM attachment.
 * Returns null if OK, or an error string.
 */
export function validateDMFile(file) {
  if (!file) return 'No file selected'
  if (file.size > MAX_FILE_B) return `File too large — max ${MAX_FILE_MB}MB`
  if (!ALLOWED_TYPES.has(file.type)) return 'File type not supported. Use: images, audio, PDF, or text.'
  return null
}

/**
 * Get a human-readable file size string.
 */
export function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024)        return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// DM_READY: true if the session has a password hash available (server endpoints need it)
// NOTE: calls _getSessionPH() — the function — not just a reference to it
export const DM_READY = Boolean(_getSessionPH())
