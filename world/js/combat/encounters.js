// CombatEncounterSystem — turn-based combat foundation for creature/NPC/gang fights.
// Turn queue with action types: attack, defend, skill, item, flee.

class Combatant {
  constructor(id, name, hp, atk, def, speed, team) {
    this.id = id
    this.name = name
    this.hp = hp
    this.maxHp = hp
    this.atk = atk
    this.def = def
    this.speed = speed
    this.team = team
    this.buffs = []
    this.debuffs = []
  }

  isAlive() { return this.hp > 0 }
}

class CombatEncounterSystem {
  constructor() {
    this._combatants = []
    this._turn = 0
    this._active = false
    this._log = []
  }

  start(playerParty, enemyParty) {
    this._combatants = [...playerParty, ...enemyParty]
    this._turn = 0
    this._active = true
    this._log = [{ time: Date.now(), message: 'Combat started!' }]
    // Sort by speed for turn order
    this._combatants.sort((a, b) => b.speed - a.speed)
  }

  executeAction(actorId, action, targetId) {
    if (!this._active) return { success: false, reason: 'No active combat' }
    const actor = this._combatants.find(c => c.id === actorId)
    const target = this._combatants.find(c => c.id === targetId)
    if (!actor || !target) return { success: false, reason: 'Combatant not found' }

    let result = { success: true, action, actor: actor.name, target: target.name }

    if (action === 'attack') {
      const damage = Math.max(1, actor.atk - target.def + Math.floor(Math.random() * 3 - 1))
      target.hp = Math.max(0, target.hp - damage)
      result.damage = damage
      result.targetHp = target.hp
      this._log.push({ time: Date.now(), message: `${actor.name} attacks ${target.name} for ${damage} damage!` })
    } else if (action === 'defend') {
      actor.def += 2
      result.defBoost = 2
      this._log.push({ time: Date.now(), message: `${actor.name} takes a defensive stance.` })
    } else if (action === 'flee') {
      if (Math.random() < 0.5) {
        this._active = false
        result.fled = true
        this._log.push({ time: Date.now(), message: `${actor.name} flees!` })
      } else {
        result.fled = false
        this._log.push({ time: Date.now(), message: `${actor.name} failed to flee!` })
      }
    }

    this._turn++
    return result
  }

  isActive() { return this._active }

  getTurnOrder() { return [...this._combatants].filter(c => c.isAlive()) }

  end() {
    this._active = false
    this._log.push({ time: Date.now(), message: 'Combat ended.' })
  }

  getLog() { return [...this._log] }
}

const combatEncounters = new CombatEncounterSystem()
export { combatEncounters, CombatEncounterSystem, Combatant }
