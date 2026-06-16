export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  const token = context.env.CF_AI_TOKEN || '';
  const accountId = context.env.CF_ACCOUNT_ID || '';

  // Debug: echo env info and test fetch to CF AI
  let result = { tokenPrefix: token.slice(0, 10), tokenLength: token.length, accountId };

  try {
    const aiRes = await fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/run/@cf/meta/llama-3.2-3b-instruct', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'You are an AI assistant.' },
          { role: 'user', content: 'Say hello in one word.' },
        ],
      }),
    });

    const status = aiRes.status;
    const bodyText = await aiRes.text();
    result = { status, body: bodyText.slice(0, 500), tokenPrefix: token.slice(0, 10) };
  } catch (e) {
    result = { error: e.message, name: e.name, stack: (e.stack || '').slice(0, 300) };
  }

  return new Response(JSON.stringify(result), {
    headers: { 'content-type': 'application/json' },
  });
}
