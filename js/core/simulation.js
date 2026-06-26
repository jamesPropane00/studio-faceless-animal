/**
 * SimulationEngine
 *
 * Central orchestrator for the Faceless Animal game engine.
 * Responsibilities:
 *   - Register and manage game systems
 *   - Enable/disable systems at runtime
 *   - Drive the world tick (update loop)
 *   - Execute systems in priority order
 *   - Collect and expose engine statistics
 *
 * No gameplay logic lives here.
 *
 * Integration:
 *   All modules import and register with the engine via `registerSystem()`.
 *   The engine's `tick(dt)` is called from the main requestAnimationFrame loop
 *   in world.html. Each system receives `dt` in priority order.
 *
 * Event hooks:
 *   'beforeTick'  - emitted before any system runs
 *   'afterTick'   - emitted after all systems run
 *   'systemRegistered' - emitted when a new system is registered
 *   'systemEnabled'    - emitted when a system is enabled/disabled
 */

const SimulationEventBus = {
  _listeners: {},
  on(event, fn) { (this._listeners[event] = this._listeners[event] || []).push(fn) },
  off(event, fn) { const arr = this._listeners[event]; if (arr) this._listeners[event] = arr.filter(f => f !== fn) },
  emit(event, ...args) { for (const fn of (this._listeners[event] || [])) fn(...args) }
}

class SimulationEngine {
  constructor() {
    /** @type {Map<string, { system: Object, priority: number, enabled: boolean, name: string }>} */
    this._systems = new Map()
    this._tickCount = 0
    this._elapsed = 0
    this._stats = {
      systems: 0,
      enabled: 0,
      ticks: 0,
      lastTickDuration: 0,
      avgTickDuration: 0
    }
    this.eventBus = SimulationEventBus
  }

  /**
   * Register a system with the engine.
   * @param {string} id - Unique system identifier
   * @param {Object} system - System instance (must have an `update(dt)` method)
   * @param {number} [priority=100] - Lower = runs earlier in the tick
   * @returns {SimulationEngine}
   */
  registerSystem(id, system, priority = 100) {
    if (this._systems.has(id)) {
      console.warn(`[SimulationEngine] System "${id}" already registered — skipping`)
      return this
    }
    this._systems.set(id, { system, priority, enabled: true, name: id })
    this._stats.systems = this._systems.size
    this._stats.enabled = this._countEnabled()
    this.eventBus.emit('systemRegistered', id, system)
    return this
  }

  /**
   * Unregister a system by id.
   * @param {string} id
   * @returns {SimulationEngine}
   */
  unregisterSystem(id) {
    this._systems.delete(id)
    this._stats.systems = this._systems.size
    this._stats.enabled = this._countEnabled()
    return this
  }

  /**
   * Enable or disable a registered system.
   * @param {string} id
   * @param {boolean} enabled
   * @returns {SimulationEngine}
   */
  setSystemEnabled(id, enabled) {
    const entry = this._systems.get(id)
    if (!entry) return this
    entry.enabled = enabled
    this._stats.enabled = this._countEnabled()
    this.eventBus.emit('systemEnabled', id, enabled)
    return this
  }

  /**
   * Check if a system is enabled.
   * @param {string} id
   * @returns {boolean}
   */
  isSystemEnabled(id) {
    const entry = this._systems.get(id)
    return entry ? entry.enabled : false
  }

  /**
   * Get a registered system by id.
   * @param {string} id
   * @returns {Object|undefined}
   */
  getSystem(id) {
    const entry = this._systems.get(id)
    return entry ? entry.system : undefined
  }

  /**
   * Main world tick. Called every frame from the game loop.
   * @param {number} dt - Delta time in seconds
   */
  tick(dt) {
    this.eventBus.emit('beforeTick', dt)
    const start = performance.now()

    // Sort by priority and run enabled systems in order
    const sorted = [...this._systems.values()]
      .filter(e => e.enabled)
      .sort((a, b) => a.priority - b.priority)

    for (const entry of sorted) {
      if (typeof entry.system.update === 'function') {
        entry.system.update(dt)
      }
    }

    const elapsed = performance.now() - start
    this._tickCount++
    this._elapsed += dt
    this._stats.ticks = this._tickCount
    this._stats.lastTickDuration = elapsed
    // Rolling average (EMA)
    this._stats.avgTickDuration = this._stats.avgTickDuration === 0
      ? elapsed
      : this._stats.avgTickDuration * 0.95 + elapsed * 0.05

    this.eventBus.emit('afterTick', dt)
  }

  /** @returns {Object} Snapshot of engine statistics */
  getStats() {
    return { ...this._stats, uptime: this._elapsed }
  }

  /** @returns {string[]} List of all registered system ids */
  getSystemIds() {
    return [...this._systems.keys()]
  }

  /** Reset all state (useful for testing or full restart) */
  reset() {
    this._systems.clear()
    this._tickCount = 0
    this._elapsed = 0
    this._stats = { systems: 0, enabled: 0, ticks: 0, lastTickDuration: 0, avgTickDuration: 0 }
  }

  _countEnabled() {
    let c = 0
    for (const e of this._systems.values()) if (e.enabled) c++
    return c
  }
}

/**
 * Singleton instance shared across the application.
 * Import and use directly:
 *   import { engine } from './simulation.js'
 *   engine.registerSystem('mySystem', myInstance, 50)
 */
const engine = new SimulationEngine()

export { SimulationEngine, engine, SimulationEventBus }
