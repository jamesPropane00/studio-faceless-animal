/**
 * WeatherSystem
 *
 * Manages weather state transitions, intensity ramping, and regional weather.
 * Designed to be registered with SimulationEngine.
 *
 * Integration:
 *   engine.registerSystem('weather', weatherSystem, 30)
 *   Reads from / writes to a shared weather state object.
 *   Emits 'weatherChanged' on transition.
 *
 * TODO:
 *   - Add regional weather (different weather per region)
 *   - Add weather forecasting / prediction
 *   - Add seasonal weather patterns
 *   - Add extreme weather events (tornado, blizzard, heatwave)
 *   - Connect to visual rendering system
 *   - Add weather audio (rain, wind SFX)
 *
 * Event hooks:
 *   'weatherChanged' — { from: string, to: string, intensity: number }
 */

class WeatherSystem {
  constructor() {
    this.state = {
      type: 'clear',
      intensity: 0,
      targetIntensity: 0,
      timer: 0,
      nextChange: 30,
      wind: { x: 0.5, y: 0.2 },
      lightning: 0,
      fogDensity: 0
    }
    this._enabled = true
    this._region = 'city'
    /** @type {Object<string, Function>} */
    this._regionalOverrides = new Map()
  }

  /**
   * Register a regional weather override.
   * @param {string} regionId
   * @param {Function} fn - Returns partial state to merge
   */
  registerRegionalOverride(regionId, fn) {
    this._regionalOverrides.set(regionId, fn)
  }

  /**
   * Set the active region for weather evaluation.
   * @param {string} regionId
   */
  setRegion(regionId) {
    this._region = regionId
  }

  /**
   * Update weather state. Called each tick.
   * @param {number} dt
   */
  update(dt) {
    // TODO: Full weather simulation
  }

  /**
   * Force a specific weather type.
   * @param {string} type
   * @param {number} [intensity=1]
   */
  setWeather(type, intensity = 1) {
    const prev = this.state.type
    this.state.type = type
    this.state.targetIntensity = intensity
    // TODO: Emit weatherChanged
  }

  /** @returns {Object} Current weather state snapshot */
  getState() {
    return { ...this.state }
  }

  /** Enable or disable weather simulation. */
  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { WeatherSystem }
