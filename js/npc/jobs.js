/**
 * JobSystem
 *
 * Manages NPC professions and employment.
 * NPCs can be assigned jobs that determine their routines, income,
 * and contribution to the district economy.
 *
 * Integration:
 *   engine.registerSystem('jobs', jobSystem, 72)
 *   Linked with EconomySystem for wage simulation and DistrictSystem
 *   for employment distribution.
 *
 * TODO:
 *   - Add job marketplace (NPCs seek open positions)
 *   - Add wage negotiation and satisfaction
 *   - Add job performance and promotion
 *   - Add unemployment tracking
 *   - Add job training and skill requirements
 *   - Add player employment (hire NPCs for tasks)
 *   - Add job events (strikes, layoffs, hiring sprees)
 *   - Add freelance / gig economy support
 *
 * Event hooks:
 *   'npcEmployed'   — { npcId, job, employer }
 *   'npcFired'      — { npcId, job, reason }
 *   'npcPromoted'   — { npcId, oldJob, newJob }
 *   'jobCreated'    — { jobId, type, districtId }
 *   'jobFilled'     — { jobId, npcId }
 */

const JOB_TYPES = ['shopkeeper', 'builder', 'farmer', 'guard', 'vendor', 'artist', 'gang_member', 'logistics', 'entertainer']

class JobDefinition {
  /**
   * @param {string} id
   * @param {string} title
   * @param {string} type
   * @param {number} basePay - Coins per cycle
   * @param {string[]} [requiredSkills=[]]
   */
  constructor(id, title, type, basePay, requiredSkills = []) {
    this.id = id
    this.title = title
    this.type = type
    this.basePay = basePay
    this.requiredSkills = requiredSkills
    this.filled = false
    this.holder = null
  }
}

class JobSystem {
  constructor() {
    /** @type {Map<string, JobDefinition>} */
    this._jobs = new Map()
    /** @type {Map<string, string>} */ // npcId → jobId
    this._assignments = new Map()
    this._enabled = true
  }

  /**
   * Create a new job definition.
   * @param {string} id
   * @param {string} title
   * @param {string} type
   * @param {number} basePay
   * @param {string[]} [skills=[]]
   * @returns {JobDefinition}
   */
  createJob(id, title, type, basePay, skills = []) {
    const job = new JobDefinition(id, title, type, basePay, skills)
    this._jobs.set(id, job)
    return job
  }

  /**
   * Assign an NPC to a job.
   * @param {string} npcId
   * @param {string} jobId
   * @returns {boolean}
   */
  assign(npcId, jobId) {
    const job = this._jobs.get(jobId)
    if (!job || job.filled) return false
    job.filled = true
    job.holder = npcId
    this._assignments.set(npcId, jobId)
    return true
  }

  /**
   * Fire an NPC from their job.
   * @param {string} npcId
   * @returns {boolean}
   */
  fire(npcId) {
    const jobId = this._assignments.get(npcId)
    if (!jobId) return false
    const job = this._jobs.get(jobId)
    if (job) { job.filled = false; job.holder = null }
    this._assignments.delete(npcId)
    return true
  }

  /** @param {string} npcId @returns {JobDefinition|null} */
  getJob(npcId) {
    const jobId = this._assignments.get(npcId)
    return jobId ? this._jobs.get(jobId) || null : null
  }

  /** @returns {JobDefinition[]} List of unfilled jobs */
  getOpenJobs() {
    return [...this._jobs.values()].filter(j => !j.filled)
  }

  /** @returns {number} Current unemployment rate (0-1) */
  getUnemploymentRate() {
    const total = this._jobs.size
    if (total === 0) return 0
    return this.getOpenJobs().length / total
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { JobSystem, JobDefinition, JOB_TYPES }
