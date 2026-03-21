/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — DM Mark Read
 *  functions/api/dm/mark-read.js (Cloudflare Pages Function)
 *
 *  Handles POST /api/dm/mark-read
 *  Body contract (current frontend):
 *    { username, ph, other }
 *
 *  Auth model:
 *    - Supports Authorization: Bearer <password_hash> (preferred)
 *    - Supports body.ph for current frontend compatibility
 * ============================================================
 */

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
  const otherRaw = String((body && (body.other || body.other_user)) || '').toLowerCase()

  const username = usernameRaw.replace(/[^a-z0-9_-]/g, '')
  const other = otherRaw.replace(/[^a-z0-9_-]/g, '')

  const authHeader = request.headers.get('authorization') || ''
  const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const tokenFromBody = String((body && body.ph) || '')
  const ph = tokenFromHeader || tokenFromBody

  const headerUserRaw = (request.headers.get('x-fas-username') || '').toLowerCase()
  const headerUser = headerUserRaw.replace(/[^a-z0-9_-]/g, '')

  if (!username || !other || !ph) {
    return jsonResponse({ error: 'Missing username, other, or auth token.' }, 400)
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

  const filter =
    `recipient=eq.${encodeURIComponent(username)}` +
    `&sender=eq.${encodeURIComponent(other)}` +
    `&read_at=is.null`

  const patchRes = await supabaseFetch(
    SUPA_URL,
    SERVICE_KEY,
    'PATCH',
    `/rest/v1/dm_messages?${filter}`,
    { read_at: new Date().toISOString() }
  )

  if (!patchRes.ok) {
    const errText = await patchRes.text().catch(() => 'unknown')
    console.error('[dm/mark-read] update failed:', patchRes.status, errText)
    return jsonResponse({ error: 'Failed to mark messages read.' }, 500)
  }

  const rows = await patchRes.json().catch(() => [])
  const updatedCount = Array.isArray(rows) ? rows.length : 0

  return jsonResponse({ ok: true, updated: updatedCount }, 200)
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
