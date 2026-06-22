const FALLBACK_SUPABASE_URL = 'https://ghufaozjwondqcrcucjs.supabase.co';
const SITE_URL = 'https://facelessanimalstudios.com';

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function safeColor(value, fallback) {
  return /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : fallback;
}

function absoluteUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try { return new URL(text, SITE_URL).toString(); } catch { return ''; }
}

function articleBody(post) {
  const body = String(post.body || '').trim();
  if (!body) return '<p>Open Signal Wire for the complete studio update.</p>';
  return body
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${esc(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

async function fetchArticle(env, slug) {
  const base = String(env.SUPABASE_URL || FALLBACK_SUPABASE_URL).replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!key) return null;
  const query = `select=*&slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`;
  const response = await fetch(`${base}/rest/v1/signal_wire_posts?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

function render(post) {
  const title = String(post.title || 'Signal Wire Article');
  const description = String(post.dek || post.body || 'News and studio updates from Faceless Animal Studios')
    .replace(/\s+/g, ' ').trim().slice(0, 160);
  const canonical = `${SITE_URL}/article/${encodeURIComponent(post.slug)}`;
  const image = absoluteUrl(post.media_url);
  const accent = safeColor(post.accent_color, '#c9a96e');
  const published = post.published_at || post.created_at || new Date().toISOString();
  const modified = post.updated_at || published;
  const author = post.author_username || 'DJ Faceless Animal';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title,
    description,
    datePublished: published,
    dateModified: modified,
    mainEntityOfPage: canonical,
    author: { '@type': 'Person', name: author },
    publisher: {
      '@type': 'Organization',
      name: 'Faceless Animal Studios',
      url: SITE_URL,
    },
    ...(image ? { image: [image] } : {}),
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)} | Signal Wire</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Faceless Animal Studios">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  ${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta property="article:published_time" content="${esc(published)}">
  <meta property="article:modified_time" content="${esc(modified)}">
  <meta property="article:section" content="${esc(post.category || 'Signal Wire')}">
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/street-wire.css?v=20260622-seo">
  <style>
    :root{--bg:#07080c;--text:#f7f3ff;--soft:#b8b2c8;--border:rgba(255,255,255,.12);--accent:${esc(accent)}}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 75% 0,rgba(139,92,246,.18),transparent 34rem),var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif;line-height:1.75}
    a{color:inherit}.topbar{border-bottom:1px solid var(--border);background:rgba(7,8,12,.86);backdrop-filter:blur(16px);position:sticky;top:0;z-index:5}
    .topbar-inner,.article{width:min(920px,calc(100% - 2rem));margin:auto}.topbar-inner{min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:1rem}
    .brand{text-decoration:none;font-size:.82rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.back{color:var(--soft);font-size:.82rem;font-weight:800;text-decoration:none}
    .article{padding:clamp(2.5rem,7vw,5rem) 0 5rem}.category{display:inline-flex;border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);border-radius:999px;padding:.35rem .68rem;color:var(--accent);font-size:.72rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
    h1{font-size:clamp(2.25rem,7vw,5rem);line-height:.98;letter-spacing:-.055em;margin:1rem 0}.dek{font-size:clamp(1.05rem,2vw,1.3rem);color:var(--soft);max-width:760px}.meta{color:#817a90;font-size:.78rem;font-weight:700;margin:1rem 0 2rem}
    .hero{width:100%;max-height:620px;object-fit:cover;border:1px solid var(--border);border-radius:18px;display:block;margin:2rem 0;box-shadow:0 25px 80px rgba(0,0,0,.4)}
    .body{font-size:clamp(1rem,1.5vw,1.14rem);max-width:760px}.body p{margin:0 0 1.4rem}.actions{margin-top:2.5rem;padding-top:1.25rem;border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:.7rem}
    .button{border:1px solid var(--border);border-radius:999px;padding:.65rem .9rem;text-decoration:none;font-weight:900;font-size:.78rem;background:rgba(255,255,255,.05)}
    .button.primary{border-color:color-mix(in srgb,var(--accent) 50%,transparent);color:var(--accent)}
    @media(max-width:600px){.topbar-inner,.article{width:min(100% - 1.2rem,920px)}.article{padding-top:2rem}h1{letter-spacing:-.035em}}
  </style>
</head>
<body>
  <header class="topbar"><div class="topbar-inner">
    <a class="brand" href="/news">Signal Wire</a>
    <a class="back" href="/news">All Articles &rarr;</a>
  </div></header>
  <main class="article">
    <span class="category">${esc(post.category || 'Signal Wire')}</span>
    <h1>${esc(title)}</h1>
    ${post.dek ? `<p class="dek">${esc(post.dek)}</p>` : ''}
    <p class="meta">By ${esc(author)} &middot; <time datetime="${esc(published)}">${esc(new Date(published).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric', timeZone:'UTC' }))}</time></p>
    ${image ? `<img class="hero" src="${esc(image)}" alt="${esc(title)}" width="1200" height="675">` : ''}
    <article class="body">${articleBody(post)}</article>
    <div class="actions">
      <a class="button primary" href="/news">More Signal Wire</a>
      ${post.link_url ? `<a class="button" href="${esc(absoluteUrl(post.link_url))}" rel="noopener">Related Link</a>` : ''}
      <button class="button" type="button" onclick="navigator.share?navigator.share({title:document.title,url:location.href}):navigator.clipboard.writeText(location.href)">Share</button>
    </div>
  </main>
</body>
</html>`;
}

export async function onRequestGet(context) {
  const slug = String(context.params.slug || '').trim();
  const post = slug ? await fetchArticle(context.env, slug) : null;
  if (!post) {
    return new Response('<!doctype html><title>Article Not Found</title><h1>Article not found</h1><p><a href="/news">Return to Signal Wire</a></p>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' },
    });
  }
  return new Response(render(post), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=900',
    },
  });
}
