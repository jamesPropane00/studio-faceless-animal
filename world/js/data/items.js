// ItemData — static item definitions.

const items = [
  { id: 'coin', name: 'Coin', icon: '🪙', stackable: true, desc: 'Standard currency.' },
  { id: 'food_package', name: 'Food Package', icon: '📦', stackable: true, desc: 'Farm produce ready for city.' },
  { id: 'tool', name: 'Tool', icon: '🔧', stackable: true, desc: 'Used for construction.' },
  { id: 'gem', name: 'Gem', icon: '💎', stackable: false, desc: 'A rare valuable gem.' },
  { id: 'potion', name: 'Potion', icon: '🧪', stackable: true, desc: 'Restores health.' },
  { id: 'keycard', name: 'Keycard', icon: '💳', stackable: false, desc: 'Access to restricted areas.' }
]

function getItem(id) { return items.find(i => i.id === id) || null }

export { items, getItem }
