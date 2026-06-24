/**
 * POST /api/world/gang/recruit-npc
 * Body: { npcId, gangId, userId }
 * Recruits an NPC to a gang (costs 50 coins)
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

const RECRUITMENT_COST = 50;
const MAX_NPCS_PER_GANG = 25;
const BASE_SUCCESS_CHANCE = 0.6; // 60%

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
    if (!context.env.SUPABASE_URL || !context.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ 
        ok: false, 
        error: 'Server configuration error: Missing Supabase credentials' 
      }, 500);
    }

    const body = await context.request.json();
    const { npcId, gangId, userId } = body;

    if (npcId === undefined || !gangId || !userId) {
      return json({ ok: false, error: 'Missing required fields.' }, 400);
    }

    // Check if user is in the gang
    const membership = await supabaseFetch(
      context.env,
      `/rest/v1/world_gang_members?user_id=eq.${encodeURIComponent(userId)}&gang_id=eq.${gangId}&select=role`
    );

    if (!membership.ok || !Array.isArray(membership.data) || membership.data.length === 0) {
      return json({ ok: false, error: 'You are not in this gang.' }, 403);
    }

    // Check if gang has reached NPC limit
    const npcCount = await supabaseFetch(
      context.env,
      `/rest/v1/world_npc_affiliations?gang_id=eq.${gangId}&select=id`
    );

    if (npcCount.ok && Array.isArray(npcCount.data) && npcCount.data.length >= MAX_NPCS_PER_GANG) {
      return json({ 
        ok: false, 
        error: `Gang has reached maximum NPC limit (${MAX_NPCS_PER_GANG}).` 
      }, 400);
    }

    // Check if NPC is already in a gang
    const existingAffiliation = await supabaseFetch(
      context.env,
      `/rest/v1/world_npc_affiliations?npc_id=eq.${npcId}&select=gang_id`
    );

    if (existingAffiliation.ok && Array.isArray(existingAffiliation.data) && existingAffiliation.data.length > 0) {
      return json({ ok: false, error: 'NPC is already in a gang.' }, 400);
    }

    // Check if user has enough coins
    const playerQuery = `select=coins&user_id=eq.${encodeURIComponent(userId)}`;
    const playerResult = await supabaseFetch(context.env, `/rest/v1/world_player_states?${playerQuery}`);

    let currentCoins = 100;
    if (playerResult.ok && Array.isArray(playerResult.data) && playerResult.data.length > 0) {
      currentCoins = playerResult.data[0].coins || 100;
    }

    if (currentCoins < RECRUITMENT_COST) {
      return json({ 
        ok: false, 
        error: `Not enough coins. Need ${RECRUITMENT_COST}, have ${currentCoins}.` 
      }, 400);
    }

    // Calculate success chance based on gang reputation
    const gangInfo = await supabaseFetch(
      context.env,
      `/rest/v1/world_gangs?id=eq.${gangId}&select=total_influence,level`
    );

    let successChance = BASE_SUCCESS_CHANCE;
    if (gangInfo.ok && Array.isArray(gangInfo.data) && gangInfo.data.length > 0) {
      const influence = gangInfo.data[0].total_influence || 0;
      const level = gangInfo.data[0].level || 1;
      // Bonus: +5% per 100 influence, +5% per level above 1
      const influenceBonus = Math.min(0.3, (influence / 100) * 0.05);
      const levelBonus = Math.min(0.1, (level - 1) * 0.05);
      successChance = Math.min(0.95, BASE_SUCCESS_CHANCE + influenceBonus + levelBonus);
    }

    const success = Math.random() < successChance;

    if (!success) {
      return json({
        ok: true,
        success: false,
        message: `Recruitment failed. Success chance was ${Math.round(successChance * 100)}%.`
      });
    }

    // Determine NPC type (random for now, could be based on NPC data)
    const npcTypes = ['builder', 'guard', 'artist', 'worker'];
    const npcType = npcTypes[Math.floor(Math.random() * npcTypes.length)];

    // Create affiliation
    const affiliationData = {
      npc_id: npcId,
      gang_id: gangId,
      affiliation_strength: 50,
      recruited_at: new Date().toISOString(),
      npc_type: npcType
    };

    const affiliationResult = await supabaseFetch(
      context.env,
      `/rest/v1/world_npc_affiliations`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([affiliationData])
      }
    );

    if (!affiliationResult.ok) {
      console.error('[WORLD] recruitment failed:', affiliationResult.status, affiliationResult.data);
      return json({ 
        ok: false, 
        error: `Failed to recruit NPC: ${affiliationResult.data?.message || 'Unknown error'}` 
      }, 500);
    }

    // Add +5 influence to gang
    const currentInfluenceResult = await supabaseFetch(
      context.env,
      `/rest/v1/world_gangs?id=eq.${gangId}&select=total_influence`
    );

    let newInfluence = 5;
    if (currentInfluenceResult.ok && Array.isArray(currentInfluenceResult.data) && currentInfluenceResult.data.length > 0) {
      newInfluence = (currentInfluenceResult.data[0].total_influence || 0) + 5;
    }

    await supabaseFetch(
      context.env,
      `/rest/v1/world_gangs?id=eq.${gangId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_influence: newInfluence })
      }
    );

    // Deduct coins
    const newCoins = currentCoins - RECRUITMENT_COST;
    await supabaseFetch(
      context.env,
      `/rest/v1/world_player_states?user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([{
          user_id: userId,
          coins: newCoins,
          updated_at: new Date().toISOString()
        }])
      }
    );

    return json({
      ok: true,
      success: true,
      message: `Successfully recruited NPC!`,
      npc: {
        npc_id: npcId,
        npc_type: npcType,
        gang_id: gangId
      },
      coinsSpent: RECRUITMENT_COST,
      newBalance: newCoins,
      gangInfluence: newInfluence
    });
  } catch (error) {
    console.error('[WORLD] recruit error:', error);
    return json({ ok: false, error: error?.message || 'Failed to recruit NPC.' }, 500);
  }
}
