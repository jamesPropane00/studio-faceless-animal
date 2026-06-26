/**
 * CoastRegion
 *
 * Region definition for the Coast — beaches, ports, and shoreline.
 * Features sand terrain, water access, and trading ports.
 *
 * Integration:
 *   Registered with WorldMapSystem.
 *
 * TODO:
 *   - Add beach and shoreline terrain
 *   - Add port and dock system
 *   - Add fishing mechanics
 *   - Add boat travel between coastal regions
 *   - Add tide simulation
 *   - Add coastal storms and weather
 *   - Add underwater exploration areas
 *
 * Event hooks:
 *   'coastTick' — { dt }
 */

class CoastRegion {
  constructor() {
    this.id = 'coast'
    this.name = 'Coast'
    this.label = '\u{1F3DC}\uFE0F'
    this.color = '#38bdf8'
    this.mapPos = { x: 4, y: 1 }
    this.connections = ['mountains', 'purplepulse']
  }

  getTerrainAt(wx, wy) {
    return 3 // SAND
  }

  generateChunk(cx, cy) {
    const chunk = []
    for (let y = 0; y < 10; y++) {
      const row = []
      for (let x = 0; x < 10; x++) {
        const wx = cx * 10 + x + 80, wy = cy * 10 + y + 20
        const noise = Math.sin(wx * 0.4) * Math.cos(wy * 0.4)
        row.push(noise > 0.2 ? 1 : 3) // WATER or SAND
      }
      chunk.push(row)
    }
    return chunk
  }
}

export { CoastRegion }
