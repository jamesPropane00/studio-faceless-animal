/**
 * GET /api/world/gang/list
 * Returns all gangs sorted by total influence DESC
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

    // Fetch all gangs sorted by total influence DESC
    const result = await supabaseFetch(
      context.env,
      `/rest/v1/world_gangs?select=id,name,tag,color,leader_id,total_influence,member_count,level&order=total_influence.desc&limit=50`
    );

    if (!result.ok) {
      console.error('[WORLD] gang list failed:', result.status, result.data);
      // Return empty array instead of error if table doesn't exist yet
      if (result.status === 404 || result.data?.code === '42P01') {
        return json({ ok: true, gangs: [] });
      }
      return json({ 
        ok: false, 
        error: `Failed to fetch gangs: ${result.data?.message || 'Unknown error'}` 
      }, 500);
    }

    return json({
      ok: true,
      gangs: Array.isArray(result.data) ? result.data : []
    });
  } catch (error) {
    console.error('[WORLD] gang list error:', error);
    return json({ ok: false, error: error?.message || 'Failed to fetch gangs.' }, 500);
  }
}
