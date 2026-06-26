// WeatherSystem — weather state management.
// Legacy weather logic lives in world.html (updateWeather, drawWeatherEffects).
// This module provides a future interface for the weather system.

// Legacy: state.weather = { type, intensity, targetIntensity, timer, nextChange, wind, lightning, fogDensity }
// Legacy functions: updateWeather(dt), drawWeatherEffects(w, h)

const WEATHER_TYPES = ['clear', 'cloudy', 'rain', 'storm', 'fog']

const WEATHER_COLORS = {
  clear: { sky: 'rgba(135,206,235,0.05)', ground: null },
  cloudy: { sky: 'rgba(100,100,120,0.15)', ground: null },
  rain: { sky: 'rgba(70,80,100,0.25)', ground: 'rgba(50,60,80,0.1)' },
  storm: { sky: 'rgba(40,40,60,0.4)', ground: 'rgba(30,30,50,0.15)' },
  fog: { sky: 'rgba(180,180,200,0.3)', ground: 'rgba(200,200,220,0.2)' }
}

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

export { WeatherSystem, WEATHER_TYPES, WEATHER_COLORS }
