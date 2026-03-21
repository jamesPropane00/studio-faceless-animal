/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — DM Messages
 *  functions/api/dm/messages.js (Cloudflare Pages Function)
 *
 *  Handles GET /api/dm/messages?me=<handle>&other=<handle>
 *  (also accepts ?username=<handle>&other_user=<handle>)
 *  Auth: Authorization: Bearer <password_hash>
 * ============================================================
 */

export async function onRequestGet(context) {
  const { request, env } = context

  const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
  const SUPA_URL = env.SUPABASE_URL
  if (!SERVICE_KEY || !SUPA_URL) {
    return jsonResponse({ error: 'DM service unavailable.' }, 503)
  }

  const url = new URL(request.url)
  const meRaw = (url.searchParams.get('me') || url.searchParams.get('username') || '').toLowerCase()
  const otherRaw = (url.searchParams.get('other') || url.searchParams.get('other_user') || '').toLowerCase()
  const me = meRaw.replace(/[^a-z0-9_-]/g, '')
  const other = otherRaw.replace(/[^a-z0-9_-]/g, '')

  const authHeader = request.headers.get('authorization') || ''
  const ph = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  const headerUserRaw = (request.headers.get('x-fas-username') || '').toLowerCase()
  const headerUser = headerUserRaw.replace(/[^a-z0-9_-]/g, '')

  if (!me || !other || !ph) {
    return jsonResponse({ error: 'Missing me, other, or auth token.' }, 400)
  }

  if (headerUser && headerUser !== me) {
    return jsonResponse({ error: 'Username mismatch.' }, 400)
  }

  const verifyRes = await supabaseFetch(
    SUPA_URL,
    SERVICE_KEY,
    'POST',
    '/rest/v1/rpc/verify_member_password',
    { p_username: me, p_hash: ph }
  )

  if (!verifyRes.ok) {
    return jsonResponse({ error: 'Could not verify identity.' }, 500)
  }

  const verified = await verifyRes.json().catch(() => false)
  if (!verified) {
    return jsonResponse({ error: 'Authentication failed.' }, 401)
  }

  const filter =
    `or=(and(sender.eq.${encodeURIComponent(me)},recipient.eq.${encodeURIComponent(other)}),and(sender.eq.${encodeURIComponent(other)},recipient.eq.${encodeURIComponent(me)}))` +
    `&select=id,sender,recipient,message,file_url,file_type,file_name,file_size_bytes,created_at,read_at` +
    `&order=created_at.asc` +
    `&limit=200`

  const msgRes = await supabaseFetch(
    SUPA_URL,
    SERVICE_KEY,
    'GET',
    `/rest/v1/dm_messages?${filter}`,
    null
  )

  if (!msgRes.ok) {
    return jsonResponse({ error: 'Could not load messages.' }, 500)
  }

  const rows = await msgRes.json().catch(() => [])
  return jsonResponse({ messages: Array.isArray(rows) ? rows : [] }, 200)
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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-FAS-Username',
  }
}
