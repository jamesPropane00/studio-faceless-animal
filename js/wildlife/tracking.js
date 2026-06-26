/**
 * TrackingSystem
 *
 * Creature discovery and tracking system (Pokedex-style).
 * Records which creatures the player has encountered, studied, and captured.
 *
 * Integration:
 *   engine.registerSystem('tracking', trackingSystem, 94)
 *   Player earns discovery rewards and unlocks knowledge.
 *
 * TODO:
 *   - Add sighting log (where and when creatures were seen)
 *   - Add creature study / research mechanics
 *   - Add discovery milestones and rewards
 *   - Add tracking tools (footprints, calls, scat)
 *   - Add photographic evidence system
 *   - Add creature encyclopedia / bestiary UI
 *   - Add migration tracking
 *
 * Event hooks:
 *   'creatureDiscovered'  — { type, count }
 *   'creatureStudied'     — { type, knowledge }
 *   'trackingMilestone'   — { milestone, reward }
 */

class TrackingSystem {
  constructor() {
    /** @type {Map<string, { discovered: number, studied: boolean, captured: number, firstSeen: number }>} */
    this._records = new Map()
    this._enabled = true
  }

  /**
   * Record a creature sighting.
   * @param {string} creatureType
   * @param {number} [x=0]
   * @param {number} [y=0]
   */
  recordSighting(creatureType, x = 0, y = 0) {
    if (!this._records.has(creatureType)) {
      this._records.set(creatureType, {
        discovered: 0, studied: false, captured: 0, firstSeen: Date.now()
      })
    }
    const r = this._records.get(creatureType)
    r.discovered++
  }

  /**
   * Mark a creature type as studied.
   * @param {string} creatureType
   */
  markStudied(creatureType) {
    const r = this._records.get(creatureType)
    if (r) r.studied = true
  }

  /**
   * Record a creature capture.
   * @param {string} creatureType
   */
  recordCapture(creatureType) {
    const r = this._records.get(creatureType)
    if (r) r.captured++
  }

  /**
   * Get tracking data for a creature type.
   * @param {string} creatureType
   * @returns {Object|null}
   */
  getRecord(creatureType) {
    return this._records.get(creatureType) || null
  }

  /** @returns {number} Number of distinct creature types discovered */
  getDiscoveredCount() { return this._records.size }

  /** @returns {number} Total sightings across all types */
  getTotalSightings() {
    let total = 0
    for (const r of this._records.values()) total += r.discovered
    return total
  }

  /** @returns {number} Number of creature types studied */
  getStudiedCount() {
    let count = 0
    for (const r of this._records.values()) if (r.studied) count++
    return count
  }

  /** Serialize for persistence. */
  serialize() {
    const data = {}
    for (const [type, r] of this._records) data[type] = { ...r }
    return data
  }

  /** Deserialize saved state. */
  deserialize(data) {
    if (data) {
      this._records.clear()
      for (const [type, r] of Object.entries(data)) this._records.set(type, r)
    }
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { TrackingSystem }
