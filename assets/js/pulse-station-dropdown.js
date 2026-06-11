// pulse-station-dropdown.js
// Handles loading and populating the station & track dropdown for Pulse

const stationTrackSelect = document.getElementById('stationTrackSelect');
const STATION_DESCS = { file: 'Upload your own audio file to visualize.' };
let STATION_TRACKS = { file: [] };

async function loadStationsAndTracks() {
  try {
    const res = await fetch('/functions/pulse-stations.js');
    const json = await res.json();
    // Always reset dropdown and tracks
    stationTrackSelect.innerHTML = '<option value="file">🎵 Upload Audio File</option>';
    STATION_TRACKS = { file: [] };
    if (!json.stations) return;
    // Add stations and tracks
    Object.entries(json.stations).forEach(([ch, tracks]) => {
      tracks.forEach(track => {
        const opt = document.createElement('option');
        opt.value = `${ch}|${track.id}`;
        opt.textContent = `Ch ${ch}: ${track.title}`;
        stationTrackSelect.appendChild(opt);
        if (!STATION_TRACKS[ch]) STATION_TRACKS[ch] = [];
        STATION_TRACKS[ch].push(track);
      });
    });
  } catch (e) {
    stationTrackSelect.innerHTML = '<option value="file">🎵 Upload Audio File</option>';
  }
}

function updateStationDesc() {
  const val = stationTrackSelect.value;
  if (val === 'file') {
    document.getElementById('stationDesc').textContent = STATION_DESCS.file;
  } else {
    const [ch, id] = val.split('|');
    const track = (STATION_TRACKS[ch] || []).find(t => String(t.id) === id);
    document.getElementById('stationDesc').textContent = track ? `Track: ${track.title}${track.artist ? ' · ' + track.artist : ''}` : '';
  }
}

stationTrackSelect.addEventListener('change', updateStationDesc);

// Initial load
loadStationsAndTracks().then(updateStationDesc);
