export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const {
      account_id,
      signal_id,
      username,
      title,
      slug,
      html,
      css,
      full_document,
      route_hint
    } = body || {};

    if (!username || !html || !css) {
      return Response.json(
        { ok: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabaseUrl = env.SUPABASE_URL;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json(
        { ok: false, error: 'Missing server environment variables' },
        { status: 500 }
      );
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/member_pages?on_conflict=username`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify([{
        account_id: account_id || null,
        signal_id: signal_id || null,
        username,
        title: title || 'Faceless Page',
        slug: slug || username,
        html,
        css,
        full_document: full_document || null,
        route_hint: route_hint || `/${username}`,
        is_published: true,
        updated_at: new Date().toISOString()
      }])
    });

    const data = await res.text();

    if (!res.ok) {
      return Response.json(
        { ok: false, error: data || `Supabase error ${res.status}` },
        { status: 500 }
      );
    }

    return Response.json({
      ok: true,
      live_url: `/${username}`
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err.message || 'Save failed' },
      { status: 500 }
    );
  }
}
