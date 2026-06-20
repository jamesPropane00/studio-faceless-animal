function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    },
  });
}

async function supabaseFetch(env, path) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, data: null };
  const response = await fetch(`${url}${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, data };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function onRequestGet(context) {
  let channel = 1;
  try {
    const url = new URL(context.request.url);
    const requested = Number(url.searchParams.get('channel'));
    channel = [1, 4, 5].includes(requested) ? requested : 1;
    const query = [
      'select=id,title,artist,src,storage_path,channel,is_active',
      `channel=eq.${channel}`,
      'is_active=eq.true',
      'order=id.asc',
    ].join('&');
    const result = await supabaseFetch(context.env, `/rest/v1/radio_tracks?${query}`);
    if (!result.ok) return json({ tracks: [], channel, error: 'Could not load radio tracks.' }, 502);

    const tracks = (Array.isArray(result.data) ? result.data : []).map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.artist,
      src: row.src,
      storage_path: row.storage_path,
      channel: row.channel,
    }));
    return json({ tracks, channel });
  } catch (error) {
    return json({ tracks: [], channel, error: error?.message || 'Could not load radio tracks.' }, 502);
  }
}
