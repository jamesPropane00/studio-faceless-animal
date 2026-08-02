const FALLBACK_SUPABASE_URL = 'https://ghufaozjwondqcrcucjs.supabase.co';
const SITE_URL = 'https://facelessanimalstudios.com';

function xml(value) {
  return String(value == null ? '' : value).replace(/[<>&'"\u0000-\u001F]/g, (char) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  })[char] || ' ');
}

function text(value, limit) {
  const cleaned = String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return limit && cleaned.length > limit ? cleaned.slice(0, limit).replace(/\s+\S*$/, '') : cleaned;
}

function condition(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('refurb')) return 'refurbished';
  if (normalized.includes('used') || normalized.includes('pre-owned')) return 'used';
  return 'new';
}

function price(cents) {
  return `${(Number(cents || 0) / 100).toFixed(2)} USD`;
}

function safeImages(product) {
  return (product.product_images || [])
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((image) => String(image.public_url || '').trim())
    .filter((url) => /^https?:\/\//i.test(url));
}

function renderItem(product) {
  const images = safeImages(product);
  const link = `${SITE_URL}/product/${encodeURIComponent(product.slug)}`;
  const identifiers = product.gtin
    ? `<g:gtin>${xml(product.gtin)}</g:gtin>`
    : product.mpn
      ? `<g:mpn>${xml(product.mpn)}</g:mpn>`
      : '<g:identifier_exists>no</g:identifier_exists>';
  const additionalImages = images.slice(1, 11)
    .map((image) => `<g:additional_image_link>${xml(image)}</g:additional_image_link>`)
    .join('');
  const shippingService = text(product.shipping_service || 'Standard shipping', 100);
  return `<item>
    <g:id>${xml(product.sku || product.id)}</g:id>
    <title>${xml(text(product.title, 150))}</title>
    <description>${xml(text(product.description, 5000))}</description>
    <link>${xml(link)}</link>
    <g:canonical_link>${xml(link)}</g:canonical_link>
    <g:image_link>${xml(images[0])}</g:image_link>
    ${additionalImages}
    <g:availability>in_stock</g:availability>
    <g:price>${xml(price(product.price_cents))}</g:price>
    <g:condition>${condition(product.condition)}</g:condition>
    ${product.brand ? `<g:brand>${xml(text(product.brand, 70))}</g:brand>` : ''}
    ${identifiers}
    ${product.google_product_category ? `<g:google_product_category>${xml(product.google_product_category)}</g:google_product_category>` : ''}
    <g:product_type>${xml(text(product.category, 750))}</g:product_type>
    <g:shipping><g:country>US</g:country><g:service>${xml(shippingService)}</g:service><g:price>${xml(price(product.shipping_price_cents))}</g:price></g:shipping>
  </item>`;
}

export async function onRequestGet(context) {
  const base = String(context.env.SUPABASE_URL || FALLBACK_SUPABASE_URL).replace(/\/+$/, '');
  const key = context.env.SUPABASE_SERVICE_ROLE_KEY || context.env.SUPABASE_ANON_KEY;
  let products = [];
  if (key) {
    const fields = [
      'id', 'slug', 'title', 'description', 'brand', 'gtin', 'mpn', 'sku',
      'price_cents', 'quantity', 'condition', 'category', 'google_product_category',
      'shipping_price_cents', 'shipping_service', 'product_kind',
      'fulfillment_provider', 'external_purchase_url',
      'product_images(public_url,sort_order)',
    ].join(',');
    const query = new URLSearchParams({
      select: fields,
      published: 'eq.true',
      state: 'eq.available',
      quantity: 'gt.0',
      order: 'updated_at.desc',
      limit: '1000',
    });
    const response = await fetch(`${base}/rest/v1/products?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (response.ok) products = await response.json();
  }

  const eligible = products.filter((product) =>
    product.slug &&
    product.product_kind === 'physical' &&
    !['spring', 'fanvue'].includes(String(product.fulfillment_provider || '').toLowerCase()) &&
    !product.external_purchase_url &&
    safeImages(product).length > 0 &&
    Number(product.price_cents) > 0
  );
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>
  <title>Faceless Supply</title>
  <link>${SITE_URL}/store</link>
  <description>Physical products available from Faceless Animal Studios.</description>
  ${eligible.map(renderItem).join('\n  ')}
</channel></rss>`;
  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=1800',
    },
  });
}
