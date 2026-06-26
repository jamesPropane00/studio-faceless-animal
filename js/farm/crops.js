/**
 * CropSystem
 *
 * Manages crop planting, growth, harvesting, and seed inventory.
 * Each crop type has a defined growth time and visual stages.
 *
 * Integration:
 *   engine.registerSystem('crops', cropSystem, 82)
 *   Field lots reference CropSystem for growth state.
 *
 * TODO:
 *   - Add crop quality system (soil quality, fertilizer, watering)
 *   - Add seasonal crop availability
 *   - Add crop diseases and pests
 *   - Add crop rotation bonuses
 *   - Add irrigation system
 *   - Add genetic modification / crossbreeding
 *   - Add crop market prices (supply and demand)
 *
 * Event hooks:
 *   'cropPlanted'   — { lotId, type, plantedAt }
 *   'cropWatered'   — { lotId }
 *   'cropFertilized' — { lotId, type }
 *   'cropHarvested'  — { lotId, type, yield }
 *   'cropWilted'     — { lotId, reason }
 */

const CROP_TYPES = {
  corn: { name: 'Corn', growthTime: 45, stages: 4, cost: 5 },
  wheat: { name: 'Wheat', growthTime: 30, stages: 3, cost: 3 },
  veggies: { name: 'Vegetables', growthTime: 60, stages: 5, cost: 8 }
}

class CropLot {
  /**
   * @param {string} id
   * @param {number} tileX
   * @param {number} tileY
   * @param {string} type - Crop type key
   */
  constructor(id, tileX, tileY, type) {
    this.id = id
    this.tileX = tileX
    this.tileY = tileY
    this.type = type
    this.plantedAt = Date.now()
    this.watered = false
    this.fertilized = false
    this.quality = 1.0
  }

  /** @returns {number} Growth progress 0-1 */
  getProgress() {
    const info = CROP_TYPES[this.type]
    if (!info) return 0
    const elapsed = (Date.now() - this.plantedAt) / 1000
    return Math.min(1, elapsed / info.growthTime)
  }

  /** @returns {number} Current visual stage index */
  getStage() {
    const info = CROP_TYPES[this.type]
    if (!info) return 0
    const progress = this.getProgress()
    return Math.min(info.stages - 1, Math.floor(progress * info.stages))
  }

  /** @returns {boolean} Whether the crop is ready to harvest */
  isReady() {
    return this.getProgress() >= 1
  }
}

class CropSystem {
  constructor() {
    /** @type {Map<string, CropLot>} */
    this.lots = new Map()
    this._enabled = true
  }

  /**
   * Plant a crop on a field lot.
   * @param {string} lotId
   * @param {number} tileX
   * @param {number} tileY
   * @param {string} cropType
   * @returns {CropLot|null}
   */
  plant(lotId, tileX, tileY, cropType) {
    if (!CROP_TYPES[cropType]) return null
    const lot = new CropLot(lotId, tileX, tileY, cropType)
    this.lots.set(lotId, lot)
    return lot
  }

  /**
   * Harvest a crop lot.
   * @param {string} lotId
   * @returns {{ type: string, yield: number }|null}
   */
  harvest(lotId) {
    const lot = this.lots.get(lotId)
    if (!lot || !lot.isReady()) return null
    this.lots.delete(lotId)
    return { type: lot.type, yield: lot.quality > 1 ? 2 : 1 }
  }

  /** @param {string} lotId @returns {CropLot|undefined} */
  getLot(lotId) { return this.lots.get(lotId) }

  /**
   * Get all lots that are ready to harvest.
   * @returns {CropLot[]}
   */
  getReadyLots() {
    return [...this.lots.values()].filter(l => l.isReady())
  }

  /**
   * Update all crop growth. Called each tick.
   * @param {number} dt
   */
  update(dt) {
    // Growth is time-based, checked on read via getProgress()
  }

  /** Serialize for persistence. */
  serialize() {
    const data = {}
    for (const [id, lot] of this.lots) data[id] = { tileX: lot.tileX, tileY: lot.tileY, type: lot.type, plantedAt: lot.plantedAt }
    return data
  }

  /** Deserialize saved state. */
  deserialize(data) {
    if (data) {
      this.lots.clear()
      for (const [id, d] of Object.entries(data)) {
        const lot = new CropLot(id, d.tileX, d.tileY, d.type)
        lot.plantedAt = d.plantedAt || Date.now()
        this.lots.set(id, lot)
      }
    }
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { CropSystem, CropLot, CROP_TYPES }
