import { bearer, cleanUser, json, rows, sb, verify } from './_shared.js';

const SIGNAL_MARKER = '__fas_call_signal__';
const ALLOWED_TYPES = new Set(['webrtc_offer', 'webrtc_answer', 'ice_candidate', 'webrtc_hangup']);

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const username = cleanUser(url.searchParams.get('username'));
    const since = String(url.searchParams.get('since') || '').trim();
    const ph = bearer(request);
    if (!username || !ph) return json({ error: 'Missing username or auth token.' }, 400);
    if (!await verify(env, username, ph)) return json({ error: 'Authentication failed.' }, 401);

    const filters = [
      'recipient=eq.' + encodeURIComponent(username),
      'file_name=eq.' + encodeURIComponent(SIGNAL_MARKER),
      'select=id,sender,recipient,message,created_at',
      'order=created_at.asc',
      'limit=100',
    ];
    if (since && !Number.isNaN(Date.parse(since))) {
      filters.push('created_at=gte.' + encodeURIComponent(new Date(since).toISOString()));
    }
    const response = await sb(env, '/rest/v1/dm_messages?' + filters.join('&'));
    if (!response.ok) return json({ error: 'Could not load call signals.' }, 500);
    const data = await rows(response);
    const signals = (Array.isArray(data) ? data : []).map(row => {
      try {
        return { id: row.id, sender: row.sender, created_at: row.created_at, ...JSON.parse(row.message || '{}') };
      } catch {
        return null;
      }
    }).filter(Boolean);
    return json({ signals });
  } catch (error) {
    return json({ error: 'Call signaling unavailable.', detail: error.message }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const sender = cleanUser(body.username);
    const recipient = cleanUser(body.recipient);
    const ph = String(body.ph || '');
    const type = String(body.type || '');
    const callId = String(body.call_id || '').slice(0, 160);
    const signalId = String(body.signal_id || '').slice(0, 160);
    if (!sender || !recipient || !ph || !ALLOWED_TYPES.has(type) || !callId || !signalId) {
      return json({ error: 'Missing or invalid call signal fields.' }, 400);
    }
    if (!await verify(env, sender, ph)) return json({ error: 'Authentication failed.' }, 401);

    const payload = JSON.stringify({
      type,
      callId,
      signalId,
      data: body.data || {},
      senderDisplay: String(body.sender_display || sender).slice(0, 120),
      senderSignalCode: String(body.sender_signal_code || '').slice(0, 32),
    });
    if (payload.length > 60000) return json({ error: 'Call signal is too large.' }, 413);

    const response = await sb(env, '/rest/v1/dm_messages?select=id,created_at', {
      method: 'POST',
      body: JSON.stringify({
        sender,
        recipient,
        message: payload,
        file_name: SIGNAL_MARKER,
      }),
    });
    if (!response.ok) return json({ error: 'Could not queue call signal.' }, 500);
    const data = await rows(response);
    return json({ ok: true, signal: Array.isArray(data) ? data[0] : data });
  } catch (error) {
    return json({ error: 'Call signaling unavailable.', detail: error.message }, 503);
  }
}
