/**
 * RoadSystem
 *
 * Architecture for road generation, rendering, and maintenance.
 * Supports development blocks, sidewalks, intersections, parking, and decorations.
 *
 * Integration:
 *   engine.registerSystem('roads', roadSystem, 45)
 *   Consumes district and building events to update the road network.
 *
 * TODO:
 *   - Add road types (dirt, asphalt, highway, pedestrian)
 *   - Add intersection detection and rendering
 *   - Add sidewalk and curb rendering
 *   - Add parking zones near buildings
 *   - Add road decorations (trees, lamps, benches, signs)
 *   - Add road maintenance and repair
 *   - Add dynamic road width based on traffic
 *   - Add bridge and tunnel support
 *
 * Event hooks:
 *   'roadPlaced'   — { x, y, type }
 *   'roadRemoved'  — { x, y }
 *   'roadUpgraded' — { x, y, oldType, newType }
 */

const ROAD_TYPES = ['dirt', 'gravel', 'asphalt', 'concrete', 'highway', 'pedestrian']

class RoadSystem {
  constructor() {
    /** @type {Map<string, { x: number, y: number, type: string, hasSidewalk: boolean, hasLights: boolean, decorations: string[] }>} */
    this._roads = new Map()
    this._enabled = true
    this._roadSpacing = 8
    this._roadWidth = 0.5
  }

  /**
   * Place a road tile at the given world position.
   * @param {number} x
   * @param {number} y
   * @param {string} [type='asphalt']
   * @returns {Object} The road tile
   */
  placeRoad(x, y, type = 'asphalt') {
    const key = `${x},${y}`
    const road = { x, y, type, hasSidewalk: false, hasLights: false, decorations: [] }
    this._roads.set(key, road)
    return road
  }

  /**
   * Remove a road tile.
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  removeRoad(x, y) {
    return this._roads.delete(`${x},${y}`)
  }

  /** @param {number} x @param {number} y @returns {Object|undefined} */
  getRoad(x, y) {
    return this._roads.get(`${x},${y}`)
  }

  /**
   * Check if a tile has a road.
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  hasRoad(x, y) {
    return this._roads.has(`${x},${y}`)
  }

  /**
   * Upgrade a road to a different type.
   * @param {number} x
   * @param {number} y
   * @param {string} newType
   */
  upgradeRoad(x, y, newType) {
    const road = this._roads.get(`${x},${y}`)
    if (road) road.type = newType
  }

  /**
   * Add decorations to a road tile.
   * @param {number} x
   * @param {number} y
   * @param {string[]} decorations - e.g., ['tree', 'lamp', 'bench']
   */
  addDecorations(x, y, decorations) {
    const road = this._roads.get(`${x},${y}`)
    if (road) road.decorations.push(...decorations)
  }

  /**
   * Generate a road grid for an area.
   * @param {number} centerX
   * @param {number} centerY
   * @param {number} [radius=10]
   * @param {string} [type='asphalt']
   */
  generateGrid(centerX, centerY, radius = 10, type = 'asphalt') {
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x % this._roadSpacing === 0 || y % this._roadSpacing === 0) {
          this.placeRoad(centerX + x, centerY + y, type)
        }
      }
    }
  }

  /** @returns {number} Total road tiles */
  getRoadCount() { return this._roads.size }

  /** Update roads. Called each tick. */
  update(dt) {
    // TODO: road maintenance, traffic simulation
  }

  /** Serialize for persistence. */
  serialize() {
    return [...this._roads.values()]
  }

  /** Deserialize saved state. */
  deserialize(data) {
    if (Array.isArray(data)) {
      this._roads.clear()
      for (const r of data) this._roads.set(`${r.x},${r.y}`, r)
    }
  }

  setRoadSpacing(s) { this._roadSpacing = s }
  getRoadSpacing() { return this._roadSpacing }
  setRoadWidth(w) { this._roadWidth = w }
  getRoadWidth() { return this._roadWidth }
  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { RoadSystem, ROAD_TYPES }
