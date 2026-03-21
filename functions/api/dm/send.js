/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — DM Send
 *  functions/api/dm/send.js (Cloudflare Pages Function)
 *
 *  Handles POST /api/dm/send
 *  Body contract (current frontend):
 *    { username, ph, recipient, message, file_url?, file_type?, file_name?, file_size_bytes? }
 *
 *  Auth model:
 *    - Supports Authorization: Bearer <password_hash> (preferred)
 *    - Supports body.ph for current frontend compatibility
 * ============================================================
 */

const MAX_DM_LEN = 500

export async function onRequestPost(context) {
  const { request, env } = context

  const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
  const SUPA_URL = env.SUPABASE_URL
  if (!SERVICE_KEY || !SUPA_URL) {
    return jsonResponse({ error: 'DM service unavailable.' }, 503)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400)
  }

  const usernameRaw = String((body && body.username) || '').toLowerCase()
  const recipientRaw = String((body && body.recipient) || '').toLowerCase()
  const message = String((body && body.message) || '').trim()

  const username = usernameRaw.replace(/[^a-z0-9_-]/g, '')
  const recipient = recipientRaw.replace(/[^a-z0-9_-]/g, '')

  const authHeader = request.headers.get('authorization') || ''
  const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const tokenFromBody = String((body && body.ph) || '')
  const ph = tokenFromHeader || tokenFromBody

  const headerUserRaw = (request.headers.get('x-fas-username') || '').toLowerCase()
  const headerUser = headerUserRaw.replace(/[^a-z0-9_-]/g, '')

  if (!username || !recipient || !message || !ph) {
    return jsonResponse({ error: 'Missing fields.' }, 400)
  }

  if (message.length < 1 || message.length > MAX_DM_LEN) {
    return jsonResponse({ error: 'Message must be 1–500 characters.' }, 400)
  }

  if (headerUser && headerUser !== username) {
    return jsonResponse({ error: 'Username mismatch.' }, 400)
  }

  const verifyRes = await supabaseFetch(
    SUPA_URL,
    SERVICE_KEY,
    'POST',
    '/rest/v1/rpc/verify_member_password',
    { p_username: username, p_hash: ph }
  )

  if (!verifyRes.ok) {
    return jsonResponse({ error: 'Could not verify identity.' }, 500)
  }

  const verified = await verifyRes.json().catch(() => false)
  if (!verified) {
    return jsonResponse({ error: 'Authentication failed.' }, 401)
  }

  const insertRow = {
    sender: username,
    recipient,
    message,
  }

  if (body && body.file_url) insertRow.file_url = String(body.file_url)
  if (body && body.file_type) insertRow.file_type = String(body.file_type)
  if (body && body.file_name) insertRow.file_name = String(body.file_name)
  if (body && body.file_size_bytes) insertRow.file_size_bytes = Number(body.file_size_bytes) || 0

  const saveRes = await supabaseFetch(
    SUPA_URL,
    SERVICE_KEY,
    'POST',
    '/rest/v1/dm_messages',
    insertRow
  )

  if (!saveRes.ok) {
    const errText = await saveRes.text().catch(() => 'unknown')
    console.error('[dm/send] insert failed:', saveRes.status, errText)
    return jsonResponse({ error: 'Failed to send message.' }, 500)
  }

  const saved = await saveRes.json().catch(() => null)
  const savedRow = Array.isArray(saved) ? (saved[0] || null) : saved
  return jsonResponse({ message: savedRow }, 200)
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  })
}

function supabaseFetch(supabaseUrl, serviceKey, method, urlPath, jsonBody) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  return fetch(`${supabaseUrl}${urlPath}`, {
    method,
    headers,
    body: jsonBody != null ? JSON.stringify(jsonBody) : undefined,
  })
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-FAS-Username',
  }
}
