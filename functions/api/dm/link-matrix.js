import { cleanUser, json, rows, sb, verify } from './_shared.js';

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const username = cleanUser(body.username);
    const ph = String(body.ph || '');
    const matrixId = String(body.matrix_user_id || '').trim();
    if (!username || !ph || !/^@[^:]+:[^:]+$/.test(matrixId)) {
      return json({ error: 'Missing username, auth token, or Matrix user ID.' }, 400);
    }
    if (!await verify(env, username, ph)) return json({ error: 'Authentication failed.' }, 401);

    const getResponse = await sb(env, '/rest/v1/member_accounts?username=eq.' + encodeURIComponent(username)
      + '&select=social_links&limit=1');
    const data = await rows(getResponse);
    const socialLinks = data[0] && data[0].social_links && typeof data[0].social_links === 'object'
      ? { ...data[0].social_links }
      : {};
    socialLinks.matrix = matrixId;
    const update = await sb(env, '/rest/v1/member_accounts?username=eq.' + encodeURIComponent(username), {
      method: 'PATCH',
      body: JSON.stringify({ social_links: socialLinks }),
    });
    return update.ok ? json({ ok: true }) : json({ error: 'Failed to link Matrix account.' }, 500);
  } catch (error) {
    return json({ error: 'Matrix linking unavailable.', detail: error.message }, 503);
  }
}
