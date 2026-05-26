import { createClient } from '@supabase/supabase-js';

const AUDIO_CHANNELS = [1, 4, 5];

export async function onRequestGet(context) {
  const SUPABASE_URL = context.env.SUPABASE_URL || 'https://ghufaozjwondqcrcucjs.supabase.co';
  const SUPABASE_ANON_KEY = context.env.SUPABASE_ANON_KEY || 'sb_publishable_kixI74nB7Drt6mQKooaXHg_nPoE0h_-';
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    console.log('[Pulse API] Request received');
    const { data, error } = await supabase
      .from('radio_tracks')
      .select('id,title,artist,src,storage_path,channel,is_active')
      .in('channel', AUDIO_CHANNELS)
      .eq('is_active', true)
      .order('channel', { ascending: true })
      .order('title', { ascending: true });

    if (error) {
      console.error('[Pulse API] Supabase error:', error.message);
      return new Response(JSON.stringify({ error: error.message }), {
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
          ? `${SUPABASE_URL}/storage/v1/object/public/radio/${String(track.storage_path).replace(/^\/+/,'')}`
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
