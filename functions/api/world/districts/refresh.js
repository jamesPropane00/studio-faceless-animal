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

// Building cost values for wealth calculation
const BUILDING_VALUE = {
  house: 50,
  shop: 100,
  club: 150,
  warehouse: 75,
  hide: 200,
  camp: 25
};

// Avg population per building type (NPCs that call this building "home" or work there)
const BUILDING_POPULATION = {
  house: 4,
  shop: 2,
  club: 3,
  warehouse: 1,
  hide: 2,
  camp: 1
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
      const breakdown = {};
      let cx = 0, cy = 0;
      let wealth = 0;
      let population = 0;

      for (const b of cluster) {
        typeCounts[b.building_type] = (typeCounts[b.building_type] || 0) + 1;
        breakdown[b.building_type] = (breakdown[b.building_type] || 0) + 1;
        wealth += BUILDING_VALUE[b.building_type] || 50;
        population += BUILDING_POPULATION[b.building_type] || 1;
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

      // Level: every 3 buildings = 1 level
      const level = Math.max(1, Math.floor(cluster.length / 3));

      districts.push({
        name: name,
        district_type: dominantType,
        center_x: cx,
        center_y: cy,
        radius: CLUSTER_RADIUS,
        building_count: cluster.length,
        wealth: wealth,
        population: population,
        level: level,
        building_breakdown: breakdown
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

      // Update buildings to mark in_district + calculate business_health
      const buildingIdsInDistricts = new Set();
      const buildingDistrictMap = new Map(); // buildingId -> district
      for (const d of newDistricts) {
        for (const b of buildingsResult.data) {
          const dx = b.tile_x - d.center_x;
          const dy = b.tile_y - d.center_y;
          if (Math.sqrt(dx * dx + dy * dy) <= d.radius) {
            buildingIdsInDistricts.add(b.id);
            buildingDistrictMap.set(b.id, d);
          }
        }
      }

      // Insert new districts — let DB auto-generate UUID via DEFAULT gen_random_uuid()
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
        return json({
          ok: false,
          error: 'Failed to save districts: ' + (insertResult.data?.message || JSON.stringify(insertResult.data) || 'unknown'),
          supabaseError: insertResult.data
        }, 500);
      }

      // Update in_district flag + business_health on each building
      for (const b of buildingsResult.data) {
        const inDistrict = buildingIdsInDistricts.has(b.id);
        const district = buildingDistrictMap.get(b.id);

        // Calculate business_health (the cascade!)
        // Houses/camps: always healthy (residential, not businesses)
        // Shops/clubs/warehouses/hides: health depends on district population + wealth
        let health = 100;
        if (inDistrict && district && b.building_type !== 'house' && b.building_type !== 'camp') {
          const pop = district.population || 0;
          const wealth = district.wealth || 0;
          const condition = b.condition || 100;
          // Base 30 + population factor + wealth factor + condition factor
          health = Math.min(100, Math.max(10, Math.floor(
            30 + pop * 0.8 + wealth * 0.05 + condition * 0.2
          )));
        } else if (!inDistrict && b.building_type !== 'house' && b.building_type !== 'camp') {
          // Isolated businesses: lower health (no customers nearby)
          const condition = b.condition || 100;
          health = Math.min(100, Math.max(10, Math.floor(20 + condition * 0.3)));
        }

        await supabaseFetch(
          context.env,
          `/rest/v1/world_building_states?id=eq.${b.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              in_district: inDistrict,
              business_health: health
            })
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
      // Clear in_district + set low health on all buildings (no districts = no customers)
      for (const b of buildingsResult.data) {
        const condition = b.condition || 100;
        const health = (b.building_type === 'house' || b.building_type === 'camp')
          ? 100
          : Math.min(100, Math.max(10, Math.floor(20 + condition * 0.3)));
        await supabaseFetch(
          context.env,
          `/rest/v1/world_building_states?id=eq.${b.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ in_district: false, business_health: health })
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
