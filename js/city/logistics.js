/**
 * LogisticsSystem
 *
 * Manages the movement of goods, resources, and NPCs between locations.
 * Handles supply routes, delivery schedules, and transportation networks.
 *
 * Integration:
 *   engine.registerSystem('logistics', logisticsSystem, 75)
 *   Works with EconomySystem and FarmSystem for food→city supply chain.
 *
 * TODO:
 *   - Add trade routes between regions
 *   - Add delivery vehicle simulation
 *   - Add warehouse inventory management
 *   - Add supply and demand tracking per district
 *   - Add route optimization (shortest path, congestion)
 *   - Add物流 event hooks for UI notifications
 *   - Add cross-region transport (farm → city food shipments)
 *
 * Event hooks:
 *   'shipmentSent'      — { from, to, goods, quantity }
 *   'shipmentReceived'  — { from, goods, quantity }
 *   'routeEstablished'  — { from, to, duration }
 *   'routeDisrupted'    — { from, to, reason }
 *   'supplyShortage'    — { district, good }
 */

class LogisticsSystem {
  constructor() {
    /** @type {Array<{ id: string, from: string, to: string, goods: Object<string, number>, status: string, progress: number, duration: number }>} */
    this.shipments = []
    this._enabled = true
  }

  /**
   * Send a shipment from one region/district to another.
   * @param {string} from
   * @param {string} to
   * @param {Object<string, number>} goods - Map of itemId → quantity
   * @param {number} [duration=30] - Duration in seconds
   * @returns {Object} The shipment
   */
  sendShipment(from, to, goods, duration = 30) {
    const id = `ship_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const shipment = { id, from, to, goods: { ...goods }, status: 'in_transit', progress: 0, duration }
    this.shipments.push(shipment)
    return shipment
  }

  /**
   * Update shipments in transit. Called each tick.
   * @param {number} dt
   */
  update(dt) {
    for (let i = this.shipments.length - 1; i >= 0; i--) {
      const s = this.shipments[i]
      if (s.status !== 'in_transit') continue
      s.progress += dt / s.duration
      if (s.progress >= 1) {
        s.status = 'delivered'
        s.progress = 1
        // TODO: emit shipmentReceived
      }
    }
  }

  /** @returns {Array} Active (in-transit) shipments */
  getActiveShipments() {
    return this.shipments.filter(s => s.status === 'in_transit')
  }

  /** @returns {Array} Completed shipments */
  getCompletedShipments() {
    return this.shipments.filter(s => s.status === 'delivered')
  }

  /** Serialize for persistence. */
  serialize() { return this.shipments }

  /** Deserialize saved state. */
  deserialize(data) {
    if (Array.isArray(data)) this.shipments = data
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { LogisticsSystem }
