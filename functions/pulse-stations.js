// pulse-stations.js
// API endpoint to return non-YouTube, non-Spotify radio stations and their tracks from Supabase
// Requires supabase-js installed and environment variables for SUPABASE_URL and SUPABASE_ANON_KEY

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ghufaozjwondqcrcucjs.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_kixI74nB7Drt6mQKooaXHg_nPoE0h_-';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Only include audio channels (not YouTube/Spotify)
const AUDIO_CHANNELS = [1, 4, 5];

module.exports = async function (req, res) {
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
      return res.status(500).json({ error: error.message });
    }

    // Group tracks by channel
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
    res.status(200).json({ stations });
  } catch (err) {
    console.error('[Pulse API] Handler error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
