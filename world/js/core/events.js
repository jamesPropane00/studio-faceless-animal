/**
 * EventBus — lightweight pub/sub event system.
 *
 * Internal storage uses a Map of Sets to support O(1) add/remove/lookup
 * and safe iteration during emit(). Listener execution is wrapped in
 * try/catch so a failing listener never breaks subsequent listeners.
 *
 * Usage:
 *   import { Events } from '/world/js/core/events.js'
 *   Events.on('player:move', (pos) => updateUI(pos))
 *   Events.emit('player:move', { x: 10, y: 20 })
 */

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map()
  }

  /**
   * Register a listener for an event.
   * @param {string} eventName
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  on(eventName, callback) {
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, new Set())
    }
    this._listeners.get(eventName).add(callback)
    return () => this.off(eventName, callback)
  }

  /**
   * Register a one-time listener. Automatically removed after first emit.
   * @param {string} eventName
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  once(eventName, callback) {
    const wrapper = (payload) => {
      this.off(eventName, wrapper)
      callback(payload)
    }
    return this.on(eventName, wrapper)
  }

  /**
   * Remove a specific listener for an event.
   * Safe to call during emit() — the current emit iteration uses a snapshot.
   * @param {string} eventName
   * @param {Function} callback
   */
  off(eventName, callback) {
    const set = this._listeners.get(eventName)
    if (!set) return
    set.delete(callback)
    if (set.size === 0) {
      this._listeners.delete(eventName)
    }
  }

  /**
   * Emit an event, calling all registered listeners with a payload.
   * Listeners are invoked in insertion order. Execution is wrapped in
   * try/catch — a single failing listener never breaks the chain.
   * Safe to call on()/off() inside a listener during emit().
   * @param {string} eventName
   * @param {*} [payload]
   */
  emit(eventName, payload) {
    const set = this._listeners.get(eventName)
    if (!set || set.size === 0) return
    // Snapshot to allow safe removal during iteration
    const snapshot = [...set]
    for (const callback of snapshot) {
      try {
        callback(payload)
      } catch (err) {
        console.error(`[EventBus] Listener error for "${eventName}":`, err)
      }
    }
  }

  /**
   * Remove all listeners for a specific event.
   * @param {string} eventName
   */
  clear(eventName) {
    this._listeners.delete(eventName)
  }

  /**
   * Remove all listeners for every event.
   */
  clearAll() {
    this._listeners.clear()
  }

  /**
   * Return the number of listeners registered for an event.
   * @param {string} eventName
   * @returns {number}
   */
  listenerCount(eventName) {
    const set = this._listeners.get(eventName)
    return set ? set.size : 0
  }

  /**
   * Check whether an event has any listeners registered.
   * @param {string} eventName
   * @returns {boolean}
   */
  hasListeners(eventName) {
    const set = this._listeners.get(eventName)
    return set !== undefined && set.size > 0
  }
}

export const Events = new EventBus()
export { EventBus }
