// TravelSystem — region travel management.
// Legacy: state.travel, startTravel(), completeTravel(), travel overlay UI

class TravelSystem {
  constructor() {
    this.active = false
    this.target = null
    this.progress = 0
    this._duration = 8
    this._callback = null
  }

  start(target, duration = 8, onComplete = null) {
    this.active = true
    this.target = target
    this.progress = 0
    this._duration = duration
    this._callback = onComplete
  }

  update(dt) {
    if (!this.active) return
    this.progress = Math.min(1, this.progress + dt / this._duration)
    if (this.progress >= 1) {
      this.active = false
      if (this._callback) this._callback(this.target)
    }
  }

  cancel() {
    this.active = false
    this.target = null
    this.progress = 0
  }
}

export { TravelSystem }
