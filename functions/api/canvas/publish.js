const MAX_BYTES = 50 * 1024 * 1024;

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function getUser(request) {
  const value = request.headers.get('x-fas-user');
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getSupabaseConfig(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Publishing service is not configured.');
  return { url: String(url).replace(/\/+$/, ''), key };
}

async function supabaseFetch(env, path, options = {}) {
  const config = getSupabaseConfig(env);
  const headers = new Headers(options.headers || {});
  headers.set('apikey', config.key);
  headers.set('Authorization', `Bearer ${config.key}`);
  const response = await fetch(`${config.url}${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: response.ok, status: response.status, data, text, url: config.url };
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function extensionFor(fileName, fileType) {
  const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  if (match) return match[1] === 'jpeg' ? 'jpg' : match[1];
  const extensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  };
  return extensions[String(fileType || '').toLowerCase()] || 'bin';
}

async function createBoardPost(env, username, bodyText, mediaUrl, category) {
  const headers = {
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  const signal = await supabaseFetch(env, '/rest/v1/signal_posts?select=id,author_username,body_text,category,media_url,created_at', {
    method: 'POST',
    headers,
    body: JSON.stringify([{
      author_username: username,
      post_type: category,
      category,
      body_text: bodyText,
      media_url: mediaUrl,
      moderation_state: 'approved',
      visibility: 'public',
    }]),
  });
  if (signal.ok) return Array.isArray(signal.data) ? signal.data[0] : signal.data;

  const board = await supabaseFetch(env, '/rest/v1/board_posts?select=id,username,post_text,category,image_url,created_at', {
    method: 'POST',
    headers,
    body: JSON.stringify([{
      username,
      post_text: bodyText,
      category,
      image_url: mediaUrl,
      is_approved: true,
      visibility_status: 'visible',
    }]),
  });
  if (!board.ok) {
    throw new Error(board.data?.message || signal.data?.message || 'Community Board post failed.');
  }
  return Array.isArray(board.data) ? board.data[0] : board.data;
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-fas-user',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function onRequestPost(context) {
  let storagePath = '';
  try {
    const user = getUser(context.request);
    const username = cleanUsername(user?.username);
    if (!username) return json({ ok: false, error: 'Sign in before publishing.' }, 401);

    const body = await context.request.json();
    const title = cleanText(body.title, 120) || 'Canvas edit';
    const caption = cleanText(body.caption, 800) || title;
    const fileName = cleanText(body.file_name, 120) || 'canvas-edit.webm';
    const fileType = cleanText(body.file_type, 80) || 'video/webm';
    const fileBase64 = String(body.file_b64 || '');
    if (!fileBase64) return json({ ok: false, error: 'Render the project before publishing.' }, 400);
    if (fileBase64.length > Math.ceil(MAX_BYTES * 4 / 3) + 16) {
      return json({ ok: false, error: 'Published files are limited to 50MB.' }, 413);
    }

    const bytes = base64ToBytes(fileBase64);
    if (!bytes.byteLength) return json({ ok: false, error: 'The rendered file was empty.' }, 400);
    if (bytes.byteLength > MAX_BYTES) return json({ ok: false, error: 'Published files are limited to 50MB.' }, 413);

    const category = fileType.startsWith('image/') ? 'picture' : 'video';
    const extension = extensionFor(fileName, fileType);
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'canvas-edit';
    storagePath = `board/${username}/${Date.now()}-${safeTitle}.${extension}`;
    const upload = await supabaseFetch(context.env, `/storage/v1/object/tv-media/${storagePath}`, {
      method: 'POST',
      headers: {
        'Content-Type': fileType,
        'x-upsert': 'false',
      },
      body: bytes,
    });
    if (!upload.ok) {
      return json({ ok: false, error: upload.data?.message || upload.text || 'Media upload failed.' }, 500);
    }

    const mediaUrl = `${getSupabaseConfig(context.env).url}/storage/v1/object/public/tv-media/${storagePath}`;
    let post;
    try {
      post = await createBoardPost(context.env, username, caption, mediaUrl, category);
    } catch (error) {
      await supabaseFetch(context.env, `/storage/v1/object/tv-media/${storagePath}`, { method: 'DELETE' });
      storagePath = '';
      throw error;
    }

    return json({ ok: true, post, media_url: mediaUrl });
  } catch (error) {
    return json({ ok: false, error: error?.message || 'Publishing failed.' }, 500);
  }
}
