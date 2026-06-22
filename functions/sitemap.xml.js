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
  if (key) {
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const response = await fetch(`${base}/rest/v1/signal_wire_posts?select=slug,updated_at,published_at&status=eq.published&order=published_at.desc&limit=1000`, {
      headers,
    });
    const profileResponse = await fetch(`${base}/rest/v1/member_accounts?select=username,last_active_at&member_status=in.(active,free)&order=last_active_at.desc&limit=1000`, {
      headers,
    });
    if (response.ok) articles = await response.json();
    if (profileResponse.ok) profiles = await profileResponse.json();
  }
  const staticPages = ['', '/news', '/radio', '/tv', '/directory', '/network', '/ai'];
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
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=1800',
    },
  });
}
