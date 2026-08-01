import { onRequestGet as getCharacters } from './characters.js';

const ADMINS = new Set(['jdot00', 'jamespropane00']);
const MAX_BYTES = 100 * 1024 * 1024;

function json(body, status = 200) { return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } }); }
function clean(value, limit = 500) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit); }
function config(env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service credentials.');
  return { url, key };
}
async function call(env, path, options = {}) {
  const { url, key } = config(env);
  const headers = new Headers(options.headers || {});
  headers.set('apikey', key); headers.set('Authorization', `Bearer ${key}`);
  const response = await fetch(`${url}${path}`, { ...options, headers });
  const text = await response.text(); let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || text || 'Storage request failed.');
  return data;
}
async function admin(context) {
  let user = null;
  try { user = JSON.parse(context.request.headers.get('x-fas-user') || 'null'); } catch {}
  const username = clean(user?.username, 40).toLowerCase();
  const ph = clean(user?.ph || user?.password_hash, 250);
  if (!ADMINS.has(username) || !ph) throw Object.assign(new Error('Admin access only.'), { status: 403 });
  const rows = await call(context.env, `/rest/v1/member_accounts?select=id&username=eq.${encodeURIComponent(username)}&password_hash=eq.${encodeURIComponent(ph)}&limit=1`);
  if (!Array.isArray(rows) || !rows.length) throw Object.assign(new Error('Please sign in again.'), { status: 401 });
}
function extension(file) {
  const match = String(file.name || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  return match ? match[1] : file.type.startsWith('video/') ? 'mp4' : 'jpg';
}

export const onRequestGet = getCharacters;

export async function onRequestPost(context) {
  try {
    await admin(context);
    const type = String(context.request.headers.get('content-type') || '');
    if (type.includes('application/json')) {
      const body = await context.request.json();
      if (body.action !== 'delete') return json({ ok: false, error: 'Unknown action.' }, 400);
      const rows = await call(context.env, `/rest/v1/neon_dreams_media?select=storage_path&id=eq.${encodeURIComponent(body.id)}&limit=1`);
      if (rows?.[0]?.storage_path) await call(context.env, `/storage/v1/object/neon-dreams-media/${rows[0].storage_path}`, { method: 'DELETE' });
      await call(context.env, `/rest/v1/neon_dreams_media?id=eq.${encodeURIComponent(body.id)}`, { method: 'DELETE' });
      return json({ ok: true });
    }
    const form = await context.request.formData();
    const file = form.get('file');
    const characterId = clean(form.get('character_id'), 80);
    if (!file?.size || !characterId) return json({ ok: false, error: 'Choose a character and file.' }, 400);
    if (file.size > MAX_BYTES) return json({ ok: false, error: 'Files must be 100MB or smaller.' }, 413);
    const mediaType = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : '';
    if (!mediaType) return json({ ok: false, error: 'Upload an image or video file.' }, 415);
    const path = `${characterId}/${Date.now()}-${crypto.randomUUID()}.${extension(file)}`;
    const { url } = config(context.env);
    await call(context.env, `/storage/v1/object/neon-dreams-media/${path}`, {
      method: 'POST', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: await file.arrayBuffer(),
    });
    const publicUrl = `${url}/storage/v1/object/public/neon-dreams-media/${path}`;
    const rows = await call(context.env, '/rest/v1/neon_dreams_media?select=*', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify([{
        character_id: characterId, media_type: mediaType,
        title: clean(form.get('title'), 120) || null,
        caption: clean(form.get('caption'), 500) || null,
        public_url: publicUrl, storage_path: path,
        sort_order: Number(form.get('sort_order') || 0), published: form.get('published') !== 'false',
      }]),
    });
    return json({ ok: true, media: rows?.[0] });
  } catch (error) {
    return json({ ok: false, error: error.message }, error.status || 500);
  }
}

