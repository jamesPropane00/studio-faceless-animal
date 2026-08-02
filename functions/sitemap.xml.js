const FALLBACK_SUPABASE_URL = 'https://ghufaozjwondqcrcucjs.supabase.co';
const SITE_URL = 'https://facelessanimalstudios.com';

function xml(value) {
  return String(value || '').replace(/[<>&'"]/g, (char) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  })[char]);
}

export async function onRequestGet(context) {
  const base = String(context.env.SUPABASE_URL || FALLBACK_SUPABASE_URL).replace(/\/+$/, '');
  const key = context.env.SUPABASE_SERVICE_ROLE_KEY || context.env.SUPABASE_ANON_KEY;
  let articles = [];
  let profiles = [];
  let products = [];
  if (key) {
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const response = await fetch(`${base}/rest/v1/signal_wire_posts?select=slug,updated_at,published_at&status=eq.published&order=published_at.desc&limit=1000`, {
      headers,
    });
    const profileResponse = await fetch(`${base}/rest/v1/member_accounts?select=username,last_active_at&member_status=in.(active,free)&order=last_active_at.desc&limit=1000`, {
      headers,
    });
    const productResponse = await fetch(`${base}/rest/v1/products?select=slug,updated_at,product_images(public_url,sort_order)&published=eq.true&state=in.(available,reserved,sold)&order=updated_at.desc&limit=1000`, {
      headers,
    });
    if (response.ok) articles = await response.json();
    if (profileResponse.ok) profiles = await profileResponse.json();
    if (productResponse.ok) products = await productResponse.json();
  }
  const staticPages = ['', '/store', '/news', '/radio', '/tv', '/directory', '/network', '/ai'];
  const urls = staticPages.map((path) => `<url><loc>${SITE_URL}${path}</loc></url>`);
  articles.forEach((article) => {
    if (!article.slug) return;
    const lastmod = article.updated_at || article.published_at;
    urls.push(`<url><loc>${SITE_URL}/article/${xml(encodeURIComponent(article.slug))}</loc>${lastmod ? `<lastmod>${xml(new Date(lastmod).toISOString())}</lastmod>` : ''}</url>`);
  });
  profiles.forEach((profile) => {
    if (!profile.username) return;
    urls.push(`<url><loc>${SITE_URL}/profile/${xml(encodeURIComponent(profile.username))}</loc>${profile.last_active_at ? `<lastmod>${xml(new Date(profile.last_active_at).toISOString())}</lastmod>` : ''}</url>`);
  });
  products.forEach((product) => {
    if (!product.slug) return;
    const images = (product.product_images || [])
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      .map((image) => String(image.public_url || '').trim())
      .filter((url) => /^https?:\/\//i.test(url));
    const imageEntries = images.slice(0, 10)
      .map((url) => `<image:image><image:loc>${xml(url)}</image:loc></image:image>`)
      .join('');
    urls.push(`<url><loc>${SITE_URL}/product/${xml(encodeURIComponent(product.slug))}</loc>${product.updated_at ? `<lastmod>${xml(new Date(product.updated_at).toISOString())}</lastmod>` : ''}${imageEntries}</url>`);
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls.join('')}</urlset>`;
  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=1800',
    },
  });
}
