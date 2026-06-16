export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  // Test basic fetch to a public API
  try {
    const resp = await fetch('https://httpbin.org/json');
    const text = await resp.text();
    return new Response(text.slice(0, 500), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, stack: (e.stack || '').slice(0, 300) }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
