/**
 * GET /api/world/visual-data
 * Returns district influences and NPC gang affiliations for client rendering
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

    // Fetch all district influences with gang info
    const influenceResult = await supabaseFetch(
      context.env,
      `/rest/v1/world_district_influence?select=*`
    );

    // Fetch all gangs (for color/tag lookup)
    const gangsResult = await supabaseFetch(
      context.env,
      `/rest/v1/world_gangs?select=id,name,tag,color`
    );

    // Fetch all NPC affiliations with gang info
    const affiliationsResult = await supabaseFetch(
      context.env,
      `/rest/v1/world_npc_affiliations?select=npc_id,gang_id,affiliation_strength`
    );

    // Build gang lookup map
    const gangMap = {};
    if (gangsResult.ok && Array.isArray(gangsResult.data)) {
      for (const g of gangsResult.data) {
        gangMap[g.id] = g;
      }
    }

    // Group influences by district
    const districtMap = {};
    if (influenceResult.ok && Array.isArray(influenceResult.data)) {
      for (const inf of influenceResult.data) {
        if (!districtMap[inf.district_id]) {
          districtMap[inf.district_id] = [];
        }
        const gang = gangMap[inf.gang_id];
        if (gang) {
          districtMap[inf.district_id].push({
            gang_id: inf.gang_id,
            tag: gang.tag,
            color: gang.color,
            name: gang.name,
            percent: inf.influence_percent
          });
        }
      }
    }

    // Sort each district's influences by percent DESC and limit to top 3
    const districtInfluences = [];
    for (const [districtId, influences] of Object.entries(districtMap)) {
      const sorted = influences.sort((a, b) => b.percent - a.percent).slice(0, 3);
      districtInfluences.push({
        district_id: parseInt(districtId),
        influences: sorted
      });
    }

    // Build NPC affiliations array
    const npcAffiliations = [];
    if (affiliationsResult.ok && Array.isArray(affiliationsResult.data)) {
      for (const aff of affiliationsResult.data) {
        const gang = gangMap[aff.gang_id];
        if (gang) {
          npcAffiliations.push({
            npc_id: aff.npc_id,
            gang_id: aff.gang_id,
            gang_tag: gang.tag,
            gang_color: gang.color
          });
        }
      }
    }

    return json({
      ok: true,
      districtInfluences,
      npcAffiliations
    });
  } catch (error) {
    console.error('[WORLD] visual-data error:', error);
    return json({ ok: false, error: error?.message || 'Failed to fetch visual data.' }, 500);
  }
}
