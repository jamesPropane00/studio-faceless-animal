/**
 * POST /api/world/job/start
 * Body: { userId, buildingId }
 * Starts a job at a building
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

const JOB_PAY_RATES = {
  shop: 2,
  club: 3,
  warehouse: 1,
  hide: 5
};

const JOB_DURATION = 30000; // 30 seconds

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
    const body = await context.request.json();
    const { userId, buildingId } = body;
    
    if (!userId || !buildingId) {
      return json({ ok: false, error: 'Missing userId or buildingId.' }, 400);
    }

    // Fetch building from Supabase
    const buildingQuery = `select=id,building_type&id=eq.${buildingId}`;
    const buildingResult = await supabaseFetch(context.env, `/rest/v1/world_building_states?${buildingQuery}`);
    
    if (!buildingResult.ok || !Array.isArray(buildingResult.data) || buildingResult.data.length === 0) {
      return json({ ok: false, error: 'Building not found.' }, 404);
    }

    const building = buildingResult.data[0];
    const buildingType = building.building_type;
    
    if (!JOB_PAY_RATES[buildingType]) {
      return json({ ok: false, error: 'This building type does not offer jobs.' }, 400);
    }

    // Check if player already has a job
    const playerQuery = `select=current_job_id&user_id=eq.${encodeURIComponent(userId)}`;
    const playerResult = await supabaseFetch(context.env, `/rest/v1/world_player_states?${playerQuery}`);
    
    if (playerResult.ok && Array.isArray(playerResult.data) && playerResult.data.length > 0) {
      if (playerResult.data[0].current_job_id) {
        return json({ ok: false, error: 'You already have an active job.' }, 400);
      }
    }

    const startTime = Date.now();

    // Update player state with job
    const updatePlayer = await supabaseFetch(context.env, `/rest/v1/world_player_states?user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{
        user_id: userId,
        current_job_id: buildingId,
        job_started_at: new Date(startTime).toISOString(),
        updated_at: new Date().toISOString()
      }])
    });

    return json({
      ok: true,
      jobStarted: true,
      buildingId: buildingId,
      buildingType: buildingType,
      payRate: JOB_PAY_RATES[buildingType],
      duration: JOB_DURATION,
      startTime: startTime
    });
  } catch (error) {
    console.error('Job start error:', error);
    return json({ ok: false, error: error?.message || 'Failed to start job.' }, 500);
  }
}
