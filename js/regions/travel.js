/**
 * TravelSystem
 *
 * Manages travel between regions: initiation, animation, loading, and arrival.
 * Supports travel animations, music transitions, and weather transitions.
 *
 * Integration:
 *   engine.registerSystem('travel', travelSystem, 25)
 *   Consumes WorldMapSystem for reachable regions.
 *   Emits events that other systems consume (weather, audio, NPC).
 *
 * TODO:
 *   - Add travel cost (coins, stamina, time)
 *   - Add travel events (random encounters during travel)
 *   - Add group travel (travel with NPCs or other players)
 *   - Add vehicle types (on foot, horse, vehicle, teleport)
 *   - Add travel music and ambient transitions
 *   - Add weather transition between regions
 *   - Add travel time scaling based on distance
 *   - Add travel animation variants
 *
 * Event hooks:
 *   'travelStart'    — { from, to, duration }
 *   'travelProgress' — { from, to, progress }
 *   'travelComplete' — { from, to }
 *   'travelCancelled' — { from, reason }
 *   'regionEnter'    — { regionId }
 *   'regionExit'     — { regionId }
 */

const TRAVEL_STATUSES = {
  IDLE: 'idle',
  DEPARTING: 'departing',
  IN_TRANSIT: 'in_transit',
  ARRIVING: 'arriving',
  COMPLETE: 'complete'
}

class TravelSystem {
  constructor() {
    this.active = false
    this.target = null
    this.from = null
    this.progress = 0
    this.duration = 8000 // ms
    this._elapsed = 0
    this._enabled = true
    this._statusTexts = ['Departing...', 'Leaving...', 'En route...', 'Almost there...', 'Arriving...']
  }

  /**
   * Start travel to a target region.
   * @param {string} from
   * @param {string} to
   * @param {number} [duration=8000]
   */
  start(from, to, duration = 8000) {
    this.active = true
    this.from = from
    this.target = to
    this.progress = 0
    this._elapsed = 0
    this.duration = duration
  }

  /**
   * Update travel progress. Called each tick.
   * @param {number} dt
   */
  update(dt) {
    if (!this.active) return
    this._elapsed += dt * 1000
    this.progress = Math.min(1, this._elapsed / this.duration)
    if (this.progress >= 1) {
      this.complete()
    }
  }

  /** @returns {string} Current status text */
  getStatusText() {
    const idx = Math.min(this._statusTexts.length - 1, Math.floor(this.progress * this._statusTexts.length))
    return this._statusTexts[idx]
  }

  /** Mark travel as complete. */
  complete() {
    this.active = false
    this.progress = 1
    // TODO: emit travelComplete
  }

  /** Cancel the current travel. */
  cancel() {
    if (!this.active) return
    this.active = false
    this.progress = 0
    this._elapsed = 0
    // TODO: emit travelCancelled
  }

  /** @returns {boolean} Whether travel is currently active */
  isActive() { return this.active }

  /** Serialize for persistence. */
  serialize() {
    return { active: this.active, target: this.target, from: this.from, progress: this.progress }
  }

  /** Deserialize saved state. */
  deserialize(data) {
    if (data) {
      this.active = data.active || false
      this.target = data.target || null
      this.from = data.from || null
      this.progress = data.progress || 0
    }
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { TravelSystem, TRAVEL_STATUSES }
