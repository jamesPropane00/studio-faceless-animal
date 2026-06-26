/**
 * GangSystem
 *
 * Manages NPC gangs: creation, territory, hierarchy, and conflict.
 * Gangs control districts, run illegal activities, and fight for influence.
 *
 * Integration:
 *   engine.registerSystem('gangs', gangSystem, 73)
 *   Works with DistrictSystem for territory and NPCSystem for members.
 *
 * TODO:
 *   - Add gang hierarchy (leader, lieutenants, soldiers, recruits)
 *   - Add territory control (district influence)
 *   - Add gang reputation and notoriety
 *   - Add gang missions and activities
 *   - Add gang wars and conflict resolution
 *   - Add player gang membership and ranks
 *   - Add gang alliances and betrayals
 *   - Add police/gang interactions
 *
 * Event hooks:
 *   'gangFormed'       — { id, name, leader }
 *   'gangDisbanded'    — { id, reason }
 *   'gangTerritoryChanged' — { gangId, districtId, oldInfluence, newInfluence }
 *   'gangConflict'     — { attackerId, defenderId, outcome }
 *   'gangMemberAdded'   — { gangId, npcId }
 *   'gangMemberRemoved' — { gangId, npcId, reason }
 */

class Gang {
  /**
   * @param {string} id
   * @param {string} name
   * @param {string} leaderId
   */
  constructor(id, name, leaderId) {
    this.id = id
    this.name = name
    this.leaderId = leaderId
    /** @type {string[]} */
    this.memberIds = [leaderId]
    /** @type {Map<string, number>} */ // districtId → influence (0-1)
    this.territory = new Map()
    this.reputation = 0
    this.treasury = 0
    this.createdAt = Date.now()
  }
}

class GangSystem {
  constructor() {
    /** @type {Map<string, Gang>} */
    this.gangs = new Map()
    this._enabled = true
  }

  /**
   * Create a new gang.
   * @param {string} name
   * @param {string} leaderId
   * @returns {Gang}
   */
  createGang(name, leaderId) {
    const id = `gang_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const gang = new Gang(id, name, leaderId)
    this.gangs.set(id, gang)
    return gang
  }

  /**
   * Disband a gang.
   * @param {string} gangId
   * @returns {boolean}
   */
  disband(gangId) {
    return this.gangs.delete(gangId)
  }

  /**
   * Add a member to a gang.
   * @param {string} gangId
   * @param {string} npcId
   * @returns {boolean}
   */
  addMember(gangId, npcId) {
    const gang = this.gangs.get(gangId)
    if (!gang || gang.memberIds.includes(npcId)) return false
    gang.memberIds.push(npcId)
    return true
  }

  /**
   * Remove a member from a gang.
   * @param {string} gangId
   * @param {string} npcId
   * @returns {boolean}
   */
  removeMember(gangId, npcId) {
    const gang = this.gangs.get(gangId)
    if (!gang) return false
    gang.memberIds = gang.memberIds.filter(id => id !== npcId)
    return true
  }

  /**
   * Set gang influence over a district.
   * @param {string} gangId
   * @param {string} districtId
   * @param {number} influence - 0 to 1
   */
  setInfluence(gangId, districtId, influence) {
    const gang = this.gangs.get(gangId)
    if (gang) gang.territory.set(districtId, Math.max(0, Math.min(1, influence)))
  }

  /**
   * Get the dominant gang in a district.
   * @param {string} districtId
   * @returns {Gang|null}
   */
  getDominantGang(districtId) {
    let best = null, bestInf = 0
    for (const gang of this.gangs.values()) {
      const inf = gang.territory.get(districtId) || 0
      if (inf > bestInf) { bestInf = inf; best = gang }
    }
    return best
  }

  /** Serialize for persistence. */
  serialize() {
    const data = {}
    for (const [id, gang] of this.gangs) {
      data[id] = { ...gang, territory: [...gang.territory] }
    }
    return data
  }

  /** Deserialize saved state. */
  deserialize(data) {
    if (data) {
      this.gangs.clear()
      for (const [id, g] of Object.entries(data)) {
        const gang = new Gang(id, g.name, g.leaderId)
        gang.memberIds = g.memberIds || []
        gang.territory = new Map(g.territory || [])
        gang.reputation = g.reputation || 0
        gang.treasury = g.treasury || 0
        this.gangs.set(id, gang)
      }
    }
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { GangSystem, Gang }
