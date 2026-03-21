/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — Admin Create User (Template)
 *  functions/api/admin/users/create.js (Cloudflare Pages Function)
 *
 *  Handles POST /api/admin/users/create
 *
 *  Expected body:
 *    {
 *      actor_username,
 *      ph,
 *      username,
 *      display_name,
 *      role,
 *      membership_tier,
 *      account_status,
 *      temporary_password
 *    }
 *
 *  Notes:
 *   - Auth/token verification style matches existing functions.
 *   - Only super_admin can create users.
 *   - This template includes Supabase Auth admin user creation.
 *   - Do not return temporary_password in responses.
 * ============================================================
 */

const USERNAME_RE = /^[a-z0-9_-]{3,30}$/
const ALLOWED_ROLES = new Set(['user', 'moderator', 'super_admin'])
const ALLOWED_TIERS = new Set(['free', 'starter', 'pro', 'premium', 'access'])
const ALLOWED_STATUS = new Set(['active', 'limited', 'warned', 'suspended', 'banned'])

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

  if (!actorUsername || !ph) {
    return jsonResponse({ error: 'Missing actor_username or auth token.' }, 400)
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
    return jsonResponse({ error: 'Only super_admin can create users.' }, 403)
  }

  const usernameRaw = String((body && body.username) || '').toLowerCase()
  const username = usernameRaw.replace(/[^a-z0-9_-]/g, '')
  const displayName = String((body && body.display_name) || '').trim()
  const role = String((body && body.role) || 'user').toLowerCase().trim()
  const membershipTier = String((body && body.membership_tier) || 'free').toLowerCase().trim()
  const accountStatus = String((body && body.account_status) || 'active').toLowerCase().trim()
  const temporaryPassword = String((body && body.temporary_password) || '')

  if (!USERNAME_RE.test(username)) {
    return jsonResponse({ error: 'Invalid username.' }, 400)
  }
  if (!displayName) {
    return jsonResponse({ error: 'display_name is required.' }, 400)
  }
  if (!temporaryPassword || temporaryPassword.length < 8) {
    return jsonResponse({ error: 'temporary_password must be at least 8 characters.' }, 400)
  }
  if (!ALLOWED_ROLES.has(role)) {
    return jsonResponse({ error: 'Invalid role.' }, 400)
  }
  if (!ALLOWED_TIERS.has(membershipTier)) {
    return jsonResponse({ error: 'Invalid membership_tier.' }, 400)
  }
  if (!ALLOWED_STATUS.has(accountStatus)) {
    return jsonResponse({ error: 'Invalid account_status.' }, 400)
  }

  const existsRes = await supabaseFetch(
    SUPA_URL,
    SERVICE_KEY,
    'GET',
    `/rest/v1/member_accounts?username=eq.${encodeURIComponent(username)}&select=id,username,is_deleted&limit=1`,
    null
  )

  if (!existsRes.ok) {
    return jsonResponse({ error: 'Could not verify username availability.' }, 500)
  }

  const existingRows = await existsRes.json().catch(() => [])
  if (Array.isArray(existingRows) && existingRows.length) {
    return jsonResponse({ error: 'Username already exists.' }, 409)
  }

  // Required service-role/admin step:
  // Create the Supabase Auth account on the server (never in frontend code).
  const authCreateRes = await createAuthUserWithServiceRole(SUPA_URL, SERVICE_KEY, {
    username,
    displayName,
    temporaryPassword,
  })

  if (!authCreateRes.ok) {
    return jsonResponse({ error: authCreateRes.error || 'Failed to create auth user.' }, authCreateRes.status || 500)
  }

  const authUserId = authCreateRes.userId

  const memberInsertPayload = {
    username,
    display_name: displayName,
    role,
    membership_tier: membershipTier,
    account_status: accountStatus,
    last_active_at: new Date().toISOString(),
  }

  if (authUserId) {
    // Keep this key only if your schema has auth_user_id.
    memberInsertPayload.auth_user_id = authUserId
  }

  const memberInsertRes = await supabaseFetch(
    SUPA_URL,
    SERVICE_KEY,
    'POST',
    '/rest/v1/member_accounts',
    memberInsertPayload
  )

  if (!memberInsertRes.ok) {
    await softCleanupAuthUser(SUPA_URL, SERVICE_KEY, authUserId)
    const errText = await memberInsertRes.text().catch(() => 'unknown')
    console.error('[admin/users/create] member insert failed:', memberInsertRes.status, errText)
    return jsonResponse({ error: 'Failed to create member account row.' }, 500)
  }

  const memberRows = await memberInsertRes.json().catch(() => [])
  const memberRow = Array.isArray(memberRows) ? (memberRows[0] || null) : null

  const profileInsertPayload = {
    username,
    display_name: displayName,
    slug: username,
    plan_type: membershipTier,
    is_active: accountStatus === 'active',
  }

  const profileInsertRes = await supabaseFetch(
    SUPA_URL,
    SERVICE_KEY,
    'POST',
    '/rest/v1/profiles',
    profileInsertPayload
  )

  if (!profileInsertRes.ok) {
    const errText = await profileInsertRes.text().catch(() => 'unknown')
    console.error('[admin/users/create] profile insert failed:', profileInsertRes.status, errText)
    return jsonResponse({ error: 'User created, but profile row failed. Review manually.' }, 500)
  }

  const targetUserId = (memberRow && memberRow.id) || null

  const logRes = await supabaseFetch(
    SUPA_URL,
    SERVICE_KEY,
    'POST',
    '/rest/v1/admin_logs',
    {
      action_type: 'user_created',
      actor_user_id: actor.id,
      target_user_id: targetUserId,
      context_json: {
        username,
        role,
        membership_tier: membershipTier,
        account_status: accountStatus,
      },
    }
  )

  if (!logRes.ok) {
    const errText = await logRes.text().catch(() => 'unknown')
    console.error('[admin/users/create] admin_logs insert failed:', logRes.status, errText)
    return jsonResponse({ error: 'User created, but admin log write failed.' }, 500)
  }

  return jsonResponse(
    {
      ok: true,
      user: {
        id: targetUserId,
        username,
        display_name: displayName,
        role,
        membership_tier: membershipTier,
        account_status: accountStatus,
      },
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

async function createAuthUserWithServiceRole(supabaseUrl, serviceKey, input) {
  const syntheticEmail = `${input.username}@fas.local`

  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: syntheticEmail,
      password: input.temporaryPassword,
      email_confirm: true,
      user_metadata: {
        username: input.username,
        display_name: input.displayName,
      },
      app_metadata: {
        provider: 'email',
      },
    }),
  })

  if (!res.ok) {
    const msg = await res.text().catch(() => 'unknown')
    console.error('[admin/users/create] auth create failed:', res.status, msg)
    return { ok: false, status: res.status, error: 'Supabase Auth create failed.' }
  }

  const json = await res.json().catch(() => null)
  const userId = json && json.id ? String(json.id) : null
  return { ok: true, userId }
}

async function softCleanupAuthUser(supabaseUrl, serviceKey, userId) {
  if (!userId) return
  try {
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    })
  } catch {
    // Best-effort cleanup only.
  }
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
