import { onRequestGet as pulseStationsGet } from '../pulse-stations.js';

export async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    });
  }

  return pulseStationsGet(context);
}
