/**
 * RegionData
 *
 * Central registry for all region definitions. Stores metadata per region:
 * name, biome, size, connections, spawn rules, and visual theme.
 *
 * Integration:
 *   Imported by WorldMapSystem, travel system, and region generators.
 *   Single source of truth for region properties.
 *
 * TODO:
 *   - Define all region metadata (biome, size, level req, description)
 *   - Add region unlock conditions
 *   - Add region visual themes (sky, ground, foliage palette)
 *   - Add region music and ambience references
 *   - Add region spawn tables (NPCs, creatures, resources)
 *   - Add region weather profiles
 *   - Add region seasonal variations
 *   - Add region special features (dungeons, landmarks, events)
 *   - Add region connection requirements (bridges, tunnels, keys)
 *   - Add event hooks for region data changes
 *
 * Event hooks:
 *   'regionDataLoaded' — { count }
 *   'regionDataChanged' — { id, changes }
 */

class RegionData {
  constructor() {
    /** @type {Map<string, Object>} */
    this._regions = new Map()
  }

  /**
   * Register a region definition.
   * @param {string} id
   * @param {Object} data - { name, biome, size, connections, levelReq, theme }
   */
  register(id, data) {
    this._regions.set(id, { ...data, id })
  }

  /**
   * Get region data by id.
   * @param {string} id
   * @returns {Object|undefined}
   */
  get(id) { return this._regions.get(id) }

  /** Get all registered regions. */
  getAll() { return [...this._regions.values()] }

  /** @param {string} biome @returns {Object[]} */
  getByBiome(biome) {
    return this.getAll().filter(r => r.biome === biome)
  }

  /**
   * Get connections for a region.
   * @param {string} id
   * @returns {string[]}
   */
  getConnections(id) {
    const r = this._regions.get(id)
    return r ? r.connections || [] : []
  }
}

const regionData = new RegionData()
export { regionData }
