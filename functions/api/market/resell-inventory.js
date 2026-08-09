import { createClient } from '@supabase/supabase-js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': status === 200 ? 'public, max-age=60, s-maxage=300' : 'no-store',
    'x-content-type-options': 'nosniff',
  } });
}

export async function onRequestGet({ env }) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!url || !key) return json({ error: 'Resell Inventory is not configured.' }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.from('wholesale_lots').select(`
    id,lot_name,unit_count,lot_tier,suggested_retail_min_cents,suggested_retail_max_cents,
    warehouse_country,public_supplier_label,resale_channels,included_resources,opportunity_summary,updated_at,
    products!inner(id,slug,title,description,price_cents,shipping_price_cents,quantity,state,published,ships_from,
      delivery_min_business_days,delivery_max_business_days,shipping_service,product_images(public_url,alt_text,sort_order))
  `).eq('status', 'published').eq('freight_status', 'confirmed')
    .eq('products.published', true).gt('products.quantity', 0).in('products.state', ['available', 'reserved'])
    .order('updated_at', { ascending: false }).limit(100);
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205' || /wholesale_lots/i.test(String(error.message || ''))) {
      return json({ error: 'Resell Inventory is waiting for database migration 050.' }, 503);
    }
    return json({ error: 'Reseller lots could not be loaded.' }, 500);
  }
  const lots = (data || []).map((lot) => {
    const product = Array.isArray(lot.products) ? lot.products[0] : lot.products;
    const delivered = Number(product.price_cents) + Number(product.shipping_price_cents || 0);
    const retailMin = lot.unit_count * lot.suggested_retail_min_cents;
    const retailMax = lot.unit_count * lot.suggested_retail_max_cents;
    return {
      id: lot.id,
      product_id: product.id,
      slug: product.slug,
      lot_name: lot.lot_name,
      description: product.description,
      unit_count: lot.unit_count,
      lot_tier: lot.lot_tier,
      lot_price_cents: product.price_cents,
      shipping_price_cents: product.shipping_price_cents,
      delivered_total_cents: delivered,
      buyer_cost_per_unit_cents: Math.ceil(delivered / lot.unit_count),
      suggested_retail_min_cents: lot.suggested_retail_min_cents,
      suggested_retail_max_cents: lot.suggested_retail_max_cents,
      potential_gross_retail_min_cents: retailMin,
      potential_gross_retail_max_cents: retailMax,
      break_even_units_at_min_price: Math.ceil(delivered / lot.suggested_retail_min_cents),
      warehouse_country: lot.warehouse_country,
      supplier_label: lot.public_supplier_label,
      resale_channels: lot.resale_channels,
      included_resources: lot.included_resources,
      opportunity_summary: lot.opportunity_summary,
      delivery_min_business_days: product.delivery_min_business_days,
      delivery_max_business_days: product.delivery_max_business_days,
      shipping_service: product.shipping_service,
      images: (product.product_images || []).sort((a, b) => a.sort_order - b.sort_order),
    };
  });
  return json({ lots });
}

export async function onRequestPost() {
  return json({ error: 'Method not allowed.' }, 405);
}
