/**
 * MountainsRegion
 *
 * Region definition for the Mountain range — rocky highlands with
 * mineral resources, snow caps, and rugged terrain.
 *
 * Integration:
 *   Registered with WorldMapSystem.
 *
 * TODO:
 *   - Add elevation-based terrain generation
 *   - Add mining and resource extraction
 *   - Add mountain pass routes and bridges
 *   - Add snow weather system
 *   - Add climbing and traversal mechanics
 *   - Add cave systems and underground areas
 *   - Add mountain-specific creatures
 *
 * Event hooks:
 *   'mountainsTick' — { dt }
 */

class MountainsRegion {
  constructor() {
    this.id = 'mountains'
    this.name = 'Mountains'
    this.label = '\u26F0\uFE0F'
    this.color = '#94a3b8'
    this.mapPos = { x: 2, y: 4 }
    this.connections = ['farmlands', 'whisperwoods', 'coast']
  }

  getTerrainAt(wx, wy) {
    return 5 // ROCK
  }

  generateChunk(cx, cy) {
    const chunk = []
    for (let y = 0; y < 10; y++) {
      const row = []
      for (let x = 0; x < 10; x++) {
        const wx = cx * 10 + x + 20, wy = cy * 10 + y + 80
        const noise = Math.sin(wx * 0.2) * Math.cos(wy * 0.2)
        row.push(noise > 0 ? 5 : 9) // ROCK or SNOW
      }
      chunk.push(row)
    }
    return chunk
  }
}

export { MountainsRegion }
