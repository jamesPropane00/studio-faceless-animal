/**
 * POST /api/world/simulation/npc-build
 * Places an NPC-built building (unowned, no coin cost)
 * Called when an NPC in the world decides to settle or start a business
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
  })
}

async function supabaseFetch(env, path, options = {}) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '')
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, status: 500, data: { message: 'Missing Supabase credentials.' } }
  const headers = new Headers(options.headers || {})
  headers.set('apikey', key)
  headers.set('Authorization', `Bearer ${key}`)
  const response = await fetch(`${url}${path}`, { ...options, headers })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { ok: response.ok, status: response.status, data, text }
}

const NPC_BUILDING_TYPES = {
  camp: { income: 0, cost: 0 },
  house: { income: 0.5, cost: 0 },
  shop: { income: 1, cost: 0 },
  warehouse: { income: 1, cost: 0 },
  club: { income: 2, cost: 0 },
  hide: { income: 3, cost: 0 }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function onRequestPost(context) {
  try {
    if (!context.env.SUPABASE_URL || !context.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ ok: false, error: 'Missing Supabase credentials' }, 500)
    }

    const body = await context.request.json()
    const { buildingType, tileX, tileY } = body

    if (!buildingType || tileX === undefined || tileY === undefined) {
      return json({ ok: false, error: 'Missing buildingType, tileX, or tileY' }, 400)
    }

    if (!NPC_BUILDING_TYPES[buildingType]) {
      return json({ ok: false, error: 'Invalid building type' }, 400)
    }

    // Clamp to reasonable world bounds
    const cx = Math.max(0, Math.min(200, Math.floor(tileX)))
    const cy = Math.max(0, Math.min(200, Math.floor(tileY)))

    // Check if tile is occupied
    const checkResult = await supabaseFetch(
      context.env,
      `/rest/v1/world_building_states?select=id&tile_x=eq.${cx}&tile_y=eq.${cy}`
    )
    if (checkResult.ok && Array.isArray(checkResult.data) && checkResult.data.length > 0) {
      return json({ ok: false, error: 'Tile occupied', occupied: true })
    }

    // Get next ID
    const maxIdResult = await supabaseFetch(
      context.env,
      '/rest/v1/world_building_states?select=id&order=id.desc&limit=1'
    )
    let nextId = 1
    if (maxIdResult.ok && Array.isArray(maxIdResult.data) && maxIdResult.data.length > 0) {
      nextId = (maxIdResult.data[0].id || 0) + 1
    }

    // Place the building (NPC-built = owner_id null)
    const building = {
      id: nextId,
      owner_id: null,
      building_type: buildingType,
      tile_x: cx,
      tile_y: cy,
      condition: 100,
      income_rate: NPC_BUILDING_TYPES[buildingType].income,
      last_collected_at: new Date().toISOString(),
      in_district: false,
      status: 'active'
    }

    const insertResult = await supabaseFetch(
      context.env,
      '/rest/v1/world_building_states',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify([building])
      }
    )

    if (!insertResult.ok) {
      console.error('[NPC-BUILD] insert failed:', insertResult.status, insertResult.data)
      return json({ ok: false, error: 'Failed to place building', details: insertResult.data }, 500)
    }

    return json({
      ok: true,
      building: {
        id: nextId,
        building_type: buildingType,
        tile_x: cx,
        tile_y: cy,
        owner_id: null,
        status: 'active'
      }
    })

  } catch (error) {
    console.error('[NPC-BUILD] error:', error?.message)
    return json({ ok: false, error: error?.message || 'Failed to place NPC building' }, 500)
  }
}
