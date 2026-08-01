const ADMINS = new Set(['jdot00', 'jamespropane00']);

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function clean(value, limit = 500) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

function slugify(value) {
  return clean(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function config(env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service credentials.');
  return { url, key };
}

async function db(env, path, options = {}) {
  const { url, key } = config(env);
  const headers = new Headers(options.headers || {});
  headers.set('apikey', key);
  headers.set('Authorization', `Bearer ${key}`);
  const response = await fetch(`${url}${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || text || 'Database request failed.');
  return data;
}

function requestUser(request) {
  try { return JSON.parse(request.headers.get('x-fas-user') || 'null'); } catch { return null; }
}

async function requireAdmin(context) {
  const user = requestUser(context.request);
  const username = clean(user?.username, 40).toLowerCase();
  const ph = clean(user?.ph || user?.password_hash, 250);
  if (!ADMINS.has(username) || !ph) throw Object.assign(new Error('Admin access only.'), { status: 403 });
  const rows = await db(context.env, `/rest/v1/member_accounts?select=id&username=eq.${encodeURIComponent(username)}&password_hash=eq.${encodeURIComponent(ph)}&limit=1`);
  if (!Array.isArray(rows) || !rows.length) throw Object.assign(new Error('Please sign in again.'), { status: 401 });
  return username;
}

export async function onRequestGet(context) {
  try {
    const admin = new URL(context.request.url).searchParams.get('admin') === '1';
    if (admin) await requireAdmin(context);
    const characterFilter = admin ? '' : '&published=eq.true';
    const mediaFilter = admin ? '' : '&published=eq.true';
    const characters = await db(context.env, `/rest/v1/neon_dreams_characters?select=*&order=sort_order.asc,created_at.asc${characterFilter}`);
    const media = await db(context.env, `/rest/v1/neon_dreams_media?select=*&order=sort_order.asc,created_at.asc${mediaFilter}`);
    return json({ ok: true, characters: characters.map((character) => ({
      ...character,
      media: media.filter((item) => item.character_id === character.id),
    })) });
  } catch (error) {
    return json({ ok: false, error: error.message }, error.status || 500);
  }
}

export async function onRequestPost(context) {
  try {
    await requireAdmin(context);
    const body = await context.request.json();
    const action = clean(body.action, 30);
    if (action === 'save') {
      const id = clean(body.id, 80);
      const name = clean(body.name, 100);
      if (!name) return json({ ok: false, error: 'Character name is required.' }, 400);
      const record = {
        slug: slugify(body.slug || name), name,
        subtitle: clean(body.subtitle, 140) || null,
        description: clean(body.description, 1200) || null,
        accent_color: /^#[0-9a-f]{6}$/i.test(body.accent_color) ? body.accent_color : '#ec4899',
        cover_url: clean(body.cover_url, 1000) || null,
        sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
        published: body.published !== false,
        updated_at: new Date().toISOString(),
      };
      const path = id
        ? `/rest/v1/neon_dreams_characters?id=eq.${encodeURIComponent(id)}&select=*`
        : '/rest/v1/neon_dreams_characters?select=*';
      const rows = await db(context.env, path, {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(id ? record : [record]),
      });
      return json({ ok: true, character: Array.isArray(rows) ? rows[0] : rows });
    }
    if (action === 'delete') {
      const id = clean(body.id, 80);
      if (!id) return json({ ok: false, error: 'Missing character id.' }, 400);
      const media = await db(context.env, `/rest/v1/neon_dreams_media?select=storage_path&character_id=eq.${encodeURIComponent(id)}`);
      for (const item of media || []) {
        await db(context.env, `/storage/v1/object/neon-dreams-media/${item.storage_path}`, { method: 'DELETE' });
      }
      await db(context.env, `/rest/v1/neon_dreams_characters?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return json({ ok: true });
    }
    return json({ ok: false, error: 'Unknown action.' }, 400);
  } catch (error) {
    return json({ ok: false, error: error.message }, error.status || 500);
  }
}
