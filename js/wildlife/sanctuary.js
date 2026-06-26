/**
 * SanctuarySystem
 *
 * Manages creature sanctuaries — protected areas where creatures live,
 * breed, and are displayed. Players can build and customize sanctuaries.
 *
 * Integration:
 *   engine.registerSystem('sanctuary', sanctuarySystem, 95)
 *   CreatureSystem assigns creatures to sanctuaries via CreatureSystem.assignSanctuary().
 *
 * TODO:
 *   - Add sanctuary building and expansion
 *   - Add sanctuary biome customization
 *   - Add sanctuary visitor system
 *   - Add sanctuary staff (NPC caretakers)
 *   - Add creature happiness based on sanctuary quality
 *   - Add public/private sanctuary visibility
 *   - Add sanctuary rating and ranking
 *
 * Event hooks:
 *   'sanctuaryCreated'  — { id, owner, biome }
 *   'sanctuaryExpanded' — { id, newCapacity }
 *   'sanctuaryRated'    — { id, rating }
 *   'sanctuaryEvent'    — { id, type, data }
 */

class Sanctuary {
  /**
   * @param {string} id
   * @param {string} ownerId
   * @param {string} biome
   * @param {number} x
   * @param {number} y
   */
  constructor(id, ownerId, biome, x, y) {
    this.id = id
    this.ownerId = ownerId
    this.biome = biome
    this.x = x
    this.y = y
    this.level = 1
    this.capacity = 10
    this.creatureIds = []
    this.rating = 0
  }
}

class SanctuarySystem {
  constructor() {
    /** @type {Map<string, Sanctuary>} */
    this.sanctuaries = new Map()
    this._enabled = true
  }

  /**
   * Create a new sanctuary.
   * @param {string} ownerId
   * @param {string} biome
   * @param {number} x
   * @param {number} y
   * @returns {Sanctuary}
   */
  createSanctuary(ownerId, biome, x, y) {
    const id = `sanctuary_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const s = new Sanctuary(id, ownerId, biome, x, y)
    this.sanctuaries.set(id, s)
    return s
  }

  /**
   * Add a creature to a sanctuary.
   * @param {string} sanctuaryId
   * @param {string} creatureId
   * @returns {boolean}
   */
  addCreature(sanctuaryId, creatureId) {
    const s = this.sanctuaries.get(sanctuaryId)
    if (!s || s.creatureIds.length >= s.capacity) return false
    s.creatureIds.push(creatureId)
    return true
  }

  /**
   * Remove a creature from a sanctuary.
   * @param {string} sanctuaryId
   * @param {string} creatureId
   */
  removeCreature(sanctuaryId, creatureId) {
    const s = this.sanctuaries.get(sanctuaryId)
    if (s) s.creatureIds = s.creatureIds.filter(id => id !== creatureId)
  }

  /**
   * Upgrade a sanctuary to increase capacity.
   * @param {string} sanctuaryId
   */
  upgrade(sanctuaryId) {
    const s = this.sanctuaries.get(sanctuaryId)
    if (s) {
      s.level++
      s.capacity += 5
    }
  }

  /**
   * Get all sanctuaries owned by a player.
   * @param {string} ownerId
   * @returns {Sanctuary[]}
   */
  getOwnedSanctuaries(ownerId) {
    return [...this.sanctuaries.values()].filter(s => s.ownerId === ownerId)
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { SanctuarySystem, Sanctuary }
