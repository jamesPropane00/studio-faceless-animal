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

  const CF_AI_TOKEN = (context.env && context.env.CF_AI_TOKEN) || '';
  const CF_ACCOUNT_ID = (context.env && context.env.CF_ACCOUNT_ID) || '';

  if (!CF_AI_TOKEN || !CF_ACCOUNT_ID) {
    return new Response(JSON.stringify({
      error: 'AI service not configured. Set CF_AI_TOKEN and CF_ACCOUNT_ID.',
    }), { status: 503, headers: { 'content-type': 'application/json' } });
  }

  const aiRes = await fetch('https://api.cloudflare.com/client/v4/accounts/' + CF_ACCOUNT_ID + '/ai/run/@cf/meta/llama-3.2-3b-instruct', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + CF_AI_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'You are a helpful AI assistant named Faceless AI.' },
        { role: 'user', content: message },
      ],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    return new Response(JSON.stringify({
      error: 'AI service error',
      status: aiRes.status,
      detail: errText.slice(0, 300),
    }), { status: 502, headers: { 'content-type': 'application/json' } });
  }

  const data = await aiRes.json();
  const reply = data && data.result && data.result.response;
  return new Response(JSON.stringify({ reply: reply || '...' }), {
    headers: { 'content-type': 'application/json' },
  });
}
