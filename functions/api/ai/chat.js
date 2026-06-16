export async function onRequest(context) {
  return new Response(JSON.stringify({ ok: true, message: 'hello from faceless ai' }), {
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  });
}
