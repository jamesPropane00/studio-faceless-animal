// ItemData — static item definitions.

const items = [
  { id: 'coin', name: 'Coin', icon: '\u{1FA99}', stackable: true, desc: 'Standard currency.' },
  { id: 'food_package', name: 'Food Package', icon: '\u{1F4E6}', stackable: true, desc: 'Farm produce ready for city.' },
  { id: 'tool', name: 'Tool', icon: '\u{1F527}', stackable: true, desc: 'Used for construction.' },
  { id: 'gem', name: 'Gem', icon: '\u{1F48E}', stackable: false, desc: 'A rare valuable gem.' },
  { id: 'potion', name: 'Potion', icon: '\u{1F9EA}', stackable: true, desc: 'Restores health.' },
  { id: 'keycard', name: 'Keycard', icon: '\u{1F4B3}', stackable: false, desc: 'Access to restricted areas.' }
]

const GOD_POWERS = {
  meteor: { name: 'Meteor Strike', icon: '\u2604\uFE0F', cost: 200, radius: 3, desc: 'Destroy buildings in area' },
  blessing: { name: 'Divine Blessing', icon: '\u2728', cost: 100, radius: 5, desc: 'Restore buildings in area' },
  earthquake: { name: 'Earthquake', icon: '\u{1F30B}', cost: 150, radius: 8, desc: 'Damage buildings in area' },
  spawn_npc: { name: 'Spawn NPC', icon: '\u{1F464}', cost: 25, radius: 0, desc: 'Create a new citizen' }
}

const CROP_TYPES = {
  corn: { name: 'Corn', icon: '\u{1F33D}', growthTime: 45000, stages: 3, yield: 2, color: '#fbbf24' },
  wheat: { name: 'Wheat', icon: '\u{1F33E}', growthTime: 30000, stages: 3, yield: 1, color: '#eab308' },
  veggies: { name: 'Vegetables', icon: '\u{1F955}', growthTime: 60000, stages: 4, yield: 3, color: '#4ade80' },
}

function getItem(id) { return items.find(i => i.id === id) || null }

export { items, getItem, GOD_POWERS, CROP_TYPES }
