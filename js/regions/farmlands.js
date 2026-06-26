/**
 * FarmlandsRegion
 *
 * Region definition for Farmlands — the agricultural zone.
 * Farm-specific terrain, dirt roads, crops, animals, and atmosphere.
 *
 * Integration:
 *   Registered with WorldMapSystem.
 *   FarmSystem and CropSystem activate when currentRegion === 'farmlands'.
 *
 * TODO:
 *   - Add field generation algorithm
 *   - Add irrigation system (water sources, canals)
 *   - Add seasonal crop rotation
 *   - Add farm expansion (buy more land)
 *   - Add weather effects specific to farmlands (drought, flood)
 *   - Add farm road network (dirt roads between fields)
 *   - Add silo and storage rendering
 *
 * Event hooks:
 *   'farmlandsTick' — { dt }
 *   'seasonChanged' — { season }
 */

class FarmlandsRegion {
  constructor() {
    this.id = 'farmlands'
    this.name = 'Farmlands'
    this.label = '\u{1F33E}'
    this.color = '#84cc16'
    this.mapPos = { x: 3, y: 2 }
    this.connections = ['facelesscity', 'mountains']
  }

  /**
   * Get terrain at a given position.
   * @param {number} wx
   * @param {number} wy
   * @returns {number}
   */
  getTerrainAt(wx, wy) {
    // TODO: farmlands-specific terrain
    return 12 // DIRT
  }

  /**
   * Generate terrain for a chunk.
   * @param {number} cx
   * @param {number} cy
   * @returns {Array<Array<number>>}
   */
  generateChunk(cx, cy) {
    // TODO: farmlands chunk generation with fields
    const chunk = []
    for (let y = 0; y < 10; y++) {
      const row = []
      for (let x = 0; x < 10; x++) {
        // Farmlands are mostly dirt and grass
        const wx = cx * 10 + x
        const wy = cy * 10 + y
        const noise = Math.sin(wx * 0.3) * Math.cos(wy * 0.3)
        row.push(noise > 0.6 ? 0 : 12) // GRASS or DIRT
      }
      chunk.push(row)
    }
    return chunk
  }
}

export { FarmlandsRegion }
