export async function onRequestGet(context) {
  const { params, env } = context;
  // Extract username from the path
  const url = new URL(context.request.url);
  const username = url.pathname.replace(/^\//, '').split('/')[0];

  // Ignore root and known static routes
  const staticRoutes = [
    '', 'index.html', 'landingpage', 'about', 'login', 'dashboard', 'faq', 'pricing', 'store', 'radio', 'music', 'admin', 'assets', 'api', 'games', 'network', 'presence', 'storage', 'wallet', 'my-media', 'my-page', 'my-pages', 'artists', 'business', 'templates', 'supabase', 'scripts', 'sql', 'Studio-Faceless-Animalv3-Original', 'artifacts', 'branding', 'attached_assets', '_headers', '_redirects', 'favicon.ico', 'robots.txt', 'manifest.json'
  ];
  if (staticRoutes.includes(username)) {
    return context.next(); // Let static file or other route handle
  }

  // Fetch the user's published page from Supabase
  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/member_pages?username=eq.${encodeURIComponent(username)}&is_published=eq.true&select=html,css,full_document`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    }
  });

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
