const MAX_BYTES = 50 * 1024 * 1024;
const RADIO_ADMINS = new Set(['jamespropane00', 'arianamnm']);
const ALLOWED_TYPES = new Set([
  'audio/aac',
  'audio/aiff',
  'audio/flac',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/x-aiff',
  'audio/x-m4a',
]);

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

function cleanTitle(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

function extensionFor(fileName, fileType) {
  const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  if (match) return match[1] === 'jpeg' ? 'jpg' : match[1];
  if (fileType === 'audio/mp4' || fileType === 'audio/x-m4a') return 'm4a';
  if (fileType === 'audio/aac') return 'aac';
  if (fileType === 'audio/ogg') return 'ogg';
  if (fileType === 'audio/wav') return 'wav';
  if (fileType === 'audio/flac') return 'flac';
  return 'mp3';
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function supabaseFetch(env, path, options = {}) {
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) {
    return { ok: false, status: 500, data: { message: 'Missing Supabase service credentials.' }, supabaseUrl };
  }

  const headers = new Headers(options.headers || {});
  headers.set('apikey', key);
  headers.set('Authorization', `Bearer ${key}`);
  const response = await fetch(`${supabaseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data, text, supabaseUrl };
}

async function verifyAdmin(env, username, ph) {
  if (!RADIO_ADMINS.has(username)) return { error: 'Admin access only.', status: 403 };
  const query = [
    'select=id,username,display_name',
    `username=eq.${encodeURIComponent(username)}`,
    `password_hash=eq.${encodeURIComponent(ph)}`,
    'limit=1',
  ].join('&');
  const result = await supabaseFetch(env, `/rest/v1/member_accounts?${query}`);
  if (!result.ok) return { error: 'Could not verify the admin account.', status: 500 };
  const member = Array.isArray(result.data) ? result.data[0] : null;
  return member ? { member } : { error: 'Authentication failed. Please sign in again.', status: 401 };
}

async function insertTrack(env, row) {
  const result = await supabaseFetch(env, '/rest/v1/radio_tracks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify([row]),
  });
  if (result.ok) return result;

  const minimal = {
    title: row.title,
    src: row.src,
    storage_path: row.storage_path,
    channel: row.channel,
    is_active: true,
    play_count: 0,
    upvotes: 0,
  };
  return supabaseFetch(env, '/rest/v1/radio_tracks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify([minimal]),
  });
}

async function createDirectoryPost(env, username, title, channel, publicSrc) {
  const channelLabel = channel === 4 ? 'Station 4 · Lounge' : channel === 5 ? 'Station 5 · The Vault' : 'Station 1 · Original';
  const bodyText = `New radio upload: "${title}" is now live on ${channelLabel}.`;
  const signal = await supabaseFetch(env, '/rest/v1/signal_posts?select=id,author_username,body_text,category,media_url,created_at', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify([{
      author_username: username,
      post_type: 'music',
      category: 'music',
      body_text: bodyText,
      media_url: publicSrc,
      moderation_state: 'approved',
      visibility: 'public',
    }]),
  });
  if (signal.ok) return { ok: true, post: Array.isArray(signal.data) ? signal.data[0] : signal.data };

  const board = await supabaseFetch(env, '/rest/v1/board_posts?select=id,username,post_text,category,image_url,created_at', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify([{
      username,
      post_text: bodyText,
      category: 'music',
      image_url: publicSrc,
      is_approved: true,
      visibility_status: 'visible',
    }]),
  });
  return {
    ok: board.ok,
    post: board.ok ? (Array.isArray(board.data) ? board.data[0] : board.data) : null,
    error: board.ok ? null : (board.data?.message || signal.data?.message || 'Directory post failed.'),
  };
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
    const title = cleanTitle(body.title);
    const channel = [1, 4, 5].includes(Number(body.channel)) ? Number(body.channel) : 1;
    const fileType = String(body.file_type || 'audio/mpeg').toLowerCase();
    const fileName = String(body.file_name || 'track.mp3');

    if (!username || !ph) return json({ ok: false, error: 'Please sign in before uploading.' }, 401);
    if (!title) return json({ ok: false, error: 'Track title is required.' }, 400);
    if (!body.file_b64) return json({ ok: false, error: 'Choose an audio file to upload.' }, 400);
    if (!ALLOWED_TYPES.has(fileType) && !fileType.startsWith('audio/')) {
      return json({ ok: false, error: 'Only audio files are supported.' }, 400);
    }

    const admin = await verifyAdmin(context.env, username, ph);
    if (admin.error) return json({ ok: false, error: admin.error }, admin.status);

    const bytes = base64ToBytes(body.file_b64);
    if (!bytes.byteLength) return json({ ok: false, error: 'The selected audio file is empty.' }, 400);
    if (bytes.byteLength > MAX_BYTES) return json({ ok: false, error: 'File too large. Max upload size is 50MB.' }, 413);

    const ext = extensionFor(fileName, fileType);
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'track';
    const storagePath = `ch${channel}/admin-${username}-${Date.now()}-${safeTitle}.${ext}`;
    const upload = await supabaseFetch(context.env, `/storage/v1/object/radio/${storagePath}`, {
      method: 'POST',
      headers: { 'Content-Type': fileType, 'x-upsert': 'false' },
      body: bytes,
    });
    if (!upload.ok) {
      return json({ ok: false, error: upload.data?.message || upload.text || 'Storage upload failed.' }, 500);
    }

    const publicSrc = `${upload.supabaseUrl}/storage/v1/object/public/radio/${storagePath}`;
    const trackRow = {
      title,
      src: publicSrc,
      storage_path: storagePath,
      channel,
      is_active: true,
      play_count: 0,
      upvotes: 0,
      uploaded_by: username,
      uploaded_at: new Date().toISOString(),
    };
    const insert = await insertTrack(context.env, trackRow);
    if (!insert.ok) {
      await supabaseFetch(context.env, `/storage/v1/object/radio/${storagePath}`, { method: 'DELETE' });
      return json({ ok: false, error: insert.data?.message || insert.text || 'Track database insert failed.' }, 500);
    }

    const directoryPost = await createDirectoryPost(context.env, username, title, channel, publicSrc);
    const track = Array.isArray(insert.data) ? insert.data[0] : insert.data;
    return json({
      ok: true,
      track,
      channel,
      storage_path: storagePath,
      directory_post_created: directoryPost.ok,
      directory_post: directoryPost.post || null,
      warning: directoryPost.ok ? null : directoryPost.error,
    });
  } catch (error) {
    return json({ ok: false, error: error?.message || 'Upload failed.' }, 500);
  }
}
