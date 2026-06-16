export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  const token = context.env.CF_AI_TOKEN || '';
  const accountId = context.env.CF_ACCOUNT_ID || '';

  let result = { tokenLen: token.length, accountId };

  // Test fetch to api.cloudflare.com
  try {
    const testUrl = 'https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/models/search?search=llama';
    const resp = await fetch(testUrl, {
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    });
    const bodyText = await resp.text();
    result = { status: resp.status, body: bodyText.slice(0, 500), tokenLen: token.length, accountId };
  } catch (e) {
    result = { error: e.message, name: e.name, stack: (e.stack || '').slice(0, 300) };
  }

  return new Response(JSON.stringify(result), {
    headers: { 'content-type': 'application/json' },
  });
}
