/**
 * POST /api/world/gang/join
 * Body: { gangId, userId }
 * Adds user to a gang as a member
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
    const { gangId, userId } = body;

    if (!gangId || !userId) {
      return json({ ok: false, error: 'Missing gangId or userId.' }, 400);
    }

    // Check if user is already in a gang
    const existingMembership = await supabaseFetch(
      context.env,
      `/rest/v1/world_gang_members?user_id=eq.${encodeURIComponent(userId)}&select=gang_id`
    );

    if (existingMembership.ok && Array.isArray(existingMembership.data) && existingMembership.data.length > 0) {
      return json({ ok: false, error: 'You are already in a gang. Leave your current gang first.' }, 400);
    }

    // Check if gang exists
    const gangCheck = await supabaseFetch(
      context.env,
      `/rest/v1/world_gangs?id=eq.${gangId}&select=*`
    );

    if (!gangCheck.ok || !Array.isArray(gangCheck.data) || gangCheck.data.length === 0) {
      return json({ ok: false, error: 'Gang not found.' }, 404);
    }

    const gang = gangCheck.data[0];

    // Add user as member
    const memberData = {
      gang_id: gangId,
      user_id: userId,
      role: 'member',
      joined_at: new Date().toISOString()
    };

    const joinResult = await supabaseFetch(
      context.env,
      `/rest/v1/world_gang_members`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([memberData])
      }
    );

    if (!joinResult.ok) {
      console.error('[WORLD] gang join failed:', joinResult.status, joinResult.data);
      return json({ 
        ok: false, 
        error: `Failed to join gang: ${joinResult.data?.message || 'Unknown error'}` 
      }, 500);
    }

    // Increment member count
    const newCount = (gang.member_count || 0) + 1;
    await supabaseFetch(
      context.env,
      `/rest/v1/world_gangs?id=eq.${gangId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_count: newCount })
      }
    );

    return json({
      ok: true,
      gang: {
        id: gang.id,
        name: gang.name,
        tag: gang.tag,
        color: gang.color,
        member_count: newCount
      }
    });
  } catch (error) {
    console.error('[WORLD] gang join error:', error);
    return json({ ok: false, error: error?.message || 'Failed to join gang.' }, 500);
  }
}
