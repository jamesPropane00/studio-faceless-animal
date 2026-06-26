// EventBus — pub/sub event system for decoupled communication
// between modules. Currently unused by legacy world.html code.
// When migration begins, systems use this instead of direct state mutation.

class EventBus {
  constructor() {
    this._listeners = {}
  }

  on(event, fn) {
    (this._listeners[event] = this._listeners[event] || []).push(fn)
    return () => this.off(event, fn)
  }

  once(event, fn) {
    const wrapper = (...args) => { fn(...args); this.off(event, wrapper) }
    return this.on(event, wrapper)
  }

  off(event, fn) {
    const list = this._listeners[event]
    if (!list) return
    const idx = list.indexOf(fn)
    if (idx !== -1) list.splice(idx, 1)
  }

  emit(event, ...args) {
    const list = this._listeners[event]
    if (!list) return
    for (const fn of [...list]) fn(...args)
  }

  clear(event) {
    if (event) delete this._listeners[event]
    else this._listeners = {}
  }
}

const eventBus = new EventBus()
export { eventBus, EventBus }
