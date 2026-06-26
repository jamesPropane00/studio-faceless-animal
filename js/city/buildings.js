/**
 * BuildingSystem
 *
 * Manages building placement, removal, types, and state.
 * Each building has a type, position, owner, and income generation.
 *
 * Integration:
 *   engine.registerSystem('buildings', buildingSystem, 55)
 *   Called by the build menu (world.html) to place/remove buildings.
 *
 * TODO:
 *   - Add building upgrade paths (level 1→5)
 *   - Add building maintenance costs
 *   - Add building blueprints and requirements
 *   - Add building damage and destruction
 *   - Add building animations (construction, idle, upgrade)
 *   - Add building-specific interactions (collect income, hire staff)
 *
 * Event hooks:
 *   'buildingPlaced'   — { id, type, x, y, owner }
 *   'buildingRemoved'  — { id, type }
 *   'buildingUpgraded' — { id, newLevel }
 *   'buildingIncome'   — { id, amount, total }
 */

const BUILDING_TYPES = ['house', 'shop', 'warehouse', 'club', 'hide', 'camp', 'farm']

class BuildingSystem {
  constructor() {
    /** @type {Array<{ id: string, type: string, x: number, y: number, owner: string, level: number, income: number, data: Object }>} */
    this.buildings = []
    this._enabled = true
  }

  /**
   * Place a new building.
   * @param {string} type
   * @param {number} x
   * @param {number} y
   * @param {string} [owner='']
   * @returns {Object} The new building
   */
  placeBuilding(type, x, y, owner = '') {
    const id = `bld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const building = {
      id, type, x, y, owner,
      level: 1,
      income: type === 'shop' ? 1 : 0,
      data: {}
    }
    this.buildings.push(building)
    return building
  }

  /**
   * Remove a building by id.
   * @param {string} id
   * @returns {boolean}
   */
  removeBuilding(id) {
    const idx = this.buildings.findIndex(b => b.id === id)
    if (idx === -1) return false
    this.buildings.splice(idx, 1)
    return true
  }

  /**
   * Get all buildings at a given position.
   * @param {number} x
   * @param {number} y
   * @returns {Array}
   */
  getBuildingsAt(x, y) {
    return this.buildings.filter(b => Math.abs(b.x - x) < 2 && Math.abs(b.y - y) < 2)
  }

  /**
   * Get all buildings owned by a player.
   * @param {string} ownerId
   * @returns {Array}
   */
  getOwnedBuildings(ownerId) {
    return this.buildings.filter(b => b.owner === ownerId)
  }

  /**
   * Collect income from a building.
   * @param {string} id
   * @returns {number} Income collected
   */
  collectIncome(id) {
    const b = this.buildings.find(b => b.id === id)
    if (!b || b.income <= 0) return 0
    const amount = b.income
    // TODO: emit buildingIncome
    return amount
  }

  /**
   * Update buildings. Called each tick.
   * @param {number} dt
   */
  update(dt) {
    // TODO: income accumulation, maintenance, etc.
  }

  /** Serialize for persistence. */
  serialize() { return this.buildings }

  /** Deserialize saved state. */
  deserialize(data) {
    if (Array.isArray(data)) this.buildings = data
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { BuildingSystem, BUILDING_TYPES }
