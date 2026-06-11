// pulse-station-ui.js
// Reimagined: Separate station and track dropdowns for Pulse

const stationSelect = document.getElementById('stationSelect');
const trackSelect = document.getElementById('trackSelect');
const trackSelectWrap = document.getElementById('trackSelectWrap');
const stationDesc = document.getElementById('stationDesc');

let STATION_DATA = {};

function setStationDesc(text) {
  stationDesc.textContent = text || '';
}

function populateStations(stations) {
  stationSelect.innerHTML = '<option value="file">🎵 Upload Audio File</option>';
  Object.entries(stations).forEach(([ch, tracks]) => {
    if (tracks.length > 0) {
      const label = `Station ${ch} · ${getStationLabel(ch)}`;
      const opt = document.createElement('option');
      opt.value = ch;
      opt.textContent = label;
      stationSelect.appendChild(opt);
    }
  });
}

function populateTracks(tracks) {
  trackSelect.innerHTML = '';
  tracks.forEach(track => {
    const opt = document.createElement('option');
    opt.value = track.id;
    opt.textContent = track.title + (track.artist ? ` · ${track.artist}` : '');
    trackSelect.appendChild(opt);
  });
}

function getStationLabel(ch) {
  switch (String(ch)) {
    case '1': return 'Original';
    case '4': return 'Blends';
    case '5': return 'Archives';
    default: return 'Audio';
  }
}

async function loadStations() {
  try {
    const res = await fetch('/functions/pulse-stations.js');
    const json = await res.json();
    STATION_DATA = json.stations || {};
    populateStations(STATION_DATA);
    setStationDesc('Upload your own audio file or select a station.');
    // Hide track select by default
    trackSelectWrap.style.display = 'none';
  } catch (e) {
    stationSelect.innerHTML = '<option value="file">🎵 Upload Audio File</option>';
    setStationDesc('Could not load stations.');
    trackSelectWrap.style.display = 'none';
  }
}

stationSelect.addEventListener('change', () => {
  const val = stationSelect.value;
  if (val === 'file') {
    setStationDesc('Upload your own audio file to visualize.');
    trackSelectWrap.style.display = 'none';
  } else {
    const tracks = (STATION_DATA[val] || []);
    if (tracks.length > 0) {
      populateTracks(tracks);
      setStationDesc('Select a track from this station.');
      trackSelectWrap.style.display = '';
    } else {
      setStationDesc('No tracks available for this station.');
      trackSelectWrap.style.display = 'none';
    }
  }
});

// Initial load
loadStations();
