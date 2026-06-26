/**
 * PoliceSystem
 *
 * Manages law enforcement, crime tracking, and public safety.
 * Police NPCs patrol districts, respond to incidents, and maintain order.
 *
 * Integration:
 *   engine.registerSystem('police', policeSystem, 74)
 *   Works with GangSystem for crime tracking and DistrictSystem for safety.
 *
 * TODO:
 *   - Add crime rate simulation per district
 *   - Add police patrol routes and coverage
 *   - Add wanted / bounty system
 *   - Add jail and sentencing mechanics
 *   - Add police scanner / radio events for player awareness
 *   - Add corruption and police misconduct
 *   - Add neighbourhood watch programs
 *   - Add emergency response times
 *
 * Event hooks:
 *   'crimeReported'    — { districtId, type, severity }
 *   'crimeResolved'    — { incidentId, outcome }
 *   'patrolAssigned'   — { npcId, districtId }
 *   'safetyChanged'    — { districtId, oldValue, newValue }
 *   'wantedIssued'     — { npcId, reason, bounty }
 *   'wantedCleared'    — { npcId, reason }
 */

class PoliceSystem {
  constructor() {
    /** @type {Array<{ id: string, districtId: string, type: string, severity: number, reportedAt: number, resolved: boolean }>} */
    this.incidents = []
    /** @type {Array<{ npcId: string, reason: string, bounty: number, issuedAt: number }>} */
    this.wantedList = []
    this._enabled = true
    this._patrolAssignments = new Map()
  }

  /**
   * Report a crime incident.
   * @param {string} districtId
   * @param {string} type
   * @param {number} severity - 0-1
   * @returns {Object} Incident
   */
  reportIncident(districtId, type, severity) {
    const id = `incident_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const incident = { id, districtId, type, severity, reportedAt: Date.now(), resolved: false }
    this.incidents.push(incident)
    return incident
  }

  /**
   * Resolve an incident.
   * @param {string} incidentId
   */
  resolveIncident(incidentId) {
    const inc = this.incidents.find(i => i.id === incidentId)
    if (inc) inc.resolved = true
  }

  /**
   * Issue a wanted notice for an NPC.
   * @param {string} npcId
   * @param {string} reason
   * @param {number} [bounty=100]
   */
  issueWanted(npcId, reason, bounty = 100) {
    this.wantedList.push({ npcId, reason, bounty, issuedAt: Date.now() })
  }

  /**
   * Clear a wanted notice.
   * @param {string} npcId
   * @param {string} [reason='']
   */
  clearWanted(npcId, reason = '') {
    this.wantedList = this.wantedList.filter(w => w.npcId !== npcId)
  }

  /**
   * Assign a police NPC to patrol a district.
   * @param {string} npcId
   * @param {string} districtId
   */
  assignPatrol(npcId, districtId) {
    this._patrolAssignments.set(npcId, districtId)
  }

  /**
   * Get crime rate for a district (0-1).
   * @param {string} districtId
   * @returns {number}
   */
  getCrimeRate(districtId) {
    const recent = this.incidents.filter(i => i.districtId === districtId && !i.resolved)
    return Math.min(1, recent.length * 0.1)
  }

  /**
   * Get safety rating for a district (0-1, higher = safer).
   * @param {string} districtId
   * @returns {number}
   */
  getSafetyRating(districtId) {
    return Math.max(0, 1 - this.getCrimeRate(districtId))
  }

  /**
   * Update police system. Called each tick.
   * @param {number} dt
   */
  update(dt) {
    // TODO: incident aging, patrol updates
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { PoliceSystem }
