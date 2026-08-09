import { createClient } from '@supabase/supabase-js';

const ADMINS = new Set(['jdot00', 'jamespropane00']);
const SELLER_STATES = new Set(['pending', 'approved', 'rejected', 'suspended', 'closed']);
const SELL_STATES = new Set(['new', 'reviewing', 'needs_info', 'accepted', 'declined', 'converted']);
const REQUEST_STATES = new Set(['new', 'open', 'matched', 'fulfilled', 'closed', 'rejected']);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function clean(value, limit = 255) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyAdmin(admin, username, token) {
  const normalized = clean(username, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!ADMINS.has(normalized) || !token) return null;
  const tokenHash = await sha256(token);
  const { data, error } = await admin.from('shop_platform_sessions').select('id,username')
    .eq('username', normalized).eq('token_hash', tokenHash)
    .gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error || !data) return null;
  await admin.from('shop_platform_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return data.username;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Market administration is not configured.' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const reviewer = await verifyAdmin(admin, body.username, clean(body.token, 255));
  if (!reviewer) return json({ error: 'Your Market admin session is not valid.' }, 401);
  const action = clean(body.action, 40);

  if (action === 'list') {
    const [sellers, sellQueue, buyerQueue] = await Promise.all([
      admin.from('market_seller_accounts').select('*').order('created_at', { ascending: false }).limit(300),
      admin.from('market_sell_submissions').select('*,market_sell_images(id,storage_path,sort_order),market_seller_accounts(seller_code,seller_handle,status)')
        .order('created_at', { ascending: false }).limit(300),
      admin.from('market_buyer_requests').select('*').order('created_at', { ascending: false }).limit(300),
    ]);
    const error = sellers.error || sellQueue.error || buyerQueue.error;
    if (error) {
      if (error.code === '42P01') return json({ error: 'Run migration 049 before opening the Market queue.' }, 503);
      return json({ error: 'The Market review queue could not be loaded.' }, 500);
    }
    const items = [];
    for (const submission of sellQueue.data || []) {
      const images = [];
      for (const image of (submission.market_sell_images || []).sort((a, b) => a.sort_order - b.sort_order)) {
        const { data } = await admin.storage.from('market-intake').createSignedUrl(image.storage_path, 900);
        if (data?.signedUrl) images.push({ id: image.id, url: data.signedUrl, sort_order: image.sort_order });
      }
      items.push({ ...submission, market_sell_images: images });
    }
    return json({ sellers: sellers.data || [], sell_submissions: items, buyer_requests: buyerQueue.data || [] });
  }

  if (action === 'seller_status') {
    const status = clean(body.status, 30);
    const id = clean(body.id, 60);
    if (!SELLER_STATES.has(status) || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Invalid seller review update.' }, 400);
    const { error } = await admin.from('market_seller_accounts').update({
      status,
      reviewed_by: reviewer,
      reviewed_at: new Date().toISOString(),
      review_notes: clean(body.review_notes, 2000) || null,
    }).eq('id', id);
    if (error) return json({ error: 'Seller status could not be updated.' }, 500);
    return json({ ok: true });
  }

  if (action === 'sell_status' || action === 'request_status') {
    const sellAction = action === 'sell_status';
    const allowed = sellAction ? SELL_STATES : REQUEST_STATES;
    const table = sellAction ? 'market_sell_submissions' : 'market_buyer_requests';
    const status = clean(body.status, 30);
    const id = clean(body.id, 60);
    if (!allowed.has(status) || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Invalid queue update.' }, 400);
    const { error } = await admin.from(table).update({
      status,
      admin_notes: clean(body.admin_notes, 4000) || null,
    }).eq('id', id);
    if (error) return json({ error: 'Queue status could not be updated.' }, 500);
    return json({ ok: true });
  }

  return json({ error: 'Unknown Market admin action.' }, 400);
}

export async function onRequestGet() {
  return json({ error: 'Method not allowed.' }, 405);
}
