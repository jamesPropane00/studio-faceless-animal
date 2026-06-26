/**
 * Reputation
 *
 * Tracks and manages the player's reputation level and progress.
 * Reputation unlocks abilities, districts, and social standing.
 *
 * Integration:
 *   Attached to Player or used standalone.
 *   Levels are defined by thresholds; each level has a name.
 *
 * TODO:
 *   - Add per-faction reputation (gangs, districts, NPC groups)
 *   - Add reputation decay over time
 *   - Add reputation rewards and penalties
 *   - Add UI for reputation breakdown
 *   - Add server sync for reputation state
 *
 * Event hooks:
 *   'repChanged'  — { rep, delta }
 *   'repLevelUp'  — { level, name }
 *   'repLevelDown' — { level, name }
 */

const REP_LEVELS = [
  { name: 'Nobody', min: 0, max: 50 },
  { name: 'Newcomer', min: 50, max: 150 },
  { name: 'Local', min: 150, max: 350 },
  { name: 'Contributor', min: 350, max: 700 },
  { name: 'Respected', min: 700, max: 1200 },
  { name: 'Influential', min: 1200, max: 2000 },
  { name: 'Leader', min: 2000, max: 3500 },
  { name: 'Legend', min: 3500, max: Infinity }
]

class Reputation {
  constructor() {
    this.rep = 0
    this._levelIndex = 0
  }

  /**
   * Add reputation points.
   * @param {number} amount
   * @returns {number} New rep total
   */
  add(amount) {
    if (amount <= 0) return this.rep
    this.rep += amount
    this._updateLevel()
    return this.rep
  }

  /**
   * Remove reputation points.
   * @param {number} amount
   * @returns {number} New rep total
   */
  remove(amount) {
    if (amount <= 0) return this.rep
    this.rep = Math.max(0, this.rep - amount)
    this._updateLevel()
    return this.rep
  }

  /** @returns {string} Current level name */
  getLevelName() {
    return REP_LEVELS[this._levelIndex].name
  }

  /** @returns {number} Current level index */
  getLevelIndex() {
    return this._levelIndex
  }

  /** @returns {number} Reputation required for current level */
  getLevelMin() {
    return REP_LEVELS[this._levelIndex].min
  }

  /** @returns {number} Reputation required for next level (or current if max) */
  getLevelMax() {
    return REP_LEVELS[this._levelIndex].max
  }

  /** @returns {number} Progress within current level (0-1) */
  getProgress() {
    const level = REP_LEVELS[this._levelIndex]
    const range = level.max - level.min
    if (range === Infinity) return 1
    return Math.min(1, Math.max(0, (this.rep - level.min) / range))
  }

  /** @returns {boolean} Whether the player is at max reputation level */
  isMaxLevel() {
    return this._levelIndex >= REP_LEVELS.length - 1
  }

  /** Update the current level index based on rep value. */
  _updateLevel() {
    for (let i = REP_LEVELS.length - 1; i >= 0; i--) {
      if (this.rep >= REP_LEVELS[i].min) {
        if (i !== this._levelIndex) {
          this._levelIndex = i
          // TODO: emit repLevelUp / repLevelDown
        }
        return
      }
    }
    this._levelIndex = 0
  }

  /** Serialize for persistence. */
  serialize() {
    return { rep: this.rep }
  }

  /** Deserialize saved state. */
  deserialize(data) {
    if (data.rep !== undefined) {
      this.rep = data.rep
      this._updateLevel()
    }
  }
}

export { Reputation, REP_LEVELS }
