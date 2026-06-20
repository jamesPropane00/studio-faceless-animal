const RADIO_ADMINS = new Set(['jamespropane00', 'arianamnm']);

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function cleanUsername(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}

async function supabaseFetch(env, path, options = {}) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, data: { message: 'Missing Supabase service credentials.' } };
  const headers = new Headers(options.headers || {});
  headers.set('apikey', key);
  headers.set('Authorization', `Bearer ${key}`);
  const response = await fetch(`${url}${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, data, text };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const username = cleanUsername(body.username);
    const ph = String(body.ph || '').trim();
    const id = String(body.id || '').trim();
    const requested = Number(body.channel);
    const channel = [1, 4, 5].includes(requested) ? requested : 1;

    if (!RADIO_ADMINS.has(username)) return json({ ok: false, error: 'Admin access only.' }, 403);
    if (!ph || !id) return json({ ok: false, error: 'Missing authentication or track id.' }, 400);

    const memberQuery = [
      'select=id',
      `username=eq.${encodeURIComponent(username)}`,
      `password_hash=eq.${encodeURIComponent(ph)}`,
      'limit=1',
    ].join('&');
    const memberResult = await supabaseFetch(context.env, `/rest/v1/member_accounts?${memberQuery}`);
    if (!memberResult.ok || !Array.isArray(memberResult.data) || !memberResult.data[0]) {
      return json({ ok: false, error: 'Authentication failed.' }, 401);
    }

    const trackQuery = [
      'select=id,storage_path',
      `id=eq.${encodeURIComponent(id)}`,
      `channel=eq.${channel}`,
      'limit=1',
    ].join('&');
    const trackResult = await supabaseFetch(context.env, `/rest/v1/radio_tracks?${trackQuery}`);
    const track = trackResult.ok && Array.isArray(trackResult.data) ? trackResult.data[0] : null;
    if (!track) return json({ ok: false, error: 'Track not found.' }, 404);

    if (track.storage_path) {
      const storageDelete = await supabaseFetch(context.env, `/storage/v1/object/radio/${track.storage_path}`, { method: 'DELETE' });
      if (!storageDelete.ok && storageDelete.data?.statusCode !== '404') {
        return json({ ok: false, error: storageDelete.data?.message || 'Could not delete the audio file.' }, 500);
      }
    }

    const rowDelete = await supabaseFetch(context.env, `/rest/v1/radio_tracks?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
    if (!rowDelete.ok) return json({ ok: false, error: rowDelete.data?.message || 'Could not remove the track.' }, 500);
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: error?.message || 'Delete failed.' }, 500);
  }
}
