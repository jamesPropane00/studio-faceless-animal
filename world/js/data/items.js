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
  wheat: { name: 'Wheat', icon: '\u{1F33E}', growthTime: 10000, stages: 3, yield: 3, sellValue: 2, xp: 2, color: '#eab308' },
  corn: { name: 'Corn', icon: '\u{1F33D}', growthTime: 15000, stages: 3, yield: 3, sellValue: 3, xp: 3, color: '#fbbf24' },
  carrots: { name: 'Carrots', icon: '\u{1F955}', growthTime: 20000, stages: 4, yield: 3, sellValue: 4, xp: 4, color: '#f97316' },
  tomatoes: { name: 'Tomatoes', icon: '\u{1F345}', growthTime: 30000, stages: 4, yield: 3, sellValue: 5, xp: 5, color: '#ef4444' },
}

function getItem(id) { return items.find(i => i.id === id) || null }

export { items, getItem, GOD_POWERS, CROP_TYPES }
