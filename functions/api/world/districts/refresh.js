/**
 * POST /api/world/districts/refresh
 * Re-evaluates district formation from all buildings
 * Called periodically by clients to keep districts up to date
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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

const CLUSTER_RADIUS = 15;
const MIN_BUILDINGS = 3;

const DISTRICT_NAMES = {
  shop: ['Market District', 'The Block', 'Commerce Row', 'Trade Center'],
  club: ['Neon Row', 'The Strip', 'Party District', 'Night Life'],
  house: ['The Hood', 'Suburbia', 'Residential', 'Home Base'],
  warehouse: ['Industrial', 'Warehouse District', 'The Docks', 'Work Zone'],
  hide: ['The Trap', 'Shadow Lane', 'Underground', 'The Block'],
  camp: ['Shantytown', 'Camp District', 'Settlement', 'Outskirts']
};

function findDistricts(buildings) {
  const used = new Set();
  const districts = [];

  for (const b1 of buildings) {
    if (used.has(b1.id)) continue;

    const cluster = [b1];
    used.add(b1.id);

    for (const b2 of buildings) {
      if (used.has(b2.id)) continue;

      const dx = b1.tile_x - b2.tile_x;
      const dy = b1.tile_y - b2.tile_y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= CLUSTER_RADIUS) {
        cluster.push(b2);
        used.add(b2.id);
      }
    }

    if (cluster.length >= MIN_BUILDINGS) {
      const typeCounts = {};
      let cx = 0, cy = 0;

      for (const b of cluster) {
        typeCounts[b.building_type] = (typeCounts[b.building_type] || 0) + 1;
        cx += b.tile_x;
        cy += b.tile_y;
      }

      cx = Math.floor(cx / cluster.length);
      cy = Math.floor(cy / cluster.length);

      let dominantType = 'house';
      let maxCount = 0;
      for (const [type, count] of Object.entries(typeCounts)) {
        if (count > maxCount) {
          maxCount = count;
          dominantType = type;
        }
      }

      const names = DISTRICT_NAMES[dominantType] || DISTRICT_NAMES.house;
      const name = names[Math.floor(Math.random() * names.length)];

      districts.push({
        name: name,
        district_type: dominantType,
        center_x: cx,
        center_y: cy,
        radius: CLUSTER_RADIUS,
        building_count: cluster.length
      });
    }
  }

  return districts;
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestPost(context) {
  return await refreshDistricts(context);
}

export async function onRequestGet(context) {
  return await refreshDistricts(context);
}

async function refreshDistricts(context) {
  try {
    if (!context.env.SUPABASE_URL || !context.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ ok: false, error: 'Missing Supabase credentials' }, 500);
    }

    // Fetch all buildings
    const buildingsResult = await supabaseFetch(
      context.env,
      '/rest/v1/world_building_states?select=id,building_type,tile_x,tile_y'
    );

    if (!buildingsResult.ok || !Array.isArray(buildingsResult.data)) {
      console.error('[WORLD] district-refresh: building fetch failed:', buildingsResult.status, buildingsResult.data);
      return json({ ok: false, error: 'Failed to fetch buildings: ' + (buildingsResult.data?.message || 'unknown') }, 500);
    }

    console.log('[WORLD] district-refresh: found', buildingsResult.data.length, 'buildings');

    // Calculate new districts
    const newDistricts = findDistricts(buildingsResult.data);

    // Fetch existing districts to detect new ones
    const existingResult = await supabaseFetch(
      context.env,
      '/rest/v1/world_districts?select=id,name,center_x,center_y,district_type'
    );
    const existingKeys = new Set();
    if (existingResult.ok && Array.isArray(existingResult.data)) {
      for (const d of existingResult.data) {
        existingKeys.add(`${d.center_x},${d.center_y},${d.district_type}`);
      }
    }

    // Detect newly formed districts
    const newlyFormed = [];
    for (const d of newDistricts) {
      const key = `${d.center_x},${d.center_y},${d.district_type}`;
      if (!existingKeys.has(key)) {
        newlyFormed.push(d);
      }
    }

    // Delete old districts and insert new ones (simpler than diffing)
    // Use a filter that's always true to delete all rows
    if (newDistricts.length > 0) {
      // Delete all existing districts using neq filter (always true)
      const deleteResult = await supabaseFetch(
        context.env,
        '/rest/v1/world_districts?id=neq.00000000-0000-0000-0000-000000000000',
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        }
      );
      // ignore delete errors (might be empty)

      // Update buildings to mark in_district
      const buildingIdsInDistricts = new Set();
      for (const d of newDistricts) {
        for (const b of buildingsResult.data) {
          const dx = b.tile_x - d.center_x;
          const dy = b.tile_y - d.center_y;
          if (Math.sqrt(dx * dx + dy * dy) <= d.radius) {
            buildingIdsInDistricts.add(b.id);
          }
        }
      }

      // Insert new districts
      const insertResult = await supabaseFetch(
        context.env,
        '/rest/v1/world_districts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify(newDistricts)
        }
      );

      if (!insertResult.ok) {
        console.error('[WORLD] district insert failed:', insertResult.status, insertResult.data);
        return json({ ok: false, error: 'Failed to save districts' }, 500);
      }

      // Update in_district flag on buildings
      for (const b of buildingsResult.data) {
        const inDistrict = buildingIdsInDistricts.has(b.id);
        await supabaseFetch(
          context.env,
          `/rest/v1/world_building_states?id=eq.${b.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ in_district: inDistrict })
          }
        );
      }
    } else {
      // No districts, clear all using neq filter
      await supabaseFetch(
        context.env,
        '/rest/v1/world_districts?id=neq.00000000-0000-0000-0000-000000000000',
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        }
      );
      // Clear in_district on all buildings
      for (const b of buildingsResult.data) {
        await supabaseFetch(
          context.env,
          `/rest/v1/world_building_states?id=eq.${b.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ in_district: false })
          }
        );
      }
    }

    return json({
      ok: true,
      districts: newDistricts,
      newlyFormed: newlyFormed,
      count: newDistricts.length
    });
  } catch (error) {
    console.error('[WORLD] district refresh error:', error?.message, error?.stack);
    return json({ ok: false, error: error?.message || 'Failed to refresh districts' }, 500);
  }
}
