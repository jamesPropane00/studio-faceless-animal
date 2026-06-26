/**
 * PropertySystem
 *
 * Manages land ownership, zoning, property values, and transactions.
 * Determines who owns what land and what can be built where.
 *
 * Integration:
 *   engine.registerSystem('property', propertySystem, 65)
 *   Called by BuildingSystem and DistrictSystem for ownership checks.
 *
 * TODO:
 *   - Add land parcel system (chunk-based ownership grid)
 *   - Add zoning rules per district
 *   - Add property purchase and sale mechanics
 *   - Add property tax collection
 *   - Add rent / lease system
 *   - Add eminent domain / forced sale mechanics
 *   - Add property deed generation (NFT-compatible)
 *   - Add land value heatmap
 *
 * Event hooks:
 *   'landPurchased'   — { parcelId, owner, price }
 *   'landSold'        — { parcelId, from, to, price }
 *   'zoneChanged'     — { parcelId, from, to }
 *   'propertyTaxDue'  — { parcelId, amount }
 */

const ZONE_TYPES = ['residential', 'commercial', 'industrial', 'agricultural', 'mixed', 'public', 'wilderness']

class PropertySystem {
  constructor() {
    /** @type {Map<string, { owner: string, zone: string, value: number, purchasedAt: number }>} */
    this._parcels = new Map()
    this._enabled = true
  }

  /**
   * Register a land parcel.
   * @param {string} parcelId - e.g., "city:5,3"
   * @param {string} [zone='wilderness']
   * @param {number} [baseValue=100]
   * @returns {Object}
   */
  registerParcel(parcelId, zone = 'wilderness', baseValue = 100) {
    const parcel = { owner: '', zone, value: baseValue, purchasedAt: 0 }
    this._parcels.set(parcelId, parcel)
    return parcel
  }

  /**
   * Purchase a parcel.
   * @param {string} parcelId
   * @param {string} buyer
   * @param {number} price
   * @returns {boolean}
   */
  purchase(parcelId, buyer, price) {
    const parcel = this._parcels.get(parcelId)
    if (!parcel || parcel.owner) return false
    parcel.owner = buyer
    parcel.purchasedAt = Date.now()
    return true
  }

  /**
   * Transfer ownership of a parcel.
   * @param {string} parcelId
   * @param {string} newOwner
   * @returns {boolean}
   */
  transfer(parcelId, newOwner) {
    const parcel = this._parcels.get(parcelId)
    if (!parcel) return false
    parcel.owner = newOwner
    return true
  }

  /**
   * Get parcel info.
   * @param {string} parcelId
   * @returns {Object|undefined}
   */
  getParcel(parcelId) {
    return this._parcels.get(parcelId)
  }

  /**
   * Get all parcels owned by a player.
   * @param {string} owner
   * @returns {Array<[string, Object]>}
   */
  getOwnedParcels(owner) {
    const result = []
    for (const [id, parcel] of this._parcels) {
      if (parcel.owner === owner) result.push([id, parcel])
    }
    return result
  }

  /**
   * Set the zone type for a parcel.
   * @param {string} parcelId
   * @param {string} zone
   * @returns {boolean}
   */
  setZone(parcelId, zone) {
    const parcel = this._parcels.get(parcelId)
    if (!parcel) return false
    parcel.zone = zone
    return true
  }

  /**
   * Calculate the current market value of a parcel.
   * @param {string} parcelId
   * @returns {number}
   */
  assessValue(parcelId) {
    const parcel = this._parcels.get(parcelId)
    if (!parcel) return 0
    // TODO: proximity to districts, services, demand
    return parcel.value
  }

  /** Serialize for persistence. */
  serialize() {
    const data = {}
    for (const [id, parcel] of this._parcels) data[id] = { ...parcel }
    return data
  }

  /** Deserialize saved state. */
  deserialize(data) {
    if (data) {
      this._parcels.clear()
      for (const [id, parcel] of Object.entries(data)) {
        this._parcels.set(id, parcel)
      }
    }
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { PropertySystem, ZONE_TYPES }
