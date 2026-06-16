export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const message = String(body.message || '').trim();
  if (!message) {
    return new Response(JSON.stringify({ error: 'Message is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const model = 'HuggingFaceH4/zephyr-7b-beta';
    const prompt = '<|system|>\nYou are a helpful AI assistant named Faceless AI.</s>\n<|user|>\n' + message + '</s>\n<|assistant|>\n';

    const hfRes = await fetch('https://huggingface.co/api/models/' + model, {
      method: 'GET',
      headers: { 'User-Agent': 'Cloudflare-Pages-Function' },
    });

    return new Response(JSON.stringify({
      status: hfRes.status,
      ok: hfRes.ok,
    }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Fetch failed',
      detail: e.message,
      name: e.name,
    }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
