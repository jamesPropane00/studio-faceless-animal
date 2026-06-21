import { cleanUser, connected, json, rows, sb, verify } from './_shared.js';

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const sender = cleanUser(body.username);
    const recipient = cleanUser(body.recipient);
    const ph = String(body.ph || '');
    const message = String(body.message || '').trim();
    if (!sender || !recipient || !ph || !message) return json({ error: 'Missing message fields.' }, 400);
    if (message.length > 500) return json({ error: 'Message must be 500 characters or fewer.' }, 400);
    if (!await verify(env, sender, ph)) return json({ error: 'Authentication failed.' }, 401);
    if (!await connected(env, sender, recipient)) return json({ error: 'Connect with this user before messaging.' }, 403);

    const response = await sb(env, '/rest/v1/dm_messages?select=*', {
      method: 'POST',
      body: JSON.stringify({ sender, recipient, message }),
    });
    if (!response.ok) return json({ error: 'Failed to send message.' }, 500);
    const data = await rows(response);
    return json({ message: Array.isArray(data) ? data[0] : data });
  } catch (error) {
    return json({ error: 'DM service unavailable.', detail: error.message }, 503);
  }
}
