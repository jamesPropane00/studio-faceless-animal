/**
 * TimeSystem
 *
 * Manages the in-game day/night cycle and time-accelerated simulation.
 * Designed to be registered with SimulationEngine.
 *
 * Integration:
 *   engine.registerSystem('time', timeSystem, 10)
 *   state.time (0-1 float, 0 = midnight) is consumed by atmosphere,
 *   audio, crop growth, NPC routines, etc.
 *
 * TODO:
 *   - Add pausing / resuming time
 *   - Add time-of-day events (dawn, dusk, noon, midnight callbacks)
 *   - Add time scaling factor per region
 *   - Add calendar system (days, seasons, years)
 *   - Add server time synchronization for multiplayer
 *
 * Event hooks:
 *   'dayChanged'   — { day: number }
 *   'hourChanged'  — { hour: number }
 *   'timeOfDay'    — { phase: 'dawn'|'day'|'dusk'|'night' }
 */

const PHASES = ['night', 'dawn', 'morning', 'day', 'midday', 'sunset', 'dusk']

class TimeSystem {
  constructor() {
    this.time = 0.5 // 0-1 float, 0 = midnight
    this.speed = 0.0003
    this.day = 1
    this._lastHour = -1
    this._lastPhase = ''
    this._enabled = true
    this._paused = false
  }

  /**
   * Update game time. Called each tick.
   * @param {number} dt
   */
  update(dt) {
    if (this._paused || !this._enabled) return

    this.time = (this.time + dt * this.speed) % 1.0

    // Track day rollover
    const prev = ((this.time - dt * this.speed) % 1.0 + 1.0) % 1.0
    if (this.time < prev && prev > 0.8) {
      this.day++
      // TODO: emit 'dayChanged'
    }

    // Track hour changes
    const hour = Math.floor(this.time * 24)
    if (hour !== this._lastHour) {
      this._lastHour = hour
      // TODO: emit 'hourChanged'
    }

    // Track phase changes
    const phase = this.getPhase()
    if (phase !== this._lastPhase) {
      this._lastPhase = phase
      // TODO: emit 'timeOfDay'
    }
  }

  /**
   * Set time directly.
   * @param {number} t - 0-1 value
   */
  setTime(t) {
    this.time = ((t % 1) + 1) % 1
  }

  /**
   * Set the time speed multiplier.
   * @param {number} speed
   */
  setSpeed(speed) {
    this.speed = Math.max(0, speed)
  }

  /** @returns {number} Current hour (0-23) */
  getHour() {
    return Math.floor(this.time * 24)
  }

  /** @returns {number} Current minute (0-59) */
  getMinute() {
    return Math.floor((this.time * 24 % 1) * 60)
  }

  /** @returns {string} Formatted time string like "14:30" */
  getFormattedTime() {
    const h = this.getHour().toString().padStart(2, '0')
    const m = this.getMinute().toString().padStart(2, '0')
    return `${h}:${m}`
  }

  /**
   * Get the current time-of-day phase name.
   * @returns {string}
   */
  getPhase() {
    const t = this.time
    if (t < 0.2 || t > 0.85) return 'night'
    if (t < 0.28) return 'dawn'
    if (t < 0.35) return 'morning'
    if (t < 0.6) return 'day'
    if (t < 0.68) return 'midday'
    if (t < 0.78) return 'sunset'
    return 'dusk'
  }

  /** Check if it is currently nighttime. */
  isNight() {
    return this.time < 0.2 || this.time > 0.85
  }

  /** Pause or resume time progression. */
  setPaused(paused) { this._paused = paused }
  isPaused() { return this._paused }
  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { TimeSystem, PHASES }
