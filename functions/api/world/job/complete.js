/**
 * POST /api/world/job/complete
 * Body: { userId }
 * Completes a job and pays the player
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
    const { userId } = body;
    
    if (!userId) {
      return json({ ok: false, error: 'Missing userId.' }, 400);
    }

    // Fetch player state
    const playerQuery = `select=coins,reputation,current_job_id,job_started_at&user_id=eq.${encodeURIComponent(userId)}`;
    const playerResult = await supabaseFetch(context.env, `/rest/v1/world_player_states?${playerQuery}`);
    
    if (!playerResult.ok || !Array.isArray(playerResult.data) || playerResult.data.length === 0) {
      return json({ ok: false, error: 'Player not found.' }, 404);
    }

    const player = playerResult.data[0];
    
    if (!player.current_job_id) {
      return json({ ok: false, error: 'You do not have an active job.' }, 400);
    }

    // Fetch building to get type
    const buildingQuery = `select=id,building_type&id=eq.${player.current_job_id}`;
    const buildingResult = await supabaseFetch(context.env, `/rest/v1/world_building_states?${buildingQuery}`);
    
    if (!buildingResult.ok || !Array.isArray(buildingResult.data) || buildingResult.data.length === 0) {
      // Building no longer exists, clear job
      await supabaseFetch(context.env, `/rest/v1/world_player_states?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_job_id: null,
          job_started_at: null,
          updated_at: new Date().toISOString()
        })
      });
      return json({ ok: false, error: 'Job building no longer exists.' }, 404);
    }

    const building = buildingResult.data[0];
    const buildingType = building.building_type;
    const payRate = JOB_PAY_RATES[buildingType] || 1;

    // Check if job duration has elapsed
    const jobStartedAt = new Date(player.job_started_at).getTime();
    const elapsed = Date.now() - jobStartedAt;
    
    if (elapsed < JOB_DURATION) {
      return json({ 
        ok: false, 
        error: 'Job not complete yet.', 
        remaining: JOB_DURATION - elapsed 
      }, 400);
    }

    // Calculate new values
    const newCoins = (player.coins || 100) + payRate;
    const newReputation = (player.reputation || 0) + 2;

    // Update player state (UPSERT for ALL users, not just UUID)
    if (userId) {
      const completeResult = await supabaseFetch(context.env, `/rest/v1/world_player_states`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([{
          user_id: userId,
          coins: newCoins,
          reputation: newReputation,
          current_job_id: null,
          job_started_at: null,
          updated_at: new Date().toISOString()
        }])
      });

      if (!completeResult.ok) {
        console.error('[WORLD] job/complete player-state upsert failed:', completeResult.status, completeResult.data);
      }
    }

    return json({
      ok: true,
      jobCompleted: true,
      coinsEarned: payRate,
      reputationEarned: 2,
      newBalance: newCoins,
      newReputation: newReputation,
      job: {
        buildingId: player.current_job_id,
        buildingType: buildingType,
        pay: payRate
      }
    });
  } catch (error) {
    console.error('Job complete error:', error);
    return json({ ok: false, error: error?.message || 'Failed to complete job.' }, 500);
  }
}
