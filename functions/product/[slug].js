const SITE_URL = 'https://facelessanimalstudios.com';

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function safeUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text, SITE_URL);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function springPurchaseUrl(value) {
  const text = safeUrl(value);
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' &&
      /^[a-z0-9-]+\.creator-spring\.com$/i.test(url.hostname) &&
      /^\/listing\/[a-z0-9-]+\/?$/i.test(url.pathname) ? url.toString() : '';
  } catch {
    return '';
  }
}

function fanvuePurchaseUrl(value) {
  const text = safeUrl(value);
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' &&
      /^(www\.)?fanvue\.com$/i.test(url.hostname) &&
      url.pathname !== '/' ? url.toString() : '';
  } catch {
    return '';
  }
}

function excerpt(value, limit = 160) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).replace(/\s+\S*$/, '')}…`;
}

function cleanSlug(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 180);
}

function conditionUrl(condition) {
  const text = String(condition || '').toLowerCase();
  if (text.includes('refurb')) return 'https://schema.org/RefurbishedCondition';
  if (text.includes('used') || text.includes('pre-owned')) return 'https://schema.org/UsedCondition';
  if (text.includes('damaged')) return 'https://schema.org/DamagedCondition';
  return 'https://schema.org/NewCondition';
}

async function fetchProduct(env, slug) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  const baseFields = [
    'id', 'slug', 'title', 'description', 'seo_title', 'meta_description',
    'search_keywords', 'brand', 'gtin', 'mpn', 'price_cents', 'quantity',
    'sku', 'condition', 'category', 'shipping_price_cents', 'local_pickup',
    'state', 'product_kind', 'preview_url', 'updated_at',
    'fulfillment_provider', 'external_purchase_url',
    'product_images(public_url,alt_text,sort_order)',
  ];
  const requestProduct = async (fields) => {
    const query = new URLSearchParams({
      select: fields.join(','),
      slug: `eq.${slug}`,
      published: 'eq.true',
      state: 'in.(available,reserved,sold)',
      limit: '1',
    });
    const response = await fetch(`${base}/rest/v1/products?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok) return { ok: false, product: null };
    const rows = await response.json();
    return { ok: true, product: Array.isArray(rows) ? rows[0] || null : null };
  };
  const enhanced = await requestProduct([
    ...baseFields,
    'fulfillment_mode', 'ships_from', 'delivery_min_business_days',
    'delivery_max_business_days', 'shipping_service',
  ]);
  if (enhanced.ok) return enhanced.product;
  return (await requestProduct(baseFields)).product;
}

function render(product) {
  const canonical = `${SITE_URL}/product/${encodeURIComponent(product.slug)}`;
  const storeUrl = `${SITE_URL}/market.html?product=${encodeURIComponent(product.slug)}`;
  const addUrl = `${SITE_URL}/market.html?add=${encodeURIComponent(product.slug)}`;
  const buyUrl = `${SITE_URL}/market.html?buy=${encodeURIComponent(product.slug)}`;
  const title = String(product.seo_title || `${product.title} | Underground Market`).slice(0, 70);
  const description = excerpt(
    product.meta_description || product.description ||
      `${product.title} from Faceless Animal Studios.`,
    160,
  );
  const images = (product.product_images || [])
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((image) => safeUrl(image.public_url))
    .filter(Boolean);
  const primaryImage = images[0] || '';
  const springUrl = product.fulfillment_provider === 'spring'
    ? springPurchaseUrl(product.external_purchase_url)
    : '';
  const fanvueUrl = product.fulfillment_provider === 'fanvue'
    ? fanvuePurchaseUrl(product.external_purchase_url)
    : '';
  const externalUrl = springUrl || fanvueUrl;
  const digital = !externalUrl && product.product_kind !== 'physical';
  const dropship = !externalUrl && product.fulfillment_mode === 'dropship';
  const soldOut = !externalUrl && (product.state === 'sold' || Number(product.quantity) < 1);
  const availability = soldOut
    ? 'https://schema.org/OutOfStock'
    : product.state === 'reserved'
      ? 'https://schema.org/LimitedAvailability'
      : 'https://schema.org/InStock';
  const price = (Number(product.price_cents || 0) / 100).toFixed(2);
  const shippingDetails = !externalUrl && !digital ? {
    '@type': 'OfferShippingDetails',
    shippingRate: {
      '@type': 'MonetaryAmount',
      value: (Number(product.shipping_price_cents || 0) / 100).toFixed(2),
      currency: 'USD',
    },
    shippingDestination: {
      '@type': 'DefinedRegion',
      addressCountry: 'US',
    },
    ...(dropship && Number(product.delivery_min_business_days) > 0 && Number(product.delivery_max_business_days) > 0 ? {
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        transitTime: {
          '@type': 'QuantitativeValue',
          minValue: Number(product.delivery_min_business_days),
          maxValue: Number(product.delivery_max_business_days),
          unitCode: 'DAY',
        },
      },
    } : {}),
  } : null;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${canonical}#product`,
    url: canonical,
    name: product.title,
    description,
    sku: product.sku,
    category: product.category,
    brand: {
      '@type': 'Brand',
      name: product.brand || 'Faceless Animal Studios',
    },
    ...(product.mpn ? { mpn: product.mpn } : {}),
    ...(product.gtin ? { gtin: product.gtin } : {}),
    ...(images.length ? { image: images } : {}),
    itemCondition: digital
      ? 'https://schema.org/NewCondition'
      : conditionUrl(product.condition),
    ...((!fanvueUrl || Number(product.price_cents) > 0) ? { offers: {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: 'USD',
      price,
      availability,
      itemCondition: digital
        ? 'https://schema.org/NewCondition'
        : conditionUrl(product.condition),
      seller: {
        '@type': 'Organization',
        name: 'Faceless Animal Studios',
        url: SITE_URL,
      },
      ...(shippingDetails ? { shippingDetails } : {}),
    } } : {}),
  };
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Faceless Animal Studios', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Market', item: `${SITE_URL}/market.html` },
      { '@type': 'ListItem', position: 3, name: product.title, item: canonical },
    ],
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="Faceless Animal Studios">
  <meta property="og:title" content="${esc(product.title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  ${primaryImage ? `<meta property="og:image" content="${esc(primaryImage)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
  ${!fanvueUrl || Number(product.price_cents) > 0 ? `<meta property="product:price:amount" content="${esc(price)}"><meta property="product:price:currency" content="USD">` : ''}
  <meta name="twitter:title" content="${esc(product.title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c')}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#070709;--panel:#101014;--line:#29252f;--purple:#9b5cff;--gold:#d5b36a;--muted:#a59eae}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,#39196755,transparent 34rem),var(--bg);color:#f8f5fb;font-family:Inter,system-ui,sans-serif}
    a{color:inherit}.top{border-bottom:1px solid var(--line);background:#070709e8;backdrop-filter:blur(18px);position:sticky;top:0;z-index:5}.top-inner,.shell{width:min(1120px,calc(100% - 2rem));margin:auto}.top-inner{min-height:70px;display:flex;align-items:center;justify-content:space-between;gap:1rem}
    .brand{font-weight:900;letter-spacing:-.04em;text-decoration:none}.brand span{color:var(--purple)}.back{color:var(--muted);font-size:.78rem;font-weight:800;text-decoration:none}
    .shell{padding:clamp(2rem,6vw,5rem) 0 5rem}.breadcrumbs{color:var(--muted);font-size:.72rem;margin-bottom:1.2rem}.breadcrumbs a{text-decoration:none}
    .product{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(320px,.9fr);gap:clamp(1.4rem,5vw,4rem);align-items:start}.gallery{display:grid;gap:.8rem}.gallery img{display:block;width:100%;max-height:760px;object-fit:cover;border:1px solid var(--line);background:#15131a}.empty-image{aspect-ratio:1;background:#15131a;display:grid;place-items:center;color:#ffffff18;font-size:5rem;font-weight:900}
    .copy{position:sticky;top:100px}.eyebrow{color:var(--gold);font-size:.68rem;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.copy h1{font-size:clamp(2.4rem,6vw,5.5rem);line-height:.9;letter-spacing:-.065em;margin:.7rem 0 1rem}.price{font-size:1.65rem;font-weight:900;color:var(--gold)}.description{color:var(--muted);line-height:1.8;white-space:pre-wrap}.facts{border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:1rem 0;margin:1.5rem 0;display:grid;gap:.45rem;color:var(--muted);font-size:.78rem}.facts strong{color:#fff}.status{display:inline-flex;border:1px solid #72569c;color:#d8c6ff;padding:.38rem .6rem;font-size:.64rem;font-weight:900;text-transform:uppercase;letter-spacing:.1em}
    .purchase-actions{display:grid;grid-template-columns:1fr 1fr;gap:.65rem;margin-top:1rem}.buy{display:block;text-align:center;text-decoration:none;border:1px solid #5d5367;background:#151219;padding:1rem;border-radius:4px;font-weight:900}.buy.primary{border:0;background:linear-gradient(110deg,#7841d2,var(--purple))}.note{font-size:.7rem;color:var(--muted);line-height:1.6}.preview{display:inline-block;color:#d8c6ff;font-weight:800;margin:.7rem 0}.shipping-disclosure{display:grid;gap:.35rem;border:1px solid #4b3b23;background:#17130d;padding:.9rem;margin:1rem 0;color:#e9d3a1;font-size:.78rem;line-height:1.5}.shipping-disclosure span{color:var(--muted)}
    @media(max-width:760px){.product{grid-template-columns:1fr}.copy{position:static;padding-bottom:5rem}.top-inner,.shell{width:min(100% - 1rem,1120px)}.copy h1{font-size:clamp(2.5rem,14vw,4.5rem)}.purchase-actions{position:fixed;left:0;right:0;bottom:0;z-index:8;padding:.7rem;background:#070709f2;border-top:1px solid var(--line);backdrop-filter:blur(16px)}.buy{padding:.9rem .5rem}}
  </style>
</head>
<body>
  <header class="top"><div class="top-inner"><a class="brand" href="/">FACELESS <span>ANIMAL</span></a><a class="back" href="/market.html">All products &rarr;</a></div></header>
  <main class="shell">
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Studio</a> / <a href="/market.html">Market</a> / ${esc(product.title)}</nav>
    <article class="product">
      <div class="gallery">${images.length
        ? images.map((image, index) => `<img src="${esc(image)}" alt="${esc(index === 0 ? product.title : `${product.title} view ${index + 1}`)}" ${index ? 'loading="lazy"' : ''}>`).join('')
        : '<div class="empty-image" aria-label="Product image coming soon">FA</div>'}</div>
      <div class="copy">
        <p class="eyebrow">${esc(product.category)} &middot; ${fanvueUrl ? '18+ on Fanvue' : springUrl ? 'Made to order by Spring' : dropship ? `Ships from ${esc(product.ships_from)}` : digital ? 'Digital release' : esc(product.condition)}</p>
        <h1>${esc(product.title)}</h1>
        <p class="price">${fanvueUrl && Number(product.price_cents) <= 0 ? 'Exclusive access' : `${springUrl ? 'From ' : ''}$${esc(price)}`}</p>
        <span class="status">${fanvueUrl ? 'Available through Fanvue · 18+' : springUrl ? 'Available through Spring' : soldOut ? 'Sold out' : product.state === 'reserved' ? 'Temporarily reserved' : Number(product.quantity) <= 3 ? `Only ${esc(product.quantity)} left` : 'Available'}</span>
        <p class="description">${esc(product.description)}</p>
        ${dropship ? `<div class="shipping-disclosure"><strong>Estimated delivery: ${esc(product.delivery_min_business_days)}&ndash;${esc(product.delivery_max_business_days)} business days</strong><span>${esc(product.shipping_service || 'Supplier shipping')} from ${esc(product.ships_from)}. Delivery timing may vary by destination, carrier processing, and customs.</span></div>` : ''}
        ${digital && product.preview_url ? `<a class="preview" href="${esc(safeUrl(product.preview_url))}" rel="noopener" target="_blank">Preview this release &rarr;</a>` : ''}
        <div class="facts">
          <span><strong>Brand:</strong> ${esc(product.brand || 'Faceless Animal Studios')}</span>
          <span><strong>SKU:</strong> ${esc(product.sku)}</span>
          ${product.gtin ? `<span><strong>GTIN:</strong> ${esc(product.gtin)}</span>` : ''}
          ${product.mpn ? `<span><strong>MPN:</strong> ${esc(product.mpn)}</span>` : ''}
          <span><strong>Delivery:</strong> ${fanvueUrl ? 'Access provided by Fanvue after its age and account checks' : springUrl ? 'Produced and shipped by Spring' : dropship ? `Ships directly from a fulfillment supplier in ${esc(product.ships_from)}` : digital ? 'Protected download after verified payment' : product.local_pickup ? 'Shipping or local pickup' : 'Shipping'}</span>
        </div>
        ${externalUrl
          ? `<div class="purchase-actions"><a class="buy primary" href="${esc(externalUrl)}" target="_blank" rel="noopener">${fanvueUrl ? 'View and unlock on Fanvue (18+)' : 'Choose options and buy on Spring'}</a></div>`
          : soldOut
            ? '<div class="purchase-actions"><a class="buy" href="/market.html">Browse available products</a></div>'
            : `<div class="purchase-actions"><a class="buy" href="${esc(addUrl)}">Add to bag</a><a class="buy primary" href="${esc(buyUrl)}">Buy now</a></div>`}
        <p class="note">${fanvueUrl ? 'Fanvue handles sign-in, age controls, payment, content access, and customer support. This item does not use the Underground Market Stripe checkout.' : springUrl ? 'Spring handles product options, payment, production, shipping, returns, and customer support for this item.' : dropship ? 'This item is fulfilled by a third-party supplier. Faceless Animal Studios remains your seller and customer-service contact.' : 'Prices and inventory are verified by the server before Stripe Checkout opens.'}</p>
      </div>
    </article>
  </main>
</body>
</html>`;
}

export async function onRequestGet(context) {
  const slug = cleanSlug(context.params.slug);
  const product = slug ? await fetchProduct(context.env || {}, slug) : null;
  if (!product) {
    return new Response('<!doctype html><title>Product Not Found</title><h1>Product not found</h1><p><a href="/market.html">Return to the Market</a></p>', {
      status: 404,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'x-robots-tag': 'noindex',
      },
    });
  }
  return new Response(render(product), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=120, s-maxage=300',
    },
  });
}
