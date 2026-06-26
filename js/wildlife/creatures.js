/**
 * CreatureSystem
 *
 * Manages wild creatures: spawning, despawning, behaviour, trust, mood,
 * breeding, mutation, and sanctuary assignment.
 * Creatures are non-domesticated animals found in the wild.
 *
 * Integration:
 *   engine.registerSystem('creatures', creatureSystem, 90)
 *   Active in wilderness regions (Whisper Woods, Mountains, Coast, Purple Pulse).
 *
 * TODO:
 *   - Add creature types and stats
 *   - Add creature AI (hunting, grazing, fleeing, social)
 *   - Add creature capture and release mechanics
 *   - Add creature evolution and mutation system
 *   - Add creature discovery tracking (Pokedex-style)
 *   - Add creature habitats and migration
 *   - Add creature taming and bonding
 *   - Add creature sanctuary management
 *
 * Event hooks:
 *   'creatureSpawned'     — { id, type, x, y }
 *   'creatureDespawned'   — { id, reason }
 *   'creatureMoved'       — { id, x, y }
 *   'creatureTrustChanged' — { id, oldTrust, newTrust }
 *   'creatureBred'        — { parent1, parent2, offspring }
 *   'creatureMutated'     — { id, oldType, newType }
 *   'creatureSanctuaryAssigned' — { id, sanctuaryId }
 */

class Creature {
  /**
   * @param {string} id
   * @param {string} type
   * @param {number} x
   * @param {number} y
   */
  constructor(id, type, x, y) {
    this.id = id
    this.type = type
    this.x = x
    this.y = y
    this.trust = 0      // 0-100, higher = more tame
    this.mood = 50      // 0-100
    this.health = 100
    this.hunger = 100
    this.mutation = 0   // 0-1, higher = more mutated
    this.generation = 1
    this.sanctuaryId = null
    this.tags = []
  }
}

class CreatureSystem {
  constructor() {
    /** @type {Map<string, Creature>} */
    this.creatures = new Map()
    this._enabled = true
    this._maxCreatures = 50
  }

  /**
   * Spawn a creature at a position.
   * @param {string} type
   * @param {number} x
   * @param {number} y
   * @returns {Creature|null}
   */
  spawn(type, x, y) {
    if (this.creatures.size >= this._maxCreatures) return null
    const id = `creature_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const c = new Creature(id, type, x, y)
    this.creatures.set(id, c)
    return c
  }

  /**
   * Despawn a creature.
   * @param {string} id
   * @returns {boolean}
   */
  despawn(id) {
    return this.creatures.delete(id)
  }

  /**
   * Adjust a creature's trust level.
   * @param {string} id
   * @param {number} delta
   * @returns {number} New trust level
   */
  adjustTrust(id, delta) {
    const c = this.creatures.get(id)
    if (!c) return 0
    c.trust = Math.max(0, Math.min(100, c.trust + delta))
    return c.trust
  }

  /**
   * Adjust a creature's mood.
   * @param {string} id
   * @param {number} delta
   * @returns {number} New mood level
   */
  adjustMood(id, delta) {
    const c = this.creatures.get(id)
    if (!c) return 0
    c.mood = Math.max(0, Math.min(100, c.mood + delta))
    return c.mood
  }

  /**
   * Attempt to breed two creatures.
   * @param {string} id1
   * @param {string} id2
   * @returns {Creature|null} Offspring, or null if conditions not met
   */
  breed(id1, id2) {
    const c1 = this.creatures.get(id1)
    const c2 = this.creatures.get(id2)
    if (!c1 || !c2) return null
    if (c1.trust < 50 || c2.trust < 50) return null
    if (c1.mood < 40 || c2.mood < 40) return null
    // Produce offspring
    const offspringType = Math.random() > 0.5 ? c1.type : c2.type
    const ox = (c1.x + c2.x) / 2 + (Math.random() - 0.5) * 3
    const oy = (c1.y + c2.y) / 2 + (Math.random() - 0.5) * 3
    const child = this.spawn(offspringType, ox, oy)
    if (child) {
      child.generation = Math.max(c1.generation, c2.generation) + 1
      child.mutation = (c1.mutation + c2.mutation) / 2 + (Math.random() - 0.5) * 0.1
    }
    return child
  }

  /**
   * Assign a creature to a sanctuary.
   * @param {string} creatureId
   * @param {string} sanctuaryId
   */
  assignSanctuary(creatureId, sanctuaryId) {
    const c = this.creatures.get(creatureId)
    if (c) c.sanctuaryId = sanctuaryId
  }

  /**
   * Get all creatures in a radius.
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @returns {Creature[]}
   */
  getInRadius(x, y, radius) {
    return [...this.creatures.values()].filter(c =>
      Math.abs(c.x - x) <= radius && Math.abs(c.y - y) <= radius
    )
  }

  /**
   * Update creatures. Called each tick.
   * @param {number} dt
   */
  update(dt) {
    // TODO: creature AI, hunger, mood decay
  }

  /** @param {number} max */
  setMaxCreatures(max) { this._maxCreatures = max }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { CreatureSystem, Creature }
