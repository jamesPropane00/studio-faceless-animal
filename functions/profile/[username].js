export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const pathname = url.pathname.replace(/^\/profile\//, '');
    const username = pathname.split('/')[0];

    // Validate username (no dots, not empty)
    if (!username || username.includes('.')) {
      return new Response('Not found', { status: 404 });
    }

    // Try to fetch dynamic user page from Supabase
    const env = context.env || {};
    const SUPABASE_URL = env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response('Service unavailable', { status: 503 });
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/member_pages?username=eq.${encodeURIComponent(username)}&is_published=eq.true&select=html,css,full_document`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      return new Response('Not found', { status: 404 });
    }

    const data = await res.json();
    if (!data || !data[0]) {
      return new Response('Not found', { status: 404 });
    }

    const { html, css, full_document } = data[0];
    if (full_document) {
      return new Response(full_document, { headers: { 'Content-Type': 'text/html' } });
    }

    const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${username}</title>
  <style>${css || ''}</style>
</head>
<body>
${html || ''}
</body>
</html>`;
    return new Response(page, { headers: { 'Content-Type': 'text/html' } });
  } catch (error) {
    console.error('Profile worker error:', error?.message || error);
    return new Response('Error', { status: 500 });
  }
}
