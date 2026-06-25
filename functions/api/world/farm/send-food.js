/**
 * POST /api/world/farm/send-food
 * Sends farm food to the city for coins and reputation.
 * Body: { foodAmount, userId }
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
    const { foodAmount, userId } = body

    if (!foodAmount || foodAmount < 1 || !userId) {
      return json({ ok: false, error: 'Invalid food amount or missing userId' }, 400)
    }

    // Calculate reward: 2 coins per food + 1 rep per 5 food
    const reward = foodAmount * 2
    const repGain = Math.floor(foodAmount / 5)

    // Update player coins and rep
    const playerResult = await supabaseFetch(
      context.env,
      `/rest/v1/world_player_states?select=coins,rep&user_id=eq.${encodeURIComponent(userId)}`
    )

    let currentCoins = 100
    let currentRep = 0
    if (playerResult.ok && Array.isArray(playerResult.data) && playerResult.data.length > 0) {
      currentCoins = playerResult.data[0].coins || 100
      currentRep = playerResult.data[0].rep || 0
    }

    const newCoins = currentCoins + reward
    const newRep = currentRep + repGain

    const upsertResult = await supabaseFetch(
      context.env,
      '/rest/v1/world_player_states',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([{
          user_id: userId,
          coins: newCoins,
          rep: newRep,
          updated_at: new Date().toISOString()
        }])
      }
    )

    if (!upsertResult.ok) {
      return json({ ok: false, error: 'Failed to update player state' }, 500)
    }

    return json({ ok: true, coins: newCoins, rep: newRep, reward, repGain })
  } catch (error) {
    return json({ ok: false, error: error?.message || 'Failed to send food' }, 500)
  }
}
