/**
 * POST /api/world/simulation/tick
 * Phase 5A — District Resource Simulation
 * Runs every ~30s (client-triggered, same pattern as district refresh)
 *
 * Evaluates each building against district resource scores:
 * - Calculates fulfillment (how well building needs are met)
 * - Updates business_health (lerps toward target)
 * - Accumulates pending_income
 * - Determines building status (active/struggling/closing/closed)
 *
 * Isolated buildings (not in any district) use a lower base fulfillment.
 * Houses/camps never close (residential types).
 * Hides don't need resources (they are the problem source).
 */

// Inline config (avoids cross-file import issues with Cloudflare Pages Functions)
const TICK_INCOME = { house: 0.25, shop: 0.5, club: 1.0, warehouse: 0.5, hide: 0, camp: 0 }
const MAX_PENDING_INCOME = {
  house: 0.25 * 2 * 60 * 24, shop: 0.5 * 2 * 60 * 24, club: 1.0 * 2 * 60 * 24,
  warehouse: 0.5 * 2 * 60 * 24, hide: 0, camp: 0
}
const FULFILLMENT_WEIGHTS = {
  house: { safety: 1.0 }, shop: { customers: 0.6, supplies: 0.4 },
  club: { customers: 0.4, supplies: 0.3, workers: 0.3 },
  warehouse: { workers: 0.6, safety: 0.4 }, hide: {}, camp: { safety: 1.0 }
}
const STATUS_THRESHOLDS = { closed: 10, closing: 25, struggling: 40, active: 60 }
const RESIDENTIAL_TYPES = ['house', 'camp']

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

// ── DISTRICT RESOURCE SCORES ──────────────────────────────────

function getDistrictResources(district, buildingsInDistrict, infrastructureInDistrict) {
  const counts = { house: 0, shop: 0, club: 0, warehouse: 0, hide: 0, camp: 0 }
  for (const b of buildingsInDistrict) {
    if (counts[b.building_type] !== undefined) counts[b.building_type]++
  }

  const crimeRate = district.crime_rate || 0
  let safety = Math.max(0, 100 - crimeRate) / 100

  // Phase 5B Pass 2: Infrastructure effects on resource scores
  if (infrastructureInDistrict && infrastructureInDistrict.length > 0) {
    const infraCounts = { tree: 0, light: 0, bench: 0, garden: 0, graffiti: 0, fence: 0, fountain: 0, road: 0 }
    for (const item of infrastructureInDistrict) {
      if (infraCounts[item.infra_type] !== undefined) infraCounts[item.infra_type]++
    }
    // Safety bonuses/penalties
    safety += infraCounts.tree * 0.02
    safety += infraCounts.light * 0.03
    safety += infraCounts.garden * 0.02
    safety -= infraCounts.graffiti * 0.02
    safety += infraCounts.fence * 0.03
    safety += infraCounts.fountain * 0.03
    safety += infraCounts.road * 0.005
    safety = Math.max(0.1, Math.min(1.0, safety))
  }

  // Customer potential: how many customers per shop
  // Each house = 3 potential customers, each club = 2 tourists
  // Infrastructure bonuses: benches, gardens, fountains attract more customers
  let infraCustomerBonus = 0
  if (infrastructureInDistrict && infrastructureInDistrict.length > 0) {
    const infraCounts = { bench: 0, garden: 0, fountain: 0 }
    for (const item of infrastructureInDistrict) {
      if (item.infra_type === 'bench') infraCounts.bench++
      else if (item.infra_type === 'garden') infraCounts.garden++
      else if (item.infra_type === 'fountain') infraCounts.fountain++
    }
    infraCustomerBonus = (infraCounts.bench * 0.02 + infraCounts.garden * 0.02 + infraCounts.fountain * 0.05) / Math.max(1, counts.shop)
  }
  const customerPotential = counts.shop > 0
    ? (counts.house * 3 + counts.club * 2) / counts.shop + infraCustomerBonus
    : 2

  // Supply potential: how many supply units per business
  const businessCount = counts.shop + counts.club
  const supplyPotential = businessCount > 0
    ? counts.warehouse * 3 / businessCount
    : 1

  // Worker potential: how many workers per employer
  const employerCount = counts.warehouse + counts.club
  const workerPotential = employerCount > 0
    ? counts.house * 2 / employerCount
    : 2

  return { safety, customerPotential, supplyPotential, workerPotential, counts }
}

// ── FULFILLMENT CALCULATION ──────────────────────────────────

function getFulfillment(building, resources) {
  const weights = FULFILLMENT_WEIGHTS[building.building_type]
  if (!weights || Object.keys(weights).length === 0) return 1.0

  let total = 0
  let weightSum = 0

  // Safety (0-1 from crime rate)
  if (weights.safety) {
    total += resources.safety * weights.safety
    weightSum += weights.safety
  }

  // Customers: 5+ customers per shop = 100% fulfillment
  if (weights.customers) {
    const custFulfill = Math.min(1, resources.customerPotential / 5)
    total += custFulfill * weights.customers
    weightSum += weights.customers
  }

  // Supplies: 3+ supply units per business = 100% fulfillment
  if (weights.supplies) {
    const suppFulfill = Math.min(1, resources.supplyPotential / 3)
    total += suppFulfill * weights.supplies
    weightSum += weights.supplies
  }

  // Workers: 3+ workers per employer = 100% fulfillment
  if (weights.workers) {
    const workFulfill = Math.min(1, resources.workerPotential / 3)
    total += workFulfill * weights.workers
    weightSum += weights.workers
  }

  return weightSum > 0 ? total / weightSum : 1.0
}

function getIsolatedFulfillment(building) {
  const type = building.building_type
  const condition = (building.condition || 100) / 100

  if (type === 'hide') return 1.0
  if (type === 'house' || type === 'camp') return 0.5 + condition * 0.2
  return 0.2 + condition * 0.15
}

// ── BUILDING UPDATE ──────────────────────────────────────────

function computeBuildingUpdate(building, fulfillment) {
  const type = building.building_type

  // Target health: 20 (struggling minimum) + fulfillment × 80 (room to grow)
  const targetHealth = 20 + Math.floor(fulfillment * 80)
  const currentHealth = building.business_health ?? 100

  // Smooth lerp toward target (0.3 per tick = ~4 ticks to converge)
  let newHealth = Math.round(currentHealth + (targetHealth - currentHealth) * 0.3)
  newHealth = Math.max(1, Math.min(100, newHealth))

  // Pending income accumulates per tick
  const tickIncome = TICK_INCOME[type] || 0
  const incomeAdd = parseFloat((tickIncome * fulfillment).toFixed(4))
  const maxPending = MAX_PENDING_INCOME[type] || 0
  let newPending = (parseFloat(building.pending_income) || 0) + incomeAdd
  newPending = Math.min(maxPending, Math.max(0, newPending))
  newPending = parseFloat(newPending.toFixed(2))

  // Status determination with hysteresis
  const currentStatus = building.status || 'active'
  let newStatus = currentStatus
  const isResidential = RESIDENTIAL_TYPES.includes(type)

  if (!isResidential) {
    if (newHealth < STATUS_THRESHOLDS.closed) {
      newStatus = 'closed'
    } else if (newHealth < STATUS_THRESHOLDS.closing) {
      newStatus = 'closing'
    } else if (newHealth < STATUS_THRESHOLDS.struggling) {
      newStatus = 'struggling'
    } else if (newHealth >= STATUS_THRESHOLDS.active) {
      newStatus = 'active'
    }
    // 40-60 hysteresis zone: keep current status
  } else {
    newStatus = 'active'
  }

  return { newHealth, newPending, newStatus, incomeAdd }
}

// ── MAIN HANDLER ─────────────────────────────────────────────

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
    // 1. Fetch all buildings
    const buildingsResult = await supabaseFetch(
      context.env,
      '/rest/v1/world_building_states?select=id,building_type,tile_x,tile_y,condition,business_health,pending_income,status,in_district,region_id&region_id=eq.city'
    )

    if (!buildingsResult.ok || !Array.isArray(buildingsResult.data)) {
      console.error('[SIM] tick: building fetch failed:', buildingsResult.status, buildingsResult.data)
      return json({ ok: false, error: 'Failed to fetch buildings' }, 500)
    }

    const buildings = buildingsResult.data
    if (buildings.length === 0) {
      return json({ ok: true, buildingsUpdated: 0, totalPendingIncome: 0, note: 'no buildings' })
    }

    // 2. Fetch all districts
    const districtsResult = await supabaseFetch(
      context.env,
      '/rest/v1/world_districts?select=*&region_id=eq.city'
    )
    const districts = (districtsResult.ok && Array.isArray(districtsResult.data)) ? districtsResult.data : []

    // 2b. Fetch all infrastructure (Phase 5B Pass 2)
    let infrastructure = []
    try {
      const infraResult = await supabaseFetch(
        context.env,
        '/rest/v1/world_infrastructure?select=infra_type,tile_x,tile_y,region_id&region_id=eq.city'
      )
      if (infraResult.ok && Array.isArray(infraResult.data)) {
        infrastructure = infraResult.data
      }
    } catch (e) {
      // table may not exist yet
    }

    // 3. Group buildings AND infrastructure by district
    const districtMap = new Map() // `${center_x},${center_y},${type}` → { district, buildings, infrastructure }
    const isolated = []

    // Group infrastructure by district first
    const infraByDistrict = new Map()
    for (const item of infrastructure) {
      let found = false
      for (const d of districts) {
        const idx = item.tile_x - d.center_x
        const idy = item.tile_y - d.center_y
        const dist = Math.sqrt(idx * idx + idy * idy)
        if (dist <= d.radius) {
          const key = `${d.center_x},${d.center_y},${d.district_type}`
          if (!infraByDistrict.has(key)) {
            infraByDistrict.set(key, [])
          }
          infraByDistrict.get(key).push(item)
          found = true
          break
        }
      }
    }

    for (const b of buildings) {
      let found = false
      for (const d of districts) {
        const dx = b.tile_x - d.center_x
        const dy = b.tile_y - d.center_y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist <= d.radius) {
          const key = `${d.center_x},${d.center_y},${d.district_type}`
          if (!districtMap.has(key)) {
            districtMap.set(key, { district: d, buildings: [], infrastructure: infraByDistrict.get(key) || [] })
          }
          districtMap.get(key).buildings.push(b)
          found = true
          break
        }
      }
      if (!found) {
        isolated.push(b)
      }
    }

    // 4. Process each district
    const updates = []

    for (const [, group] of districtMap) {
      const resources = getDistrictResources(group.district, group.buildings, group.infrastructure)

      for (const b of group.buildings) {
        const fulfillment = getFulfillment(b, resources)
        const update = computeBuildingUpdate(b, fulfillment)
        updates.push({ id: b.id, ...update })
      }
    }

    // 5. Process isolated buildings
    for (const b of isolated) {
      const fulfillment = getIsolatedFulfillment(b)
      const update = computeBuildingUpdate(b, fulfillment)
      updates.push({ id: b.id, ...update })
    }

    // 6. Batch update buildings in parallel
    let updatedCount = 0
    let totalPending = 0

    // Process in batches of 25 to avoid overwhelming Supabase
    const batchSize = 25
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize)
      const results = await Promise.allSettled(
        batch.map(u =>
          supabaseFetch(
            context.env,
            `/rest/v1/world_building_states?id=eq.${u.id}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                business_health: u.newHealth,
                pending_income: u.newPending,
                status: u.newStatus
              })
            }
          )
        )
      )

      for (let j = 0; j < results.length; j++) {
        const result = results[j]
        if (result.status === 'fulfilled' && result.value.ok) {
          updatedCount++
          totalPending = parseFloat((totalPending + updates[i + j].incomeAdd).toFixed(2))
        } else {
          console.warn(`[SIM] tick update failed for building ${updates[i + j]?.id}:`, result.status === 'rejected' ? result.reason : result.value?.data)
        }
      }
    }

    return json({
      ok: true,
      buildingsUpdated: updatedCount,
      totalPendingIncome: totalPending
    })

  } catch (error) {
    console.error('[SIM] tick error:', error?.message, error?.stack)
    // Fail safe — never break the game
    return json({ ok: false, error: error?.message || 'Simulation tick failed' }, 500)
  }
}
