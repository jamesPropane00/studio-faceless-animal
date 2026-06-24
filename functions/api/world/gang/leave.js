/**
 * POST /api/world/gang/leave
 * Body: { userId }
 * Removes user from their current gang
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
    const { userId } = body;

    if (!userId) {
      return json({ ok: false, error: 'Missing userId.' }, 400);
    }

    // Find user's current gang membership
    const membership = await supabaseFetch(
      context.env,
      `/rest/v1/world_gang_members?user_id=eq.${encodeURIComponent(userId)}&select=*`
    );

    if (!membership.ok || !Array.isArray(membership.data) || membership.data.length === 0) {
      return json({ ok: false, error: 'You are not in a gang.' }, 400);
    }

    const memberRecord = membership.data[0];
    const gangId = memberRecord.gang_id;
    const isLeader = memberRecord.role === 'leader';

    // Remove the member
    const removeResult = await supabaseFetch(
      context.env,
      `/rest/v1/world_gang_members?id=eq.${memberRecord.id}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (!removeResult.ok) {
      console.error('[WORLD] gang leave failed:', removeResult.status, removeResult.data);
      return json({ 
        ok: false, 
        error: `Failed to leave gang: ${removeResult.data?.message || 'Unknown error'}` 
      }, 500);
    }

    // Get current member count
    const gangInfo = await supabaseFetch(
      context.env,
      `/rest/v1/world_gangs?id=eq.${gangId}&select=member_count,leader_id`
    );

    let newCount = 0;
    if (gangInfo.ok && Array.isArray(gangInfo.data) && gangInfo.data.length > 0) {
      newCount = Math.max(0, (gangInfo.data[0].member_count || 1) - 1);
    }

    // If leader left, check if there are other officers to promote
    if (isLeader) {
      const officers = await supabaseFetch(
        context.env,
        `/rest/v1/world_gang_members?gang_id=eq.${gangId}&role=eq.officer&select=user_id&limit=1`
      );

      if (officers.ok && Array.isArray(officers.data) && officers.data.length > 0) {
        // Promote first officer to leader
        await supabaseFetch(
          context.env,
          `/rest/v1/world_gang_members?id=eq.${officers.data[0].id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'leader' })
          }
        );

        // Update gang leader_id
        await supabaseFetch(
          context.env,
          `/rest/v1/world_gangs?id=eq.${gangId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              leader_id: officers.data[0].user_id,
              member_count: newCount
            })
          }
        );
      } else {
        // No officers, disband the gang
        await supabaseFetch(
          context.env,
          `/rest/v1/world_gangs?id=eq.${gangId}`,
          {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    } else {
      // Just decrement member count
      await supabaseFetch(
        context.env,
        `/rest/v1/world_gangs?id=eq.${gangId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ member_count: newCount })
        }
      );
    }

    return json({
      ok: true,
      message: isLeader && newCount === 0 ? 'Gang disbanded' : 'Left gang successfully'
    });
  } catch (error) {
    console.error('[WORLD] gang leave error:', error);
    return json({ ok: false, error: error?.message || 'Failed to leave gang.' }, 500);
  }
}
