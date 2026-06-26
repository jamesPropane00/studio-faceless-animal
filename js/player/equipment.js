/**
 * Equipment
 *
 * Manages equippable item slots for the player.
 * Equipment provides stat bonuses, abilities, and visual customization.
 *
 * Integration:
 *   Attached to Player or used standalone.
 *   Slots: head, chest, legs, feet, mainHand, offHand, accessory1, accessory2.
 *
 * TODO:
 *   - Add stat aggregation from equipped items
 *   - Add equipment durability and repair
 *   - Add set bonuses (wearing multiple pieces from the same set)
 *   - Add transmog / cosmetic override system
 *   - Add equipment weight and movement speed impact
 *
 * Event hooks:
 *   'equipmentChanged' — { slot, item, oldItem }
 *   'equipmentBroken'  — { slot, item }
 */

const EQUIPMENT_SLOTS = ['head', 'chest', 'legs', 'feet', 'mainHand', 'offHand', 'accessory1', 'accessory2']

class Equipment {
  constructor() {
    /** @type {Object<string, { id: string, stats: Object, data?: Object }|null>} */
    this._slots = {}
    for (const slot of EQUIPMENT_SLOTS) this._slots[slot] = null
  }

  /**
   * Equip an item to a slot.
   * @param {string} slot
   * @param {Object} item - Must have { id, stats } properties
   * @returns {Object|null} Previously equipped item, if any
   */
  equip(slot, item) {
    if (!this._slots.hasOwnProperty(slot)) return null
    const old = this._slots[slot]
    this._slots[slot] = { id: item.id, stats: item.stats || {}, data: item.data || null }
    return old
  }

  /**
   * Unequip a slot.
   * @param {string} slot
   * @returns {Object|null} The unequipped item, if any
   */
  unequip(slot) {
    if (!this._slots.hasOwnProperty(slot)) return null
    const old = this._slots[slot]
    this._slots[slot] = null
    return old
  }

  /** @param {string} slot @returns {Object|null} */
  getSlot(slot) { return this._slots[slot] || null }

  /** @returns {Object<string, Object|null>} All slots */
  getAllSlots() { return { ...this._slots } }

  /**
   * Get aggregate stats from all equipped items.
   * @returns {Object<string, number>}
   */
  getTotalStats() {
    const totals = {}
    for (const slot of EQUIPMENT_SLOTS) {
      const item = this._slots[slot]
      if (item && item.stats) {
        for (const [stat, value] of Object.entries(item.stats)) {
          totals[stat] = (totals[stat] || 0) + value
        }
      }
    }
    return totals
  }

  /** @returns {number} Number of occupied slots */
  occupiedSlots() {
    return EQUIPMENT_SLOTS.filter(s => this._slots[s] !== null).length
  }

  /** Serialize for persistence. */
  serialize() {
    const data = {}
    for (const slot of EQUIPMENT_SLOTS) {
      if (this._slots[slot]) data[slot] = { ...this._slots[slot] }
    }
    return data
  }

  /** Deserialize saved state. */
  deserialize(data) {
    if (data) {
      for (const slot of EQUIPMENT_SLOTS) {
        if (data[slot]) this._slots[slot] = { id: data[slot].id, stats: data[slot].stats || {}, data: data[slot].data || null }
        else this._slots[slot] = null
      }
    }
  }
}

export { Equipment, EQUIPMENT_SLOTS }
