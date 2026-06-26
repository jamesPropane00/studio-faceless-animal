/**
 * BattleSystem
 *
 * Turn-based or real-time battle engine. Manages combatants, turn order,
 * actions, damage calculation, and battle state.
 *
 * Integration:
 *   engine.registerSystem('battle', battleSystem, 105)
 *   Activated by EncounterSystem when combat begins.
 *
 * TODO:
 *   - Add turn queue and initiative
 *   - Add action types (attack, defend, skill, item, flee)
 *   - Add damage calculation (weapon, armor, buffs, resistances)
 *   - Add status effects (poison, stun, burn, freeze)
 *   - Add combo and synergy system
 *   - Add AI opponent behaviour
 *   - Add battle animations and UI integration
 *   - Add multi-enemy and multi-party battles
 *   - Add battle rewards and experience
 *
 * Event hooks:
 *   'battleStart'  — { combatants }
 *   'battleTurn'   — { turn, actor }
 *   'battleAction' — { actor, action, target, result }
 *   'battleDamage' — { target, amount, type }
 *   'battleEnd'    — { outcome, rewards }
 *   'battleFlee'   — { actor, success }
 */

const BATTLE_STATES = { IDLE: 'idle', ACTIVE: 'active', PAUSED: 'paused', COMPLETE: 'complete' }

class BattleSystem {
  constructor() {
    this.state = BATTLE_STATES.IDLE
    /** @type {Array<{ id: string, name: string, hp: number, maxHp: number, atk: number, def: number, speed: number, team: string }>} */
    this.combatants = []
    this.turn = 0
    this._enabled = true
  }

  /**
   * Start a new battle.
   * @param {Array} playerParty
   * @param {Array} enemyParty
   */
  startBattle(playerParty, enemyParty) {
    this.combatants = [...playerParty, ...enemyParty]
    this.turn = 0
    this.state = BATTLE_STATES.ACTIVE
  }

  /**
   * Execute a combat action.
   * @param {string} actorId
   * @param {string} targetId
   * @param {string} action - 'attack', 'defend', 'skill', 'item'
   * @returns {Object} Action result
   */
  executeAction(actorId, targetId, action) {
    const actor = this.combatants.find(c => c.id === actorId)
    const target = this.combatants.find(c => c.id === targetId)
    if (!actor || !target) return { success: false }

    let damage = 0
    if (action === 'attack') {
      damage = Math.max(1, actor.atk - target.def + Math.floor(Math.random() * 3 - 1))
      target.hp = Math.max(0, target.hp - damage)
    }

    // Check for battle end
    const aliveEnemies = this.combatants.filter(c => c.team !== actor.team && c.hp > 0)
    if (aliveEnemies.length === 0) {
      this.state = BATTLE_STATES.COMPLETE
    }

    this.turn++
    return { success: true, action, damage, targetHp: target.hp }
  }

  /** @returns {boolean} Whether the battle is still active */
  isActive() { return this.state === BATTLE_STATES.ACTIVE }

  /** End the current battle. */
  endBattle() {
    this.state = BATTLE_STATES.IDLE
    this.combatants = []
    this.turn = 0
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { BattleSystem, BATTLE_STATES }
