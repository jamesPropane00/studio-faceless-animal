// ReputationSystem — reputation levels and progress.
// Legacy: state.rep, state.repLevel, state.repProgress
// Legacy function: updateRepBarUI()

const REP_LEVELS = [
  { name: 'Nobody', min: 0, max: 50 },
  { name: 'Newcomer', min: 50, max: 150 },
  { name: 'Resident', min: 150, max: 350 },
  { name: 'Regular', min: 350, max: 700 },
  { name: 'Rising Star', min: 700, max: 1200 },
  { name: 'Influencer', min: 1200, max: 2000 },
  { name: 'VIP', min: 2000, max: 3500 },
  { name: 'Legend', min: 3500, max: 5500 },
  { name: 'Icon', min: 5500, max: 999999 }
]

class ReputationSystem {
  constructor() {
    this.rep = 0
    this._levelIndex = 0
  }

  add(amount) {
    this.rep = Math.max(0, this.rep + amount)
    this._updateLevel()
  }

  getLevel() { return REP_LEVELS[this._levelIndex] || REP_LEVELS[0] }

  getProgress() {
    const level = this.getLevel()
    if (!level) return 100
    const range = level.max - level.min
    if (range <= 0) return 100
    return Math.min(100, ((this.rep - level.min) / range) * 100)
  }

  _updateLevel() {
    for (let i = REP_LEVELS.length - 1; i >= 0; i--) {
      if (this.rep >= REP_LEVELS[i].min) { this._levelIndex = i; break }
    }
  }

  serialize() { return { rep: this.rep, levelIndex: this._levelIndex } }
  deserialize(data) {
    if (data) {
      this.rep = data.rep || 0
      this._levelIndex = data.levelIndex || 0
    }
  }
}

export { ReputationSystem, REP_LEVELS }
