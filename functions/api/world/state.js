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

const WORLD_INSTANCE_ID = 'day-one-reset-v1';
const WORLD_RESET_AT = '2026-07-06T00:00:00.000Z';
const LEGACY_ID_FLOORS = {
  buildings: 1000,
  infrastructure: 21278964,
  blocks: 1,
  lots: 4,
};

function currentRows(rows, floor) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.world_instance_id === WORLD_INSTANCE_ID || Number(row?.id) > floor)
    .map((row) => ({ ...row, world_instance_id: WORLD_INSTANCE_ID, _dayOneCurrent: true }));
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
      `/rest/v1/world_building_states?select=*&order=id.asc`
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

    // Fetch all infrastructure (Phase 5B)
    let infraData = [];
    try {
      const infraResult = await supabaseFetch(
        context.env,
        `/rest/v1/world_infrastructure?select=*&order=id.asc`
      );
      if (infraResult.ok && Array.isArray(infraResult.data)) {
        infraData = infraResult.data;
      }
    } catch (e) {
      // table may not exist yet
    }

    // Fetch all development blocks (Phase 6)
    let blocksData = [];
    let lotsData = [];
    try {
      const blocksResult = await supabaseFetch(
        context.env,
        `/rest/v1/world_blocks?select=*&order=id.asc`
      );
      if (blocksResult.ok && Array.isArray(blocksResult.data)) {
        blocksData = blocksResult.data;
        // Fetch lots for all blocks
        const lotsResult = await supabaseFetch(
          context.env,
          `/rest/v1/world_block_lots?select=*&order=id.asc`
        );
        if (lotsResult.ok && Array.isArray(lotsResult.data)) {
          lotsData = lotsResult.data;
        }
      }
    } catch (e) {
      // tables may not exist yet
    }

    // Fetch recent events (last 20)
    const eventsResult = await supabaseFetch(
      context.env,
      `/rest/v1/world_events?select=*&order=created_at.desc&limit=20`
    );

    const buildings = currentRows(buildingsResult.data, LEGACY_ID_FLOORS.buildings);
    const infrastructure = currentRows(infraData, LEGACY_ID_FLOORS.infrastructure);
    const blocks = currentRows(blocksData, LEGACY_ID_FLOORS.blocks);
    const lots = currentRows(lotsData, LEGACY_ID_FLOORS.lots);
    const events = (eventsResult.ok && Array.isArray(eventsResult.data) ? eventsResult.data : [])
      .filter((event) => Date.parse(event?.created_at || 0) >= Date.parse(WORLD_RESET_AT));

    return json({
      ok: true,
      worldInstanceId: WORLD_INSTANCE_ID,
      buildings,
      // These districts were derived from pre-reset buildings. The district
      // engine stays intact and can repopulate once it is instance-aware.
      districts: [],
      infrastructure,
      blocks,
      lots,
      events
    });
  } catch (error) {
    console.error('[WORLD] state fetch error:', error);
    return json({ ok: false, error: error?.message || 'Failed to fetch world state.' }, 500);
  }
}
