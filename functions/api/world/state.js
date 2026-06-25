/**
 * GET /api/world/state
 * Returns all world state (buildings, districts, events)
 * Used by clients to load initial world state
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestGet(context) {
  try {
    if (!context.env.SUPABASE_URL || !context.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ 
        ok: false, 
        error: 'Server configuration error: Missing Supabase credentials' 
      }, 500);
    }

    // Fetch all buildings
    const buildingsResult = await supabaseFetch(
      context.env, 
      `/rest/v1/world_building_states?select=id,owner_id,building_type,tile_x,tile_y,condition,income_rate,last_collected_at,in_district,business_health&order=id.asc`
    );

    if (!buildingsResult.ok) {
      console.error('[WORLD] state fetch buildings failed:', buildingsResult.status, buildingsResult.data);
      return json({ 
        ok: false, 
        error: `Failed to fetch buildings: ${buildingsResult.data?.message || 'Unknown error'}`,
        status: buildingsResult.status
      }, 500);
    }

    // Fetch all districts
    const districtsResult = await supabaseFetch(
      context.env,
      `/rest/v1/world_districts?select=*&order=building_count.desc`
    );

    // Fetch recent events (last 20)
    const eventsResult = await supabaseFetch(
      context.env,
      `/rest/v1/world_events?select=*&order=created_at.desc&limit=20`
    );

    return json({
      ok: true,
      buildings: Array.isArray(buildingsResult.data) ? buildingsResult.data : [],
      districts: districtsResult.ok && Array.isArray(districtsResult.data) ? districtsResult.data : [],
      events: eventsResult.ok && Array.isArray(eventsResult.data) ? eventsResult.data : []
    });
  } catch (error) {
    console.error('[WORLD] state fetch error:', error);
    return json({ ok: false, error: error?.message || 'Failed to fetch world state.' }, 500);
  }
}
