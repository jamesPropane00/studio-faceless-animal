// TimeSystem — day/night cycle management.
// Legacy time is tracked in state.time (0-1 float) and state.timeSpeed.
// Legacy functions: getDaylightColor(), getTimeIcon(), getTimeString()

class TimeSystem {
  constructor() {
    this.time = 0.5
    this.speed = 0.0003
    this.paused = false
  }

  update(dt) {
    if (!this.paused) {
      this.time = (this.time + this.speed * dt) % 1
    }
  }

  getHour() { return Math.floor(this.time * 24) }
  getMinute() { return Math.floor((this.time * 24 - this.getHour()) * 60) }
  getTimeString() {
    return `${String(this.getHour()).padStart(2, '0')}:${String(this.getMinute()).padStart(2, '0')}`
  }

  isNight() { return this.time < 0.2 || this.time > 0.8 }
  isDay() { return !this.isNight() }

  pause() { this.paused = true }
  resume() { this.paused = false }
}

export { TimeSystem }
