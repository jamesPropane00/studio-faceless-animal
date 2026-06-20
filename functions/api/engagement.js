function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-fas-user',
      'Cache-Control': 'no-store',
    },
  });
}

function clean(value, limit = 500) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

function safeKey(value) {
  return clean(value, 140).replace(/[^a-zA-Z0-9:_-]/g, '-');
}

function userFromRequest(request) {
  try { return JSON.parse(request.headers.get('x-fas-user') || 'null'); } catch { return null; }
}

function usernameFrom(user) {
  return clean(user?.username || user?.display || 'guest', 40).replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'guest';
}

async function supabaseFetch(env, path, options = {}) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, status: 500, data: { message: 'Missing Supabase service credentials.' } };
  const headers = new Headers(options.headers || {});
  headers.set('apikey', key);
  headers.set('Authorization', `Bearer ${key}`);
  const response = await fetch(`${url}${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data, text };
}

async function fetchRows(env, contentKey) {
  const category = `engagement:${contentKey}`;
  const query = [
    'select=id,author_username,post_type,body_text,media_url,source_context,created_at',
    `category=eq.${encodeURIComponent(category)}`,
    'moderation_state=eq.approved',
    'visibility=eq.public',
    'order=created_at.asc',
    'limit=500',
  ].join('&');
  const result = await supabaseFetch(env, `/rest/v1/signal_posts?${query}`);
  return result.ok && Array.isArray(result.data) ? result.data : [];
}

function summarize(rows) {
  const reactions = { like: 0, dislike: 0 };
  const latestReaction = {};
  const comments = [];
  rows.forEach((row) => {
    const context = String(row.source_context || '');
    if (context.startsWith('reaction:')) {
      const parts = context.split(':');
      latestReaction[parts.slice(2).join(':') || row.author_username] = {
        type: parts[1],
        created_at: row.created_at,
      };
      return;
    }
    if (context === 'comment' || context.startsWith('reply:')) {
      comments.push({
        id: row.id,
        username: row.author_username || 'guest',
        text: row.body_text || '',
        parent_id: context.startsWith('reply:') ? context.slice(6) : null,
        created_at: row.created_at,
      });
    }
  });
  Object.keys(latestReaction).forEach((key) => {
    const type = latestReaction[key].type;
    if (type === 'like' || type === 'dislike') reactions[type] += 1;
  });
  return { reactions, comments };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-fas-user',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const contentKey = safeKey(url.searchParams.get('key'));
    if (!contentKey) return json({ error: 'Missing content key.' }, 400);
    return json({ ok: true, ...summarize(await fetchRows(context.env, contentKey)) });
  } catch (error) {
    return json({ error: error?.message || 'Could not load engagement.' }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const action = clean(body.action, 30);
    const contentKey = safeKey(body.key);
    const user = userFromRequest(context.request);
    const username = usernameFrom(user);
    if (!contentKey) return json({ error: 'Missing content key.' }, 400);

    if (action === 'react') {
      const reaction = body.reaction === 'dislike' ? 'dislike' : body.reaction === 'clear' ? 'clear' : 'like';
      const identity = clean(user?.account_id || user?.id || body.device_id || username, 100);
      const result = await supabaseFetch(context.env, '/rest/v1/signal_posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify([{
          author_username: username,
          username,
          display_name: username,
          post_type: 'status',
          signal_type: 'status',
          category: `engagement:${contentKey}`,
          body_text: `${reaction} reaction`,
          content: `${reaction} reaction`,
          visibility: 'public',
          moderation_state: 'approved',
          source_context: `reaction:${reaction}:${identity}`,
        }]),
      });
      if (!result.ok) return json({ error: result.data?.message || 'Reaction failed.' }, 500);
    } else if (action === 'comment' || action === 'reply') {
      const text = clean(body.text, 800);
      if (!text) return json({ error: 'Write a comment first.' }, 400);
      const parentId = action === 'reply' ? clean(body.parent_id, 80) : '';
      const result = await supabaseFetch(context.env, '/rest/v1/signal_posts?select=id,author_username,body_text,source_context,created_at', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify([{
          author_username: username,
          username,
          display_name: username,
          post_type: 'status',
          signal_type: 'status',
          category: `engagement:${contentKey}`,
          body_text: text,
          content: text,
          visibility: 'public',
          moderation_state: 'approved',
          source_context: parentId ? `reply:${parentId}` : 'comment',
        }]),
      });
      if (!result.ok) return json({ error: result.data?.message || 'Comment failed.' }, 500);
    } else if (action === 'publish_board') {
      const title = clean(body.title, 160);
      const url = clean(body.url, 500);
      const mediaUrl = clean(body.media_url, 500) || null;
      const postText = `${title || 'Signal Wire article'} — Read the full article: ${url}`;
      const result = await supabaseFetch(context.env, '/rest/v1/signal_posts?select=id,created_at', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify([{
          author_username: username,
          username,
          display_name: username,
          post_type: 'link',
          signal_type: 'link',
          category: 'news',
          body_text: postText,
          content: postText,
          media_url: mediaUrl,
          visibility: 'public',
          moderation_state: 'approved',
          page_slug: url,
          source_context: `news:${contentKey}`,
        }]),
      });
      if (!result.ok) return json({ error: result.data?.message || 'Board post failed.' }, 500);
      return json({ ok: true, board_post: Array.isArray(result.data) ? result.data[0] : result.data });
    } else {
      return json({ error: 'Unknown action.' }, 400);
    }

    return json({ ok: true, ...summarize(await fetchRows(context.env, contentKey)) });
  } catch (error) {
    return json({ error: error?.message || 'Engagement request failed.' }, 500);
  }
}
