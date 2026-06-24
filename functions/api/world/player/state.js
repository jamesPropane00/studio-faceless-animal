/**
 * GET /api/world/player/state?userId=xxx
 * Returns player's coins, reputation, level, and progress
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

const REP_LEVELS = [
  { name: 'Nobody', min: 0, max: 50 },
  { name: 'Worker', min: 50, max: 150 },
  { name: 'Hustler', min: 150, max: 300 },
  { name: 'Operator', min: 300, max: 600 },
  { name: 'Boss', min: 600, max: Infinity }
];

function getRepLevel(reputation) {
  for (let i = REP_LEVELS.length - 1; i >= 0; i--) {
    if (reputation >= REP_LEVELS[i].min) {
      return { ...REP_LEVELS[i], index: i };
    }
  }
  return { ...REP_LEVELS[0], index: 0 };
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
    const url = new URL(context.request.url);
    const userId = url.searchParams.get('userId');
    
    if (!userId) {
      return json({ ok: false, error: 'Missing userId.' }, 400);
    }

    // Fetch player state from Supabase
    const query = `select=coins,reputation,current_job_id&user_id=eq.${encodeURIComponent(userId)}`;
    const result = await supabaseFetch(context.env, `/rest/v1/world_player_states?${query}`);
    
    let coins = 100;
    let reputation = 0;
    
    if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
      coins = result.data[0].coins || 100;
      reputation = result.data[0].reputation || 0;
    } else if (!result.ok) {
      // If table doesn't exist or query fails, use defaults
      console.warn('Failed to fetch player state, using defaults');
    }

    const repLevel = getRepLevel(reputation);
    
    return json({
      ok: true,
      coins,
      reputation,
      repLevel: repLevel.name,
      repLevelIndex: repLevel.index,
      repMin: repLevel.min,
      repMax: repLevel.max === Infinity ? null : repLevel.max,
      repProgress: repLevel.max === Infinity ? 100 : ((reputation - repLevel.min) / (repLevel.max - repLevel.min)) * 100
    });
  } catch (error) {
    console.error('Player state error:', error);
    return json({ ok: false, error: error?.message || 'Failed to fetch player state.' }, 500);
  }
}
