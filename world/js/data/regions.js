// RegionData — static region definitions.
// Source: REGIONS from regions/worldmap.js (canonical copy)

const regions = [
  { id: 'city', name: 'Faceless City', type: 'city',desc: 'The beating heart of the world.', connections: ['farmlands', 'whisper-woods', 'iron-district'], mapPos: { x: 2, y: 2 }, color: '#a78bfa', label: '🏙️' },
  { id: 'farmlands', name: 'Farmlands', type: 'farmlands',desc: 'Golden fields and peaceful pastures.', connections: ['city', 'whisper-woods'], mapPos: { x: 0, y: 2 }, color: '#84cc16', label: '🌾' },
  { id: 'whisper-woods', name: 'Whisper Woods', type: 'forest',desc: 'Ancient trees that whisper secrets.', connections: ['city', 'farmlands', 'mountains'], mapPos: { x: 1, y: 0 }, color: '#22c55e', label: '🌳' },
  { id: 'iron-district', name: 'Iron District', type: 'industrial',desc: 'Factories never sleep.', connections: ['city', 'mountains'], mapPos: { x: 4, y: 2 }, color: '#6b7280', label: '🏭' },
  { id: 'mountains', name: 'Mountains', type: 'mountain',desc: 'Snow-capped peaks hide ancient caves.', connections: ['whisper-woods', 'iron-district', 'coast'], mapPos: { x: 3, y: 0 }, color: '#a8a29e', label: '⛰️' },
  { id: 'coast', name: 'Coast', type: 'coast',desc: 'Where the city meets the sea.', connections: ['mountains', 'purple-pulse'], mapPos: { x: 4, y: 4 }, color: '#38bdf8', label: '🏝️' },
  { id: 'purple-pulse', name: 'Purple Pulse', type: 'nightlife',desc: 'The underground never sleeps.', connections: ['coast', 'city'], mapPos: { x: 2, y: 4 }, color: '#c084fc', label: '🎨' }
]

function getRegion(id) { return regions.find(r => r.id === id) || null }
function getConnectedRegions(id) { const r = getRegion(id); return r ? r.connections.map(c => getRegion(c)).filter(Boolean) : [] }

export { regions, getRegion, getConnectedRegions }
