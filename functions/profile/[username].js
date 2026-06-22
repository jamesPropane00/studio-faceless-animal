const SITE_URL = 'https://facelessanimalstudios.com';

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function cleanUsername(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}

function safeUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text, SITE_URL);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}

function formatDate(value) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function excerpt(value, limit = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).replace(/\s+\S*$/, '')}…` : text;
}

function initials(value) {
  return String(value || 'FA').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

async function sb(env, path) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!base || !key) return [];
  try {
    const response = await fetch(`${base}${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : data ? [data] : [];
  } catch { return []; }
}

async function loadHub(env, username) {
  const encoded = encodeURIComponent(username);
  const [members, profiles, customPages, videos, channels, tracks, posts, articles] = await Promise.all([
    sb(env, `/rest/v1/member_accounts?username=eq.${encoded}&select=*&limit=1`),
    sb(env, `/rest/v1/profiles?username=eq.${encoded}&select=*&limit=1`),
    sb(env, `/rest/v1/member_pages?username=eq.${encoded}&is_published=eq.true&select=*&order=updated_at.desc&limit=5`),
    sb(env, `/rest/v1/tv_uploads?username=eq.${encoded}&visibility=eq.public&status=eq.published&select=*&order=created_at.desc&limit=12`),
    sb(env, `/rest/v1/tv_channels?username=eq.${encoded}&visibility=eq.public&select=*&order=created_at.desc&limit=5`),
    sb(env, `/rest/v1/radio_tracks?uploaded_by=eq.${encoded}&is_active=eq.true&select=*&order=uploaded_at.desc&limit=12`),
    sb(env, `/rest/v1/signal_posts?author_username=eq.${encoded}&visibility=eq.public&moderation_state=eq.approved&select=*&order=created_at.desc&limit=40`),
    sb(env, `/rest/v1/signal_wire_posts?author_username=eq.${encoded}&status=eq.published&select=*&order=published_at.desc&limit=12`),
  ]);

  const member = members[0] || {};
  const profile = profiles[0] || {};
  const accountId = member.account_id || member.id || profile.account_id || '';
  let pages = [];
  if (accountId) {
    const sites = await sb(env, `/rest/v1/sites?account_id=eq.${encodeURIComponent(accountId)}&select=id&limit=1`);
    if (sites[0]?.id) {
      pages = await sb(env, `/rest/v1/site_pages?site_id=eq.${encodeURIComponent(sites[0].id)}&is_published=eq.true&select=*&order=updated_at.desc&limit=20`);
    }
  }

  const activity = posts.filter((post) => {
    const category = String(post.category || '');
    const context = String(post.source_context || '');
    return !category.startsWith('engagement:') && !context.startsWith('reaction:') && context !== 'comment' && !context.startsWith('reply:');
  }).slice(0, 12);

  return { member, profile, customPages, pages, videos, channels, tracks, activity, articles };
}

function renderCustomDocument(page, fallbackTitle) {
  if (!page) return null;
  if (page.full_document) return page.full_document;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(page.title || page.page_title || fallbackTitle)}</title><style>${page.css || ''}</style></head><body>${page.html || ''}</body></html>`;
}

function mediaType(url) {
  if (/\.(mp3|wav|ogg|m4a|aac)(\?|#|$)/i.test(url)) return 'audio';
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)) return 'video';
  if (/\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i.test(url)) return 'image';
  return 'link';
}

function renderActivityMedia(url) {
  const src = safeUrl(url);
  if (!src) return '';
  const type = mediaType(src);
  if (type === 'audio') return `<audio controls preload="metadata" src="${esc(src)}"></audio>`;
  if (type === 'video') return `<video controls playsinline preload="metadata" src="${esc(src)}"></video>`;
  if (type === 'image') return `<img src="${esc(src)}" alt="" loading="lazy">`;
  return `<a class="text-link" href="${esc(src)}">View attached content →</a>`;
}

function renderLinks(links) {
  const source = links && typeof links === 'object' ? links : {};
  return Object.entries(source).filter(([, value]) => value).slice(0, 8).map(([name, value]) => {
    const href = safeUrl(value);
    return href ? `<a class="pill" href="${esc(href)}">${esc(name)}</a>` : '';
  }).join('');
}

function renderHub(username, data) {
  const { member, profile, customPages, pages, videos, channels, tracks, activity, articles } = data;
  const display = profile.display_name || member.display_name || username;
  const bio = profile.bio || member.bio || 'Creator building inside the Faceless Animal Studios network.';
  const city = profile.city || member.city || '';
  const state = profile.state || member.state_abbr || '';
  const location = [city, state].filter(Boolean).join(', ');
  const avatar = safeUrl(profile.avatar_url);
  const cover = safeUrl(profile.cover_image_url);
  const links = renderLinks(profile.links_json);
  const canonical = `${SITE_URL}/profile/${encodeURIComponent(username)}`;
  const description = excerpt(bio, 155);
  const latest = [videos[0]?.created_at, tracks[0]?.uploaded_at, activity[0]?.created_at, articles[0]?.published_at].filter(Boolean).sort().reverse()[0];
  const customPage = customPages[0] || null;
  const webpageCount = pages.length + (customPage ? 1 : 0);
  const liveChannel = channels.find((channel) => channel.is_live || channel.live_status === 'live' || channel.status === 'live');

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: canonical,
    mainEntity: {
      '@type': 'Person',
      name: display,
      alternateName: `@${username}`,
      description,
      ...(avatar ? { image: avatar } : {}),
    },
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(display)} (@${esc(username)}) | Faceless Animal Studios</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-video-preview:-1">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="profile">
  <meta property="og:title" content="${esc(display)} — Faceless Creator Hub">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  ${avatar || cover ? `<meta property="og:image" content="${esc(cover || avatar)}">` : ''}
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#07080c;--panel:#101119;--panel2:#161722;--line:rgba(255,255,255,.11);--text:#f8f5ff;--soft:#b8b2c8;--dim:#817a90;--purple:#9b6cff;--red:#e43f67;--gold:#c9a96e;--green:#35d07f}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 80% 0,rgba(155,108,255,.18),transparent 35rem),radial-gradient(circle at 10% 20%,rgba(228,63,103,.1),transparent 30rem),var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif}
    a{color:inherit}.shell{width:min(1180px,calc(100% - 2rem));margin:auto}.top{position:sticky;top:0;z-index:20;border-bottom:1px solid var(--line);background:rgba(7,8,12,.86);backdrop-filter:blur(18px)}.top-inner{min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:1rem}.brand{font-size:.8rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase;text-decoration:none}.top-links{display:flex;gap:.55rem;flex-wrap:wrap}.pill,.button{display:inline-flex;align-items:center;justify-content:center;min-height:38px;border:1px solid var(--line);border-radius:999px;padding:.55rem .8rem;background:rgba(255,255,255,.045);text-decoration:none;font-size:.75rem;font-weight:800;text-transform:capitalize}.button.primary{border-color:rgba(155,108,255,.45);background:linear-gradient(135deg,rgba(155,108,255,.26),rgba(228,63,103,.18));color:#eadfff}
    .hero{position:relative;margin-top:1.4rem;border:1px solid var(--line);border-radius:24px;overflow:hidden;background:linear-gradient(135deg,rgba(155,108,255,.14),rgba(228,63,103,.08)),var(--panel);box-shadow:0 35px 100px rgba(0,0,0,.38)}.cover{height:clamp(150px,25vw,290px);background:${cover ? `linear-gradient(180deg,transparent,rgba(7,8,12,.75)),url("${esc(cover)}") center/cover` : 'radial-gradient(circle at 20% 20%,rgba(201,169,110,.28),transparent 35%),linear-gradient(135deg,#191224,#0b1019)'}}.identity{display:grid;grid-template-columns:auto minmax(0,1fr);gap:1.2rem;align-items:end;padding:0 clamp(1rem,4vw,2.3rem) 2rem;margin-top:-58px}.avatar{width:clamp(105px,14vw,150px);aspect-ratio:1;border-radius:22px;border:5px solid var(--panel);background:linear-gradient(135deg,var(--purple),var(--red));display:grid;place-items:center;overflow:hidden;font-size:2rem;font-weight:900}.avatar img{width:100%;height:100%;object-fit:cover}.identity-copy{padding-top:4rem}.eyebrow{color:var(--gold);font-size:.72rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.identity h1{font-size:clamp(2rem,6vw,4.5rem);line-height:.95;letter-spacing:-.055em;margin:.45rem 0}.handle{color:var(--soft);font-weight:700}.bio{max-width:760px;color:var(--soft);line-height:1.7}.identity-actions{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem}.live{color:#b8ffd5;border-color:rgba(53,208,127,.42);background:rgba(53,208,127,.1)}
    .stats{display:grid;grid-template-columns:repeat(6,1fr);gap:.7rem;margin:1rem 0}.stat{border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.035);padding:1rem}.stat strong{display:block;font-size:1.35rem}.stat span{color:var(--dim);font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
    .nav{display:flex;gap:.55rem;overflow:auto;padding:.8rem 0 1.2rem}.nav a{white-space:nowrap}.section{padding:1.5rem 0}.section-head{display:flex;align-items:end;justify-content:space-between;gap:1rem;margin-bottom:1rem}.section-head h2{font-size:clamp(1.55rem,3vw,2.4rem);margin:0;letter-spacing:-.035em}.section-head p{color:var(--dim);margin:.2rem 0 0;font-size:.82rem}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.9rem}.card{border:1px solid var(--line);border-radius:17px;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.025));overflow:hidden}.card-body{padding:1rem}.card h3{font-size:1rem;margin:0 0 .4rem}.card p{color:var(--soft);font-size:.82rem;line-height:1.55;margin:.35rem 0}.meta{color:var(--dim)!important;font-size:.68rem!important;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.card video,.card img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#000}.card audio{display:block;width:calc(100% - 2rem);margin:0 1rem 1rem}.text-link{display:inline-block;color:#d9c9ff;font-size:.78rem;font-weight:900;text-decoration:none;margin-top:.6rem}.empty{border:1px dashed var(--line);border-radius:17px;padding:1.2rem;color:var(--dim);font-size:.84rem}.feed{display:grid;gap:.75rem}.post{border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.035);padding:1rem}.post-top{display:flex;justify-content:space-between;gap:1rem;align-items:center}.post-kind{color:var(--gold);font-size:.68rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.post p{color:var(--soft);line-height:1.6;margin:.65rem 0}.post img,.post video{width:min(100%,680px);max-height:480px;object-fit:contain;border-radius:12px;background:#000}.post audio{width:min(100%,680px)}.webpage{min-height:170px;display:flex;flex-direction:column;justify-content:space-between}.footer{border-top:1px solid var(--line);margin-top:3rem;padding:2rem 0 3rem;color:var(--dim);font-size:.76rem}
    @media(max-width:900px){.stats{grid-template-columns:repeat(3,1fr)}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.shell{width:min(100% - 1rem,1180px)}.identity{grid-template-columns:1fr;margin-top:-50px}.identity-copy{padding-top:0}.stats{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.top-links .pill:not(:last-child){display:none}.cover{height:180px}.avatar{width:110px}}
  </style>
</head>
<body>
  <header class="top"><div class="shell top-inner"><a class="brand" href="/">Faceless Animal Studios</a><div class="top-links"><a class="pill" href="/directory">Directory</a><a class="pill" href="/network">Community</a><a class="pill" href="/tv">TV</a><a class="pill" href="/radio">Radio</a></div></div></header>
  <main class="shell">
    <section class="hero">
      <div class="cover"></div>
      <div class="identity">
        <div class="avatar">${avatar ? `<img src="${esc(avatar)}" alt="${esc(display)}">` : esc(initials(display))}</div>
        <div class="identity-copy">
          <div class="eyebrow">${liveChannel ? '● Live now on Faceless TV' : 'Faceless Creator Hub'}</div>
          <h1>${esc(display)}</h1>
          <div class="handle">@${esc(username)}${location ? ` · ${esc(location)}` : ''}</div>
          <p class="bio">${esc(bio)}</p>
          <div class="identity-actions">
            ${liveChannel ? `<a class="button live" href="/tv">Watch Live</a>` : ''}
            ${customPage ? `<a class="button primary" href="?view=site">Open Custom Website</a>` : ''}
            <a class="button" href="/messages.html?to=${encodeURIComponent(username)}">Send Signal</a>
            ${links}
          </div>
        </div>
      </div>
    </section>

    <section class="stats" aria-label="Creator activity totals">
      <div class="stat"><strong>${videos.length}</strong><span>Videos</span></div>
      <div class="stat"><strong>${tracks.length}</strong><span>Tracks</span></div>
      <div class="stat"><strong>${activity.length}</strong><span>Posts</span></div>
      <div class="stat"><strong>${articles.length}</strong><span>Articles</span></div>
      <div class="stat"><strong>${webpageCount}</strong><span>Webpages</span></div>
      <div class="stat"><strong>${latest ? formatDate(latest) : 'New'}</strong><span>Latest activity</span></div>
    </section>

    <nav class="nav" aria-label="Profile sections">
      ${videos.length ? '<a class="pill" href="#video">Video</a>' : ''}
      ${tracks.length ? '<a class="pill" href="#music">Music</a>' : ''}
      ${activity.length ? '<a class="pill" href="#posts">Posts</a>' : ''}
      ${articles.length ? '<a class="pill" href="#articles">Articles</a>' : ''}
      ${webpageCount ? '<a class="pill" href="#webpages">Webpages</a>' : ''}
    </nav>

    <section class="section" id="video">
      <div class="section-head"><div><h2>Video Channel</h2><p>Published videos from Faceless TV.</p></div><a class="button" href="/tv">Open TV</a></div>
      ${videos.length ? `<div class="grid">${videos.map((video) => {
        const src = safeUrl(video.source_url || video.external_video_url);
        return `<article class="card">${src ? `<video controls playsinline preload="metadata" ${video.thumb_url ? `poster="${esc(safeUrl(video.thumb_url))}"` : ''} src="${esc(src)}"></video>` : ''}<div class="card-body"><p class="meta">${esc(video.channel_slug || 'Faceless TV')} · ${esc(formatDate(video.created_at))}</p><h3>${esc(video.title || 'Untitled video')}</h3>${video.description ? `<p>${esc(excerpt(video.description, 130))}</p>` : ''}</div></article>`;
      }).join('')}</div>` : '<div class="empty">No public videos have been posted yet.</div>'}
    </section>

    <section class="section" id="music">
      <div class="section-head"><div><h2>Music & Radio</h2><p>Tracks uploaded to Faceless Radio.</p></div><a class="button" href="/radio">Open Radio</a></div>
      ${tracks.length ? `<div class="grid">${tracks.map((track) => `<article class="card"><div class="card-body"><p class="meta">Station ${esc(track.channel || '1')} · ${esc(formatDate(track.uploaded_at))}</p><h3>${esc(track.title || 'Untitled track')}</h3><p>${Number(track.play_count || 0)} plays</p></div><audio controls preload="metadata" src="${esc(safeUrl(track.src))}"></audio></article>`).join('')}</div>` : '<div class="empty">No public radio tracks have been uploaded yet.</div>'}
    </section>

    <section class="section" id="posts">
      <div class="section-head"><div><h2>Community Posts</h2><p>Updates and releases shared across the network.</p></div><a class="button" href="/directory">Open Directory</a></div>
      ${activity.length ? `<div class="feed">${activity.map((post) => `<article class="post"><div class="post-top"><span class="post-kind">${esc(post.category || post.post_type || 'Update')}</span><span class="meta">${esc(formatDate(post.created_at))}</span></div><p>${esc(post.content || post.body_text || '')}</p>${renderActivityMedia(post.media_url || post.audio_url)}</article>`).join('')}</div>` : '<div class="empty">No public community posts yet.</div>'}
    </section>

    <section class="section" id="articles">
      <div class="section-head"><div><h2>Signal Wire Articles</h2><p>Published writing and editorial work.</p></div><a class="button" href="/news">Open News</a></div>
      ${articles.length ? `<div class="grid">${articles.map((article) => `<article class="card">${article.media_url ? `<img src="${esc(safeUrl(article.media_url))}" alt="" loading="lazy">` : ''}<div class="card-body"><p class="meta">${esc(article.category || 'Signal Wire')} · ${esc(formatDate(article.published_at))}</p><h3>${esc(article.title || 'Untitled article')}</h3><p>${esc(excerpt(article.dek || article.body, 135))}</p><a class="text-link" href="/article/${encodeURIComponent(article.slug)}">Read article →</a></div></article>`).join('')}</div>` : '<div class="empty">No published articles yet.</div>'}
    </section>

    <section class="section" id="webpages">
      <div class="section-head"><div><h2>Webpages & Projects</h2><p>Pages built and published through Faceless Builder.</p></div></div>
      ${webpageCount ? `<div class="grid">
        ${customPage ? `<article class="card webpage"><div class="card-body"><p class="meta">Faceless Builder · ${esc(formatDate(customPage.updated_at))}</p><h3>${esc(customPage.title || 'Custom Website')}</h3><p>A custom visual website built by @${esc(username)}.</p><a class="text-link" href="?view=site">Open custom website →</a></div></article>` : ''}
        ${pages.map((page) => `<article class="card webpage"><div class="card-body"><p class="meta">${page.is_homepage ? 'Homepage' : 'Published page'} · ${esc(formatDate(page.updated_at))}</p><h3>${esc(page.page_title || page.page_slug || 'Webpage')}</h3><p>${esc(excerpt(page.page_config?.description || 'A published page created with Faceless Builder.', 125))}</p><a class="text-link" href="?page=${encodeURIComponent(page.page_slug)}">Open webpage →</a></div></article>`).join('')}
      </div>` : '<div class="empty">No public webpages have been published yet.</div>'}
    </section>
  </main>
  <footer class="footer"><div class="shell">Faceless Creator Hub · @${esc(username)} · Powered by Faceless Animal Studios</div></footer>
</body>
</html>`;
}

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const username = cleanUsername(context.params.username || url.pathname.replace(/^\/profile\//, '').split('/')[0]);
    if (!username) return new Response('Not found', { status: 404 });
    const data = await loadHub(context.env || {}, username);
    const exists = data.member.id || data.profile.id || data.customPages.length || data.videos.length || data.tracks.length || data.activity.length || data.articles.length;
    if (!exists) return new Response('Creator not found', { status: 404, headers: { 'x-robots-tag': 'noindex' } });

    if (url.searchParams.get('view') === 'site') {
      const document = renderCustomDocument(data.customPages[0], username);
      if (!document) return new Response('Custom website not found', { status: 404 });
      return new Response(document, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } });
    }

    const pageSlug = cleanUsername(url.searchParams.get('page'));
    if (pageSlug) {
      const page = data.pages.find((item) => String(item.page_slug || '').toLowerCase() === pageSlug);
      const document = renderCustomDocument(page, username);
      if (!document) return new Response('Webpage not found', { status: 404 });
      return new Response(document, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } });
    }

    return new Response(renderHub(username, data), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=120, s-maxage=300' },
    });
  } catch (error) {
    return new Response(`Profile error: ${error?.message || 'unknown error'}`, { status: 500 });
  }
}
