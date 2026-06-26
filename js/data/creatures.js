/**
 * CreatureData
 *
 * Defines all creature types: stats, behaviours, habitats, evolution
 * paths, and discoverability. Serves as the creature database.
 *
 * Integration:
 *   Imported by CreatureSystem for creature templates.
 *   Used by TrackingSystem for discovery metadata.
 *
 * TODO:
 *   - Define all creature templates with stats
 *   - Add creature evolution/mutation paths
 *   - Add creature habitat preferences
 *   - Add creature behaviour profiles
 *   - Add creature loot tables
 *   - Add creature rarity tiers
 *   - Add creature size and collision data
 *   - Add creature sprite/animation references
 *   - Add creature sounds (vocalizations)
 *   - Add creature discovery hints and lore
 *   - Add creature breeding combinations
 *   - Add creature regional variants
 *
 * Event hooks:
 *   'creatureDataLoaded' — { count }
 *   'creatureDataChanged' — { id, changes }
 */

const CREATURE_RARITY = { COMMON: 'common', UNCOMMON: 'uncommon', RARE: 'rare', EPIC: 'epic', LEGENDARY: 'legendary' }
const CREATURE_BEHAVIOUR = { PEACEFUL: 'peaceful', NEUTRAL: 'neutral', AGGRESSIVE: 'aggressive', TIMID: 'timid', CURIOUS: 'curious' }

class CreatureData {
  constructor() {
    /** @type {Map<string, Object>} */
    this._templates = new Map()
  }

  /**
   * Register a creature template.
   * @param {string} id
   * @param {Object} data - { name, rarity, behaviour, stats, habitats }
   */
  register(id, data) {
    this._templates.set(id, { ...data, id })
  }

  /**
   * Get a creature template by id.
   * @param {string} id
   * @returns {Object|undefined}
   */
  get(id) { return this._templates.get(id) }

  /** Get all registered creature templates. */
  getAll() { return [...this._templates.values()] }

  /** Get creatures by rarity. */
  getByRarity(rarity) {
    return this.getAll().filter(c => c.rarity === rarity)
  }

  /** Get creatures by behaviour. */
  getByBehaviour(behaviour) {
    return this.getAll().filter(c => c.behaviour === behaviour)
  }
}

const creatureData = new CreatureData()
export { creatureData, CREATURE_RARITY, CREATURE_BEHAVIOUR }
