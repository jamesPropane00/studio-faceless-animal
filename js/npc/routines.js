/**
 * RoutineSystem
 *
 * Manages NPC daily routines and schedules.
 * NPCs follow time-based routines (morning work, evening rest, etc.)
 * that drive their position and state throughout the day.
 *
 * Integration:
 *   engine.registerSystem('routines', routineSystem, 49)
 *   Consumes time events from TimeSystem to update NPC schedules.
 *
 * TODO:
 *   - Add weekly schedules (work days vs rest days)
 *   - Add seasonal routine variations
 *   - Add emergency routine overrides (fire, crime, disaster)
 *   - Add social routines (visiting neighbours, gatherings)
 *   - Add leisure routines (eating, entertainment, exercise)
 *   - Add route planning between routine waypoints
 *   - Add routine priority system
 *
 * Event hooks:
 *   'routineStarted'  — { npcId, routine }
 *   'routineCompleted' — { npcId, routine }
 *   'routineSkipped'  — { npcId, routine, reason }
 */

class RoutineDefinition {
  /**
   * @param {string} id
   * @param {string} name
   * @param {number} startHour - 0-23
   * @param {number} endHour - 0-23
   * @param {Object} [behaviour={}] - State and target info
   */
  constructor(id, name, startHour, endHour, behaviour = {}) {
    this.id = id
    this.name = name
    this.startHour = startHour
    this.endHour = endHour
    this.behaviour = behaviour
  }

  /** Check if this routine is active at the given hour. */
  isActive(hour) {
    if (this.startHour <= this.endHour) {
      return hour >= this.startHour && hour < this.endHour
    }
    // Overnight routine
    return hour >= this.startHour || hour < this.endHour
  }
}

class RoutineSystem {
  constructor() {
    /** @type {Map<string, RoutineDefinition[]>} */
    this._routines = new Map()
    this._enabled = true
  }

  /**
   * Define routines for an NPC type.
   * @param {string} npcType
   * @param {RoutineDefinition[]} routines
   */
  defineRoutines(npcType, routines) {
    this._routines.set(npcType, routines.sort((a, b) => a.startHour - b.startHour))
  }

  /**
   * Get the active routine for an NPC at the given hour.
   * @param {string} npcType
   * @param {number} hour
   * @returns {RoutineDefinition|null}
   */
  getActiveRoutine(npcType, hour) {
    const routines = this._routines.get(npcType)
    if (!routines) return null
    return routines.find(r => r.isActive(hour)) || null
  }

  /**
   * Get all routines defined for an NPC type.
   * @param {string} npcType
   * @returns {RoutineDefinition[]}
   */
  getRoutines(npcType) {
    return this._routines.get(npcType) || []
  }

  /**
   * Update routines. Called each tick.
   * @param {number} dt
   */
  update(dt) {
    // TODO: evaluate active routines, emit events
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { RoutineSystem, RoutineDefinition }
