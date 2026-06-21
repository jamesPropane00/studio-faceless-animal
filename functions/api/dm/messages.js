import { bearer, cleanUser, connected, json, rows, sb, verify } from './_shared.js';

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const me = cleanUser(url.searchParams.get('me'));
    const other = cleanUser(url.searchParams.get('other'));
    const ph = bearer(request);
    if (!me || !other || !ph) return json({ error: 'Missing me, other, or auth token.' }, 400);
    if (!await verify(env, me, ph)) return json({ error: 'Authentication failed.' }, 401);
    if (!await connected(env, me, other)) return json({ error: 'Connect with this user before messaging.' }, 403);

    const filter = 'or=(and(sender.eq.' + encodeURIComponent(me) + ',recipient.eq.' + encodeURIComponent(other)
      + '),and(sender.eq.' + encodeURIComponent(other) + ',recipient.eq.' + encodeURIComponent(me) + '))';
    const response = await sb(env, '/rest/v1/dm_messages?' + filter + '&order=created_at.asc&limit=100');
    if (!response.ok) return json({ error: 'Could not load messages.' }, 500);
    return json({ messages: await rows(response) });
  } catch (error) {
    return json({ error: 'DM service unavailable.', detail: error.message }, 503);
  }
}
