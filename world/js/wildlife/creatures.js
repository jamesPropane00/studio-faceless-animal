// CreatureEncounterSystem — branded creature encounters.
// Turn-based encounter foundation: observe, feed, calm, trust, retreat.
// Each creature has a type, habitat, mood, trust level.
// Encounters happen in wilderness regions.

const CREATURE_TYPES = {
  wispling: {
    id: 'wispling', name: 'Wispling', icon: '✨',
    desc: 'A tiny glowing fae that dances in the woods.',
    habitat: ['whisper-woods'], rarity: 'common',
    baseTrust: 20, baseMood: 60
  },
  shardback: {
    id: 'shardback', name: 'Shardback', icon: '🦔',
    desc: 'Crystalline spines protect this shy creature.',
    habitat: ['mountains', 'iron-district'], rarity: 'uncommon',
    baseTrust: 10, baseMood: 40
  },
  tideflutter: {
    id: 'tideflutter', name: 'Tideflutter', icon: '🦋',
    desc: 'Wings like ocean waves, found near the coast.',
    habitat: ['coast'], rarity: 'common',
    baseTrust: 30, baseMood: 70
  },
  gloomstalk: {
    id: 'gloomstalk', name: 'Gloomstalk', icon: '👁️',
    desc: 'Lurks in the neon alleys of the Purple Pulse.',
    habitat: ['purple-pulse'], rarity: 'rare',
    baseTrust: 5, baseMood: 30
  },
  emberhorn: {
    id: 'emberhorn', name: 'Emberhorn', icon: '🔥',
    desc: 'A majestic beast with smoldering horns.',
    habitat: ['mountains', 'iron-district'], rarity: 'epic',
    baseTrust: 0, baseMood: 20
  },
  cloudwhisk: {
    id: 'cloudwhisk', name: 'Cloudwhisk', icon: '☁️',
    desc: 'Drifts through the sky, barely visible.',
    habitat: ['farmlands', 'whisper-woods'], rarity: 'rare',
    baseTrust: 15, baseMood: 50
  },
  neonprowler: {
    id: 'neonprowler', name: 'Neon Prowler', icon: '🐱',
    desc: 'A cat-like creature that glows in the dark.',
    habitat: ['city', 'purple-pulse'], rarity: 'uncommon',
    baseTrust: 25, baseMood: 55
  }
}

class CreatureEncounter {
  constructor(type, x, y) {
    const def = CREATURE_TYPES[type]
    this.id = `creature_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    this.type = type
    this.name = def ? def.name : type
    this.icon = def ? def.icon : '❓'
    this.x = x
    this.y = y
    this.trust = def ? def.baseTrust : 10
    this.mood = def ? def.baseMood : 50
    this.health = 100
    this.state = 'idle' // idle, alert, friendly, scared, fleeing
    this.turnActive = false
    this.turnActions = 0
  }
}

class CreatureEncounterSystem {
  constructor() {
    this._encounters = []
    this._discovered = new Set()
  }

  spawn(type, x, y, regionId) {
    const def = CREATURE_TYPES[type]
    if (!def) return null
    if (!def.habitat.includes(regionId)) return null
    const enc = new CreatureEncounter(type, x, y)
    this._encounters.push(enc)
    this._discovered.add(type)
    return enc
  }

  remove(id) { this._encounters = this._encounters.filter(e => e.id !== id) }

  getInRadius(x, y, radius) {
    return this._encounters.filter(e =>
      Math.abs(e.x - x) <= radius && Math.abs(e.y - y) <= radius
    )
  }

  // Turn-based encounter actions
  observe(encounter) {
    encounter.turnActions++
    encounter.mood = Math.min(100, encounter.mood + 2)
    return { success: true, insight: `The ${encounter.name} seems ${encounter.mood > 60 ? 'calm' : 'uneasy'}. Trust: ${encounter.trust}%` }
  }

  feed(encounter, foodAmount = 1) {
    encounter.turnActions++
    encounter.trust = Math.min(100, encounter.trust + 5 * foodAmount)
    encounter.mood = Math.min(100, encounter.mood + 10)
    return { success: true, message: `The ${encounter.name} accepts the food. (+${5 * foodAmount} trust)` }
  }

  calm(encounter) {
    encounter.turnActions++
    encounter.mood = Math.min(100, encounter.mood + 15)
    if (encounter.mood > 70) encounter.trust = Math.min(100, encounter.trust + 3)
    return { success: true, message: `The ${encounter.name} seems calmer. (+15 mood)` }
  }

  retreat(encounter) {
    encounter.state = 'fleeing'
    return { success: true, message: 'You back away slowly.' }
  }

  // Turn management
  getAvailableEncounters() { return this._encounters.filter(e => e.state !== 'fleeing') }

  getDiscovered() { return [...this._discovered] }

  isDiscovered(type) { return this._discovered.has(type) }

  serialize() {
    return {
      encounters: this._encounters.map(e => ({ id: e.id, type: e.type, x: e.x, y: e.y, trust: e.trust, mood: e.mood, state: e.state })),
      discovered: [...this._discovered]
    }
  }
}

const creatureEncounters = new CreatureEncounterSystem()
export { creatureEncounters, CreatureEncounterSystem, CREATURE_TYPES }
