/**
 * POST /api/world/income/collect
 * Body: { userId, buildingId }
 * Collects accumulated income from a building
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

const INCOME_CAP_HOURS = 24;
const DISTRICT_INCOME_BONUS = 0.2;

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

function calculateAccumulatedIncome(building) {
  if (!building.last_collected_at) return 0;
  const now = Date.now();
  const lastCollected = new Date(building.last_collected_at).getTime();
  const elapsed = now - lastCollected;
  const maxMs = INCOME_CAP_HOURS * 60 * 60 * 1000;
  const cappedElapsed = Math.min(elapsed, maxMs);
  const minutes = cappedElapsed / 60000;
  let income = building.income_rate * minutes;
  if (building.in_district) {
    income *= (1 + DISTRICT_INCOME_BONUS);
  }
  return Math.floor(income);
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
    const body = await context.request.json();
    const { userId, buildingId } = body;
    
    if (!userId || !buildingId) {
      return json({ ok: false, error: 'Missing userId or buildingId.' }, 400);
    }

    // Fetch building from Supabase
    const buildingQuery = `select=id,owner_id,building_type,income_rate,last_collected_at,in_district&id=eq.${buildingId}`;
    const buildingResult = await supabaseFetch(context.env, `/rest/v1/world_building_states?${buildingQuery}`);
    
    if (!buildingResult.ok || !Array.isArray(buildingResult.data) || buildingResult.data.length === 0) {
      return json({ ok: false, error: 'Building not found.' }, 404);
    }

    const building = buildingResult.data[0];
    
    if (building.owner_id !== userId) {
      return json({ ok: false, error: 'You do not own this building.' }, 403);
    }

    const income = calculateAccumulatedIncome(building);
    
    if (income <= 0) {
      return json({ ok: true, coinsCollected: 0, message: 'No income to collect.' });
    }

    // Update player coins
    const playerQuery = `select=coins,reputation&user_id=eq.${encodeURIComponent(userId)}`;
    const playerResult = await supabaseFetch(context.env, `/rest/v1/world_player_states?${playerQuery}`);
    
    let currentCoins = 100;
    let currentRep = 0;
    
    if (playerResult.ok && Array.isArray(playerResult.data) && playerResult.data.length > 0) {
      currentCoins = playerResult.data[0].coins || 100;
      currentRep = playerResult.data[0].reputation || 0;
    }

    const newCoins = currentCoins + income;
    const newRep = currentRep + 1;

    // Update player state
    if (userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      const updatePlayer = await supabaseFetch(context.env, `/rest/v1/world_player_states?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([{
          user_id: userId,
          coins: newCoins,
          reputation: newRep,
          updated_at: new Date().toISOString()
        }])
      });

      if (!updatePlayer.ok) {
        console.error('[WORLD] income/collect player-state upsert failed:', updatePlayer.status, updatePlayer.data);
      }
    }

    // Update building last_collected_at
    const updateBuilding = await supabaseFetch(context.env, `/rest/v1/world_building_states?id=eq.${buildingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        last_collected_at: new Date().toISOString()
      })
    });

    return json({
      ok: true,
      coinsCollected: income,
      newBalance: newCoins,
      reputation: newRep
    });
  } catch (error) {
    console.error('Income collection error:', error);
    return json({ ok: false, error: error?.message || 'Failed to collect income.' }, 500);
  }
}
