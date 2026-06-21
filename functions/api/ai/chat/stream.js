import { onRequest as handleChat } from '../chat.js';

const event = (data) => `data: ${JSON.stringify(data)}\n\n`;

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (context.request.method !== 'POST') {
    return new Response(event({ type: 'error', error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    });
  }

  try {
    const request = new Request(new URL('/api/ai/chat', context.request.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await context.request.text(),
    });
    const response = await handleChat({ ...context, request });
    const payload = await response.json().catch(() => ({}));
    const headers = {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
    };

    if (!response.ok || payload.error) {
      return new Response(event({
        type: 'error',
        error: payload.error || `AI request failed (${response.status})`,
        detail: payload.detail || '',
      }) + 'data: [DONE]\n\n', { status: response.ok ? 502 : response.status, headers });
    }

    return new Response(
      event({ type: 'meta', model: payload.model || 'Faceless AI' }) +
      event({ type: 'token', content: payload.reply || 'No response.' }) +
      event({
        type: 'done',
        history: true,
        conversation_id: payload.conversation_id || 'default',
        memory: Boolean(payload.memory),
      }) +
      'data: [DONE]\n\n',
      { headers }
    );
  } catch (error) {
    return new Response(event({ type: 'error', error: error?.message || 'AI stream failed' }), {
      status: 500,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    });
  }
}
