const MAX_BYTES = 45 * 1024 * 1024;

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

function cleanText(value, limit) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

function extensionFor(fileName, fileType) {
  const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  if (match) return match[1] === 'jpeg' ? 'jpg' : match[1];
  if (String(fileType || '').toLowerCase() === 'video/mp4') return 'mp4';
  if (String(fileType || '').toLowerCase() === 'video/webm') return 'webm';
  if (String(fileType || '').toLowerCase() === 'video/quicktime') return 'mov';
  if (String(fileType || '').toLowerCase() === 'video/x-matroska') return 'mkv';
  return 'mp4';
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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
  return { ok: res.ok, status: res.status, data, text, supabaseUrl: config.url };
}

async function getChannels(env, username) {
  const key = getSupabaseConfig(env).key;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
  const publicRes = await supabaseFetch(env, '/rest/v1/tv_channels?select=*&visibility=eq.public&order=is_featured.desc,created_at.desc&limit=100', { headers });
  const mineRes = username
    ? await supabaseFetch(env, `/rest/v1/tv_channels?select=*&username=eq.${encodeURIComponent(username)}&order=created_at.desc&limit=100`, { headers })
    : { data: [] };
  return {
    public: Array.isArray(publicRes.data) ? publicRes.data : [],
    mine: Array.isArray(mineRes.data) ? mineRes.data : [],
  };
}

async function getUploads(env, username) {
  const key = getSupabaseConfig(env).key;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
  const publicRes = await supabaseFetch(env, '/rest/v1/tv_uploads?select=*&visibility=eq.public&status=eq.published&order=created_at.desc&limit=30', { headers });
  const mineRes = username
    ? await supabaseFetch(env, `/rest/v1/tv_uploads?select=*&username=eq.${encodeURIComponent(username)}&order=created_at.desc&limit=30`, { headers })
    : { data: [] };
  return {
    public: Array.isArray(publicRes.data) ? publicRes.data : [],
    mine: Array.isArray(mineRes.data) ? mineRes.data : [],
  };
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
    const username = cleanUsername(user?.username);
    const channels = await getChannels(context.env, username);
    const uploads = await getUploads(context.env, username);

    return json({
      owner: ownerChannel(),
      channels: channels.public,
      mine: channels.mine,
      uploads: uploads.public,
      mine_uploads: uploads.mine,
      session: user ? {
        username: user.username || '',
        display: user.display || user.display_name || user.username || '',
        plan: user.plan || 'free',
        status: user.status || 'free',
      } : null,
    });
  } catch (err) {
    return json({ ok: false, error: err?.message || 'Could not load TV network.' }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const user = getUserFromRequest(context);
    if (!user) return json({ ok: false, error: 'Sign in first.' }, 401);

    const body = await context.request.json();
    const username = cleanUsername(user.username);
    const channelSlug = cleanText(body.channel_slug || body.channelSlug || '', 80).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    const title = cleanText(body.title, 120);
    const description = cleanText(body.description, 500);
    const visibility = String(body.visibility || 'public').toLowerCase() === 'private' ? 'private' : 'public';
    const fileName = cleanText(body.file_name || 'clip.mp4', 120);
    const fileType = String(body.file_type || 'video/mp4').toLowerCase();
    const sourceUrl = cleanText(body.source_url || body.sourceUrl || '', 500);

    if (!channelSlug) return json({ ok: false, error: 'Choose a channel.' }, 400);
    if (!title) return json({ ok: false, error: 'Enter a title.' }, 400);
    if (!sourceUrl && !body.file_b64) return json({ ok: false, error: 'Select a file or provide a source URL.' }, 400);

    const channelRes = await supabaseFetch(context.env, `/rest/v1/tv_channels?select=*&channel_slug=eq.${encodeURIComponent(channelSlug)}&limit=1`, {
      headers: {
        apikey: getSupabaseConfig(context.env).key,
        Authorization: `Bearer ${getSupabaseConfig(context.env).key}`,
      },
    });
    const channel = Array.isArray(channelRes.data) ? channelRes.data[0] : null;
    if (!channel && channelSlug !== 'faceless-animal-studios') {
      return json({ ok: false, error: 'Channel not found.' }, 404);
    }
    if (channel && cleanUsername(channel.username) !== username) {
      return json({ ok: false, error: 'You can only upload to your own channel.' }, 403);
    }

    let storagePath = null;
    let publicSrc = sourceUrl || null;

    if (body.file_b64) {
      const bytes = base64ToBytes(body.file_b64);
      if (bytes.byteLength > MAX_BYTES) {
        return json({ ok: false, error: 'File too large. Max upload size is 45MB.' }, 400);
      }

      const ext = extensionFor(fileName, fileType);
      const safeName = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'clip';
      storagePath = `tv/${username}/${Date.now()}-${safeName}.${ext}`;

      const upload = await supabaseFetch(context.env, `/storage/v1/object/tv-media/${storagePath}`, {
        method: 'POST',
        headers: {
          'Content-Type': fileType,
          'x-upsert': 'false',
        },
        body: bytes,
      });

      if (!upload.ok) {
        return json({ ok: false, error: upload.data?.message || upload.text || 'Storage upload failed.' }, 500);
      }

      publicSrc = `${getSupabaseConfig(context.env).url}/storage/v1/object/public/tv-media/${storagePath}`;
    }

    const insertRow = {
      account_id: user.account_id || null,
      username,
      channel_id: channel?.id || null,
      channel_slug: channelSlug,
      title,
      description,
      visibility,
      status: 'published',
      file_name: fileName,
      file_type: fileType,
      file_size_bytes: body.file_size_bytes || null,
      storage_path: storagePath,
      source_url: publicSrc,
      thumb_url: body.thumb_url || null,
      external_video_id: body.external_video_id || null,
      external_video_url: publicSrc,
      duration_seconds: body.duration_seconds || null,
      is_published: true,
      publish_at: new Date().toISOString(),
    };

    const insert = await supabaseFetch(context.env, '/rest/v1/tv_uploads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify([insertRow]),
    });

    if (!insert.ok) {
      return json({ ok: false, error: insert.data?.message || insert.text || 'Could not save upload.' }, 500);
    }

    return json({ ok: true, upload: Array.isArray(insert.data) ? insert.data[0] : insert.data });
  } catch (err) {
    return json({ ok: false, error: err?.message || 'Upload failed.' }, 500);
  }
}
