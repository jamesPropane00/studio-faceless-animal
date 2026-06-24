/**
 * POST /api/world/godpower/trigger
 * Body: { type, x, y, userId }
 * Triggers a god power event
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

const WORLD_EVENTS = [
  { type: 'meteor', name: 'Meteor Strike', icon: '\u2604\uFE0F', desc: 'A meteor crashed nearby!', radius: 3, duration: 5 },
  { type: 'treasure', name: 'Treasure Found', icon: '\u{1F4B0}', desc: 'Treasure appeared!', radius: 2, duration: 10 },
  { type: 'portal', name: 'Portal Opened', icon: '\u{1F300}', desc: 'A mysterious portal opened...', radius: 2, duration: 15 },
  { type: 'blessing', name: 'Divine Blessing', icon: '\u2728', desc: 'The gods smile upon this land', radius: 5, duration: 20 },
  { type: 'earthquake', name: 'Earthquake', icon: '\u{1F30B}', desc: 'The ground shakes!', radius: 8, duration: 3 },
];

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

    const template = WORLD_EVENTS.find(e => e.type === type);
    if (!template) {
      return json({ ok: false, error: 'Invalid event type.' }, 400);
    }

    const evtX = Math.max(2, Math.min(206, x));
    const evtY = Math.max(2, Math.min(206, y));

    // Create event
    const eventId = Date.now();
    const event = {
      id: eventId,
      event_type: type,
      player_id: userId || null,
      tile_x: Math.floor(evtX),
      tile_y: Math.floor(evtY),
      radius: template.radius || 0,
      cost: 0,
      metadata: { name: template.name, icon: template.icon, desc: template.desc },
      created_at: new Date().toISOString()
    };

    // Insert event into world_events table
    await supabaseFetch(context.env, `/rest/v1/world_events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify([event])
    });

    // Apply event effects to buildings
    if (type === 'meteor' || type === 'earthquake') {
      const radius = template.radius || 3;
      
      // Fetch buildings in radius
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
              // Remove building
              await supabaseFetch(context.env, `/rest/v1/world_building_states?id=eq.${building.id}`, {
                method: 'DELETE'
              });
            } else {
              // Damage building
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
      const radius = template.radius || 5;
      
      // Fetch buildings in radius
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

    return json({
      ok: true,
      event: {
        id: eventId,
        type: type,
        x: evtX,
        y: evtY,
        timer: template.duration
      }
    });
  } catch (error) {
    console.error('God power error:', error);
    return json({ ok: false, error: error?.message || 'Failed to trigger god power.' }, 500);
  }
}
