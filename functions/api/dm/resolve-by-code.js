import { json, rows, sb } from './_shared.js';

export async function onRequestGet({ request, env }) {
  try {
    const code = String(new URL(request.url).searchParams.get('code') || '').trim().toUpperCase();
    if (!/^SIG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)) {
      return json({ error: 'Missing or invalid Signal Code.' }, 400);
    }
    const response = await sb(env, '/rest/v1/member_accounts?platform_id=ilike.' + encodeURIComponent(code)
      + '&select=username,display_name,platform_id,social_links&limit=1');
    const data = await rows(response);
    const user = Array.isArray(data) ? data[0] : null;
    if (!response.ok || !user) return json({ error: 'No user found for that Signal Code.' }, 404);
    return json({
      ok: true,
      username: String(user.username || '').toLowerCase(),
      display_name: user.display_name || user.username || '',
      matrix_user_id: user.social_links && user.social_links.matrix || null,
    });
  } catch (error) {
    return json({ error: 'Signal Code lookup unavailable.', detail: error.message }, 503);
  }
}
