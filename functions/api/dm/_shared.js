const jsonHeaders = { 'content-type': 'application/json', 'cache-control': 'no-store' };

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

export function cleanUser(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

export function bearer(request) {
  const value = request.headers.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

export function config(env) {
  const url = env.SUPABASE_URL || 'https://ghufaozjwondqcrcucjs.supabase.co';
  const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url: url.replace(/\/$/, ''), key };
}

export async function sb(env, path, options = {}) {
  const { url, key } = config(env);
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  return fetch(url + path, {
    ...options,
    headers: {
      apikey: key,
      authorization: 'Bearer ' + key,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
}

export async function rows(response) {
  const text = await response.text();
  if (!text) return [];
  try { return JSON.parse(text); } catch { return []; }
}

export async function verify(env, username, ph) {
  const user = cleanUser(username);
  if (!user || !ph) return false;
  const response = await sb(env, '/rest/v1/member_accounts?username=eq.' + encodeURIComponent(user)
    + '&password_hash=eq.' + encodeURIComponent(ph) + '&select=username&limit=1');
  const data = await rows(response);
  return response.ok && Array.isArray(data) && data.length > 0;
}

export async function connected(env, one, two) {
  const a = cleanUser(one);
  const b = cleanUser(two);
  const filter = 'or=(and(requester_username.eq.' + encodeURIComponent(a)
    + ',target_username.eq.' + encodeURIComponent(b)
    + '),and(requester_username.eq.' + encodeURIComponent(b)
    + ',target_username.eq.' + encodeURIComponent(a) + '))';
  const response = await sb(env, '/rest/v1/user_connections?' + filter + '&state=eq.connected&select=id&limit=1');
  const data = await rows(response);
  return response.ok && Array.isArray(data) && data.length > 0;
}
