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

// Phase 5B: Auto-road generation using Prim's MST (Manhattan distance)
function generateAutoRoads(districts, buildings) {
  const roads = new Set();
  const occupiedTiles = new Set(buildings.map(b => `${b.tile_x},${b.tile_y}`));

  for (const district of districts) {
    const clusterBuildings = buildings.filter(b => {
      const dx = b.tile_x - district.center_x;
      const dy = b.tile_y - district.center_y;
      return Math.sqrt(dx * dx + dy * dy) <= district.radius;
    });

    if (clusterBuildings.length < 2) continue;

    // Prim's MST
    const connected = [clusterBuildings.shift()];
    const unconnected = clusterBuildings;

    while (unconnected.length > 0) {
      let bestEdge = null;
      let bestDist = Infinity;

      for (const a of connected) {
        for (const b of unconnected) {
          const dist = Math.abs(a.tile_x - b.tile_x) + Math.abs(a.tile_y - b.tile_y);
          if (dist < bestDist) {
            bestDist = dist;
            bestEdge = { from: a, to: b };
          }
        }
      }

      if (!bestEdge) break;

      const { from, to } = bestEdge;
      const fx = from.tile_x, fy = from.tile_y;
      const tx = to.tile_x, ty = to.tile_y;

      // L-shaped path: horizontal then vertical
      const stepX = tx >= fx ? 1 : -1;
      for (let x = fx + stepX; x !== tx; x += stepX) {
        roads.add(`${x},${fy}`);
      }
      const stepY = ty >= fy ? 1 : -1;
      for (let y = fy; y !== ty; y += stepY) {
        const key = `${tx},${y}`;
        if (!occupiedTiles.has(key)) roads.add(key);
      }

      roads.add(`${tx},${ty}`);

      connected.push(bestEdge.to);
      unconnected.splice(unconnected.indexOf(bestEdge.to), 1);
    }
  }

  return [...roads].map(key => {
    const [x, y] = key.split(',').map(Number);
    return { infra_type: 'road', tile_x: x, tile_y: y, owner_id: null };
  });
}

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
      let hideCount = 0;

      for (const b of cluster) {
        typeCounts[b.building_type] = (typeCounts[b.building_type] || 0) + 1;
        breakdown[b.building_type] = (breakdown[b.building_type] || 0) + 1;
        wealth += BUILDING_VALUE[b.building_type] || 50;
        population += BUILDING_POPULATION[b.building_type] || 1;
        cx += b.tile_x;
        cy += b.tile_y;
        if (b.building_type === 'hide') hideCount++;
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

      // Phase C: Crime rate calculation
      // Each hide adds 25 crime, capped at 100
      // More hides = more crime, but diminishing returns
      const hideCrime = Math.min(100, hideCount * 25);
      // Wealth reduces crime slightly (rich neighborhoods are safer)
      const wealthMitigation = Math.min(20, Math.floor(wealth / 50));
      const targetCrime = Math.max(0, hideCrime - wealthMitigation);

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
        building_breakdown: breakdown,
        target_crime: targetCrime
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

    // Fetch existing districts to detect new ones + preserve crime_rate for decay
    const existingResult = await supabaseFetch(
      context.env,
      '/rest/v1/world_districts?select=id,name,center_x,center_y,district_type,crime_rate'
    );
    const existingKeys = new Set();
    const oldCrimeMap = new Map(); // key -> crime_rate (for gradual decay)
    if (existingResult.ok && Array.isArray(existingResult.data)) {
      for (const d of existingResult.data) {
        const key = `${d.center_x},${d.center_y},${d.district_type}`;
        existingKeys.add(key);
        oldCrimeMap.set(key, d.crime_rate || 0);
      }
    }

    // Detect newly formed districts + blend crime_rate (gradual rise/decay)
    const newlyFormed = [];
    for (const d of newDistricts) {
      const key = `${d.center_x},${d.center_y},${d.district_type}`;
      const oldCrime = oldCrimeMap.get(key);
      const targetCrime = d.target_crime || 0;

      if (oldCrime != null) {
        // Existing district: gradually move toward target crime
        // Rise fast (+10 per refresh), decay slow (-5 per refresh)
        if (targetCrime > oldCrime) {
          d.crime_rate = Math.min(100, oldCrime + 10);
        } else if (targetCrime < oldCrime) {
          d.crime_rate = Math.max(0, oldCrime - 5);
        } else {
          d.crime_rate = oldCrime;
        }
      } else {
        // New district: start at target crime
        d.crime_rate = targetCrime;
        newlyFormed.push(d);
      }
      // Remove target_crime (not a DB column)
      delete d.target_crime;
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

      // Update in_district flag + business_health on each building (batched for speed)
      const buildingUpdates = [];
      for (const b of buildingsResult.data) {
        const inDistrict = buildingIdsInDistricts.has(b.id);
        const district = buildingDistrictMap.get(b.id);

        // Calculate business_health (the cascade!)
        let health = 100;
        let crimeRate = 0;
        if (inDistrict && district) {
          crimeRate = district.crime_rate || 0;
        }
        if (inDistrict && district && b.building_type !== 'house' && b.building_type !== 'camp') {
          const pop = district.population || 0;
          const wealth = district.wealth || 0;
          const condition = b.condition || 100;
          health = Math.min(100, Math.max(10, Math.floor(
            30 + pop * 0.8 + wealth * 0.05 + condition * 0.2
          )));
          const crimePenalty = Math.floor(health * (crimeRate / 200));
          health = health - crimePenalty;
          health = Math.max(10, health);
        } else if (!inDistrict && b.building_type !== 'house' && b.building_type !== 'camp') {
          const condition = b.condition || 100;
          health = Math.min(100, Math.max(10, Math.floor(20 + condition * 0.3)));
        }

        buildingUpdates.push({
          id: b.id,
          body: JSON.stringify({ in_district: inDistrict, business_health: health })
        });
      }

      // Batch PATCH in parallel (25 at a time)
      const batchSize = 25;
      for (let i = 0; i < buildingUpdates.length; i += batchSize) {
        const batch = buildingUpdates.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map(u =>
            supabaseFetch(
              context.env,
              `/rest/v1/world_building_states?id=eq.${u.id}`,
              { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: u.body }
            )
          )
        );
      }

      // Phase 5B: Auto-road generation via MST
      try {
        // Delete old auto-roads
        await supabaseFetch(
          context.env,
          '/rest/v1/world_infrastructure?infra_type=eq.road&owner_id=is.null',
          { method: 'DELETE', headers: { 'Content-Type': 'application/json' } }
        );
        // Generate new roads
        const roadItems = generateAutoRoads(newDistricts, buildingsResult.data);
        if (roadItems.length > 0) {
          for (let i = 0; i < roadItems.length; i += 50) {
            const batch = roadItems.slice(i, i + 50);
            await supabaseFetch(
              context.env,
              '/rest/v1/world_infrastructure',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
                body: JSON.stringify(batch)
              }
            );
          }
        }
      } catch (e) {
        console.warn('[WORLD] auto-road generation skipped: table may not exist', e?.message);
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
      const buildingUpdates = [];
      for (const b of buildingsResult.data) {
        const condition = b.condition || 100;
        const health = (b.building_type === 'house' || b.building_type === 'camp')
          ? 100
          : Math.min(100, Math.max(10, Math.floor(20 + condition * 0.3)));
        buildingUpdates.push({
          id: b.id,
          body: JSON.stringify({ in_district: false, business_health: health })
        });
      }
      const batchSize = 25;
      for (let i = 0; i < buildingUpdates.length; i += batchSize) {
        const batch = buildingUpdates.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map(u =>
            supabaseFetch(
              context.env,
              `/rest/v1/world_building_states?id=eq.${u.id}`,
              { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: u.body }
            )
          )
        );
      }
      // Also clear auto-roads when no districts exist
      try {
        await supabaseFetch(
          context.env,
          '/rest/v1/world_infrastructure?infra_type=eq.road&owner_id=is.null',
          { method: 'DELETE', headers: { 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        // table may not exist yet
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
