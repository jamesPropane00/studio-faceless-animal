import { createClient } from '@supabase/supabase-js';

const ADMINS = new Set(['jdot00', 'jamespropane00']);
const SELLER_STATES = new Set(['pending', 'approved', 'rejected', 'suspended', 'closed']);
const SELL_STATES = new Set(['new', 'reviewing', 'needs_info', 'accepted', 'declined', 'converted']);
const REQUEST_STATES = new Set(['new', 'open', 'matched', 'fulfilled', 'closed', 'rejected']);
const LOT_STATES = new Set(['draft', 'published', 'paused']);
const LOT_TIERS = new Set(['starter', 'reseller', 'business', 'custom']);
const FREIGHT_STATES = new Set(['quote_required', 'pending', 'confirmed']);

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

  if (action === 'list_lots') {
    const [lots, products] = await Promise.all([
      admin.from('wholesale_lots').select('*,products(id,title,slug,sku,price_cents,shipping_price_cents,quantity,published,state,product_kind,fulfillment_provider,fulfillment_mode,ships_from,delivery_min_business_days,delivery_max_business_days,product_images(public_url,sort_order),product_sources(supplier_name,supplier_product_url,supplier_product_id,supplier_variant,supplier_variant_id,supplier_sku,supplier_cost_cents))').order('updated_at', { ascending: false }),
      admin.from('products').select('id,title,slug,sku,price_cents,shipping_price_cents,quantity,published,state,product_kind,fulfillment_provider,fulfillment_mode,ships_from,delivery_min_business_days,delivery_max_business_days,product_images(public_url,sort_order),product_sources(supplier_name,supplier_product_url,supplier_product_id,supplier_variant,supplier_variant_id,supplier_sku,supplier_cost_cents)').eq('product_kind', 'physical').eq('fulfillment_mode', 'dropship').order('updated_at', { ascending: false }),
    ]);
    const error = lots.error || products.error;
    if (error) {
      if (error.code === '42P01') return json({ error: 'Run migration 050 before managing reseller lots.' }, 503);
      return json({ error: 'Reseller lots could not be loaded.' }, 500);
    }
    return json({ lots: lots.data || [], products: products.data || [] });
  }

  if (action === 'save_lot') {
    const productId = clean(body.product_id, 60);
    const status = clean(body.status, 20);
    const tier = clean(body.lot_tier, 20);
    const freightStatus = clean(body.freight_status, 30);
    const unitCount = Number(body.unit_count);
    const landedCost = body.landed_cost_cents === null || body.landed_cost_cents === '' ? null : Number(body.landed_cost_cents);
    const feeBufferBps = Number(body.fee_buffer_bps ?? 500);
    const problemBuffer = Number(body.problem_buffer_cents ?? 0);
    const retailMin = Number(body.suggested_retail_min_cents);
    const retailMax = Number(body.suggested_retail_max_cents);
    if (!/^[0-9a-f-]{36}$/i.test(productId) || !LOT_STATES.has(status) || !LOT_TIERS.has(tier) || !FREIGHT_STATES.has(freightStatus)) {
      return json({ error: 'Choose a valid product, lot status, tier, and freight status.' }, 400);
    }
    if (!Number.isInteger(unitCount) || unitCount < 2 || unitCount > 100000 ||
        !Number.isInteger(retailMin) || !Number.isInteger(retailMax) || retailMin < 1 || retailMax < retailMin ||
        !Number.isInteger(feeBufferBps) || feeBufferBps < 0 || feeBufferBps > 3000 ||
        !Number.isInteger(problemBuffer) || problemBuffer < 0 ||
        (landedCost !== null && (!Number.isInteger(landedCost) || landedCost < 1))) {
      return json({ error: 'Check the lot quantity, costs, buffers, and suggested retail range.' }, 400);
    }
    const { data: product, error: productError } = await admin.from('products')
      .select('id,title,slug,price_cents,shipping_price_cents,quantity,published,state,product_kind,fulfillment_provider,fulfillment_mode,ships_from,delivery_min_business_days,delivery_max_business_days,product_sources(supplier_name,supplier_product_url,supplier_variant_id,supplier_sku)')
      .eq('id', productId).single();
    if (productError || !product) return json({ error: 'The selected product no longer exists.' }, 404);
    if (product.product_kind !== 'physical' || product.fulfillment_provider !== 'internal' || product.fulfillment_mode !== 'dropship') {
      return json({ error: 'A reseller lot must use an internal physical dropship product.' }, 409);
    }
    const source = Array.isArray(product.product_sources) ? product.product_sources[0] : product.product_sources;
    const buyerTotal = Number(product.price_cents) + Number(product.shipping_price_cents || 0);
    const bufferedSpread = landedCost === null ? null : buyerTotal - landedCost - Math.round(buyerTotal * feeBufferBps / 10000) - problemBuffer;
    const exactCJ = source?.supplier_name !== 'CJdropshipping' || (
      source?.supplier_variant_id && source?.supplier_sku &&
      !/^PENDING(?:-|$)/i.test(source.supplier_variant_id) && !/^PENDING(?:-|$)/i.test(source.supplier_sku)
    );
    if (status === 'published' && (!product.published || product.quantity < 1 || !product.slug || !source?.supplier_product_url || !exactCJ || freightStatus !== 'confirmed' || landedCost === null || bufferedSpread <= 0 || unitCount * retailMin <= buyerTotal)) {
      return json({ error: 'Before publishing: publish the product, keep a lot available, save the supplier URL and exact CJ mapping, confirm full freight, preserve a positive buffered spread, and leave the reseller credible room above their delivered cost.' }, 409);
    }
    const record = {
      product_id: productId,
      status,
      lot_name: clean(body.lot_name, 180),
      unit_count: unitCount,
      lot_tier: tier,
      landed_cost_cents: landedCost,
      fee_buffer_bps: feeBufferBps,
      problem_buffer_cents: problemBuffer,
      suggested_retail_min_cents: retailMin,
      suggested_retail_max_cents: retailMax,
      freight_status: freightStatus,
      freight_checked_at: freightStatus === 'confirmed' ? new Date().toISOString() : null,
      warehouse_country: clean(body.warehouse_country, 80),
      public_supplier_label: clean(body.public_supplier_label, 80),
      resale_channels: Array.isArray(body.resale_channels) ? body.resale_channels.map((item) => clean(item, 60)).filter(Boolean).slice(0, 12) : [],
      included_resources: Array.isArray(body.included_resources) ? body.included_resources.map((item) => clean(item, 80)).filter(Boolean).slice(0, 12) : [],
      opportunity_summary: clean(body.opportunity_summary, 2000) || null,
      admin_notes: clean(body.admin_notes, 4000) || null,
    };
    if (record.lot_name.length < 3 || record.warehouse_country.length < 2 || record.public_supplier_label.length < 2) {
      return json({ error: 'Enter a lot name, warehouse country, and public supplier label.' }, 400);
    }
    const { data, error } = await admin.from('wholesale_lots').upsert(record, { onConflict: 'product_id' }).select('id,status').single();
    if (error) {
      if (error.code === '42P01') return json({ error: 'Run migration 050 before saving reseller lots.' }, 503);
      return json({ error: error.message || 'The reseller lot could not be saved.' }, 500);
    }
    return json({ ok: true, lot: data });
  }

  if (action === 'delete_lot') {
    const id = clean(body.id, 60);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Invalid reseller lot.' }, 400);
    const { error } = await admin.from('wholesale_lots').delete().eq('id', id);
    if (error) return json({ error: 'The reseller lot could not be deleted.' }, 500);
    return json({ ok: true });
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
