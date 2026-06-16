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

  const HF_TOKEN = context.env.HF_TOKEN || '';
  const model = 'HuggingFaceH4/zephyr-7b-beta';

  try {
    const hfRes = await fetch('https://api-inference.huggingface.co/models/' + model, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(HF_TOKEN ? { 'Authorization': 'Bearer ' + HF_TOKEN } : {}),
      },
      body: JSON.stringify({
        inputs: message,
        parameters: { max_new_tokens: 1024, return_full_text: false },
      }),
    });

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      return new Response(JSON.stringify({
        error: 'AI service unavailable.',
        detail: errText.slice(0, 200),
      }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      });
    }

    const data = await hfRes.json();
    const text = Array.isArray(data) && data[0]
      ? (data[0].generated_text || '')
      : (data.generated_text || JSON.stringify(data));

    return new Response(JSON.stringify({ reply: text.trim() }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'AI request failed', detail: e.message }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
