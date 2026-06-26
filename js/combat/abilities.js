/**
 * AbilitySystem
 *
 * Manages combat abilities and skills. Abilities are special actions
 * that can be used in battle, with cooldowns, costs, and effects.
 *
 * Integration:
 *   engine.registerSystem('abilities', abilitySystem, 110)
 *   BattleSystem calls abilitySystem.execute() for special moves.
 *
 * TODO:
 *   - Add ability categories (attack, heal, buff, debuff, utility)
 *   - Add ability cooldown and resource cost
 *   - Add ability upgrade trees
 *   - Add ability synergies and combos
 *   - Add passive abilities
 *   - Add area-of-effect abilities
 *   - Add ability animation data
 *   - Add ability unlock conditions
 *
 * Event hooks:
 *   'abilityUsed'     — { abilityId, user, target, result }
 *   'abilityUnlocked' — { abilityId, playerId }
 *   'abilityUpgraded' — { abilityId, newLevel }
 *   'abilityCooldown' — { abilityId, remaining }
 */

class Ability {
  /**
   * @param {string} id
   * @param {string} name
   * @param {string} category
   * @param {Object} effects
   * @param {number} [cooldown=0]
   * @param {number} [cost=0]
   */
  constructor(id, name, category, effects, cooldown = 0, cost = 0) {
    this.id = id
    this.name = name
    this.category = category
    this.effects = effects  // { damage, heal, buff, debuff }
    this.cooldown = cooldown
    this.cost = cost
    this.level = 1
    this.currentCooldown = 0
  }
}

class AbilitySystem {
  constructor() {
    /** @type {Map<string, Ability>} */
    this._abilities = new Map()
    this._enabled = true
  }

  /**
   * Register a new ability.
   * @param {Ability} ability
   */
  registerAbility(ability) {
    this._abilities.set(ability.id, ability)
  }

  /**
   * Execute an ability.
   * @param {string} abilityId
   * @param {*} user
   * @param {*} target
   * @returns {Object} Result of the ability
   */
  execute(abilityId, user, target) {
    const ab = this._abilities.get(abilityId)
    if (!ab || ab.currentCooldown > 0) return { success: false, reason: 'cooldown' }
    ab.currentCooldown = ab.cooldown
    return { success: true, effects: ab.effects }
  }

  /**
   * Reduce cooldowns. Called each battle turn.
   */
  tickCooldowns() {
    for (const ab of this._abilities.values()) {
      if (ab.currentCooldown > 0) ab.currentCooldown--
    }
  }

  /**
   * Get all abilities in a category.
   * @param {string} category
   * @returns {Ability[]}
   */
  getByCategory(category) {
    return [...this._abilities.values()].filter(a => a.category === category)
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { AbilitySystem, Ability }
