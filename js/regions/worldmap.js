/**
 * WorldMapSystem
 *
 * Manages the world map: region nodes, connections, positions, and rendering.
 * Drives the visual node graph shown in the world map panel.
 *
 * Integration:
 *   engine.registerSystem('worldmap', worldMapSystem, 20)
 *   Consumed by the travel system and world map UI.
 *
 * TODO:
 *   - Add dynamic region discovery (unlock new regions through gameplay)
 *   - Add region status indicators (population, stability, threat level)
 *   - Add region event markers (available quests, active events)
 *   - Add zoom and pan on the world map
 *   - Add region detail tooltips
 *   - Add minimap integration
 *   - Add server-synced region state
 *
 * Event hooks:
 *   'regionDiscovered'  — { regionId }
 *   'regionStatusChanged' — { regionId, status }
 */

class RegionNode {
  /**
   * @param {string} id
   * @param {string} name
   * @param {string} label - Emoji icon
   * @param {string} color
   * @param {{ x: number, y: number }} mapPos - Grid position (0-4)
   * @param {string[]} connections - Connected region ids
   */
  constructor(id, name, label, color, mapPos, connections) {
    this.id = id
    this.name = name
    this.label = label
    this.color = color
    this.mapPos = mapPos
    this.connections = connections
    this.discovered = true
    this.locked = false
  }

  /** Get the node position as a percentage for CSS layout. */
  getNodePos() {
    return { x: 8 + this.mapPos.x * 21, y: 8 + this.mapPos.y * 21 }
  }
}

class WorldMapSystem {
  constructor() {
    /** @type {Map<string, RegionNode>} */
    this.regions = new Map()
    this._enabled = true
    this._currentRegion = 'city'
  }

  /**
   * Register a region on the world map.
   * @param {RegionNode} node
   */
  registerRegion(node) {
    this.regions.set(node.id, node)
  }

  /**
   * Get a registered region node.
   * @param {string} id
   * @returns {RegionNode|undefined}
   */
  getRegion(id) { return this.regions.get(id) }

  /** @returns {RegionNode[]} All registered regions */
  getAllRegions() { return [...this.regions.values()] }

  /** @returns {string[]} Region ids connected to the current region */
  getReachableRegions() {
    const current = this.regions.get(this._currentRegion)
    if (!current) return []
    return current.connections.filter(id => {
      const r = this.regions.get(id)
      return r && !r.locked && r.discovered
    })
  }

  /** @param {string} id */
  setCurrentRegion(id) {
    this._currentRegion = id
  }

  /** @returns {string} */
  getCurrentRegion() { return this._currentRegion }

  /**
   * Lock or unlock a region.
   * @param {string} id
   * @param {boolean} locked
   */
  setRegionLock(id, locked) {
    const r = this.regions.get(id)
    if (r) r.locked = locked
  }

  /**
   * Mark a region as discovered.
   * @param {string} id
   */
  discoverRegion(id) {
    const r = this.regions.get(id)
    if (r && !r.discovered) {
      r.discovered = true
      // TODO: emit regionDiscovered
    }
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { WorldMapSystem, RegionNode }
