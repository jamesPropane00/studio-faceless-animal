/**
 * NPCSystem
 *
 * Manages non-player characters: spawning, despawning, state, and behavior.
 * NPCs have types, roles, positions, and routines driven by the AI system.
 *
 * Integration:
 *   engine.registerSystem('npc', npcSystem, 50)
 *   Delegates AI decisions to ai.js, routines to routines.js.
 *
 * TODO:
 *   - Add NPC memory and relationships
 *   - Add NPC dialogue and quests
 *   - Add NPC inventory and equipment
 *   - Add NPC stats (health, speed, strength)
 *   - Add NPC visual customization
 *   - Add NPC lifecycle (aging, retirement, death)
 *   - Add NPC reputation per player
 *
 * Event hooks:
 *   'npcSpawned'   — { id, type, x, y }
 *   'npcDespawned' — { id, reason }
 *   'npcMoved'     — { id, x, y }
 *   'npcStateChanged' — { id, oldState, newState }
 *   'npcInteracted'   — { npcId, playerId, type }
 */

const NPC_TYPES = ['wanderer', 'worker', 'vendor', 'farmer', 'guard', 'artist', 'gang_member', 'creature_keeper']

class NPCSystem {
  constructor() {
    /** @type {Array<{ id: string, type: string, x: number, y: number, state: string, direction: string, speed: number, data: Object }>} */
    this.npcs = []
    this._enabled = true
    this._spawnTimer = 0
  }

  /**
   * Spawn an NPC at a position.
   * @param {string} type
   * @param {number} x
   * @param {number} y
   * @param {Object} [data={}]
   * @returns {Object} The spawned NPC
   */
  spawn(type, x, y, data = {}) {
    const id = `npc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const npc = {
      id, type,
      x, y,
      state: 'idle',
      direction: 'down',
      speed: 0.5 + Math.random() * 0.5,
      data: { ...data }
    }
    this.npcs.push(npc)
    return npc
  }

  /**
   * Despawn an NPC by id.
   * @param {string} id
   * @returns {boolean}
   */
  despawn(id) {
    const idx = this.npcs.findIndex(n => n.id === id)
    if (idx === -1) return false
    this.npcs.splice(idx, 1)
    return true
  }

  /**
   * Find the nearest NPC to a position within range.
   * @param {number} x
   * @param {number} y
   * @param {number} [maxDist=10]
   * @returns {Object|null}
   */
  findNearest(x, y, maxDist = 10) {
    let best = null, bestDist = maxDist
    for (const npc of this.npcs) {
      const dx = x - npc.x, dy = y - npc.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < bestDist) { bestDist = dist; best = npc }
    }
    return best
  }

  /**
   * Get all NPCs within a radius.
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @returns {Array}
   */
  getInRadius(x, y, radius) {
    return this.npcs.filter(n => Math.abs(n.x - x) <= radius && Math.abs(n.y - y) <= radius)
  }

  /**
   * Update NPC system. Called each tick.
   * @param {number} dt
   */
  update(dt) {
    // NPC movement interpolation handled in world.html
    // TODO: delegate to AI system
  }

  /** @returns {number} Total NPC count */
  count() { return this.npcs.length }

  /** Serialize for persistence. */
  serialize() { return this.npcs }

  /** Deserialize saved state. */
  deserialize(data) {
    if (Array.isArray(data)) this.npcs = data
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { NPCSystem, NPC_TYPES }
