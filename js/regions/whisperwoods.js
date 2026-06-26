/**
 * WhisperWoodsRegion
 *
 * Region definition for Whisper Woods — a dense, mystical forest.
 * Features ancient trees, hidden clearings, and wildlife habitats.
 *
 * Integration:
 *   Registered with WorldMapSystem.
 *   CreatureSystem and HabitatSystem activate in this region.
 *
 * TODO:
 *   - Add dense forest terrain generation
 *   - Add hidden paths and secret locations
 *   - Add forest-specific creatures and NPCs
 *   - Add ambient audio (wind through trees, animal calls)
 *   - Add fog and lighting effects
 *   - Add foraging and gathering mechanics
 *   - Add ancient ruins and exploration points
 *
 * Event hooks:
 *   'whisperwoodsTick' — { dt }
 */

class WhisperWoodsRegion {
  constructor() {
    this.id = 'whisperwoods'
    this.name = 'Whisper Woods'
    this.label = '\u{1F333}'
    this.color = '#22c55e'
    this.mapPos = { x: 1, y: 1 }
    this.connections = ['facelesscity', 'mountains']
  }

  getTerrainAt(wx, wy) {
    return 4 // FOREST
  }

  generateChunk(cx, cy) {
    const chunk = []
    for (let y = 0; y < 10; y++) {
      const row = []
      for (let x = 0; x < 10; x++) {
        const wx = cx * 10 + x + 50, wy = cy * 10 + y + 50
        const noise = Math.sin(wx * 0.5) * Math.cos(wy * 0.5)
        row.push(noise > 0.3 ? 4 : 0) // FOREST or GRASS
      }
      chunk.push(row)
    }
    return chunk
  }
}

export { WhisperWoodsRegion }
