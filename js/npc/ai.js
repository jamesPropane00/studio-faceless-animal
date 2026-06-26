/**
 * AISystem
 *
 * NPC artificial intelligence: decision-making, pathfinding, state machines.
 * Each NPC has an AI state machine that drives its behaviour each tick.
 *
 * Integration:
 *   engine.registerSystem('ai', aiSystem, 48)
 *   Consumed by NPCSystem. Each NPC is assigned an AI controller.
 *
 * TODO:
 *   - Add hierarchical state machines (idle, patrol, work, flee, attack)
 *   - Add A* pathfinding integration
 *   - Add decision trees for NPC reactions
 *   - Add NPC memory (recent events, known locations)
 *   - Add personality traits influencing decisions
 *   - Add group/herd behaviour
 *   - Add combat AI (target selection, positioning, ability usage)
 *   - Add dialogue AI (response selection, relationship tracking)
 *
 * Event hooks:
 *   'aiStateChanged' — { npcId, from, to }
 *   'aiDecision'     — { npcId, decision, context }
 *   'aiPathFound'    — { npcId, pathLength }
 */

const AI_STATES = ['idle', 'wander', 'patrol', 'work', 'follow', 'flee', 'attack', 'return', 'sleep', 'socialize']

class AIController {
  /**
   * @param {Object} npc - Reference to the NPC entity
   */
  constructor(npc) {
    this.npc = npc
    this.state = 'idle'
    this.target = null
    this.path = []
    this.timer = 0
    this.personality = {
      bravery: Math.random(),
      sociability: Math.random(),
      laziness: Math.random()
    }
    this._memory = new Map()
  }

  /**
   * Set the AI state.
   * @param {string} newState
   */
  setState(newState) {
    const old = this.state
    this.state = newState
    this.timer = 0
    // TODO: emit aiStateChanged
  }

  /**
   * Make a decision this tick. Override in subclasses.
   * @param {number} dt
   * @param {Object} world - World state reference
   */
  decide(dt, world) {
    // Base implementation: wander randomly
    if (this.state === 'idle') {
      this.setState('wander')
    }
  }

  /**
   * Execute current state behaviour.
   * @param {number} dt
   */
  execute(dt) {
    // TODO: state execution logic
  }

  /**
   * Remember something.
   * @param {string} key
   * @param {*} value
   * @param {number} [ttl=60] - Time-to-live in seconds
   */
  remember(key, value, ttl = 60) {
    this._memory.set(key, { value, expires: Date.now() + ttl * 1000 })
  }

  /**
   * Recall a memory.
   * @param {string} key
   * @returns {*}
   */
  recall(key) {
    const mem = this._memory.get(key)
    if (!mem) return null
    if (Date.now() > mem.expires) { this._memory.delete(key); return null }
    return mem.value
  }
}

class AISystem {
  constructor() {
    /** @type {Map<string, AIController>} */
    this._controllers = new Map()
    this._enabled = true
  }

  /**
   * Register an AI controller for an NPC.
   * @param {string} npcId
   * @param {AIController} controller
   */
  register(npcId, controller) {
    this._controllers.set(npcId, controller)
  }

  /**
   * Unregister an AI controller.
   * @param {string} npcId
   */
  unregister(npcId) {
    this._controllers.delete(npcId)
  }

  /** @param {string} npcId @returns {AIController|undefined} */
  getController(npcId) {
    return this._controllers.get(npcId)
  }

  /**
   * Update all AI controllers. Called each tick.
   * @param {number} dt
   * @param {Object} world
   */
  update(dt, world) {
    for (const [npcId, ctrl] of this._controllers) {
      ctrl.decide(dt, world)
      ctrl.execute(dt)
    }
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { AISystem, AIController, AI_STATES }
