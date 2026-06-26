/**
 * EncounterSystem
 *
 * Manages combat encounters: trigger conditions, enemy spawning,
 * encounter types, and rewards. Encounters can be hostile creatures,
 * gang ambushes, or random events.
 *
 * Integration:
 *   engine.registerSystem('encounters', encounterSystem, 100)
 *   Triggers BattleSystem when an encounter begins.
 *
 * TODO:
 *   - Add encounter zones per region
 *   - Add encounter difficulty scaling
 *   - Add encounter rewards (coins, items, experience)
 *   - Add stealth and evasion mechanics
 *   - Add boss encounters and world events
 *   - Add encounter cooldown system
 *   - Add player-initiated encounters (hunt, provoke)
 *
 * Event hooks:
 *   'encounterStarted'  — { id, type, enemies, location }
 *   'encounterResolved'  — { id, outcome, rewards }
 *   'encounterEvaded'    — { id }
 *   'encounterTriggered' — { type, source }
 */

const ENCOUNTER_TYPES = ['ambush', 'creature', 'gang', 'event', 'boss', 'hunt']

class EncounterSystem {
  constructor() {
    /** @type {Array<{ id: string, type: string, x: number, y: number, enemies: string[], status: string }>} */
    this.encounters = []
    this._enabled = true
  }

  /**
   * Trigger a new encounter.
   * @param {string} type
   * @param {number} x
   * @param {number} y
   * @param {string[]} enemies - Enemy type ids
   * @returns {Object}
   */
  trigger(type, x, y, enemies) {
    const id = `encounter_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const enc = { id, type, x, y, enemies: [...enemies], status: 'active' }
    this.encounters.push(enc)
    return enc
  }

  /**
   * Resolve an encounter.
   * @param {string} id
   * @param {string} outcome - 'victory', 'defeat', 'flee'
   * @returns {Object|null} Rewards if victorious
   */
  resolve(id, outcome) {
    const idx = this.encounters.findIndex(e => e.id === id)
    if (idx === -1) return null
    const enc = this.encounters[idx]
    enc.status = outcome
    if (outcome === 'victory') {
      const rewards = { coins: 10 + Math.floor(Math.random() * 20), rep: 5 }
      return rewards
    }
    return null
  }

  /**
   * Find active encounters near a position.
   * @param {number} x
   * @param {number} y
   * @param {number} [radius=10]
   * @returns {Object[]}
   */
  findNearby(x, y, radius = 10) {
    return this.encounters.filter(e =>
      e.status === 'active' &&
      Math.abs(e.x - x) <= radius && Math.abs(e.y - y) <= radius
    )
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { EncounterSystem, ENCOUNTER_TYPES }
