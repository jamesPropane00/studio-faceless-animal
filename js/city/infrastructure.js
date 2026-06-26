/**
 * InfrastructureSystem
 *
 * Manages non-building infrastructure: roads, power lines, water pipes,
 * street lights, trees, bridges, and public works.
 *
 * Integration:
 *   engine.registerSystem('infrastructure', infrastructureSystem, 40)
 *   Works alongside RoadSystem and BuildingSystem for city services.
 *
 * TODO:
 *   - Add power grid simulation (power plants → buildings)
 *   - Add water pipe network
 *   - Add sewage system
 *   - Add public transport routes (bus, tram)
 *   - Add garbage collection simulation
 *   - Add infrastructure decay and maintenance costs
 *   - Add natural disaster resilience
 *
 * Event hooks:
 *   'infrastructurePlaced'  — { type, x, y }
 *   'infrastructureRemoved' — { type, x, y }
 *   'infrastructureUpgraded' — { type, x, y, level }
 *   'serviceOutage' — { type, area }
 */

const INFRA_TYPES = ['tree', 'light', 'sign', 'bench', 'fence', 'power_pole', 'water_pipe', 'bus_stop', 'bridge']

class InfrastructureSystem {
  constructor() {
    /** @type {Array<{ id: string, type: string, x: number, y: number, level: number, data: Object }>} */
    this.items = []
    this._enabled = true
  }

  /**
   * Place an infrastructure item.
   * @param {string} type
   * @param {number} x
   * @param {number} y
   * @param {Object} [data={}]
   * @returns {Object}
   */
  place(type, x, y, data = {}) {
    const id = `infra_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const item = { id, type, x, y, level: 1, data }
    this.items.push(item)
    return item
  }

  /**
   * Remove an infrastructure item by id.
   * @param {string} id
   * @returns {boolean}
   */
  remove(id) {
    const idx = this.items.findIndex(i => i.id === id)
    if (idx === -1) return false
    this.items.splice(idx, 1)
    return true
  }

  /**
   * Get all infrastructure items near a position.
   * @param {number} x
   * @param {number} y
   * @param {number} [radius=5]
   * @returns {Array}
   */
  getNearby(x, y, radius = 5) {
    return this.items.filter(i => Math.abs(i.x - x) <= radius && Math.abs(i.y - y) <= radius)
  }

  /**
   * Get all items of a specific type.
   * @param {string} type
   * @returns {Array}
   */
  getByType(type) {
    return this.items.filter(i => i.type === type)
  }

  /** Serialize for persistence. */
  serialize() { return this.items }

  /** Deserialize saved state. */
  deserialize(data) {
    if (Array.isArray(data)) this.items = data
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { InfrastructureSystem, INFRA_TYPES }
