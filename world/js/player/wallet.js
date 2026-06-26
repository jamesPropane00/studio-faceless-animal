// WalletService — shared wallet for FC (coins) and FS (stable/premium).
// FC = existing coins from world.html (state.coins)
// FS = stable/premium coin placeholder
// Provides transaction hooks for all systems to use.

class WalletService {
  constructor() {
    this.fc = 0  // Faceless Coins (existing coins)
    this.fs = 0  // Faceless Stable (premium placeholder)
    this._listeners = []
    this._history = []
  }

  init(fc, fs = 0) {
    this.fc = fc
    this.fs = fs
  }

  addFC(amount, source = 'unknown') {
    this.fc += amount
    this._notify('fc', amount, source)
    this._history.push({ type: 'fc', amount, source, time: Date.now() })
    return this.fc
  }

  addFS(amount, source = 'unknown') {
    this.fs += amount
    this._notify('fs', amount, source)
    this._history.push({ type: 'fs', amount, source, time: Date.now() })
    return this.fs
  }

  spendFC(amount, source = 'unknown') {
    if (this.fc < amount) return false
    this.fc -= amount
    this._notify('fc', -amount, source)
    this._history.push({ type: 'fc', amount: -amount, source, time: Date.now() })
    return true
  }

  hasFC(amount) { return this.fc >= amount }

  onChange(fn) { this._listeners.push(fn); return () => { this._listeners = this._listeners.filter(l => l !== fn) } }

  _notify(type, amount, source) {
    for (const fn of this._listeners) fn({ type, amount, source, fc: this.fc, fs: this.fs })
  }

  getHistory(limit = 50) { return this._history.slice(-limit) }
}

const wallet = new WalletService()
export { wallet, WalletService }
