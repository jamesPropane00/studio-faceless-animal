/**
 * POST /api/world/gang/create
 * Body: { name, tag, color, userId }
 * Creates a new gang (costs 500 coins)
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

const GANG_CREATION_COST = 500;

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
    if (!context.env.SUPABASE_URL || !context.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ 
        ok: false, 
        error: 'Server configuration error: Missing Supabase credentials' 
      }, 500);
    }

    const body = await context.request.json();
    const { name, tag, color, userId } = body;

    if (!name || !tag || !userId) {
      return json({ ok: false, error: 'Missing required fields.' }, 400);
    }

    if (tag.length < 2 || tag.length > 5) {
      return json({ ok: false, error: 'Tag must be 2-5 characters.' }, 400);
    }

    // Check if user has enough coins
    const playerQuery = `select=coins&user_id=eq.${encodeURIComponent(userId)}`;
    const playerResult = await supabaseFetch(context.env, `/rest/v1/world_player_states?${playerQuery}`);

    let currentCoins = 100;
    if (playerResult.ok && Array.isArray(playerResult.data) && playerResult.data.length > 0) {
      currentCoins = playerResult.data[0].coins || 100;
    }

    if (currentCoins < GANG_CREATION_COST) {
      return json({ 
        ok: false, 
        error: `Not enough coins. Need ${GANG_CREATION_COST}, have ${currentCoins}.` 
      }, 400);
    }

    // Check if gang name or tag is already taken
    const nameCheck = await supabaseFetch(
      context.env,
      `/rest/v1/world_gangs?name=eq.${encodeURIComponent(name)}&select=id`
    );

    if (nameCheck.ok && Array.isArray(nameCheck.data) && nameCheck.data.length > 0) {
      return json({ ok: false, error: 'Gang name already taken.' }, 400);
    }

    const tagCheck = await supabaseFetch(
      context.env,
      `/rest/v1/world_gangs?tag=eq.${encodeURIComponent(tag)}&select=id`
    );

    if (tagCheck.ok && Array.isArray(tagCheck.data) && tagCheck.data.length > 0) {
      return json({ ok: false, error: 'Gang tag already taken.' }, 400);
    }

    // Create the gang
    const gangData = {
      name,
      tag: tag.toUpperCase(),
      color: color || '#a78bfa',
      leader_id: userId,
      total_influence: 0,
      member_count: 1,
      level: 1
    };

    const createResult = await supabaseFetch(
      context.env,
      `/rest/v1/world_gangs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify([gangData])
      }
    );

    if (!createResult.ok || !Array.isArray(createResult.data) || createResult.data.length === 0) {
      console.error('[WORLD] gang create failed:', createResult.status, createResult.data);
      return json({ 
        ok: false, 
        error: `Failed to create gang: ${createResult.data?.message || 'Unknown error'}` 
      }, 500);
    }

    const gang = createResult.data[0];

    // Add creator as leader
    const memberData = {
      gang_id: gang.id,
      user_id: userId,
      role: 'leader',
      joined_at: new Date().toISOString()
    };

    await supabaseFetch(
      context.env,
      `/rest/v1/world_gang_members`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([memberData])
      }
    );

    // Deduct 500 coins (use UPSERT to handle new users)
    const newCoins = currentCoins - GANG_CREATION_COST;
    await supabaseFetch(
      context.env,
      `/rest/v1/world_player_states`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([{
          user_id: userId,
          coins: newCoins,
          updated_at: new Date().toISOString()
        }])
      }
    );

    return json({
      ok: true,
      gang: {
        id: gang.id,
        name: gang.name,
        tag: gang.tag,
        color: gang.color,
        leader_id: gang.leader_id,
        total_influence: gang.total_influence,
        member_count: gang.member_count,
        level: gang.level
      },
      coinsSpent: GANG_CREATION_COST,
      newBalance: newCoins
    });
  } catch (error) {
    console.error('[WORLD] gang create error:', error);
    return json({ ok: false, error: error?.message || 'Failed to create gang.' }, 500);
  }
}
