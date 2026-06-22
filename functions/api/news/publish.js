const SUPABASE_FALLBACK_URL = 'https://ghufaozjwondqcrcucjs.supabase.co';
const ARTICLE_BUCKET = 'article-media';
const ADMIN_USERS = new Set(['jamespropane00']);

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-fas-user',
      'Cache-Control': 'no-store',
    },
  });
}

function clean(value, limit = 500) {
  return String(value || '').trim().slice(0, limit);
}

function userFromRequest(request) {
  try { return JSON.parse(request.headers.get('x-fas-user') || 'null'); } catch { return null; }
}

function usernameFrom(user) {
  return clean(user?.username || user?.display, 40)
    .replace(/^@/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function safeFileName(name) {
  return clean(name || 'article-image', 120)
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-');
}

async function sbFetch(env, path, options = {}) {
  const base = String(env.SUPABASE_URL || SUPABASE_FALLBACK_URL).replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return { ok: false, status: 500, data: { message: 'Missing Supabase service credentials.' } };
  const headers = new Headers(options.headers || {});
  headers.set('apikey', key);
  headers.set('Authorization', `Bearer ${key}`);
  const response = await fetch(`${base}${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data, text, base };
}

async function ensureArticleBucket(env) {
  const current = await sbFetch(env, `/storage/v1/bucket/${ARTICLE_BUCKET}`);
  if (current.ok) return current;
  if (current.status !== 400 && current.status !== 404) return current;
  return sbFetch(env, '/storage/v1/bucket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: ARTICLE_BUCKET,
      name: ARTICLE_BUCKET,
      public: true,
      file_size_limit: 10485760,
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    }),
  });
}

async function uploadArticleImage(env, file, username) {
  if (!file || !file.size) return null;
  if (!String(file.type || '').startsWith('image/')) throw new Error('The article attachment must be an image.');
  if (file.size > 10 * 1024 * 1024) throw new Error('The article image must be smaller than 10 MB.');

  const bucket = await ensureArticleBucket(env);
  if (!bucket.ok && bucket.status !== 409) {
    throw new Error(bucket.data?.message || 'Could not prepare article image storage.');
  }

  const fileName = `${Date.now().toString(36)}-${safeFileName(file.name)}`;
  const objectPath = `${username}/${fileName}`;
  const upload = await sbFetch(env, `/storage/v1/object/${ARTICLE_BUCKET}/${encodeURIComponent(username)}/${encodeURIComponent(fileName)}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!upload.ok) throw new Error(upload.data?.message || `Image upload failed (${upload.status}).`);
  return `${upload.base}/storage/v1/object/public/${ARTICLE_BUCKET}/${objectPath}`;
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-fas-user',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function onRequestPost(context) {
  try {
    const user = userFromRequest(context.request);
    const username = usernameFrom(user);
    if (!ADMIN_USERS.has(username)) return json({ error: 'Admin sign-in is required to publish News articles.' }, 403);

    const form = await context.request.formData();
    if (form.get('action') === 'prepare_storage') {
      const bucket = await ensureArticleBucket(context.env);
      if (!bucket.ok && bucket.status !== 409) {
        return json({ error: bucket.data?.message || 'Could not prepare article image storage.' }, 500);
      }
      return json({ ok: true, storage_ready: true });
    }
    const title = clean(form.get('title'), 200);
    const body = clean(form.get('body'), 30000);
    if (!title) return json({ error: 'Title is required.' }, 400);

    const file = form.get('image');
    const uploadedUrl = file instanceof File ? await uploadArticleImage(context.env, file, username) : null;
    const mediaUrl = uploadedUrl || clean(form.get('media_url'), 1000) || null;
    const publishedAt = new Date().toISOString();
    const articlePayload = {
      title,
      dek: clean(form.get('dek'), 300) || null,
      body: body || null,
      category: clean(form.get('category'), 80) || 'General',
      accent_color: clean(form.get('accent_color'), 20) || '#c9a96e',
      media_url: mediaUrl,
      link_url: clean(form.get('link_url'), 1000) || null,
      status: 'published',
      published_at: publishedAt,
      content_html: body
        ? `<p>${body.replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]).replace(/\n/g, '<br>')}</p>`
        : null,
    };

    const articleResult = await sbFetch(context.env, '/rest/v1/signal_wire_posts?select=*', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify([articlePayload]),
    });
    if (!articleResult.ok) {
      return json({ error: articleResult.data?.message || 'Article publishing failed.' }, 500);
    }

    const article = Array.isArray(articleResult.data) ? articleResult.data[0] : articleResult.data;
    const articleKey = article?.slug || article?.id || '';
    const articleUrl = `https://facelessanimalstudios.com/news#post-${articleKey}`;
    const postText = `${title} — Read the full Signal Wire article: ${articleUrl}`;
    const boardResult = await sbFetch(context.env, '/rest/v1/signal_posts?select=id,created_at', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify([{
        author_username: username,
        username,
        display_name: user?.display_name || user?.display || username,
        post_type: 'link',
        signal_type: 'drop',
        category: 'news',
        body_text: postText,
        content: postText,
        media_url: mediaUrl,
        visibility: 'public',
        moderation_state: 'approved',
        page_slug: articleUrl,
        source_context: `news:${articleKey}`,
      }]),
    });

    return json({
      ok: true,
      article,
      article_url: articleUrl,
      board_posted: boardResult.ok,
      board_error: boardResult.ok ? null : (boardResult.data?.message || 'Community post failed.'),
    });
  } catch (error) {
    return json({ error: error?.message || 'News publishing failed.' }, 500);
  }
}
