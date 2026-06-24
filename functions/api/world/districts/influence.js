/**
 * GET /api/world/districts/influence
 * Returns all districts with gang influence percentages
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

    // Fetch all districts
    const districtsResult = await supabaseFetch(
      context.env,
      `/rest/v1/world_districts?select=id,name,district_type,center_x,center_y,radius&order=building_count.desc`
    );

    // Fetch all district influence records
    const influenceResult = await supabaseFetch(
      context.env,
      `/rest/v1/world_district_influence?select=*`
    );

    // Fetch all gangs (for names and colors)
    const gangsResult = await supabaseFetch(
      context.env,
      `/rest/v1/world_gangs?select=id,name,tag,color`
    );

    if (!districtsResult.ok) {
      console.error('[WORLD] district fetch failed:', districtsResult.status, districtsResult.data);
      return json({ 
        ok: false, 
        error: `Failed to fetch districts: ${districtsResult.data?.message || 'Unknown error'}` 
      }, 500);
    }

    const districts = Array.isArray(districtsResult.data) ? districtsResult.data : [];
    const influences = Array.isArray(influenceResult.data) ? influenceResult.data : [];
    const gangs = Array.isArray(gangsResult.data) ? gangsResult.data : [];

    // Build a gang lookup map
    const gangMap = {};
    for (const g of gangs) {
      gangMap[g.id] = g;
    }

    // Group influences by district
    const districtMap = {};
    for (const inf of influences) {
      if (!districtMap[inf.district_id]) {
        districtMap[inf.district_id] = [];
      }
      districtMap[inf.district_id].push(inf);
    }

    // Build result with top 3 gangs per district
    const result = districts.map(district => {
      const districtInfluences = districtMap[district.id] || [];
      
      // Sort by influence percent DESC and take top 3
      const top3 = districtInfluences
        .sort((a, b) => b.influence_percent - a.influence_percent)
        .slice(0, 3)
        .map(inf => ({
          gang_id: inf.gang_id,
          gang_name: gangMap[inf.gang_id]?.name || 'Unknown',
          gang_tag: gangMap[inf.gang_id]?.tag || '',
          gang_color: gangMap[inf.gang_id]?.color || '#888',
          influence_percent: inf.influence_percent
        }));

      return {
        district_id: district.id,
        district_name: district.name,
        district_type: district.district_type,
        center_x: district.center_x,
        center_y: district.center_y,
        radius: district.radius,
        influences: top3
      };
    });

    return json({
      ok: true,
      districts: result
    });
  } catch (error) {
    console.error('[WORLD] district influence error:', error);
    return json({ ok: false, error: error?.message || 'Failed to fetch district influence.' }, 500);
  }
}
