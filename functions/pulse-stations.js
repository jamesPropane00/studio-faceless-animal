const AUDIO_CHANNELS = [1, 4, 5];

export async function onRequestGet(context) {
  const SUPABASE_URL = context.env.SUPABASE_URL || 'https://ghufaozjwondqcrcucjs.supabase.co';
  const SUPABASE_ANON_KEY = context.env.SUPABASE_ANON_KEY || 'sb_publishable_kixI74nB7Drt6mQKooaXHg_nPoE0h_-';
  const supabaseBase = SUPABASE_URL.replace(/\/+$/, '');

  try {
    console.log('[Pulse API] Request received');
    const params = new URLSearchParams({
      select: 'id,title,artist,src,storage_path,channel,is_active',
      channel: `in.(${AUDIO_CHANNELS.join(',')})`,
      is_active: 'eq.true',
      order: 'channel.asc,title.asc',
    });
    const res = await fetch(`${supabaseBase}/rest/v1/radio_tracks?${params.toString()}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    const data = await res.json();

    if (!res.ok) {
      const message = data?.message || `Supabase error ${res.status}`;
      console.error('[Pulse API] Supabase error:', message);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

    const stations = {};
    AUDIO_CHANNELS.forEach(ch => stations[ch] = []);
    (data || []).forEach(track => {
      stations[track.channel].push({
        id: track.id,
        title: track.title,
        artist: track.artist,
        src: track.storage_path
          ? `${supabaseBase}/storage/v1/object/public/radio/${String(track.storage_path).replace(/^\/+/,'')}`
          : track.src || '',
      });
    });

    console.log('[Pulse API] Returning stations:', JSON.stringify(stations));
    return new Response(JSON.stringify({ stations }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('[Pulse API] Handler error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
