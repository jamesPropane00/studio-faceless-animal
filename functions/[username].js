export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const pathname = url.pathname.replace(/^\//, '');

    // Skip any path with a dot (file extension)
    if (pathname.includes('.')) {
      return new Response('Not found', { status: 404 });
    }

    const username = pathname.split('/')[0];

    // Skip known directory and page routes
    const skipRoutes = [
      '', 'index', 'landingpage', 'about', 'login', 'dashboard', 'faq', 'pricing', 'store', 'radio', 'music', 'admin', 'assets', 'api', 'games', 'network', 'presence', 'storage', 'wallet', 'my-media', 'my-page', 'my-pages', 'artists', 'business', 'templates', 'supabase', 'scripts', 'sql', 'Studio-Faceless-Animalv3-Original', 'artifacts', 'branding', 'attached_assets', '_headers', '_redirects', 'favicon.ico', 'robots.txt', 'manifest.json',
      'apps', 'build-like-this', 'create', 'free', 'phone', 'paid', 'old-login', 'old-login-utf8', 'messages', 'miner', 'mobile_builder_app', 'grapesjs-block-test', 'game-word', 'game-rush', 'game-quick', 'game-beat', 'pulse', 'quick-template', 'radio-original', 'directory', 'drops', 'services', 'supabase-setup', 'start', 'faceless_builder_fullstack', 'faceless_builder_app', 'faceless_builder_supabase', 'faceless_builder', 'thankyou'
    ];

    if (skipRoutes.includes(username)) {
      return new Response('Not found', { status: 404 });
    }

    // Try to fetch dynamic user page
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
    console.error('Worker error:', error?.message || error);
    return new Response('Error', { status: 500 });
  }
}

  if (!res.ok) {
    return new Response('User page not found.', { status: 404 });
  }
  const data = await res.json();
  if (!data || !data[0]) {
    return new Response('User page not found.', { status: 404 });
  }
  const { html, css, full_document } = data[0];

  // If full_document is present, serve it as-is
  if (full_document) {
    return new Response(full_document, { headers: { 'Content-Type': 'text/html' } });
  }

  // Otherwise, build a minimal HTML page
  const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${username}'s Page</title>
  <style>${css || ''}</style>
</head>
<body>
${html || ''}
</body>
</html>`;
  return new Response(page, { headers: { 'Content-Type': 'text/html' } });
}
