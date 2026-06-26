/**
 * DistrictSystem
 *
 * Manages city districts: creation, expansion, influence, and stats.
 * A district is a cluster of buildings that shares resources and identity.
 *
 * Integration:
 *   engine.registerSystem('districts', districtSystem, 60)
 *   Consumes building placement events to form and grow districts.
 *
 * TODO:
 *   - Add district specialisation (residential, commercial, industrial, cultural)
 *   - Add district happiness / crime / wealth simulation
 *   - Add district borders and territory influence map
 *   - Add district events (festivals, crime waves, economic booms)
 *   - Add district name generation
 *   - Add district level-up system
 *
 * Event hooks:
 *   'districtFormed'  — { id, center_x, center_y, name }
 *   'districtExpanded' — { id, newRadius }
 *   'districtMerged'   — { kept, absorbed }
 *   'districtStatChanged' — { id, stat, value }
 */

class DistrictSystem {
  constructor() {
    /** @type {Array<{ id: string, center_x: number, center_y: number, radius: number, name: string, buildings: string[], stats: Object }>} */
    this.districts = []
    this._enabled = true
  }

  /**
   * Form a new district at the given center.
   * @param {number} x
   * @param {number} y
   * @param {string} [name]
   * @returns {Object} The new district
   */
  createDistrict(x, y, name) {
    const id = `district_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const district = {
      id,
      center_x: x,
      center_y: y,
      radius: 10,
      name: name || `District ${this.districts.length + 1}`,
      buildings: [],
      stats: { population: 0, wealth: 0, crime_rate: 0, happiness: 50, building_breakdown: {} }
    }
    this.districts.push(district)
    return district
  }

  /**
   * Find the district nearest to a world position within range.
   * @param {number} x
   * @param {number} y
   * @param {number} [maxDist=15]
   * @returns {Object|null}
   */
  findNearest(x, y, maxDist = 15) {
    let best = null, bestDist = maxDist * 3
    for (const d of this.districts) {
      const dx = x - d.center_x, dy = y - d.center_y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < bestDist && dist < (d.radius || maxDist) * 3) {
        bestDist = dist; best = d
      }
    }
    return best
  }

  /**
   * Remove a district by id.
   * @param {string} id
   */
  removeDistrict(id) {
    this.districts = this.districts.filter(d => d.id !== id)
  }

  /**
   * Update districts simulation. Called each tick.
   * @param {number} dt
   */
  update(dt) {
    // TODO: district simulation tick
  }

  /** Serialize for persistence. */
  serialize() { return this.districts }

  /** Deserialize saved state. */
  deserialize(data) {
    if (Array.isArray(data)) this.districts = data
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { DistrictSystem }
