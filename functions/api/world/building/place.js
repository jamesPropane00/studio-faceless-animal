/**
 * POST /api/world/building/place
 * Body: { x, y, type, userId }
 * Places a new building in the world
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

const BUILDING_TYPES = {
  house: { name: 'House', cost: 50, income: 0.5 },
  shop: { name: 'Shop', cost: 100, income: 1 },
  club: { name: 'Club', cost: 150, income: 2 },
  warehouse: { name: 'Warehouse', cost: 75, income: 1 },
  hide: { name: 'Hide', cost: 200, income: 3 },
  camp: { name: 'Camp', cost: 25, income: 0 }
};

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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestPost(context) {
  try {
    // Check if environment variables are set
    if (!context.env.SUPABASE_URL || !context.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[WORLD] building/place: Missing Supabase credentials');
      return json({ 
        ok: false, 
        error: 'Server configuration error: Missing Supabase credentials' 
      }, 500);
    }

    const body = await context.request.json();
    const { x, y, type, userId } = body;
    
    if (x === undefined || y === undefined || !type) {
      return json({ ok: false, error: 'Missing x, y, or type.' }, 400);
    }

    if (!BUILDING_TYPES[type]) {
      return json({ ok: false, error: 'Invalid building type.' }, 400);
    }

    const tileX = Math.floor(x);
    const tileY = Math.floor(y);

    // First, verify the table exists
    const tableCheck = await supabaseFetch(context.env, `/rest/v1/world_building_states?select=id&limit=1`);
    if (!tableCheck.ok) {
      console.error('[WORLD] building/place: Table check failed:', tableCheck.status, JSON.stringify(tableCheck.data));
      return json({ 
        ok: false, 
        error: `Table not found or inaccessible. Make sure you ran the SQL schema. Error: ${tableCheck.data?.message || 'Unknown'}`,
        status: tableCheck.status
      }, 500);
    }

    // Check if tile is already occupied
    const checkQuery = `select=id&tile_x=eq.${tileX}&tile_y=eq.${tileY}`;
    const checkResult = await supabaseFetch(context.env, `/rest/v1/world_building_states?${checkQuery}`);
    
    if (!checkResult.ok) {
      console.error('[WORLD] building/place: Check query failed:', checkResult.status, JSON.stringify(checkResult.data));
      return json({ 
        ok: false, 
        error: `Tile check failed: ${checkResult.data?.message || 'Unknown error'}`,
        status: checkResult.status
      }, 500);
    }
    
    if (Array.isArray(checkResult.data) && checkResult.data.length > 0) {
      return json({ ok: false, error: 'Tile is already occupied.' }, 400);
    }

    // Get next building ID
    const maxIdQuery = `select=id&order=id.desc&limit=1`;
    const maxIdResult = await supabaseFetch(context.env, `/rest/v1/world_building_states?${maxIdQuery}`);
    
    let nextId = 1;
    if (maxIdResult.ok && Array.isArray(maxIdResult.data) && maxIdResult.data.length > 0) {
      nextId = (maxIdResult.data[0].id || 0) + 1;
    }

    // Insert building. owner_id is now TEXT (no FK constraint), so we can store
    // any value: real user UUIDs, local guest IDs, or null for anonymous buildings.
    const building = {
      id: nextId,
      owner_id: userId || null,
      building_type: type,
      tile_x: tileX,
      tile_y: tileY,
      condition: 100,
      income_rate: BUILDING_TYPES[type].income,
      last_collected_at: new Date().toISOString(),
      in_district: false,
      status: 'active'
    };

    const insertResult = await supabaseFetch(context.env, `/rest/v1/world_building_states`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify([building])
    });

    if (!insertResult.ok) {
      console.error('[WORLD] building/place insert failed:', insertResult.status, JSON.stringify(insertResult.data));
      return json({ 
        ok: false, 
        error: `Database insert failed: ${insertResult.data?.message || insertResult.data?.hint || 'Unknown error'}. Make sure you ran the SQL schema.`,
        status: insertResult.status
      }, 500);
    }

    // Update player reputation (+5 for building) - for ALL users
    if (userId) {
      const playerQuery = `select=coins,reputation&user_id=eq.${encodeURIComponent(userId)}`;
      const playerResult = await supabaseFetch(context.env, `/rest/v1/world_player_states?${playerQuery}`);
      
      let currentCoins = 100;
      let currentRep = 0;
      if (playerResult.ok && Array.isArray(playerResult.data) && playerResult.data.length > 0) {
        currentCoins = playerResult.data[0].coins || 100;
        currentRep = playerResult.data[0].reputation || 0;
      }

      const upsertResult = await supabaseFetch(context.env, `/rest/v1/world_player_states`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([{
          user_id: userId,
          coins: currentCoins,
          reputation: currentRep + 5,
          updated_at: new Date().toISOString()
        }])
      });

      if (!upsertResult.ok) {
        console.error('[WORLD] building/place player-state upsert failed:', upsertResult.status, upsertResult.data);
      }
    }

    return json({
      ok: true,
      building: {
        id: nextId,
        building_type: type,
        tile_x: tileX,
        tile_y: tileY,
        owner_id: userId || null,
        condition: 100,
        income_rate: BUILDING_TYPES[type].income,
        status: 'active'
      }
    });
  } catch (error) {
    console.error('Building placement error:', error);
    return json({ ok: false, error: error?.message || 'Failed to place building.' }, 500);
  }
}
