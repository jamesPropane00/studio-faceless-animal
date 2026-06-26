/**
 * GangData
 *
 * Defines all gang types and factions. Gangs have territories, members,
 * reputation, relationships, and special activities.
 *
 * Integration:
 *   Imported by GangSystem (NPC subsystem). Used for faction relationships
 *   and territory assignment.
 *
 * TODO:
 *   - Define all gang templates with stats
 *   - Add gang relationships (allies, enemies, neutral)
 *   - Add gang territory preferences (districts, regions)
 *   - Add gang activities (smuggling, protection, turf wars, heists)
 *   - Add gang member templates (names, roles, stats)
 *   - Add gang reputation rewards (missions, bounties)
 *   - Add gang hideout locations
 *   - Add gang progression (small → large → empire)
 *   - Add gang special events (showdowns, alliances)
 *   - Add gang equipment and vehicles
 *
 * Event hooks:
 *   'gangDataLoaded' — { count }
 *   'gangDataChanged' — { id, changes }
 */

class GangData {
  constructor() {
    /** @type {Map<string, Object>} */
    this._gangs = new Map()
  }

  /**
   * Register a gang template.
   * @param {string} id
   * @param {Object} data - { name, territory, allies, enemies, color, activities }
   */
  register(id, data) {
    this._gangs.set(id, { ...data, id })
  }

  /**
   * Get gang data by id.
   * @param {string} id
   * @returns {Object|undefined}
   */
  get(id) { return this._gangs.get(id) }

  /** Get all registered gangs. */
  getAll() { return [...this._gangs.values()] }
}

const gangData = new GangData()
export { gangData }
