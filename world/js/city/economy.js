// EconomySystem — city economy management.
// Legacy income/job system lives in world.html (openIncomePanel, collectIncome, startJob, etc.)
// Legacy: state.coins, state.buildings[].income_rate

class EconomySystem {
  constructor() {
    this.coins = 0
    this._incomeSources = []
  }

  addIncomeSource(source) { this._incomeSources.push(source) }
  removeIncomeSource(id) { this._incomeSources = this._incomeSources.filter(s => s.id !== id) }

  getTotalIncomeRate() {
    return this._incomeSources.reduce((sum, s) => sum + (s.rate || 0), 0)
  }

  sync(state) {
    if (state) this.coins = state.coins || 0
  }
}

export { EconomySystem }
