/**
 * POST /api/world/block/place
 * Phase 6: Urban DNA — Development Blocks
 * Places a block (roads, sidewalks, lots) without replacing the old system.
 *
 * Body: { blockType, tileX, tileY, userId }
 * blockType: 'residential' | 'commercial' | 'industrial' | 'entertainment' | 'park' | 'farm'
 *
 * Block dimensions (width x height in tiles):
 *   residential:   8x8
 *   commercial:    6x6
 *   industrial:    10x8
 *   entertainment: 8x6
 *   park:          6x6
 *   farm:          10x10
 *
 * Creates:
 *   1. The block record
 *   2. Road tiles around the perimeter (via world_infrastructure)
 *   3. Empty lots inside the block (via world_block_lots)
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

const BLOCK_DIMS = {
  residential: { w: 8, h: 8, lotSize: 2, cost: 200 },
  commercial:  { w: 6, h: 6, lotSize: 2, cost: 300 },
  industrial:  { w: 10, h: 8, lotSize: 3, cost: 250 },
  entertainment: { w: 8, h: 6, lotSize: 2, cost: 400 },
  park:        { w: 6, h: 6, lotSize: 0, cost: 150 },
  farm:        { w: 10, h: 10, lotSize: 3, cost: 100 },
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
    const { blockType, tileX, tileY, userId } = body

    if (!blockType || tileX === undefined || tileY === undefined) {
      return json({ ok: false, error: 'Missing blockType, tileX, or tileY' }, 400)
    }

    const dims = BLOCK_DIMS[blockType]
    if (!dims) {
      return json({ ok: false, error: 'Invalid block type' }, 400)
    }

    const cx = Math.max(0, Math.min(200, Math.floor(tileX)))
    const cy = Math.max(0, Math.min(200, Math.floor(tileY)))
    const bw = dims.w
    const bh = dims.h

    // Check bounds
    if (cx + bw > 200 || cy + bh > 200) {
      return json({ ok: false, error: 'Block extends beyond world edge' }, 400)
    }

    // Check no overlap with existing blocks
    const overlapCheck = await supabaseFetch(
      context.env,
      `/rest/v1/world_blocks?select=id&tile_x=lte.${cx + bw - 1}&tile_x=gte.${cx}&tile_y=lte.${cy + bh - 1}&tile_y=gte.${cy}`
    )
    if (overlapCheck.ok && Array.isArray(overlapCheck.data) && overlapCheck.data.length > 0) {
      return json({ ok: false, error: 'Overlaps an existing block' }, 400)
    }

    // Deduct coins
    if (userId) {
      const playerResult = await supabaseFetch(
        context.env,
        `/rest/v1/world_player_states?select=coins&user_id=eq.${encodeURIComponent(userId)}`
      )
      let currentCoins = 100
      if (playerResult.ok && Array.isArray(playerResult.data) && playerResult.data.length > 0) {
        currentCoins = playerResult.data[0].coins || 100
      }
      const cost = dims.cost
      if (currentCoins < cost) {
        return json({ ok: false, error: 'Not enough coins' }, 400)
      }
      await supabaseFetch(
        context.env,
        '/rest/v1/world_player_states',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify([{ user_id: userId, coins: currentCoins - cost, updated_at: new Date().toISOString() }])
        }
      )
    }

    // Insert the block
    const blockInsert = await supabaseFetch(
      context.env,
      '/rest/v1/world_blocks',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify([{
          block_type: blockType,
          tile_x: cx,
          tile_y: cy,
          width: bw,
          height: bh,
          owner_id: userId || null,
        }])
      }
    )

    if (!blockInsert.ok) {
      console.error('[BLOCK] insert failed:', blockInsert.status, blockInsert.data)
      return json({ ok: false, error: 'Failed to create block' }, 500)
    }

    const block = (Array.isArray(blockInsert.data) ? blockInsert.data[0] : blockInsert.data)
    const blockId = block.id

    // Generate lots
    const lots = []
    if (blockType !== 'park') {
      const lotSize = dims.lotSize
      const pad = 2 // 1 tile road + 1 tile sidewalk
      let lotIndex = 0
      for (let y = pad; y + lotSize <= bh - pad; y += lotSize) {
        for (let x = pad; x + lotSize <= bw - pad; x += lotSize) {
      lots.push({
        block_id: blockId,
        lot_index: lotIndex,
        tile_x: cx + x,
        tile_y: cy + y,
        lot_type: blockType === 'industrial' ? 'industrial' : (blockType === 'residential' ? 'residential' : (blockType === 'farm' ? 'field' : 'commercial')),
        occupied_building_id: null
      })
          lotIndex++
        }
      }
    }

    if (lots.length > 0) {
      const lotResult = await supabaseFetch(
        context.env,
        '/rest/v1/world_block_lots',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify(lots)
        }
      )
      if (!lotResult.ok) {
        console.error('[BLOCK] lot insert failed:', lotResult.status, lotResult.data)
      }
    }

    // Generate road tiles around the perimeter using world_infrastructure
    const roadTiles = []
    // Top edge
    for (let x = cx - 1; x < cx + bw + 1; x++) {
      roadTiles.push({ infra_type: blockType + '_road', tile_x: x, tile_y: cy - 1, owner_id: null })
    }
    // Bottom edge
    for (let x = cx - 1; x < cx + bw + 1; x++) {
      roadTiles.push({ infra_type: blockType + '_road', tile_x: x, tile_y: cy + bh, owner_id: null })
    }
    // Left edge
    for (let y = cy - 1; y < cy + bh + 1; y++) {
      roadTiles.push({ infra_type: blockType + '_road', tile_x: cx - 1, tile_y: y, owner_id: null })
    }
    // Right edge
    for (let y = cy - 1; y < cy + bh + 1; y++) {
      roadTiles.push({ infra_type: blockType + '_road', tile_x: cx + bw, tile_y: y, owner_id: null })
    }

    if (roadTiles.length > 0) {
      for (let i = 0; i < roadTiles.length; i += 50) {
        const batch = roadTiles.slice(i, i + 50)
        await supabaseFetch(
          context.env,
          '/rest/v1/world_infrastructure',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify(batch)
          }
        )
      }
    }

    // Also add a sidewalk ring as infrastructure (using block_type + '_sidewalk')
    const sidewalkTiles = []
    for (let y = cy; y < cy + bh; y++) {
      sidewalkTiles.push({ infra_type: blockType + '_sidewalk', tile_x: cx, tile_y: y, owner_id: null })
      sidewalkTiles.push({ infra_type: blockType + '_sidewalk', tile_x: cx + bw - 1, tile_y: y, owner_id: null })
    }
    for (let x = cx + 1; x < cx + bw - 1; x++) {
      sidewalkTiles.push({ infra_type: blockType + '_sidewalk', tile_x: x, tile_y: cy, owner_id: null })
      sidewalkTiles.push({ infra_type: blockType + '_sidewalk', tile_x: x, tile_y: cy + bh - 1, owner_id: null })
    }

    if (sidewalkTiles.length > 0) {
      for (let i = 0; i < sidewalkTiles.length; i += 50) {
        const batch = sidewalkTiles.slice(i, i + 50)
        await supabaseFetch(
          context.env,
          '/rest/v1/world_infrastructure',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify(batch)
          }
        )
      }
    }

    return json({
      ok: true,
      block: { id: blockId, block_type: blockType, tile_x: cx, tile_y: cy, width: bw, height: bh, owner_id: userId || null },
      lotCount: lots.length
    })

  } catch (error) {
    console.error('[BLOCK] error:', error?.message)
    return json({ ok: false, error: error?.message || 'Failed to place block' }, 500)
  }
}
