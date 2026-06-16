export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  const token = context.env.CF_AI_TOKEN || '';
  const accountId = context.env.CF_ACCOUNT_ID || '';

  return new Response(JSON.stringify({
    tokenPrefix: token.slice(0, 10),
    tokenLength: token.length,
    tokenEnd: token.slice(-6),
    accountId,
    accountIdLength: accountId.length,
    envList: Object.keys(context.env).join(', '),
  }), {
    headers: { 'content-type': 'application/json' },
  });
}
