/**
 * GET/POST /api/world/farm/stand
 * Shared Roadside Stand state for player-stocked farm shops.
 *
 * This endpoint stores the stand object state; farm inventory accounting still
 * happens client-side until farm/player inventories are fully server-backed.
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

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const standId = url.searchParams.get('standId');
    if (!standId) return json({ ok: false, error: 'Missing standId.' }, 400);

    const result = await supabaseFetch(
      context.env,
      `/rest/v1/world_farm_stands?select=*&stand_id=eq.${encodeURIComponent(standId)}&world_instance_id=eq.${encodeURIComponent(WORLD_INSTANCE_ID)}&limit=1`
    );
    if (!result.ok) return json({ ok: false, error: result.data?.message || 'Farm stand table unavailable.', status: result.status }, 500);

    const row = Array.isArray(result.data) ? result.data[0] : null;
    return json({ ok: true, stand: row || null });
  } catch (error) {
    return json({ ok: false, error: error?.message || 'Failed to load farm stand.' }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const standId = String(body.standId || '').trim();
    if (!standId) return json({ ok: false, error: 'Missing standId.' }, 400);

    const stock = body.stock && typeof body.stock === 'object' ? body.stock : {};
    const sales = Array.isArray(body.sales) ? body.sales.slice(-50) : [];
    const earnings = Math.max(0, Number(body.earnings) || 0);
    const row = {
      stand_id: standId,
      world_instance_id: WORLD_INSTANCE_ID,
      owner_id: body.ownerId || null,
      owner_name: body.ownerName || 'Unknown Farmer',
      region_id: body.regionId || 'farmlands',
      tile_x: Number(body.tileX) || 0,
      tile_y: Number(body.tileY) || 0,
      stock,
      earnings,
      sales,
      updated_at: new Date().toISOString(),
    };

    const result = await supabaseFetch(context.env, `/rest/v1/world_farm_stands?on_conflict=stand_id,world_instance_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify([row]),
    });

    if (!result.ok) return json({ ok: false, error: result.data?.message || result.data?.hint || 'Farm stand save failed.', status: result.status }, 500);
    return json({ ok: true, stand: Array.isArray(result.data) ? result.data[0] : row });
  } catch (error) {
    return json({ ok: false, error: error?.message || 'Failed to save farm stand.' }, 500);
  }
}
