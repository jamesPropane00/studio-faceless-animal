/**
 * FarmStorageSystem
 *
 * Manages farm inventory: raw crops, processed food, seeds, and materials.
 * Tracks storage capacity and handles conversion (crops → food).
 *
 * Integration:
 *   engine.registerSystem('farmStorage', farmStorageSystem, 88)
 *   Linked to the player's farm HUD and the send-food system.
 *
 * TODO:
 *   - Add storage upgrades (bigger silos, cold storage)
 *   - Add item categorization (seeds, crops, food, materials)
 *   - Add spoilage and decay simulation
 *   - Add batch processing (crops → food → goods)
 *   - Add storage transfer between farm and city
 *   - Add storage alerts (near capacity, spoilage risk)
 *
 * Event hooks:
 *   'storageChanged'    — { item, delta, total }
 *   'storageFull'       — { item }
 *   'foodProcessed'     — { cropsUsed, foodProduced }
 *   'foodSent'          — { amount, destination }
 */

class FarmStorageSystem {
  constructor() {
    /** @type {Object<string, number>} */
    this.items = {}
    this._capacity = 100
    this._enabled = true
  }

  /**
   * Add items to storage.
   * @param {string} itemId
   * @param {number} count
   * @returns {number} Actual amount added
   */
  add(itemId, count) {
    if (count <= 0) return 0
    const current = this.items[itemId] || 0
    const maxAdd = this._capacity - this.getTotalUsed()
    const actual = Math.min(count, maxAdd)
    this.items[itemId] = current + actual
    return actual
  }

  /**
   * Remove items from storage.
   * @param {string} itemId
   * @param {number} count
   * @returns {number} Actual amount removed
   */
  remove(itemId, count) {
    if (count <= 0) return 0
    const current = this.items[itemId] || 0
    const actual = Math.min(count, current)
    this.items[itemId] = current - actual
    if (this.items[itemId] <= 0) delete this.items[itemId]
    return actual
  }

  /**
   * Get the count of a specific item.
   * @param {string} itemId
   * @returns {number}
   */
  count(itemId) {
    return this.items[itemId] || 0
  }

  /**
   * Process raw crops into food units.
   * @param {number} cropAmount
   * @param {number} [rate=3] - Crops per food unit
   * @returns {number} Food units produced
   */
  processFood(cropAmount, rate = 3) {
    const cropsAvailable = this.count('crops')
    const toProcess = Math.min(cropAmount, cropsAvailable)
    const foodProduced = Math.floor(toProcess / rate)
    const cropsUsed = foodProduced * rate
    this.remove('crops', cropsUsed)
    this.add('food', foodProduced)
    return foodProduced
  }

  /** @returns {number} Total storage slots used */
  getTotalUsed() {
    return Object.values(this.items).reduce((a, b) => a + b, 0)
  }

  /** @returns {number} Total storage capacity */
  getCapacity() { return this._capacity }

  /** @param {number} cap */
  setCapacity(cap) { this._capacity = cap }

  /** @returns {boolean} Whether storage is full */
  isFull() { return this.getTotalUsed() >= this._capacity }

  /** @returns {Object} Snapshot of all items */
  getAll() { return { ...this.items } }

  /** Serialize for persistence. */
  serialize() { return { items: this.items, capacity: this._capacity } }

  /** Deserialize saved state. */
  deserialize(data) {
    if (data) {
      this.items = data.items || {}
      this._capacity = data.capacity || 100
    }
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { FarmStorageSystem }
