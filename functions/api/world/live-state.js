/**
 * GET/POST /api/world/live-state
 * Generic per-player live save records.
 *
 * This is the bridge away from browser-only localStorage. Store compact JSON
 * blobs by user + state key while larger systems get dedicated tables.
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

const WORLD_INSTANCE_ID = 'day-one-reset-v1';
const SHARED_WORLD_USER_ID = '__faceless_shared_world__';
const ALLOWED_KEYS = new Set([
  'farm',
  'regional_objects',
  'city_construction',
  'living_world',
  'creatures',
  'skills',
  'shipments',
  'goals',
  'signal_wire',
]);
const SHARED_WORLD_KEYS = new Set([
  'farm',
  'regional_objects',
  'city_construction',
  'living_world',
  'signal_wire',
]);

async function supabaseFetch(env, path, options = {}) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, status: 500, data: { message: 'Missing Supabase credentials.' } };

  const headers = new Headers(options.headers || {});
  headers.set('apikey', key);
  headers.set('Authorization', `Bearer ${key}`);

  const response = await fetch(`${url}${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data, text };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function normalizeScope(key, scope) {
  if (scope === 'world') return 'world';
  if (scope === 'player') return 'player';
  return SHARED_WORLD_KEYS.has(key) ? 'world' : 'player';
}

function validate(userId, key, scope, write = false) {
  if (!key || !ALLOWED_KEYS.has(key)) return 'Invalid state key.';
  if (scope === 'world') {
    if (write && (!userId || String(userId).startsWith('local_'))) return 'Login required to change the shared live world.';
    return '';
  }
  if (!userId) return 'Missing userId.';
  if (String(userId).startsWith('local_')) return 'Login required for live cross-device saves.';
  return '';
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const userId = url.searchParams.get('userId');
    const key = url.searchParams.get('key');
    const scope = normalizeScope(key, url.searchParams.get('scope'));
    const ownerId = scope === 'world' ? SHARED_WORLD_USER_ID : userId;
    const invalid = validate(userId, key, scope, false);
    if (invalid) return json({ ok: false, error: invalid }, 400);

    const result = await supabaseFetch(
      context.env,
      `/rest/v1/world_live_states?select=*&user_id=eq.${encodeURIComponent(ownerId)}&state_key=eq.${encodeURIComponent(key)}&world_instance_id=eq.${encodeURIComponent(WORLD_INSTANCE_ID)}&limit=1`
    );
    if (!result.ok) return json({ ok: false, error: result.data?.message || 'Live state table unavailable.', status: result.status }, 500);

    const row = Array.isArray(result.data) ? result.data[0] : null;
    return json({ ok: true, state: row?.state_data || null, updatedAt: row?.updated_at || null });
  } catch (error) {
    return json({ ok: false, error: error?.message || 'Failed to load live state.' }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const userId = String(body.userId || '').trim();
    const key = String(body.key || '').trim();
    const scope = normalizeScope(key, body.scope);
    const ownerId = scope === 'world' ? SHARED_WORLD_USER_ID : userId;
    const invalid = validate(userId, key, scope, true);
    if (invalid) return json({ ok: false, error: invalid }, 400);

    const row = {
      user_id: ownerId,
      world_instance_id: WORLD_INSTANCE_ID,
      state_key: key,
      state_data: body.state && typeof body.state === 'object' ? body.state : {},
      updated_at: new Date().toISOString(),
    };

    const result = await supabaseFetch(context.env, `/rest/v1/world_live_states?on_conflict=user_id,world_instance_id,state_key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify([row]),
    });
    if (!result.ok) return json({ ok: false, error: result.data?.message || result.data?.hint || 'Live state save failed.', status: result.status }, 500);

    return json({ ok: true, updatedAt: row.updated_at });
  } catch (error) {
    return json({ ok: false, error: error?.message || 'Failed to save live state.' }, 500);
  }
}
