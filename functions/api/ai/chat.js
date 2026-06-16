export async function onRequest(context) {
  const method = context.request.method;
  const url = context.request.url;
  let bodyText = '';
  try { bodyText = await context.request.text(); } catch(e) { bodyText = 'read_error: ' + e.message; }

  return new Response(JSON.stringify({
    method,
    url,
    bodySnippet: bodyText.slice(0, 100),
    envExists: typeof context.env !== 'undefined',
    envKeys: context.env ? Object.keys(context.env).join(',') : 'no_env',
  }), {
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  });
}
