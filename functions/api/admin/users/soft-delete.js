/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — Admin Soft Delete User (Template)
 *  functions/api/admin/users/soft-delete.js (Cloudflare Pages Function)
 *
 *  Handles POST /api/admin/users/soft-delete
 *
 *  Expected body:
 *    {
 *      actor_username,
 *      ph,
 *      target_user_id
 *    }
 *
 *  Notes:
 *   - Auth/token verification style matches existing functions.
 *   - Only super_admin can soft-delete users.
 *   - No hard delete. No Supabase Auth user deletion here.
 * ============================================================
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function onRequestPost(context) {
  const { request, env } = context

  const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
  const SUPA_URL = env.SUPABASE_URL
  if (!SERVICE_KEY || !SUPA_URL) {
    return jsonResponse({ error: 'Admin user service unavailable.' }, 503)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400)
  }

  const actorUsernameRaw = String((body && body.actor_username) || '').toLowerCase()
  const actorUsername = actorUsernameRaw.replace(/[^a-z0-9_-]/g, '')

  const authHeader = request.headers.get('authorization') || ''
  const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const tokenFromBody = String((body && body.ph) || '')
  const ph = tokenFromHeader || tokenFromBody

  const headerUserRaw = (request.headers.get('x-fas-username') || '').toLowerCase()
  const headerUser = headerUserRaw.replace(/[^a-z0-9_-]/g, '')

  const targetUserId = String((body && body.target_user_id) || '').trim()

  if (!actorUsername || !ph || !targetUserId) {
    return jsonResponse({ error: 'Missing actor_username, target_user_id, or auth token.' }, 400)
  }

  if (!UUID_RE.test(targetUserId)) {
    return jsonResponse({ error: 'Invalid target_user_id.' }, 400)
  }

  if (headerUser && headerUser !== actorUsername) {
    return jsonResponse({ error: 'Username mismatch.' }, 400)
  }

  const verifyRes = await supabaseFetch(
    SUPA_URL,
    SERVICE_KEY,
    'POST',
    '/rest/v1/rpc/verify_member_password',
    { p_username: actorUsername, p_hash: ph }
  )

  if (!verifyRes.ok) {
    return jsonResponse({ error: 'Could not verify identity.' }, 500)
  }

  const verified = await verifyRes.json().catch(() => false)
  if (!verified) {
    return jsonResponse({ error: 'Authentication failed.' }, 401)
  }

  const actorRes = await supabaseFetch(
    SUPA_URL,
    SERVICE_KEY,
    'GET',
    `/rest/v1/member_accounts?username=eq.${encodeURIComponent(actorUsername)}&select=id,username,role,is_deleted&limit=1`,
    null
  )

  if (!actorRes.ok) {
    return jsonResponse({ error: 'Could not load actor account.' }, 500)
  }

  const actorRows = await actorRes.json().catch(() => [])
  const actor = Array.isArray(actorRows) ? (actorRows[0] || null) : null
  if (!actor || actor.is_deleted) {
    return jsonResponse({ error: 'Actor account unavailable.' }, 403)
  }

  const actorRole = String(actor.role || 'user').toLowerCase()
  if (actorRole !== 'super_admin') {
    return jsonResponse({ error: 'Only super_admin can soft-delete users.' }, 403)
  }

  if (String(actor.id || '') === targetUserId) {
    return jsonResponse({ error: 'You cannot soft-delete your own account.' }, 403)
  }

  const targetRes = await supabaseFetch(
    SUPA_URL,
    SERVICE_KEY,
    'GET',
    `/rest/v1/member_accounts?id=eq.${encodeURIComponent(targetUserId)}&select=id,username,role,is_deleted&limit=1`,
    null
  )

  if (!targetRes.ok) {
    return jsonResponse({ error: 'Could not load target account.' }, 500)
  }

  const targetRows = await targetRes.json().catch(() => [])
  const target = Array.isArray(targetRows) ? (targetRows[0] || null) : null

  if (!target) {
    return jsonResponse({ error: 'Target user not found.' }, 404)
  }

  const targetRole = String(target.role || 'user').toLowerCase()
  if (targetRole === 'super_admin') {
    return jsonResponse({ error: 'Cannot soft-delete a super_admin account.' }, 403)
  }

  if (target.is_deleted) {
    return jsonResponse({ ok: true, already_deleted: true, target_user_id: targetUserId }, 200)
  }

  const patchRes = await supabaseFetch(
    SUPA_URL,
    SERVICE_KEY,
    'PATCH',
    `/rest/v1/member_accounts?id=eq.${encodeURIComponent(targetUserId)}`,
    {
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: actor.id,
    }
  )

  if (!patchRes.ok) {
    const errText = await patchRes.text().catch(() => 'unknown')
    console.error('[admin/users/soft-delete] member update failed:', patchRes.status, errText)
    return jsonResponse({ error: 'Failed to soft-delete user.' }, 500)
  }

  const logRes = await supabaseFetch(
    SUPA_URL,
    SERVICE_KEY,
    'POST',
    '/rest/v1/admin_logs',
    {
      action_type: 'user_soft_deleted',
      actor_user_id: actor.id,
      target_user_id: target.id,
      context_json: {
        username: target.username,
      },
    }
  )

  if (!logRes.ok) {
    const errText = await logRes.text().catch(() => 'unknown')
    console.error('[admin/users/soft-delete] admin_logs insert failed:', logRes.status, errText)
    return jsonResponse({ error: 'User soft-deleted, but admin log write failed.' }, 500)
  }

  return jsonResponse(
    {
      ok: true,
      target_user_id: target.id,
      username: target.username,
      is_deleted: true,
    },
    200
  )
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
