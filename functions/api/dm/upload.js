/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — DM File Upload
 *  functions/api/dm/upload.js  (Cloudflare Pages Function)
 *
 *  Handles POST /api/dm/upload in production on Cloudflare Pages.
 *  Identical security model to the server.js dev handler.
 *
 *  Required CF Pages environment variables (set in CF dashboard):
 *    SUPABASE_URL               — e.g. https://xxxx.supabase.co
 *    SUPABASE_SERVICE_ROLE_KEY  — server-only, NEVER in env.js
 *
 *  Security model:
 *    1. Receives { username, ph, file_b64, file_type, file_name, file_size }
 *    2. Verifies `ph` (PBKDF2 hash) via Supabase RPC — proves user identity
 *    3. Checks member_accounts plan — must be active/paid
 *    4. Uploads binary to Supabase Storage via service_role — bypasses RLS
 *    5. Returns a 24-hour signed URL
 *
 *  The service_role key NEVER reaches the browser.
 *  The anon key NEVER touches Storage.
 *  No anon/authenticated storage policies are needed on dm-attachments.
 *  The bucket must remain private with NO storage policies (service_role only).
 * ============================================================
 */

const BUCKET         = 'dm-attachments'
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_BODY_BYTES = 15 * 1024 * 1024

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/flac', 'audio/mp4',
  'audio/x-m4a', 'audio/aiff',
  'video/mp4', 'video/webm',
  'application/pdf', 'text/plain',
])

export async function onRequestPost(context) {
  const { request, env } = context

  const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
  const SUPA_URL    = env.SUPABASE_URL

  if (!SERVICE_KEY || !SUPA_URL) {
    return jsonResponse({ error: 'File uploads not configured on this server.' }, 503)
  }

  // ── 1. Parse body ─────────────────────────────────────────────
  const contentLength = parseInt(request.headers.get('content-length') || '0', 10)
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'Request too large. Max file size is 10MB.' }, 413)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400)
  }

  const { username, ph, file_b64, file_type, file_name, file_size } = body

  // ── 2. Validate ───────────────────────────────────────────────
  if (!username || !ph || !file_b64 || !file_type || !file_name) {
    return jsonResponse({ error: 'Missing required fields.' }, 400)
  }
  if (typeof file_size === 'number' && file_size > MAX_FILE_BYTES) {
    return jsonResponse({ error: 'File too large. Maximum is 10MB.' }, 400)
  }
  if (!ALLOWED_TYPES.has(file_type)) {
    return jsonResponse({ error: 'File type not allowed.' }, 400)
  }
  const u = username.toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (!u || u.length < 3 || u.length > 30) {
    return jsonResponse({ error: 'Invalid username.' }, 400)
  }

  // ── 3. Verify identity (password hash via Supabase RPC) ───────
  const verifyRes = await supabaseFetch(SUPA_URL, SERVICE_KEY,
    'POST', '/rest/v1/rpc/verify_member_password',
    { p_username: u, p_hash: ph }
  )
  if (!verifyRes.ok) {
    return jsonResponse({ error: 'Could not verify identity. Try again.' }, 500)
  }
  const verified = await verifyRes.json()
  if (!verified) {
    return jsonResponse({ error: 'Authentication failed. Please sign in again.' }, 401)
  }

  // ── 4. Check plan (active/paid only) ─────────────────────────
  const planRes = await supabaseFetch(SUPA_URL, SERVICE_KEY,
    'GET',
    `/rest/v1/member_accounts?username=eq.${encodeURIComponent(u)}&select=plan_type,member_status`,
    null
  )
  let member = null
  if (planRes.ok) {
    const rows = await planRes.json()
    member = Array.isArray(rows) ? rows[0] : null
  }
  const isActive = member &&
    !['free', 'none', '', null, undefined].includes(member.plan_type) &&
    member.member_status !== 'inactive'

  if (!isActive) {
    return jsonResponse({
      error: 'File attachments require an active paid membership. Upgrade your plan to send files.',
    }, 403)
  }

  // ── 5. Decode base64 → binary ─────────────────────────────────
  let fileBytes
  try {
    const binary = atob(file_b64)
    fileBytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) fileBytes[i] = binary.charCodeAt(i)
  } catch {
    return jsonResponse({ error: 'Could not decode file data.' }, 400)
  }
  if (fileBytes.length > MAX_FILE_BYTES) {
    return jsonResponse({ error: 'Decoded file exceeds 10MB limit.' }, 400)
  }

  // ── 6. Upload to Supabase Storage via service_role ────────────
  const safeName    = (file_name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
  const storagePath = `${u}/${Date.now()}_${safeName}`

  const uploadRes = await fetch(
    `${SUPA_URL}/storage/v1/object/${BUCKET}/${storagePath}`,
    {
      method:  'PUT',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type':  file_type,
        'x-upsert':      'false',
      },
      body: fileBytes,
    }
  )

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => 'unknown')
    console.error('[FAS:upload] Storage error:', uploadRes.status, errText)
    return jsonResponse({ error: 'File upload failed. Try again.' }, 500)
  }

  // ── 7. Generate 24-hour signed URL ────────────────────────────
  const signRes = await supabaseFetch(SUPA_URL, SERVICE_KEY,
    'POST',
    `/storage/v1/object/sign/${BUCKET}/${storagePath}`,
    { expiresIn: 86400 }
  )

  if (!signRes.ok) {
    return jsonResponse({ error: 'Upload succeeded but could not generate a download link.' }, 500)
  }

  const signData  = await signRes.json()
  const rawUrl    = signData.signedURL || signData.signedUrl || ''
  const signedUrl = rawUrl.startsWith('http') ? rawUrl : `${SUPA_URL}/storage/v1${rawUrl}`

  return jsonResponse({ url: signedUrl, path: storagePath, error: null })
}

export async function onRequestOptions() {
  return new Response(null, {
    status:  204,
    headers: corsHeaders(),
  })
}

// ── Helpers ───────────────────────────────────────────────────────────

function supabaseFetch(supabaseUrl, serviceKey, method, urlPath, jsonBody) {
  const headers = {
    'apikey':        serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
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
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
