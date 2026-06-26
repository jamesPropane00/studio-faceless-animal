/**
 * CombatEquipmentSystem
 *
 * Manages combat-specific equipment: weapons, armor, and accessories
 * that modify battle stats and provide combat abilities.
 *
 * Integration:
 *   engine.registerSystem('combatEquipment', combatEquipmentSystem, 108)
 *   Works with BattleSystem for stat aggregation.
 *   Player equipment is managed by player/equipment.js.
 *
 * TODO:
 *   - Add weapon types (sword, bow, staff, gun, fist)
 *   - Add armor types (light, medium, heavy)
 *   - Add accessory effects (rings, amulets, trinkets)
 *   - Add weapon skills and special attacks
 *   - Add equipment rarity tiers
 *   - Add equipment crafting and enhancement
 *   - Add equipment durability and repair
 *   - Add set bonuses
 *
 * Event hooks:
 *   'combatEquipChanged' — { slot, item }
 *   'combatEquipBroken'  — { slot, item }
 *   'combatEquipEnhanced' — { id, newLevel }
 */

const COMBAT_EQUIP_TYPES = ['weapon', 'armor', 'accessory']
const RARITY_TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary']

class CombatEquipmentItem {
  /**
   * @param {string} id
   * @param {string} type
   * @param {string} name
   * @param {string} rarity
   * @param {Object} stats - { atk, def, speed, hp }
   */
  constructor(id, type, name, rarity, stats) {
    this.id = id
    this.type = type
    this.name = name
    this.rarity = rarity
    this.stats = { atk: 0, def: 0, speed: 0, hp: 0, ...stats }
    this.level = 1
    this.durability = 100
  }
}

class CombatEquipmentSystem {
  constructor() {
    /** @type {Map<string, CombatEquipmentItem>} */
    this._items = new Map()
    this._enabled = true
  }

  /**
   * Register a combat equipment item.
   * @param {CombatEquipmentItem} item
   */
  registerItem(item) {
    this._items.set(item.id, item)
  }

  /**
   * Get an equipment item by id.
   * @param {string} id
   * @returns {CombatEquipmentItem|undefined}
   */
  getItem(id) { return this._items.get(id) }

  /**
   * Calculate total combat stats from a list of equipped item ids.
   * @param {string[]} itemIds
   * @returns {{ atk: number, def: number, speed: number, hp: number }}
   */
  calculateStats(itemIds) {
    const total = { atk: 0, def: 0, speed: 0, hp: 0 }
    for (const id of itemIds) {
      const item = this._items.get(id)
      if (item) {
        for (const [stat, value] of Object.entries(item.stats)) {
          total[stat] = (total[stat] || 0) + value
        }
      }
    }
    return total
  }

  /**
   * Reduce durability of equipped items after battle.
   * @param {string[]} itemIds
   * @param {number} [amount=1]
   */
  applyDurabilityLoss(itemIds, amount = 1) {
    for (const id of itemIds) {
      const item = this._items.get(id)
      if (item) item.durability = Math.max(0, item.durability - amount)
    }
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { CombatEquipmentSystem, CombatEquipmentItem, COMBAT_EQUIP_TYPES, RARITY_TIERS }
