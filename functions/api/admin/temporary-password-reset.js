const TOKEN_DIGEST = '944e1336917bdf48ee87c7182ff0d2af50ff66f16a64b5d8c78b8197c734d871';
const TARGETS = new Set(['naelynn', 'empressnae']);

function base64(bytes) {
  let text = '';
  bytes.forEach((byte) => { text += String.fromCharCode(byte); });
  return btoa(text);
}

async function hexDigest(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function passwordRecord(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    material,
    256,
  );
  return {
    password_hash: base64(new Uint8Array(bits)),
    password_salt: base64(salt),
    password_set_at: new Date().toISOString(),
  };
}

export async function onRequestPost(context) {
  const suppliedToken = context.request.headers.get('x-reset-token') || '';
  if (await hexDigest(suppliedToken) !== TOKEN_DIGEST) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 403 });
  }

  const body = await context.request.json();
  const password = String(body.password || '');
  const usernames = Array.isArray(body.usernames)
    ? body.usernames.map((value) => String(value || '').toLowerCase().trim())
    : [];
  if (password.length < 8 || !usernames.length || usernames.some((name) => !TARGETS.has(name))) {
    return Response.json({ ok: false, error: 'Invalid reset request.' }, { status: 400 });
  }

  const base = String(context.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = context.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return Response.json({ ok: false, error: 'Server configuration missing.' }, { status: 500 });

  const results = [];
  for (const username of usernames) {
    const record = await passwordRecord(password);
    const response = await fetch(`${base}/rest/v1/member_accounts?username=eq.${encodeURIComponent(username)}`, {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(record),
    });
    const rows = response.ok ? await response.json() : [];
    results.push({ username, updated: response.ok && Array.isArray(rows) && rows.length === 1 });
  }

  return Response.json({ ok: results.every((item) => item.updated), results });
}
