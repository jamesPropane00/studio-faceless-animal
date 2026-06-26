/**
 * EconomySystem
 *
 * Interfaces for the city economy simulation.
 * Future responsibilities include district simulation, business health,
 * logistics, taxes, inflation, supply chains, and property values.
 *
 * Integration:
 *   engine.registerSystem('economy', economySystem, 70)
 *   Reads from and writes to district and building stats.
 *
 * TODO:
 *   - District-level economic simulation (employment, production, consumption)
 *   - Business health tracking (profit, customers, inventory)
 *   - Logistics network (goods movement between districts)
 *   - Tax system (property tax, income tax, sales tax)
 *   - Inflation and currency valuation
 *   - Supply chain simulation (raw materials → production → consumption)
 *   - Property value calculation based on desirability, crime, services
 *   - Economic events (boom, recession, trade route disruption)
 *
 * Event hooks:
 *   'economyTick'       — { dt, metrics }
 *   'propertyValueChanged' — { districtId, oldValue, newValue }
 *   'taxCollected'      — { amount, type }
 *   'supplyChainEvent'  — { type, good, quantity }
 *   'marketPriceChanged' — { good, oldPrice, newPrice }
 */

class EconomySystem {
  constructor() {
    this._enabled = true
    this.metrics = {
      totalWealth: 0,
      averagePropertyValue: 0,
      unemploymentRate: 0,
      inflationRate: 0,
      gdp: 0
    }
  }

  /**
   * Update economy simulation. Called each tick.
   * @param {number} dt
   */
  update(dt) {
    // TODO: full economy simulation
  }

  /**
   * Calculate property value at a given position.
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  calculatePropertyValue(x, y) {
    // TODO: desirability, crime, services, proximity to amenities
    return 1000
  }

  /**
   * Calculate taxes for an entity.
   * @param {number} income
   * @param {string} [type='income']
   * @returns {number}
   */
  calculateTax(income, type = 'income') {
    return income * 0.05
  }

  /** @returns {Object} Current economic metrics snapshot */
  getMetrics() {
    return { ...this.metrics }
  }

  /** @returns {number} Current estimated GDP */
  getGDP() { return this.metrics.gdp }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { EconomySystem }
