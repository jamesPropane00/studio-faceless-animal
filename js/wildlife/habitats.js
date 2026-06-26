/**
 * HabitatSystem
 *
 * Defines and manages creature habitats across regions.
 * Each habitat has terrain preferences, capacity, and spawn rules.
 *
 * Integration:
 *   engine.registerSystem('habitats', habitatSystem, 92)
 *   CreatureSystem uses HabitatSystem to determine valid spawn locations.
 *
 * TODO:
 *   - Add habitat quality scoring (food, water, shelter)
 *   - Add habitat restoration and conservation
 *   - Add seasonal habitat changes
 *   - Add habitat competition between species
 *   - Add player-built habitats (ponds, nests, feeders)
 *   - Add habitat migration corridors
 *
 * Event hooks:
 *   'habitatCreated'  — { id, region, type }
 *   'habitatDestroyed' — { id, reason }
 *   'habitatOccupied'  — { habitatId, creatureId }
 *   'habitatVacated'   — { habitatId }
 */

class Habitat {
  /**
   * @param {string} id
   * @param {string} regionId
   * @param {string} type
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @param {number} capacity
   */
  constructor(id, regionId, type, x, y, radius, capacity) {
    this.id = id
    this.regionId = regionId
    this.type = type
    this.x = x
    this.y = y
    this.radius = radius
    this.capacity = capacity
    /** @type {Set<string>} */
    this.occupants = new Set()
  }

  /** @returns {boolean} Whether the habitat is at capacity */
  isFull() { return this.occupants.size >= this.capacity }

  /** @returns {number} Available space */
  available() { return this.capacity - this.occupants.size }
}

class HabitatSystem {
  constructor() {
    /** @type {Map<string, Habitat>} */
    this.habitats = new Map()
    this._enabled = true
  }

  /**
   * Create a new habitat.
   * @param {string} regionId
   * @param {string} type
   * @param {number} x
   * @param {number} y
   * @param {number} [radius=10]
   * @param {number} [capacity=5]
   * @returns {Habitat}
   */
  createHabitat(regionId, type, x, y, radius = 10, capacity = 5) {
    const id = `habitat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const h = new Habitat(id, regionId, type, x, y, radius, capacity)
    this.habitats.set(id, h)
    return h
  }

  /**
   * Remove a habitat.
   * @param {string} id
   */
  removeHabitat(id) {
    this.habitats.delete(id)
  }

  /**
   * Assign a creature to a habitat.
   * @param {string} habitatId
   * @param {string} creatureId
   * @returns {boolean}
   */
  assignCreature(habitatId, creatureId) {
    const h = this.habitats.get(habitatId)
    if (!h || h.isFull()) return false
    h.occupants.add(creatureId)
    return true
  }

  /**
   * Remove a creature from its habitat.
   * @param {string} habitatId
   * @param {string} creatureId
   */
  removeCreature(habitatId, creatureId) {
    const h = this.habitats.get(habitatId)
    if (h) h.occupants.delete(creatureId)
  }

  /**
   * Find habitats near a position.
   * @param {number} x
   * @param {number} y
   * @param {number} [radius=20]
   * @returns {Habitat[]}
   */
  findNearby(x, y, radius = 20) {
    return [...this.habitats.values()].filter(h =>
      Math.abs(h.x - x) <= radius && Math.abs(h.y - y) <= radius
    )
  }

  /** @param {string} regionId @returns {Habitat[]} */
  getHabitatsByRegion(regionId) {
    return [...this.habitats.values()].filter(h => h.regionId === regionId)
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { HabitatSystem, Habitat }
