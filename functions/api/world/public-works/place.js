/**
 * POST /api/world/public-works/place
 * Body: { type, tileX, tileY, userId }
 * Places a public works item (tree, light, bench, garden, graffiti, fence, fountain)
 * Costs coins from the player's balance
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

const INFRA_COSTS = {
  tree: 5, light: 10, bench: 5, garden: 15,
  graffiti: 10, fence: 10, fountain: 25
}

const VALID_TYPES = new Set(Object.keys(INFRA_COSTS))

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
    const { type, tileX, tileY, userId } = body

    if (!type || tileX === undefined || tileY === undefined) {
      return json({ ok: false, error: 'Missing type, tileX, or tileY' }, 400)
    }

    if (!VALID_TYPES.has(type)) {
      return json({ ok: false, error: 'Invalid infrastructure type' }, 400)
    }

    const cost = INFRA_COSTS[type]
    const cx = Math.max(0, Math.min(200, Math.floor(tileX)))
    const cy = Math.max(0, Math.min(200, Math.floor(tileY)))

    // Check tile is not occupied by a building
    const bldCheck = await supabaseFetch(
      context.env,
      `/rest/v1/world_building_states?select=id&tile_x=eq.${cx}&tile_y=eq.${cy}`
    )
    if (bldCheck.ok && Array.isArray(bldCheck.data) && bldCheck.data.length > 0) {
      return json({ ok: false, error: 'Tile occupied by a building' }, 400)
    }

    // Check tile is not already infrastructure (only for non-road types)
    const infraCheck = await supabaseFetch(
      context.env,
      `/rest/v1/world_infrastructure?select=id&tile_x=eq.${cx}&tile_y=eq.${cy}`
    )
    if (infraCheck.ok && Array.isArray(infraCheck.data) && infraCheck.data.length > 0) {
      return json({ ok: false, error: 'Tile already has infrastructure' }, 400)
    }

    // Deduct coins from player
    if (userId) {
      const playerResult = await supabaseFetch(
        context.env,
        `/rest/v1/world_player_states?select=coins&user_id=eq.${encodeURIComponent(userId)}`
      )
      let currentCoins = 100
      if (playerResult.ok && Array.isArray(playerResult.data) && playerResult.data.length > 0) {
        currentCoins = playerResult.data[0].coins || 100
      }

      if (currentCoins < cost) {
        return json({ ok: false, error: 'Not enough coins' }, 400)
      }

      await supabaseFetch(
        context.env,
        '/rest/v1/world_player_states',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify([{
            user_id: userId,
            coins: currentCoins - cost,
            updated_at: new Date().toISOString()
          }])
        }
      )
    }

    const item = {
      infra_type: type,
      tile_x: cx,
      tile_y: cy,
      owner_id: userId || null
    }

    const insertResult = await supabaseFetch(
      context.env,
      '/rest/v1/world_infrastructure',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify([item])
      }
    )

    if (!insertResult.ok) {
      console.error('[PW] insert failed:', insertResult.status, insertResult.data)
      return json({ ok: false, error: 'Failed to place item', details: insertResult.data }, 500)
    }

    const inserted = Array.isArray(insertResult.data) ? insertResult.data[0] : insertResult.data

    return json({
      ok: true,
      item: { id: inserted?.id || 0, infra_type: type, tile_x: cx, tile_y: cy, owner_id: userId || null }
    })

  } catch (error) {
    console.error('[PW] error:', error?.message)
    return json({ ok: false, error: error?.message || 'Failed to place infrastructure' }, 500)
  }
}
