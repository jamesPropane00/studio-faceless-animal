import { bearer, cleanUser, json, rows, sb, verify } from './_shared.js';

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const username = cleanUser(url.searchParams.get('username'));
    const ph = bearer(request);
    if (!username || !ph) return json({ error: 'Missing username or auth token.' }, 400);
    if (!await verify(env, username, ph)) return json({ error: 'Authentication failed.' }, 401);

    const filter = 'or=(sender.eq.' + encodeURIComponent(username) + ',recipient.eq.' + encodeURIComponent(username) + ')';
    const response = await sb(env, '/rest/v1/dm_messages?' + filter
      + '&select=sender,recipient,message,file_name,created_at,read_at&order=created_at.desc');
    if (!response.ok) return json({ error: 'Could not load threads.' }, 500);
    const data = await rows(response);
    const seen = {};
    for (const row of Array.isArray(data) ? data : []) {
      if (row.file_name === '__fas_call_signal__') continue;
      const partner = row.sender === username ? row.recipient : row.sender;
      if (!partner) continue;
      if (!seen[partner]) {
        seen[partner] = {
          username: partner,
          last_message: row.file_name ? 'Attachment: ' + row.file_name : row.message,
          last_ts: row.created_at,
          unread: row.recipient === username && !row.read_at ? 1 : 0,
        };
      } else if (row.recipient === username && !row.read_at) {
        seen[partner].unread += 1;
      }
    }
    return json({ threads: Object.values(seen) });
  } catch (error) {
    return json({ error: 'DM service unavailable.', detail: error.message }, 503);
  }
}
