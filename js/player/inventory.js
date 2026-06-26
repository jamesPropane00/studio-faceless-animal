/**
 * Inventory
 *
 * Slot-based inventory system for the player.
 * Supports items, stacking, and categorization.
 *
 * Integration:
 *   Attached to Player or used standalone.
 *   Each slot holds an item type and count.
 *
 * TODO:
 *   - Add item definitions reference (from /data/items.js)
 *   - Add drag-and-drop slot reordering
 *   - Add equipment slot integration
 *   - Add overflow bag / bank storage
 *   - Add item filtering and sorting
 *   - Add quick-use / hotbar slots
 *   - Add item tooltips and metadata
 *
 * Event hooks:
 *   'itemAdded'   — { slot, itemId, count }
 *   'itemRemoved' — { slot, itemId, count }
 *   'inventoryFull' — { itemId, count }
 *   'inventorySorted' — { slots }
 */

class Inventory {
  /**
   * @param {number} [slots=24]
   */
  constructor(slots = 24) {
    /** @type {Array<{ id: string, count: number, data?: Object }|null>} */
    this.slots = new Array(slots).fill(null)
    this._maxSlots = slots
  }

  /**
   * Add an item to the inventory.
   * @param {string} itemId
   * @param {number} [count=1]
   * @param {Object} [data]
   * @returns {number} Number of items successfully added
   */
  addItem(itemId, count = 1, data) {
    let remaining = count
    // Stack onto existing slots first
    for (let i = 0; i < this._maxSlots && remaining > 0; i++) {
      const slot = this.slots[i]
      if (slot && slot.id === itemId) {
        const add = Math.min(remaining, 64 - slot.count)
        slot.count += add
        remaining -= add
      }
    }
    // Fill empty slots
    for (let i = 0; i < this._maxSlots && remaining > 0; i++) {
      if (!this.slots[i]) {
        const add = Math.min(remaining, 64)
        this.slots[i] = { id: itemId, count: add, data: data || null }
        remaining -= add
      }
    }
    return count - remaining
  }

  /**
   * Remove an item from the inventory.
   * @param {string} itemId
   * @param {number} [count=1]
   * @returns {number} Number of items successfully removed
   */
  removeItem(itemId, count = 1) {
    let remaining = count
    for (let i = this._maxSlots - 1; i >= 0 && remaining > 0; i--) {
      const slot = this.slots[i]
      if (slot && slot.id === itemId) {
        const remove = Math.min(remaining, slot.count)
        slot.count -= remove
        remaining -= remove
        if (slot.count <= 0) this.slots[i] = null
      }
    }
    return count - remaining
  }

  /**
   * Count how many of a given item are in the inventory.
   * @param {string} itemId
   * @returns {number}
   */
  countItem(itemId) {
    let total = 0
    for (const slot of this.slots) {
      if (slot && slot.id === itemId) total += slot.count
    }
    return total
  }

  /**
   * Check if there is room for a given item.
   * @param {string} itemId
   * @param {number} [count=1]
   * @returns {boolean}
   */
  hasRoom(itemId, count = 1) {
    let available = 0
    for (const slot of this.slots) {
      if (!slot) available += 64
      else if (slot.id === itemId) available += 64 - slot.count
    }
    return available >= count
  }

  /**
   * Check if the inventory contains at least `count` of `itemId`.
   * @param {string} itemId
   * @param {number} [count=1]
   * @returns {boolean}
   */
  hasItem(itemId, count = 1) {
    return this.countItem(itemId) >= count
  }

  /** Get the slot at a specific index. */
  getSlot(index) {
    return this.slots[index] || null
  }

  /** Set a slot directly. */
  setSlot(index, item) {
    this.slots[index] = item
  }

  /** Swap two slots. */
  swapSlots(a, b) {
    const tmp = this.slots[a]
    this.slots[a] = this.slots[b]
    this.slots[b] = tmp
  }

  /** Clear all slots. */
  clear() {
    this.slots = new Array(this._maxSlots).fill(null)
  }

  /** @returns {number} Number of occupied slots */
  usedSlots() {
    return this.slots.filter(s => s !== null).length
  }

  /** @returns {number} Total number of slots */
  maxSlots() { return this._maxSlots }

  /** @returns {boolean} Whether the inventory is completely full */
  isFull() {
    return this.slots.every(s => s !== null && s.count >= 64)
  }

  /** Serialize for persistence. */
  serialize() {
    return this.slots.map(s => s ? { ...s } : null)
  }

  /** Deserialize saved state. */
  deserialize(data) {
    if (Array.isArray(data)) {
      this.slots = data.map(s => s ? { id: s.id, count: s.count, data: s.data || null } : null)
      while (this.slots.length < this._maxSlots) this.slots.push(null)
    }
  }
}

export { Inventory }
