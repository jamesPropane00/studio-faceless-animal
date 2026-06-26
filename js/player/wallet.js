/**
 * Wallet
 *
 * Single wallet API for managing in-game currency (coins, stablecoins).
 * All financial transactions flow through this module.
 *
 * Integration:
 *   Attached to Player or used standalone.
 *   Transactions are recorded in a history buffer for UI and debugging.
 *   No direct database implementation — all changes are in-memory until
 *   saveManager.write() is called.
 *
 * TODO:
 *   - Add transaction categories (income, expense, trade, reward)
 *   - Add balance change notifications
 *   - Add daily/weekly spending limits
 *   - Add currency conversion (coins ↔ stable)
 *   - Add ledger export for debugging
 *   - Add fraud detection hooks
 *
 * Event hooks:
 *   'coinChanged'  — { balance, delta, reason }
 *   'stableChanged' — { balance, delta, reason }
 *   'transaction'  — { type, amount, balance, timestamp, reason }
 */

class Wallet {
  constructor() {
    this._coins = 0
    this._stable = 0
    /** @type {Array<{ type: string, amount: number, balance: number, timestamp: number, reason: string }>} */
    this._history = []
    this._maxHistory = 100
  }

  /**
   * Add coins to the wallet.
   * @param {number} amount
   * @param {string} [reason='']
   * @returns {number} New coin balance
   */
  addCoins(amount, reason = '') {
    if (amount <= 0) return this._coins
    this._coins += amount
    this._record('coin_add', amount, reason)
    return this._coins
  }

  /**
   * Remove coins from the wallet.
   * @param {number} amount
   * @param {string} [reason='']
   * @returns {boolean} Whether the transaction succeeded
   */
  removeCoins(amount, reason = '') {
    if (amount <= 0 || amount > this._coins) return false
    this._coins -= amount
    this._record('coin_remove', -amount, reason)
    return true
  }

  /**
   * Add stablecoins to the wallet.
   * @param {number} amount
   * @param {string} [reason='']
   * @returns {number} New stablecoin balance
   */
  addStable(amount, reason = '') {
    if (amount <= 0) return this._stable
    this._stable += amount
    this._record('stable_add', amount, reason)
    return this._stable
  }

  /**
   * Remove stablecoins from the wallet.
   * @param {number} amount
   * @param {string} [reason='']
   * @returns {boolean} Whether the transaction succeeded
   */
  removeStable(amount, reason = '') {
    if (amount <= 0 || amount > this._stable) return false
    this._stable -= amount
    this._record('stable_remove', -amount, reason)
    return true
  }

  /**
   * Transfer coins between two wallets.
   * @param {Wallet} target
   * @param {number} amount
   * @param {string} [reason='']
   * @returns {boolean}
   */
  transfer(target, amount, reason = '') {
    if (!target || amount <= 0 || amount > this._coins) return false
    this.removeCoins(amount, `transfer_out: ${reason}`)
    target.addCoins(amount, `transfer_in: ${reason}`)
    return true
  }

  /** @returns {number} Current coin balance */
  getBalance() { return this._coins }

  /** @returns {number} Current stablecoin balance */
  getStableBalance() { return this._stable }

  /** @returns {number} Total net worth in coins (coins + stable * exchange rate) */
  getNetWorth(rate = 1) {
    return this._coins + this._stable * rate
  }

  /**
   * Set coin balance directly (use with caution).
   * @param {number} amount
   */
  setBalance(amount) {
    const delta = amount - this._coins
    this._coins = Math.max(0, amount)
    this._record('balance_set', delta, 'direct_set')
  }

  /**
   * Get the transaction history.
   * @param {number} [limit=20]
   * @returns {Array}
   */
  transactionHistory(limit = 20) {
    return this._history.slice(0, limit)
  }

  /** Clear transaction history. */
  clearHistory() {
    this._history = []
  }

  /** Record a transaction internally. */
  _record(type, amount, reason) {
    this._history.unshift({ type, amount, balance: this._coins, timestamp: Date.now(), reason })
    if (this._history.length > this._maxHistory) this._history.length = this._maxHistory
  }

  /** Serialize for persistence. */
  serialize() {
    return { coins: this._coins, stable: this._stable }
  }

  /** Deserialize saved state. */
  deserialize(data) {
    if (data.coins !== undefined) this._coins = data.coins
    if (data.stable !== undefined) this._stable = data.stable
  }
}

export { Wallet }
