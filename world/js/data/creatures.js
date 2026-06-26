// CreatureData — static creature type definitions.
// Source: CREATURE_TYPES from wildlife/creatures.js (canonical copy)

const creatures = [
  { id: 'wispling', name: 'Wispling', icon: '✨', desc: 'A tiny glowing fae that dances in the woods.', habitat: ['whisper-woods'], rarity: 'common', baseTrust: 20, baseMood: 60 },
  { id: 'shardback', name: 'Shardback', icon: '🦔', desc: 'Crystalline spines protect this shy creature.', habitat: ['mountains', 'iron-district'], rarity: 'uncommon', baseTrust: 10, baseMood: 40 },
  { id: 'tideflutter', name: 'Tideflutter', icon: '🦋', desc: 'Wings like ocean waves, found near the coast.', habitat: ['coast'], rarity: 'common', baseTrust: 30, baseMood: 70 },
  { id: 'gloomstalk', name: 'Gloomstalk', icon: '👁️', desc: 'Lurks in the neon alleys of the Purple Pulse.', habitat: ['purple-pulse'], rarity: 'rare', baseTrust: 5, baseMood: 30 },
  { id: 'emberhorn', name: 'Emberhorn', icon: '🔥', desc: 'A majestic beast with smoldering horns.', habitat: ['mountains', 'iron-district'], rarity: 'epic', baseTrust: 0, baseMood: 20 },
  { id: 'cloudwhisk', name: 'Cloudwhisk', icon: '☁️', desc: 'Drifts through the sky, barely visible.', habitat: ['farmlands', 'whisper-woods'], rarity: 'rare', baseTrust: 15, baseMood: 50 },
  { id: 'neonprowler', name: 'Neon Prowler', icon: '🐱', desc: 'A cat-like creature that glows in the dark.', habitat: ['city', 'purple-pulse'], rarity: 'uncommon', baseTrust: 25, baseMood: 55 }
]

function getCreature(id) { return creatures.find(c => c.id === id) || null }
function getCreaturesByHabitat(regionId) { return creatures.filter(c => c.habitat.includes(regionId)) }
function getCreaturesByRarity(rarity) { return creatures.filter(c => c.rarity === rarity) }

export { creatures, getCreature, getCreaturesByHabitat, getCreaturesByRarity }
