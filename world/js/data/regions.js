// RegionData — static region definitions.
// Source: REGIONS from regions/worldmap.js (canonical copy)

const regions = [
  { id: 'city', name: 'Faceless City', type: 'city',desc: 'The beating heart of the world.', connections: ['farmlands', 'whisper-woods', 'iron-district'], mapPos: { x: 2, y: 2 }, color: '#a78bfa', label: '\u{1F3D9}\uFE0F' },
  { id: 'farmlands', name: 'Farmlands', type: 'farmlands',desc: 'Golden fields and peaceful pastures.', connections: ['city', 'whisper-woods'], mapPos: { x: 0, y: 2 }, color: '#84cc16', label: '\u{1F33E}' },
  { id: 'whisper-woods', name: 'Whisper Woods', type: 'forest',desc: 'Ancient trees that whisper secrets.', connections: ['city', 'farmlands', 'mountains'], mapPos: { x: 1, y: 0 }, color: '#22c55e', label: '\u{1F333}' },
  { id: 'iron-district', name: 'Iron District', type: 'industrial',desc: 'Factories never sleep.', connections: ['city', 'mountains'], mapPos: { x: 4, y: 2 }, color: '#6b7280', label: '\u{1F3ED}' },
  { id: 'mountains', name: 'Mountains', type: 'mountain',desc: 'Snow-capped peaks hide ancient caves.', connections: ['whisper-woods', 'iron-district', 'coast'], mapPos: { x: 3, y: 0 }, color: '#a8a29e', label: '\u26F0\uFE0F' },
  { id: 'coast', name: 'Coast', type: 'coast',desc: 'Where the city meets the sea.', connections: ['mountains', 'purple-pulse'], mapPos: { x: 4, y: 4 }, color: '#38bdf8', label: '\u{1F3DD}\uFE0F' },
  { id: 'purple-pulse', name: 'Purple Pulse', type: 'nightlife',desc: 'The underground never sleeps.', connections: ['coast', 'city'], mapPos: { x: 2, y: 4 }, color: '#c084fc', label: '\u{1F3A8}' }
]

const REGIONS = {
  city: {
    id: 'city', name: 'Faceless City', type: 'city',
    desc: 'The beating heart of the world. Neon lights, crowded streets, and endless opportunity.',
    connections: ['farmlands', 'whisper-woods', 'iron-district'],
    mapPos: { x: 2, y: 2 },
    color: '#a78bfa',
    label: '\u{1F3D9}\uFE0F',
  },
  farmlands: {
    id: 'farmlands', name: 'Farmlands', type: 'farmlands',
    desc: 'Golden fields and peaceful pastures stretching to the horizon.',
    connections: ['city', 'whisper-woods'],
    mapPos: { x: 0, y: 2 },
    color: '#84cc16',
    label: '\u{1F33E}',
  },
  'whisper-woods': {
    id: 'whisper-woods', name: 'Whisper Woods', type: 'forest',
    desc: 'Ancient trees that whisper secrets. Glowing creatures roam the undergrowth.',
    connections: ['city', 'farmlands', 'mountains'],
    mapPos: { x: 1, y: 0 },
    color: '#22c55e',
    label: '\u{1F333}',
  },
  'iron-district': {
    id: 'iron-district', name: 'Iron District', type: 'industrial',
    desc: 'Factories never sleep. Smoke and steel dominate the skyline.',
    connections: ['city', 'mountains'],
    mapPos: { x: 4, y: 2 },
    color: '#6b7280',
    label: '\u{1F3ED}',
  },
  mountains: {
    id: 'mountains', name: 'Mountains', type: 'mountain',
    desc: 'Snow-capped peaks hide ancient caves and valuable ore.',
    connections: ['whisper-woods', 'iron-district', 'coast'],
    mapPos: { x: 3, y: 0 },
    color: '#a8a29e',
    label: '\u26F0\uFE0F',
  },
  coast: {
    id: 'coast', name: 'Coast', type: 'coast',
    desc: 'Where the city meets the sea. Docks, beaches, and ocean trade.',
    connections: ['mountains', 'purple-pulse'],
    mapPos: { x: 4, y: 4 },
    color: '#38bdf8',
    label: '\u{1F3DD}\uFE0F',
  },
  'purple-pulse': {
    id: 'purple-pulse', name: 'Purple Pulse', type: 'nightlife',
    desc: 'The underground never sleeps. Music, bass, and neon-drenched alleys.',
    connections: ['coast', 'city'],
    mapPos: { x: 2, y: 4 },
    color: '#c084fc',
    label: '\u{1F3A8}',
  },
}

const NEIGHBORHOOD_THEMES = {
  purple_pulse: {
    name: 'Purple Pulse', emoji: '\u{1F3B5}', color: '#a78bfa',
    roadTint: 'rgba(167, 139, 250, 0.2)',
    buildingTint: 'rgba(167, 139, 250, 0.06)',
    glowColor: 'rgba(167, 139, 250, 0.04)',
    desc: 'Nightlife \u00B7 Music \u00B7 Neon'
  },
  graffiti_row: {
    name: 'Graffiti Row', emoji: '\u{1F3A8}', color: '#f43f5e',
    roadTint: 'rgba(244, 63, 94, 0.15)',
    buildingTint: 'rgba(251, 191, 36, 0.06)',
    glowColor: 'rgba(244, 63, 94, 0.04)',
    desc: 'Murals \u00B7 Art \u00B7 Street Culture'
  },
  signal_square: {
    name: 'Signal Square', emoji: '\u{1F4E1}', color: '#3b82f6',
    roadTint: 'rgba(59, 130, 246, 0.15)',
    buildingTint: 'rgba(96, 165, 250, 0.06)',
    glowColor: 'rgba(59, 130, 246, 0.04)',
    desc: 'Media \u00B7 News \u00B7 Broadcast'
  },
  old_harbor: {
    name: 'Old Harbor', emoji: '\u2693', color: '#d97706',
    roadTint: 'rgba(217, 119, 6, 0.15)',
    buildingTint: 'rgba(180, 130, 80, 0.06)',
    glowColor: 'rgba(217, 119, 6, 0.04)',
    desc: 'Markets \u00B7 Docks \u00B7 Trade'
  },
  iron_district: {
    name: 'Iron District', emoji: '\u{1F3ED}', color: '#6b7280',
    roadTint: 'rgba(107, 114, 128, 0.2)',
    buildingTint: 'rgba(156, 163, 175, 0.06)',
    glowColor: 'rgba(107, 114, 128, 0.04)',
    desc: 'Industry \u00B7 Warehouses \u00B7 Freight'
  }
}

function getRegion(id) { return regions.find(r => r.id === id) || null }
function getConnectedRegions(id) { const r = getRegion(id); return r ? r.connections.map(c => getRegion(c)).filter(Boolean) : [] }

export { regions, getRegion, getConnectedRegions, REGIONS, NEIGHBORHOOD_THEMES }
