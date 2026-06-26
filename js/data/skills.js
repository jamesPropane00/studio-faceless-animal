/**
 * SkillData
 *
 * Defines all skill trees, skills, and their progression paths.
 * Skills are organized into categories (combat, farming, crafting,
 * exploration, social) with tiered unlocks.
 *
 * Integration:
 *   Imported by SkillTreeManager (player subsystem) for tree definitions.
 *   Used for skill unlock requirements and stat bonuses.
 *
 * TODO:
 *   - Define all skill trees with full node graphs
 *   - Add skill prerequisites and dependencies
 *   - Add skill stat bonuses per level
 *   - Add skill unlock requirements (level, quests, items)
 *   - Add skill visual icons and descriptions
 *   - Add skill categories and specializations
 *   - Add skill experience requirements per level
 *   - Add skill masteries and capstone abilities
 *   - Add skill reset mechanics
 *   - Add event hooks for skill data changes
 *
 * Event hooks:
 *   'skillDataLoaded' — { count }
 *   'skillDataChanged' — { id, changes }
 */

const SKILL_CATEGORIES = {
  COMBAT: 'combat',
  FARMING: 'farming',
  CRAFTING: 'crafting',
  EXPLORATION: 'exploration',
  SOCIAL: 'social'
}

class SkillData {
  constructor() {
    /** @type {Map<string, Object>} */
    this._skills = new Map()
  }

  /**
   * Register a skill definition.
   * @param {string} id
   * @param {Object} data - { name, category, maxLevel, prerequisites, bonuses }
   */
  register(id, data) {
    this._skills.set(id, { ...data, id })
  }

  /**
   * Get skill data by id.
   * @param {string} id
   * @returns {Object|undefined}
   */
  get(id) { return this._skills.get(id) }

  /** Get all registered skills. */
  getAll() { return [...this._skills.values()] }

  /** Get skills by category. */
  getByCategory(category) {
    return this.getAll().filter(s => s.category === category)
  }
}

const skillData = new SkillData()
export { skillData, SKILL_CATEGORIES }
