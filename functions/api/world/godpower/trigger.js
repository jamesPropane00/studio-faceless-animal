/**
 * POST /api/world/godpower/trigger
 * Body: { type, x, y, userId }
 * Triggers a god power event after validating and deducting coins.
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

const GOD_POWERS = {
  meteor:     { name: 'Meteor Strike',     icon: '☄️',  cost: 200, radius: 3, desc: 'Destroy buildings in area' },
  blessing:   { name: 'Divine Blessing',   icon: '✨',  cost: 100, radius: 5, desc: 'Restore buildings in area' },
  earthquake: { name: 'Earthquake',        icon: '🌋',  cost: 150, radius: 8, desc: 'Damage buildings in area' },
  spawn_npc:  { name: 'Spawn NPC',         icon: '👤',  cost: 25,  radius: 0, desc: 'Create a new citizen' },
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
    const body = await context.request.json();
    const { type, x, y, userId } = body;
    
    if (!type || x === undefined || y === undefined) {
      return json({ ok: false, error: 'Missing type, x, or y.' }, 400);
    }

    const power = GOD_POWERS[type];
    if (!power) {
      return json({ ok: false, error: 'Invalid god power type.' }, 400);
    }

    const evtX = Math.max(2, Math.min(206, x));
    const evtY = Math.max(2, Math.min(206, y));

    // ── Coin validation (only for real UUID users) ──
    const isUuid = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (isUuid) {
      const playerQuery = `select=coins&user_id=eq.${encodeURIComponent(userId)}`;
      const playerResult = await supabaseFetch(context.env, `/rest/v1/world_player_states?${playerQuery}`);

      if (!playerResult.ok) {
        console.error('[WORLD] godpower/trigger: Failed to fetch player state:', playerResult.status, JSON.stringify(playerResult.data));
        return json({ ok: false, error: 'Failed to verify player state.' }, 500);
      }

      if (!Array.isArray(playerResult.data) || playerResult.data.length === 0) {
        return json({ ok: false, error: 'Player not found.' }, 404);
      }

      const currentCoins = playerResult.data[0].coins || 0;
      if (currentCoins < power.cost) {
        return json({ ok: false, error: 'Not enough coins.', currentCoins, cost: power.cost }, 400);
      }

      // Deduct coins
      const deductResult = await supabaseFetch(context.env, `/rest/v1/world_player_states?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coins: currentCoins - power.cost, updated_at: new Date().toISOString() }),
      });

      if (!deductResult.ok) {
        console.error('[WORLD] godpower/trigger: Failed to deduct coins:', deductResult.status, JSON.stringify(deductResult.data));
        return json({ ok: false, error: 'Failed to deduct coins.' }, 500);
      }
    }

    // Create event
    const eventId = Date.now();
    const event = {
      id: eventId,
      event_type: type,
      player_id: userId || null,
      tile_x: Math.floor(evtX),
      tile_y: Math.floor(evtY),
      radius: power.radius || 0,
      cost: power.cost,
      metadata: { name: power.name, icon: power.icon, desc: power.desc },
      created_at: new Date().toISOString()
    };

    // Insert event into world_events table
    await supabaseFetch(context.env, `/rest/v1/world_events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify([event])
    });

    // Apply event effects to buildings in world_building_states
    if (type === 'meteor' || type === 'earthquake') {
      const radius = power.radius || 3;
      
      const buildingsQuery = `select=id,tile_x,tile_y,condition&tile_x=gte.${Math.floor(evtX - radius)}&tile_x=lte.${Math.floor(evtX + radius)}&tile_y=gte.${Math.floor(evtY - radius)}&tile_y=lte.${Math.floor(evtY + radius)}`;
      const buildingsResult = await supabaseFetch(context.env, `/rest/v1/world_building_states?${buildingsQuery}`);
      
      if (buildingsResult.ok && Array.isArray(buildingsResult.data)) {
        for (const building of buildingsResult.data) {
          const dx = building.tile_x - evtX;
          const dy = building.tile_y - evtY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist <= radius) {
            const newCondition = Math.max(0, (building.condition || 100) - 50);
            
            if (newCondition <= 0) {
              await supabaseFetch(context.env, `/rest/v1/world_building_states?id=eq.${building.id}`, {
                method: 'DELETE'
              });
            } else {
              await supabaseFetch(context.env, `/rest/v1/world_building_states?id=eq.${building.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ condition: newCondition })
              });
            }
          }
        }
      }
    }

    if (type === 'blessing') {
      const radius = power.radius || 5;
      
      const buildingsQuery = `select=id,tile_x,tile_y,condition&tile_x=gte.${Math.floor(evtX - radius)}&tile_x=lte.${Math.floor(evtX + radius)}&tile_y=gte.${Math.floor(evtY - radius)}&tile_y=lte.${Math.floor(evtY + radius)}`;
      const buildingsResult = await supabaseFetch(context.env, `/rest/v1/world_building_states?${buildingsQuery}`);
      
      if (buildingsResult.ok && Array.isArray(buildingsResult.data)) {
        for (const building of buildingsResult.data) {
          const dx = building.tile_x - evtX;
          const dy = building.tile_y - evtY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist <= radius) {
            const newCondition = Math.min(100, (building.condition || 100) + 30);
            await supabaseFetch(context.env, `/rest/v1/world_building_states?id=eq.${building.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ condition: newCondition })
            });
          }
        }
      }
    }

    // Fetch updated balance to return to client
    let newBalance = null;
    if (isUuid) {
      const balanceResult = await supabaseFetch(context.env, `/rest/v1/world_player_states?select=coins&user_id=eq.${encodeURIComponent(userId)}`);
      if (balanceResult.ok && Array.isArray(balanceResult.data) && balanceResult.data.length > 0) {
        newBalance = balanceResult.data[0].coins;
      }
    }

    return json({
      ok: true,
      event: {
        id: eventId,
        type: type,
        x: evtX,
        y: evtY,
        timer: power.duration || 5
      },
      newBalance
    });
  } catch (error) {
    console.error('God power error:', error);
    return json({ ok: false, error: error?.message || 'Failed to trigger god power.' }, 500);
  }
}
