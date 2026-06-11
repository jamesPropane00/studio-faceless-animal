const MAX_BYTES = 30 * 1024 * 1024;
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
const BLOCKED_STATUSES = new Set(['suspended', 'banned', 'limited']);
const PAID_PLANS = new Set(['access', 'starter', 'pro', 'premium', 'paid']);

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
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function supabaseFetch(env, path, options = {}) {
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) {
    return { ok: false, status: 500, data: { error: 'Missing Supabase server environment variables.' } };
  }

  const headers = new Headers(options.headers || {});
  headers.set('apikey', key);
  headers.set('Authorization', `Bearer ${key}`);

  const res = await fetch(`${supabaseUrl}${path}`, { ...options, headers });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data, text, supabaseUrl };
}

async function getMember(env, username, ph) {
  const query = [
    'select=id,username,display_name,plan_type,member_status,password_hash',
    `username=eq.${encodeURIComponent(username)}`,
    `password_hash=eq.${encodeURIComponent(ph)}`,
    'limit=1',
  ].join('&');
  const res = await supabaseFetch(env, `/rest/v1/member_accounts?${query}`);
  if (!res.ok) return { error: 'Could not verify your member account.' };
  const row = Array.isArray(res.data) ? res.data[0] : null;
  if (!row) return { error: 'Your session has expired. Please sign in again.' };
  if (BLOCKED_STATUSES.has(String(row.member_status || '').toLowerCase())) {
    return { error: 'This account is not currently allowed to upload tracks.' };
  }
  return { member: row };
}

function isFreePlan(member) {
  const plan = String(member?.plan_type || 'free').toLowerCase();
  return !PAID_PLANS.has(plan);
}

async function countMonthlyUploads(env, username) {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  const query = [
    'select=id',
    `uploaded_by=eq.${encodeURIComponent(username)}`,
    `created_at=gte.${encodeURIComponent(since.toISOString())}`,
  ].join('&');
  const res = await supabaseFetch(env, `/rest/v1/radio_tracks?${query}`, {
    headers: { Prefer: 'count=exact' },
  });
  if (!res.ok) return null;
  return Array.isArray(res.data) ? res.data.length : null;
}

async function insertTrack(env, row) {
  const rich = await supabaseFetch(env, '/rest/v1/radio_tracks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([row]),
  });
  if (rich.ok) return rich;

  const minimal = {
    title: row.title,
    artist: row.artist,
    src: row.src,
    storage_path: row.storage_path,
    channel: row.channel,
    is_active: row.is_active,
    play_count: 0,
    upvotes: 0,
  };
  return supabaseFetch(env, '/rest/v1/radio_tracks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([minimal]),
  });
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
    const fileType = String(body.file_type || 'audio/mpeg').toLowerCase();
    const fileName = String(body.file_name || 'track.mp3');

    if (!username || !ph) return json({ ok: false, error: 'Please sign in before uploading.' }, 401);
    if (!title) return json({ ok: false, error: 'Enter a track title.' }, 400);
    if (!body.file_b64) return json({ ok: false, error: 'Select an audio file to upload.' }, 400);
    if (!ALLOWED_TYPES.has(fileType) && !fileType.startsWith('audio/')) {
      return json({ ok: false, error: 'Only audio files are supported.' }, 400);
    }

    const memberResult = await getMember(context.env, username, ph);
    if (memberResult.error) return json({ ok: false, error: memberResult.error }, 403);

    const monthlyCount = isFreePlan(memberResult.member)
      ? await countMonthlyUploads(context.env, username)
      : null;
    if (isFreePlan(memberResult.member) && monthlyCount !== null && monthlyCount >= 2) {
      return json({ ok: false, error: 'You have already used your 2 uploads for this month.', remaining: 0 }, 429);
    }

    const bytes = base64ToBytes(body.file_b64);
    if (bytes.byteLength > MAX_BYTES) return json({ ok: false, error: 'File too large. Max upload size is 30MB.' }, 400);

    const ext = extensionFor(fileName, fileType);
    const safeName = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'track';
    const storagePath = `ch1/member-${username}-${Date.now()}-${safeName}.${ext}`;

    const upload = await supabaseFetch(context.env, `/storage/v1/object/radio/${storagePath}`, {
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

    const supabaseUrl = String(context.env.SUPABASE_URL || upload.supabaseUrl || '').replace(/\/+$/, '');
    const publicSrc = `${supabaseUrl}/storage/v1/object/public/radio/${storagePath}`;
    const trackRow = {
      title,
      artist: username,
      src: publicSrc,
      storage_path: storagePath,
      channel: 1,
      is_active: true,
      play_count: 0,
      upvotes: 0,
      uploaded_by: username,
      uploaded_at: new Date().toISOString(),
    };

    const insert = await insertTrack(context.env, trackRow);
    if (!insert.ok) {
      return json({ ok: false, error: insert.data?.message || insert.text || 'Track saved to storage, but database insert failed.' }, 500);
    }

    const used = monthlyCount === null ? null : monthlyCount + 1;
    const remaining = used === null ? null : Math.max(0, 2 - used);
    return json({
      ok: true,
      track: Array.isArray(insert.data) ? insert.data[0] : insert.data,
      storage_path: storagePath,
      remaining,
      remaining_this_month: remaining,
    });
  } catch (err) {
    return json({ ok: false, error: err?.message || 'Upload failed.' }, 500);
  }
}
