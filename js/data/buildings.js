/**
 * BuildingData
 *
 * Defines all building types: residential, commercial, industrial,
 * municipal, special. Each building has cost, size, income, capacity,
 * and upgrade path.
 *
 * Integration:
 *   Imported by CityBuildingSystem for building placement and stats.
 *   Data registry for the building planner/dev menu.
 *
 * TODO:
 *   - Define all building templates with full stats
 *   - Add upgrade tiers for each building
 *   - Add building requirements (population, roads, power)
 *   - Add building appearance data (sprite, color, size)
 *   - Add special buildings (hospital, police, school, park)
 *   - Add building effects (happiness, crime, property value)
 *   - Add landmark and unique buildings
 *   - Add building construction time and cost scaling
 *   - Add event hooks for building data changes
 *
 * Event hooks:
 *   'buildingDataLoaded' — { count }
 *   'buildingDataChanged' — { id, changes }
 */

const BUILDING_CATEGORIES = {
  RESIDENTIAL: 'residential',
  COMMERCIAL: 'commercial',
  INDUSTRIAL: 'industrial',
  MUNICIPAL: 'municipal',
  SPECIAL: 'special'
}

class BuildingData {
  constructor() {
    /** @type {Map<string, Object>} */
    this._templates = new Map()
  }

  /**
   * Register a building template.
   * @param {string} id
   * @param {Object} data - { name, category, cost, size, income, capacity, upgrades }
   */
  register(id, data) {
    this._templates.set(id, { ...data, id })
  }

  /**
   * Get a building template by id.
   * @param {string} id
   * @returns {Object|undefined}
   */
  get(id) { return this._templates.get(id) }

  /** Get all registered building templates. */
  getAll() { return [...this._templates.values()] }

  /**
   * Get templates by category.
   * @param {string} category
   * @returns {Object[]}
   */
  getByCategory(category) {
    return this.getAll().filter(b => b.category === category)
  }
}

const buildingData = new BuildingData()
export { buildingData, BUILDING_CATEGORIES }
