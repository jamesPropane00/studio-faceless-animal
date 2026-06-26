/**
 * Player
 *
 * Facade for the player entity. Owns the player's position, movement,
 * identity, and aggregates subsystems (wallet, inventory, reputation, etc.).
 *
 * Integration:
 *   engine.registerSystem('player', player, 50)
 *   Delegates to wallet, inventory, reputation, skilltree, and equipment.
 *
 * TODO:
 *   - Add movement with collision detection
 *   - Add animation state machine (idle, walk, sprint, interact)
 *   - Add player stats (health, stamina, hunger)
 *   - Add player abilities and cooldowns
 *   - Add multiplayer position interpolation
 *   - Add player customization (avatar, name, title)
 *
 * Event hooks:
 *   'playerMoved'   — { x, y, dx, dy }
 *   'playerSpawned' — { x, y, region }
 *   'playerLevelUp' — { level }
 *   'playerStatChanged' — { stat, oldValue, newValue }
 */

class Player {
  constructor() {
    this.x = 50
    this.y = 50
    this.tx = 50
    this.ty = 50
    this.speed = 3.5
    this.color = '#a78bfa'
    this.name = ''
    this.userId = null
    this.region = 'city'
    this.health = 100
    this.maxHealth = 100
    this.stamina = 100
    this.maxStamina = 100
    this.level = 1
    this._enabled = true
  }

  /**
   * Set player position.
   * @param {number} x
   * @param {number} y
   */
  setPosition(x, y) {
    this.x = x
    this.y = y
    this.tx = x
    this.ty = y
  }

  /**
   * Set target position for smooth movement.
   * @param {number} tx
   * @param {number} ty
   */
  moveTo(tx, ty) {
    this.tx = tx
    this.ty = ty
  }

  /**
   * Update movement interpolation. Called each tick.
   * @param {number} dt
   */
  update(dt) {
    // Movement interpolation placeholder
    const dx = this.tx - this.x
    const dy = this.ty - this.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > 0.5) {
      const step = this.speed * dt
      this.x += (dx / dist) * step
      this.y += (dy / dist) * step
    }
  }

  /**
   * Apply damage to the player.
   * @param {number} amount
   * @returns {number} Actual damage taken
   */
  takeDamage(amount) {
    const actual = Math.min(this.health, amount)
    this.health -= actual
    if (this.health <= 0) this.die()
    return actual
  }

  /**
   * Heal the player.
   * @param {number} amount
   * @returns {number} Actual health healed
   */
  heal(amount) {
    const actual = Math.min(this.maxHealth - this.health, amount)
    this.health += actual
    return actual
  }

  /** Handle player death. */
  die() {
    this.health = 0
    // TODO: emit 'playerDied', trigger respawn
  }

  /**
   * Respawn at a given position.
   * @param {number} [x=50]
   * @param {number} [y=50]
   */
  respawn(x = 50, y = 50) {
    this.health = this.maxHealth
    this.stamina = this.maxStamina
    this.setPosition(x, y)
  }

  /** Serialize for save/network. */
  serialize() {
    return { x: this.x, y: this.y, name: this.name, userId: this.userId, region: this.region, level: this.level }
  }

  /** Deserialize saved state. */
  deserialize(data) {
    if (data.x !== undefined) this.x = data.x
    if (data.y !== undefined) this.y = data.y
    if (data.name) this.name = data.name
    if (data.userId) this.userId = data.userId
    if (data.region) this.region = data.region
    if (data.level) this.level = data.level
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { Player }
