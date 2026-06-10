function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-fas-user',
    },
  });
}

function cleanUsername(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}

function cleanSlug(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function cleanText(value, limit) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

function makeInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = 'TV-';
  for (let i = 0; i < 4; i += 1) out += alphabet[bytes[i] % alphabet.length];
  out += '-';
  for (let i = 4; i < 8; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function getUserFromRequest(context) {
  const userHeader = context.request.headers.get('x-fas-user');
  if (!userHeader) return null;
  try {
    return JSON.parse(userHeader);
  } catch {
    return null;
  }
}

function getSupabaseConfig(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase config.');
  return { url: String(url).replace(/\/+$/, ''), key };
}

async function supabaseFetch(env, path, options = {}) {
  const config = getSupabaseConfig(env);
  const headers = new Headers(options.headers || {});
  headers.set('apikey', config.key);
  headers.set('Authorization', `Bearer ${config.key}`);
  const res = await fetch(`${config.url}${path}`, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data, text };
}

function ownerChannel() {
  return {
    id: 'owner-faceless-tv',
    channel_slug: 'faceless-animal-studios',
    channel_name: 'Faceless Animal Studios',
    channel_kind: 'owner',
    visibility: 'public',
    description: 'The owner channel that anchors the entire Faceless TV network.',
    username: 'facelessanimalstudios',
    display_name: 'Faceless Animal',
    is_owner: true,
    is_featured: true,
    parent_slug: null,
    invite_code: null,
    cover_url: 'assets/neon-dreams/covers/cover-thumb.jpg',
    external_channel_url: 'https://tv.facelessanimalstudios.com',
  };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-fas-user',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function onRequestGet(context) {
  try {
    const user = getUserFromRequest(context);
    const supabase = getSupabaseConfig(context.env);
    const headers = {
      apikey: supabase.key,
      Authorization: `Bearer ${supabase.key}`,
    };

    const publicChannels = await supabaseFetch(context.env, '/rest/v1/tv_channels?select=*&visibility=eq.public&order=is_featured.desc,created_at.desc&limit=50', { headers });
    const myChannels = user && user.username
      ? await supabaseFetch(context.env, `/rest/v1/tv_channels?select=*&username=eq.${encodeURIComponent(cleanUsername(user.username))}&order=created_at.desc&limit=50`, { headers })
      : { ok: true, data: [] };

    const response = {
      owner: ownerChannel(),
      channels: Array.isArray(publicChannels.data) ? publicChannels.data : [],
      mine: Array.isArray(myChannels.data) ? myChannels.data : [],
      session: user ? {
        username: user.username || '',
        display: user.display || user.display_name || user.username || '',
        plan: user.plan || 'free',
        status: user.status || 'free',
      } : null,
    };

    return json(response);
  } catch (err) {
    return json({ ok: false, error: err?.message || 'Could not load TV channels.' }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const user = getUserFromRequest(context);
    if (!user) return json({ ok: false, error: 'Sign in first.' }, 401);

    const body = await context.request.json();
    const channelName = cleanText(body.channel_name, 80);
    const rawSlug = cleanSlug(body.channel_slug || body.slug || channelName);
    const visibility = String(body.visibility || 'public').toLowerCase() === 'private' ? 'private' : 'public';
    const description = cleanText(body.description, 320);
    const username = cleanUsername(user.username);
    const displayName = cleanText(user.display || user.display_name || user.username || username, 80) || username;

    if (!channelName) return json({ ok: false, error: 'Enter a channel name.' }, 400);
    if (!rawSlug) return json({ ok: false, error: 'Enter a valid channel slug.' }, 400);

    const slug = rawSlug === 'faceless-animal-studios' ? `${rawSlug}-${Date.now().toString(36)}` : rawSlug;
    const inviteCode = visibility === 'private' ? makeInviteCode() : null;

    const existing = await supabaseFetch(context.env, `/rest/v1/tv_channels?select=id&channel_slug=eq.${encodeURIComponent(slug)}&limit=1`);
    if (Array.isArray(existing.data) && existing.data.length) {
      return json({ ok: false, error: 'That channel slug is already taken.' }, 409);
    }

    const insert = await supabaseFetch(context.env, '/rest/v1/tv_channels', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify([{
        account_id: user.account_id || null,
        username,
        display_name: displayName,
        channel_slug: slug,
        channel_name: channelName,
        channel_kind: 'member',
        visibility,
        description,
        parent_slug: 'faceless-animal-studios',
        is_owner: false,
        is_featured: false,
        invite_code: inviteCode,
        external_channel_url: null,
        sort_order: 0,
      }]),
    });

    if (!insert.ok) {
      return json({ ok: false, error: insert.data?.message || insert.text || 'Could not create channel.' }, 500);
    }

    return json({ ok: true, channel: Array.isArray(insert.data) ? insert.data[0] : insert.data });
  } catch (err) {
    return json({ ok: false, error: err?.message || 'Channel creation failed.' }, 500);
  }
}
