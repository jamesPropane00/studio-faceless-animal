export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const rawPath = url.searchParams.get('path') || '';
  const fallbackBase = 'https://ghufaozjwondqcrcucjs.supabase.co';
  const supabaseBase = String(context.env.SUPABASE_URL || fallbackBase).replace(/\/+$/, '');

  if (!rawPath || rawPath.includes('..')) {
    return new Response('Missing audio path', { status: 400 });
  }

  const audioPath = rawPath.replace(/^\/+/, '');
  const target = `${supabaseBase}/storage/v1/object/public/radio/${audioPath}`;
  const headers = {};
  const range = context.request.headers.get('range');
  if (range) headers.Range = range;

  const upstream = await fetch(target, { headers });
  const outHeaders = new Headers(upstream.headers);
  outHeaders.set('Access-Control-Allow-Origin', '*');
  outHeaders.set('Cache-Control', 'public, max-age=3600');
  if (!outHeaders.get('Content-Type')) {
    outHeaders.set('Content-Type', 'audio/mpeg');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}
