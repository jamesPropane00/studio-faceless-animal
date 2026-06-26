/**
 * ItemData
 *
 * Central registry for all item types. Items include resources,
 * consumables, tools, seeds, food, materials, and special items.
 *
 * Integration:
 *   Imported by InventorySystem, farm system, combat equipment.
 *   Single source of truth for item properties.
 *
 * TODO:
 *   - Define all item templates with stats
 *   - Add item categories (resource, consumable, tool, seed, food, material, unique)
 *   - Add item rarity, stack size, and max durability
 *   - Add item value (buy/sell prices)
 *   - Add item effects (heal, buff, damage, restore)
 *   - Add item crafting recipes
 *   - Add item upgrade and enhancement
 *   - Add item loot tables
 *   - Add item icons and sprite references
 *   - Add item description and lore
 *   - Add item requirements (level, skill)
 *   - Add event hooks for item data changes
 *
 * Event hooks:
 *   'itemDataLoaded' — { count }
 *   'itemDataChanged' — { id, changes }
 */

const ITEM_CATEGORIES = {
  RESOURCE: 'resource',
  CONSUMABLE: 'consumable',
  TOOL: 'tool',
  SEED: 'seed',
  FOOD: 'food',
  MATERIAL: 'material',
  EQUIPMENT: 'equipment',
  UNIQUE: 'unique'
}

class ItemData {
  constructor() {
    /** @type {Map<string, Object>} */
    this._items = new Map()
  }

  /**
   * Register an item template.
   * @param {string} id
   * @param {Object} data - { name, category, rarity, value, stackSize, effects }
   */
  register(id, data) {
    this._items.set(id, { ...data, id })
  }

  /**
   * Get item data by id.
   * @param {string} id
   * @returns {Object|undefined}
   */
  get(id) { return this._items.get(id) }

  /** Get all registered items. */
  getAll() { return [...this._items.values()] }

  /** Get items by category. */
  getByCategory(category) {
    return this.getAll().filter(i => i.category === category)
  }
}

const itemData = new ItemData()
export { itemData, ITEM_CATEGORIES }
