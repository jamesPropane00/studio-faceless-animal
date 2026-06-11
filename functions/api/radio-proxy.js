async function handleAudioProxy(context, method) {
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

  const upstream = await fetch(target, { method, headers });
  const outHeaders = new Headers(upstream.headers);
  outHeaders.set('Access-Control-Allow-Origin', '*');
  outHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  outHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type');
  outHeaders.set('Cache-Control', 'public, max-age=3600');
  if (!outHeaders.get('Content-Type')) {
    outHeaders.set('Content-Type', 'audio/mpeg');
  }

  return new Response(method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

export async function onRequestGet(context) {
  return handleAudioProxy(context, 'GET');
}

export async function onRequestHead(context) {
  return handleAudioProxy(context, 'HEAD');
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
