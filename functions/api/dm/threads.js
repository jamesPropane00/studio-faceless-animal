/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — DM Threads
 *  functions/api/dm/threads.js (Cloudflare Pages Function)
 *
 *  Handles GET /api/dm/threads?username=<handle>
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
  const usernameRaw = (url.searchParams.get('username') || '').toLowerCase()
  const username = usernameRaw.replace(/[^a-z0-9_-]/g, '')

  const authHeader = request.headers.get('authorization') || ''
  const ph = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  const headerUserRaw = (request.headers.get('x-fas-username') || '').toLowerCase()
  const headerUser = headerUserRaw.replace(/[^a-z0-9_-]/g, '')

  if (!username || !ph) {
    return jsonResponse({ error: 'Missing username or auth token.' }, 400)
  }

  // Keep identity anchor strict: header user and query user must match when provided.
  if (headerUser && headerUser !== username) {
    return jsonResponse({ error: 'Username mismatch.' }, 400)
  }

  // Verify username + password hash via RPC.
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
    `or=(sender.eq.${encodeURIComponent(username)},recipient.eq.${encodeURIComponent(username)})` +
    `&select=sender,recipient,message,file_name,created_at,read_at` +
    `&order=created_at.desc`

  const dmRes = await supabaseFetch(
    SUPA_URL,
    SERVICE_KEY,
    'GET',
    `/rest/v1/dm_messages?${filter}`,
    null
  )

  if (!dmRes.ok) {
    return jsonResponse({ error: 'Could not load threads.' }, 500)
  }

  const rows = await dmRes.json().catch(() => [])

  const seen = {}
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const sender = String(row && row.sender || '')
    const recipient = String(row && row.recipient || '')
    const partner = sender === username ? recipient : sender
    if (!partner) return

    const preview = row && row.file_name
      ? `📎 ${String(row.file_name)}`
      : String((row && row.message) || '')

    if (!seen[partner]) {
      seen[partner] = {
        username: partner,
        last_message: preview,
        last_ts: row && row.created_at ? row.created_at : null,
        unread: recipient === username && !(row && row.read_at) ? 1 : 0,
      }
    } else if (recipient === username && !(row && row.read_at)) {
      seen[partner].unread += 1
    }
  })

  const threads = Object.values(seen).sort((a, b) => {
    const ta = new Date(a.last_ts || 0).getTime()
    const tb = new Date(b.last_ts || 0).getTime()
    return tb - ta
  })

  return jsonResponse({ threads }, 200)
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
