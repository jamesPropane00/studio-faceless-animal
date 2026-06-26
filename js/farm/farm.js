/**
 * FarmSystem
 *
 * Manages the player's farm: fields, structures, inventory, and production.
 * Wraps crop, animal, machinery, and storage subsystems.
 *
 * Integration:
 *   engine.registerSystem('farm', farmSystem, 80)
 *   Active only when player is in the Farmlands region.
 *   Links to CropSystem, AnimalSystem, MachinerySystem, and StorageSystem.
 *
 * TODO:
 *   - Add farm expansion (purchasing additional plots)
 *   - Add farm level / experience
 *   - Add farm cosmetic upgrades (fences, paint, signs)
 *   - Add farm visitor system (NPCs tour your farm)
 *   - Add farm co-op (multiple players on one farm)
 *   - Add farm automation (sprinklers, auto-feeders)
 *   - Add farm events (infestation, bounty harvest, festival)
 *   - Add farm deed / title management
 *
 * Event hooks:
 *   'farmCreated'     — { id, owner }
 *   'farmExpanded'    — { id, newSize }
 *   'farmLevelUp'     — { id, level }
 *   'farmProduction'  — { id, good, amount }
 *   'farmEvent'       — { id, type, data }
 */

class FarmSystem {
  constructor() {
    this.id = null
    this.owner = ''
    this.name = 'Pine Hollow Farm'
    this.createdAt = 0
    this._enabled = true
  }

  /**
   * Initialize a new farm for a player.
   * @param {string} ownerId
   * @param {string} [name]
   */
  createFarm(ownerId, name) {
    this.id = `farm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    this.owner = ownerId
    this.name = name || `${ownerId}'s Farm`
    this.createdAt = Date.now()
  }

  /**
   * Get farm deed information.
   * @returns {{ name: string, owner: string, value: number, region: string }}
   */
  getDeed() {
    return {
      name: this.name,
      owner: this.owner,
      value: 45000,
      region: 'Farmlands'
    }
  }

  /**
   * Update farm systems. Called each tick.
   * @param {number} dt
   */
  update(dt) {
    // TODO: delegate to subsystems
  }

  /** Serialize for persistence. */
  serialize() {
    return { id: this.id, owner: this.owner, name: this.name, createdAt: this.createdAt }
  }

  /** Deserialize saved state. */
  deserialize(data) {
    if (data) {
      this.id = data.id || null
      this.owner = data.owner || ''
      this.name = data.name || 'Pine Hollow Farm'
      this.createdAt = data.createdAt || 0
    }
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { FarmSystem }
