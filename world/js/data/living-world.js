// Phase 16: one data contract for every playable region.
// Runtime systems consume this catalog instead of growing separate region switches.

export const DIRECTOR_TICK_MS = 120000

export const SEASONS = {
  spring: {
    name: 'Spring', icon: '🌷', color: '#86efac',
    cropGrowth: 1.18, cropYield: 1, wildlife: 1.2,
    discoveries: ['mushrooms', 'flowers', 'rabbits'],
    summary: 'Rain, flowers, mushrooms, and returning wildlife.'
  },
  summer: {
    name: 'Summer', icon: '☀️', color: '#fde047',
    cropGrowth: 1.28, cropYield: 1.05, wildlife: 1.1,
    discoveries: ['bees', 'festival flyers', 'warm-water fish'],
    summary: 'Fast crops, active wildlife, festivals, and long evenings.'
  },
  fall: {
    name: 'Fall', icon: '🍂', color: '#fb923c',
    cropGrowth: .94, cropYield: 1.25, wildlife: 1,
    discoveries: ['apples', 'pumpkins', 'colored leaves'],
    summary: 'Strong harvests, apples, pumpkins, and migrating wildlife.'
  },
  winter: {
    name: 'Winter', icon: '❄️', color: '#bae6fd',
    cropGrowth: .72, cropYield: .9, wildlife: .78,
    discoveries: ['animal tracks', 'frozen ponds', 'holiday market goods'],
    summary: 'Slow fields, snow tracks, frozen water, and indoor markets.'
  }
}

const profile = (config) => ({
  terrainGenerator: '',
  buildCatalog: [],
  wildlifeCatalog: [],
  npcCatalog: [],
  discoveryCatalog: [],
  economyRules: { exports: [], needs: [] },
  weatherProfile: { clear: .4, cloudy: .25, rain: .2, storm: .1, fog: .05 },
  encounterTable: [],
  trailJournal: true,
  ambientAudio: [],
  events: [],
  ...config
})

export const REGION_WORLD_PROFILES = {
  city: profile({
    terrainGenerator: 'city',
    buildCatalog: ['property', 'business', 'public-works', 'streets'],
    wildlifeCatalog: ['pigeons', 'alley cats', 'signal raccoons'],
    npcCatalog: ['residents', 'workers', 'merchants', 'broadcasters'],
    discoveryCatalog: ['street art', 'business openings', 'radio signals'],
    economyRules: { exports: ['tools', 'services'], needs: ['food', 'eggs', 'milk'] },
    weatherProfile: { clear: .42, cloudy: .28, rain: .18, storm: .07, fog: .05 },
    encounterTable: ['commute story', 'delivery arrival', 'shop request'],
    ambientAudio: ['traffic', 'crowd murmur', 'distant radio'],
    events: [
      { id:'business-rush', icon:'🏪', title:'Business Rush', text:'Markets fill with residents looking for supplies.', resource:'services', amount:2 },
      { id:'delivery-window', icon:'🚚', title:'Delivery Window', text:'City loading zones open for incoming regional goods.', resource:'food', amount:-1 },
      { id:'commute-wave', icon:'🚶', title:'Commute Wave', text:'Workers move between homes, shops, and the Iron District.', resource:'tools', amount:1 }
    ]
  }),
  farmlands: profile({
    terrainGenerator: 'farmlands',
    buildCatalog: ['crops', 'animals', 'machines', 'storage', 'dirt-paths'],
    wildlifeCatalog: ['chickens', 'cows', 'bees', 'signal rabbits'],
    npcCatalog: ['farmhands', 'drivers', 'roadside customers'],
    discoveryCatalog: ['wildflowers', 'lost seed packets', 'fresh tracks'],
    economyRules: { exports: ['food', 'eggs', 'milk'], needs: ['lumber', 'tools'] },
    weatherProfile: { clear: .34, cloudy: .25, rain: .28, storm: .08, fog: .05 },
    encounterTable: ['crop ready', 'animal care', 'new order'],
    ambientAudio: ['soft wind', 'birds', 'barn animals'],
    events: [
      { id:'crop-cycle', icon:'🌾', title:'Fields Growing', text:'Warm soil pushes the next crop cycle forward.', resource:'food', amount:2 },
      { id:'egg-round', icon:'🥚', title:'Egg Round', text:'The coops are lively and the egg crates are filling.', resource:'eggs', amount:2 },
      { id:'rain-soil', icon:'🌧️', title:'Soaking Rain', text:'Rain improves Pine Hollow soil for the next harvest.', resource:'food', amount:1, weather:'rain' }
    ]
  }),
  'whisper-woods': profile({
    terrainGenerator: 'forest',
    buildCatalog: ['trails', 'habitats', 'observation', 'stewardship'],
    wildlifeCatalog: ['owls', 'foxes', 'rabbits', 'faceless creatures'],
    npcCatalog: ['Mosskeeper', 'rangers', 'lost hikers'],
    discoveryCatalog: ['fallen logs', 'herbs', 'mushrooms', 'rare tracks'],
    economyRules: { exports: ['lumber', 'herbs'], needs: ['stone', 'tools'] },
    weatherProfile: { clear: .22, cloudy: .25, rain: .22, storm: .06, fog: .25 },
    encounterTable: ['rare tracks', 'owl call', 'Mosskeeper planting'],
    ambientAudio: ['leaves', 'stream', 'owl calls'],
    events: [
      { id:'sapling-spread', icon:'🌱', title:'Mosskeeper Plants', text:'Mosskeeper spreads native saplings along an older trail.', resource:'lumber', amount:2 },
      { id:'herb-bloom', icon:'🌿', title:'Herb Bloom', text:'Fresh herbs appear beneath the wet New England canopy.', resource:'herbs', amount:2 },
      { id:'rare-tracks', icon:'🐾', title:'Rare Tracks', text:'Unfamiliar tracks cross Old Oak Trail and vanish into ferns.', resource:'herbs', amount:1 }
    ]
  }),
  mountains: profile({
    terrainGenerator: 'mountains',
    buildCatalog: ['trails', 'shelters', 'lookouts'],
    wildlifeCatalog: ['hawks', 'mountain goats', 'aurora lynx'],
    npcCatalog: ['trail keepers', 'surveyors', 'climbers'],
    discoveryCatalog: ['ore', 'caves', 'trail cairns'],
    economyRules: { exports: ['stone', 'ore'], needs: ['food', 'tools'] },
    weatherProfile: { clear: .28, cloudy: .28, rain: .13, storm: .2, fog: .11 },
    encounterTable: ['ore seam', 'cave sighting', 'trail rescue'],
    ambientAudio: ['high wind', 'rockfall', 'distant hawks'],
    events: [
      { id:'ore-face', icon:'⛏️', title:'Ore Face Exposed', text:'Weather exposes a workable seam above the ridge.', resource:'ore', amount:2 },
      { id:'trail-stone', icon:'🪨', title:'Trail Stone Found', text:'Loose stone is cleared and stacked for regional building.', resource:'stone', amount:2 },
      { id:'cave-echo', icon:'🕳️', title:'Cave Echo', text:'A rare call answers from a newly opened cave passage.', resource:'ore', amount:1 }
    ]
  }),
  'iron-district': profile({
    terrainGenerator: 'industrial',
    buildCatalog: ['factories', 'power', 'freight', 'rail'],
    wildlifeCatalog: ['rail rats', 'ravens', 'copper hounds'],
    npcCatalog: ['mechanics', 'freight crews', 'repair workers'],
    discoveryCatalog: ['scrap', 'freight crates', 'repair beacons'],
    economyRules: { exports: ['tools', 'parts'], needs: ['ore', 'food'] },
    weatherProfile: { clear: .4, cloudy: .35, rain: .13, storm: .07, fog: .05 },
    encounterTable: ['repair request', 'freight delay', 'shift change'],
    ambientAudio: ['rail clatter', 'factory hum', 'freight horns'],
    events: [
      { id:'repair-shift', icon:'🛠️', title:'Repair Shift', text:'A maintenance crew brings another production line online.', resource:'tools', amount:2 },
      { id:'freight-cleared', icon:'🚛', title:'Freight Cleared', text:'Crates move out of the yard and toward regional routes.', resource:'parts', amount:2 },
      { id:'power-demand', icon:'⚡', title:'Power Demand', text:'Factories slow briefly while the grid balances.', resource:'ore', amount:-1 }
    ]
  }),
  coast: profile({
    terrainGenerator: 'coast',
    buildCatalog: ['docks', 'fishing', 'markets', 'lighthouse'],
    wildlifeCatalog: ['gulls', 'harbor seals', 'tide foxes'],
    npcCatalog: ['fishers', 'dockhands', 'traveling traders'],
    discoveryCatalog: ['shells', 'fish spots', 'dock marks'],
    economyRules: { exports: ['fish', 'salt'], needs: ['tools', 'entertainment'] },
    weatherProfile: { clear: .32, cloudy: .24, rain: .2, storm: .16, fog: .08 },
    encounterTable: ['active fishing spot', 'merchant boat', 'dock repair'],
    ambientAudio: ['waves', 'gulls', 'dock ropes'],
    events: [
      { id:'fish-run', icon:'🐟', title:'Fish Run', text:'A silver school gathers close to the working docks.', resource:'fish', amount:2 },
      { id:'tide-trade', icon:'⚓', title:'Tide Trade', text:'A merchant boat arrives with room for regional cargo.', resource:'salt', amount:2 },
      { id:'rough-water', icon:'🌊', title:'Rough Water', text:'High waves briefly slow dock production.', resource:'fish', amount:-1, weather:'storm' }
    ]
  }),
  'purple-pulse': profile({
    terrainGenerator: 'purple-pulse',
    buildCatalog: ['venues', 'studios', 'vendors', 'neon-routes'],
    wildlifeCatalog: ['echo bats', 'neon cats', 'signal moths'],
    npcCatalog: ['artists', 'DJs', 'vendors', 'crowds'],
    discoveryCatalog: ['venues', 'posters', 'wristbands'],
    economyRules: { exports: ['entertainment'], needs: ['food', 'parts'] },
    weatherProfile: { clear: .48, cloudy: .27, rain: .13, storm: .05, fog: .07 },
    encounterTable: ['pop-up performance', 'vendor arrival', 'crowd surge'],
    ambientAudio: ['distant bass', 'crowd energy', 'neon buzz'],
    events: [
      { id:'club-open', icon:'🎤', title:'Club Doors Open', text:'A venue lights up and pulls a new crowd off the street.', resource:'entertainment', amount:2 },
      { id:'dj-set', icon:'🎛️', title:'DJ Set Begins', text:'A live set pushes Purple Pulse crowd energy higher.', resource:'entertainment', amount:2 },
      { id:'vendor-night', icon:'🎪', title:'Vendor Night', text:'Pop-up vendors arrive looking for food and machine parts.', resource:'food', amount:-1 }
    ]
  })
}

export function getCalendarSeason(date = new Date()) {
  const month = date.getMonth()
  if (month >= 2 && month <= 4) return 'spring'
  if (month >= 5 && month <= 7) return 'summer'
  if (month >= 8 && month <= 10) return 'fall'
  return 'winter'
}
