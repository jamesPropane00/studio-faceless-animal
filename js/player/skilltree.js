/**
 * SkillTree
 *
 * Faceless Animal skill tree architecture.
 * Each tree has branches with unlockable nodes.
 * Nodes have prerequisites, costs, and effects.
 *
 * Trees:
 *   Builder     — construction, infrastructure, district development
 *   Farmer      — crops, animals, farm machinery, food production
 *   Broadcaster — communication, influence, media, reputation
 *   Explorer    — travel, discovery, mapping, survival
 *   Gang Leader — gang management, territory, combat
 *   Street Artist — aesthetics, decorations, public works, culture
 *   Creature Keeper — wildlife, habitats, breeding, sanctuary
 *   Developer   — technology, automation, efficiency, server ops
 *   Entertainer — events, attractions, tourism, social
 *
 * Integration:
 *   Attached to Player or used standalone.
 *   Each tree is an instance of SkillTree with a unique id.
 *
 * TODO:
 *   - Add XP / SP (skill point) gain system
 *   - Add node unlock animations
 *   - Add server-side validation of unlocks
 *   - Add tree visualization component
 *   - Add respec functionality
 *   - Add passive effects from unlocked nodes
 *
 * Event hooks:
 *   'skillUnlocked' — { treeId, nodeId }
 *   'skillTreeReset' — { treeId }
 *   'skillPointsChanged' — { available, total }
 */

class SkillNode {
  /**
   * @param {Object} config
   * @param {string} config.id
   * @param {string} config.name
   * @param {string} config.description
   * @param {number} config.cost - Skill points required
   * @param {string[]} [config.prerequisites=[]] - Node IDs that must be unlocked first
   * @param {Object} [config.effect={}] - Placeholder for gameplay effects
   * @param {number} [config.maxRank=1] - How many ranks this node has
   * @param {number} [config.x=0] - Visual column
   * @param {number} [config.y=0] - Visual row
   */
  constructor(config) {
    this.id = config.id
    this.name = config.name
    this.description = config.description
    this.cost = config.cost
    this.prerequisites = config.prerequisites || []
    this.effect = config.effect || {}
    this.maxRank = config.maxRank || 1
    this.rank = 0
    this.x = config.x || 0
    this.y = config.y || 0
  }

  /** @returns {boolean} Whether this node is fully ranked */
  isMaxed() { return this.rank >= this.maxRank }

  /** @returns {boolean} Whether this node has at least one rank */
  isUnlocked() { return this.rank > 0 }
}

class SkillTree {
  /**
   * @param {string} id - Unique tree identifier
   * @param {string} name - Display name
   * @param {string} description
   */
  constructor(id, name, description) {
    this.id = id
    this.name = name
    this.description = description
    /** @type {Map<string, SkillNode>} */
    this._nodes = new Map()
    this._unlockOrder = []
  }

  /**
   * Add a node to the tree.
   * @param {SkillNode} node
   * @returns {SkillTree}
   */
  addNode(node) {
    this._nodes.set(node.id, node)
    return this
  }

  /**
   * Attempt to unlock a node.
   * @param {string} nodeId
   * @param {number} [skillPoints=0] - Available skill points
   * @returns {boolean} Whether the unlock succeeded
   */
  unlock(nodeId, skillPoints = 0) {
    const node = this._nodes.get(nodeId)
    if (!node || node.isMaxed()) return false
    if (skillPoints < node.cost) return false
    // Check prerequisites
    for (const prereqId of node.prerequisites) {
      const prereq = this._nodes.get(prereqId)
      if (!prereq || !prereq.isUnlocked()) return false
    }
    node.rank++
    this._unlockOrder.push(nodeId)
    return true
  }

  /**
   * Check if a node can be unlocked.
   * @param {string} nodeId
   * @param {number} [skillPoints=0]
   * @returns {{ canUnlock: boolean, reason: string }}
   */
  canUnlock(nodeId, skillPoints = 0) {
    const node = this._nodes.get(nodeId)
    if (!node) return { canUnlock: false, reason: 'node_not_found' }
    if (node.isMaxed()) return { canUnlock: false, reason: 'already_maxed' }
    if (skillPoints < node.cost) return { canUnlock: false, reason: 'insufficient_points' }
    for (const prereqId of node.prerequisites) {
      const prereq = this._nodes.get(prereqId)
      if (!prereq || !prereq.isUnlocked()) return { canUnlock: false, reason: `missing_prerequisite: ${prereqId}` }
    }
    return { canUnlock: true, reason: '' }
  }

  /** @returns {SkillNode[]} */
  getNodes() { return [...this._nodes.values()] }

  /** @param {string} nodeId @returns {SkillNode|undefined} */
  getNode(nodeId) { return this._nodes.get(nodeId) }

  /** @returns {number} Total skill points invested in this tree */
  getTotalInvestment() {
    let total = 0
    for (const node of this._nodes.values()) total += node.rank * node.cost
    return total
  }

  /** @returns {number} Number of unlocked nodes */
  getUnlockedCount() {
    let count = 0
    for (const node of this._nodes.values()) if (node.isUnlocked()) count++
    return count
  }

  /** @returns {string[]} Ordered list of unlocked node ids */
  getUnlockOrder() { return [...this._unlockOrder] }

  /** Reset all nodes in this tree. */
  reset() {
    for (const node of this._nodes.values()) node.rank = 0
    this._unlockOrder = []
  }

  /** Serialize for persistence. */
  serialize() {
    const ranks = {}
    for (const node of this._nodes.values()) if (node.rank > 0) ranks[node.id] = node.rank
    return { treeId: this.id, ranks }
  }

  /** Deserialize saved state. */
  deserialize(data) {
    if (data.ranks) {
      for (const [nodeId, rank] of Object.entries(data.ranks)) {
        const node = this._nodes.get(nodeId)
        if (node) { node.rank = rank; this._unlockOrder.push(nodeId) }
      }
    }
  }
}

/**
 * SkillTreeManager — holds all skill trees.
 */
class SkillTreeManager {
  constructor() {
    /** @type {Map<string, SkillTree>} */
    this.trees = new Map()
    this._totalSkillPoints = 0
    this._usedSkillPoints = 0
  }

  /**
   * Register a skill tree.
   * @param {SkillTree} tree
   */
  registerTree(tree) {
    this.trees.set(tree.id, tree)
  }

  /** @param {string} id @returns {SkillTree|undefined} */
  getTree(id) { return this.trees.get(id) }

  /**
   * Add skill points to the pool.
   * @param {number} amount
   */
  addSkillPoints(amount) {
    this._totalSkillPoints += amount
  }

  /** @returns {number} Available (unspent) skill points */
  getAvailablePoints() {
    return this._totalSkillPoints - this._usedSkillPoints
  }

  /** @returns {number} Total skill points earned */
  getTotalPoints() { return this._totalSkillPoints }

  /**
   * Attempt to unlock a node in a tree.
   * @param {string} treeId
   * @param {string} nodeId
   * @returns {boolean}
   */
  unlockNode(treeId, nodeId) {
    const tree = this.trees.get(treeId)
    if (!tree) return false
    const points = this.getAvailablePoints()
    const result = tree.canUnlock(nodeId, points)
    if (!result.canUnlock) return false
    const success = tree.unlock(nodeId, points)
    if (success) this._usedSkillPoints += tree.getNode(nodeId).cost
    return success
  }

  /** Serialize all trees. */
  serialize() {
    const trees = {}
    for (const [id, tree] of this.trees) trees[id] = tree.serialize()
    return { totalPoints: this._totalSkillPoints, trees }
  }

  /** Deserialize all trees. */
  deserialize(data) {
    if (data.totalPoints !== undefined) this._totalSkillPoints = data.totalPoints
    if (data.trees) {
      for (const [id, treeData] of Object.entries(data.trees)) {
        const tree = this.trees.get(id)
        if (tree) tree.deserialize(treeData)
      }
    }
  }
}

export { SkillNode, SkillTree, SkillTreeManager }
