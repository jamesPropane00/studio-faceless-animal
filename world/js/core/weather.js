// WeatherSystem — weather state management.
// Legacy weather logic lives in world.html (updateWeather, drawWeatherEffects).
// This module provides a future interface for the weather system.

// Legacy: state.weather = { type, intensity, targetIntensity, timer, nextChange, wind, lightning, fogDensity }
// Legacy functions: updateWeather(dt), drawWeatherEffects(w, h)

class WeatherSystem {
  constructor() {
    this.type = 'clear'
    this.intensity = 0
    this.wind = { x: 0.5, y: 0.2 }
    this.lightning = 0
    this.fogDensity = 0
    this._timer = 0
    this._nextChange = 30
    this._targetIntensity = 0
  }

  update(dt) {
    // Legacy: updateWeather(dt) in world.html handles all weather logic
  }

  sync(state) {
    if (state) {
      this.type = state.type || 'clear'
      this.intensity = state.intensity || 0
    }
  }
}

export { WeatherSystem }
