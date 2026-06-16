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

  const modelIndex = Math.min(Math.max(parseInt(body.model) || 0, 0), 2);
  const MODEL_LIST = ['microsoft/phi-2', 'HuggingFaceH4/zephyr-7b-beta', 'TinyLlama/TinyLlama-1.1B-Chat-v1.0'];
  const model = MODEL_LIST[modelIndex];
  const HF_TOKEN = context.env.HF_TOKEN || '';

  const prompt = model.includes('phi')
    ? 'Instruct: ' + message + '\nOutput:'
    : '<|system|>\nYou are a helpful AI assistant named Faceless AI.</s>\n<|user|>\n' + message + '</s>\n<|assistant|>\n';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const hfRes = await fetch('https://api-inference.huggingface.co/models/' + model, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(HF_TOKEN ? { 'Authorization': 'Bearer ' + HF_TOKEN } : {}),
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: 512, return_full_text: false, temperature: 0.7 },
      }),
      signal: controller.signal,
    });

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      const isModelLoading = hfRes.status === 503 || errText.includes('loading');
      return new Response(JSON.stringify({
        error: isModelLoading ? 'AI model is waking up — please try again in a moment.' : 'AI service unavailable.',
        detail: isModelLoading ? 'Model cold-starting' : errText.slice(0, 200),
        retryable: isModelLoading,
      }), {
        status: isModelLoading ? 503 : 502,
        headers: { 'content-type': 'application/json' },
      });
    }

    const data = await hfRes.json();
    let text = Array.isArray(data) && data[0]
      ? (data[0].generated_text || '')
      : (data.generated_text || JSON.stringify(data));

    if (text.startsWith(prompt)) text = text.slice(prompt.length).trim();

    return new Response(JSON.stringify({ reply: text.trim() || '...' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    const isTimeout = e.name === 'AbortError';
    return new Response(JSON.stringify({
      error: isTimeout ? 'AI is taking too long — please try again.' : 'AI request failed',
      detail: isTimeout ? 'Request timed out after 25s' : e.message,
      retryable: true,
    }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  } finally {
    clearTimeout(timeout);
  }
}
