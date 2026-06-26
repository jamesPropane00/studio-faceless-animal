/**
 * EventBus
 *
 * Lightweight publish/subscribe event system for decoupled communication
 * between game systems. All engine-level and gameplay events flow through here.
 *
 * Integration:
 *   Attach to SimulationEngine as engine.eventBus.
 *   Systems emit and listen for events without direct coupling.
 *
 * TODO:
 *   - Add typed event payloads
 *   - Add async event emission (await listeners)
 *   - Add event history / replay debugging
 *   - Add wildcard subscribers ('*')
 *
 * Event hooks (canonical list):
 *   'beforeTick' / 'afterTick'          — simulation tick lifecycle
 *   'systemRegistered' / 'systemEnabled' — system lifecycle
 *   'playerMoved'                        — { x, y, region }
 *   'regionChanged'                      — { from, to }
 *   'travelStart' / 'travelComplete'     — travel lifecycle
 *   'dayChanged'                         — { day }
 *   'weatherChanged'                     — { from, to, intensity }
 *   'npcSpawned' / 'npcDespawned'        — NPC lifecycle
 *   'buildingPlaced' / 'buildingRemoved' — construction
 *   'cropPlanted' / 'cropHarvested'      — farming
 *   'foodSent'                           — { amount, coins, rep }
 *   'coinChanged' / 'repChanged'         — economy
 *   'combatStart' / 'combatEnd'          — battle lifecycle
 *   'creatureSpawned' / 'creatureDespawned' — wildlife
 */

class EventBus {
  constructor() {
    /** @type {Object<string, Function[]>} */
    this._listeners = {}
    this._onceListeners = {}
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} fn
   * @returns {Function} Unsubscribe function
   */
  on(event, fn) {
    (this._listeners[event] = this._listeners[event] || []).push(fn)
    return () => this.off(event, fn)
  }

  /**
   * Subscribe to an event for one emission only.
   * @param {string} event
   * @param {Function} fn
   * @returns {Function} Unsubscribe function
   */
  once(event, fn) {
    const wrapper = (...args) => { fn(...args); this.off(event, wrapper) }
    this._onceListeners[event] = this._onceListeners[event] || []
    this._onceListeners[event].push(wrapper)
    return this.on(event, wrapper)
  }

  /**
   * Unsubscribe a specific listener.
   * @param {string} event
   * @param {Function} fn
   */
  off(event, fn) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(f => f !== fn)
    }
  }

  /**
   * Emit an event, calling all subscribers synchronously.
   * @param {string} event
   * @param {...*} args
   */
  emit(event, ...args) {
    const listeners = [...(this._listeners[event] || [])]
    for (const fn of listeners) {
      try { fn(...args) } catch (err) { console.error(`[EventBus] Error in "${event}":`, err) }
    }
  }

  /**
   * Remove all listeners for a specific event (or all events).
   * @param {string} [event]
   */
  clear(event) {
    if (event) { delete this._listeners[event]; delete this._onceListeners[event] }
    else { this._listeners = {}; this._onceListeners = {} }
  }

  /** @returns {number} Total listener count across all events */
  listenerCount() {
    let count = 0
    for (const arr of Object.values(this._listeners)) count += arr.length
    return count
  }

  /** @returns {string[]} Event names with active listeners */
  activeEvents() {
    return Object.keys(this._listeners).filter(e => this._listeners[e].length > 0)
  }
}

export { EventBus }
