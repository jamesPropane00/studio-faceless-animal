/**
 * MachinerySystem
 *
 * Manages farm machinery: tractors, harvesters, sprinklers, and tools.
 * Machinery improves farm efficiency and unlocks automation.
 *
 * Integration:
 *   engine.registerSystem('machinery', machinerySystem, 86)
 *   Works with CropSystem for automated planting/harvesting.
 *
 * TODO:
 *   - Add tractor pathfinding and field navigation
 *   - Add harvester automation (auto-harvest when crops ready)
 *   - Add sprinkler coverage and water management
 *   - Add machinery fuel and maintenance
 *   - Add machinery upgrades
 *   - Add drone support (aerial surveying, pest control)
 *   - Add machinery sounds and animations
 *
 * Event hooks:
 *   'machineryPlaced'    — { id, type, x, y }
 *   'machineryRemoved'   — { id }
 *   'machineryActivated'  — { id }
 *   'machineryBreakdown'  — { id, reason }
 *   'machineryUpgraded'   — { id, level }
 */

const MACHINERY_TYPES = ['tractor', 'harvester', 'sprinkler', 'drone', 'generator', 'silo']

class MachinerySystem {
  constructor() {
    /** @type {Array<{ id: string, type: string, x: number, y: number, level: number, fuel: number, data: Object }>} */
    this.machines = []
    this._enabled = true
  }

  /**
   * Place a machine on the farm.
   * @param {string} type
   * @param {number} x
   * @param {number} y
   * @returns {Object}
   */
  place(type, x, y) {
    const id = `machine_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const machine = { id, type, x, y, level: 1, fuel: 100, data: {} }
    this.machines.push(machine)
    return machine
  }

  /**
   * Remove a machine.
   * @param {string} id
   * @returns {boolean}
   */
  remove(id) {
    const idx = this.machines.findIndex(m => m.id === id)
    if (idx === -1) return false
    this.machines.splice(idx, 1)
    return true
  }

  /**
   * Refuel a machine.
   * @param {string} id
   * @param {number} amount
   */
  refuel(id, amount) {
    const m = this.machines.find(m => m.id === id)
    if (m) m.fuel = Math.min(100, m.fuel + amount)
  }

  /**
   * Upgrade a machine.
   * @param {string} id
   */
  upgrade(id) {
    const m = this.machines.find(m => m.id === id)
    if (m) m.level++
  }

  /**
   * Update machinery. Called each tick.
   * @param {number} dt
   */
  update(dt) {
    // TODO: automation logic, fuel consumption
  }

  /** Serialize for persistence. */
  serialize() { return this.machines }

  /** Deserialize saved state. */
  deserialize(data) {
    if (Array.isArray(data)) this.machines = data
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { MachinerySystem, MACHINERY_TYPES }
