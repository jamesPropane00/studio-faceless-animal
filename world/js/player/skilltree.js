// SkillTreeEngine — multi-tree skill system with 9 skill trees.
// Each tree has nodes with prerequisites, levels, and stat bonuses.
// Foundation: nodes defined, no gameplay integration yet.

const SKILL_TREES = {
  builder: {
    id: 'builder', name: 'Builder', icon: '🏗️',
    description: 'Construct buildings faster and cheaper',
    nodes: [
      { id: 'builder_1', name: 'Apprentice Builder', level: 1, cost: 50, bonuses: { buildCost: -0.05 } },
      { id: 'builder_2', name: 'Skilled Builder', level: 2, cost: 150, prerequisites: ['builder_1'], bonuses: { buildCost: -0.1, buildSpeed: 0.1 } },
      { id: 'builder_3', name: 'Master Builder', level: 3, cost: 400, prerequisites: ['builder_2'], bonuses: { buildCost: -0.15, buildSpeed: 0.2 } },
      { id: 'builder_4', name: 'Architect', level: 4, cost: 800, prerequisites: ['builder_3'], bonuses: { buildCost: -0.2, buildSpeed: 0.3, special: 'unlock_blueprints' } },
    ]
  },
  farmer: {
    id: 'farmer', name: 'Farmer', icon: '🌾',
    description: 'Grow crops faster with higher yields',
    nodes: [
      { id: 'farmer_1', name: 'Novice Farmer', level: 1, cost: 50, bonuses: { cropSpeed: 0.05, cropYield: 1 } },
      { id: 'farmer_2', name: 'Experienced Farmer', level: 2, cost: 150, prerequisites: ['farmer_1'], bonuses: { cropSpeed: 0.1, cropYield: 2 } },
      { id: 'farmer_3', name: 'Expert Farmer', level: 3, cost: 400, prerequisites: ['farmer_2'], bonuses: { cropSpeed: 0.15, cropYield: 3 } },
      { id: 'farmer_4', name: 'Master Farmer', level: 4, cost: 800, prerequisites: ['farmer_3'], bonuses: { cropSpeed: 0.25, cropYield: 5, special: 'unlock_rare_crops' } },
    ]
  },
  broadcaster: {
    id: 'broadcaster', name: 'Broadcaster', icon: '📡',
    description: 'Amplify your influence and reach',
    nodes: [
      { id: 'broadcast_1', name: 'Local Broadcaster', level: 1, cost: 75, bonuses: { influenceRadius: 0.1 } },
      { id: 'broadcast_2', name: 'Regional Broadcaster', level: 2, cost: 200, prerequisites: ['broadcast_1'], bonuses: { influenceRadius: 0.2 } },
      { id: 'broadcast_3', name: 'National Broadcaster', level: 3, cost: 500, prerequisites: ['broadcast_2'], bonuses: { influenceRadius: 0.3 } },
    ]
  },
  explorer: {
    id: 'explorer', name: 'Explorer', icon: '🗺️',
    description: 'Travel faster and discover secrets',
    nodes: [
      { id: 'explore_1', name: 'Pathfinder', level: 1, cost: 50, bonuses: { travelSpeed: 0.1 } },
      { id: 'explore_2', name: 'Adventurer', level: 2, cost: 200, prerequisites: ['explore_1'], bonuses: { travelSpeed: 0.2 } },
      { id: 'explore_3', name: 'Globetrotter', level: 3, cost: 500, prerequisites: ['explore_2'], bonuses: { travelSpeed: 0.3, special: 'unlock_hidden_regions' } },
    ]
  },
  gang_leader: {
    id: 'gang_leader', name: 'Gang Leader', icon: '👤',
    description: 'Control territories and recruit better NPCs',
    nodes: [
      { id: 'gang_1', name: 'Recruiter', level: 1, cost: 100, bonuses: { gangRecruitCost: -10 } },
      { id: 'gang_2', name: 'Enforcer', level: 2, cost: 300, prerequisites: ['gang_1'], bonuses: { gangInfluence: 0.15 } },
      { id: 'gang_3', name: 'Kingpin', level: 3, cost: 700, prerequisites: ['gang_2'], bonuses: { gangInfluence: 0.3, special: 'unlock_territory_wars' } },
    ]
  },
  street_artist: {
    id: 'street_artist', name: 'Street Artist', icon: '🎨',
    description: 'Beautify the city and attract tourists',
    nodes: [
      { id: 'art_1', name: 'Graffiti Artist', level: 1, cost: 30, bonuses: { infraCost: -0.1 } },
      { id: 'art_2', name: 'Muralist', level: 2, cost: 100, prerequisites: ['art_1'], bonuses: { infraCost: -0.2, tourism: 0.1 } },
      { id: 'art_3', name: 'Master Artist', level: 3, cost: 300, prerequisites: ['art_2'], bonuses: { infraCost: -0.3, tourism: 0.2, special: 'unlock_public_art' } },
    ]
  },
  creature_keeper: {
    id: 'creature_keeper', name: 'Creature Keeper', icon: '🐾',
    description: 'Tame, breed, and protect wild creatures',
    nodes: [
      { id: 'keeper_1', name: 'Animal Lover', level: 1, cost: 50, bonuses: { creatureTrust: 5 } },
      { id: 'keeper_2', name: 'Wildlife Tracker', level: 2, cost: 150, prerequisites: ['keeper_1'], bonuses: { creatureTrust: 10 } },
      { id: 'keeper_3', name: 'Sanctuary Keeper', level: 3, cost: 400, prerequisites: ['keeper_2'], bonuses: { creatureTrust: 15, special: 'unlock_sanctuary' } },
    ]
  },
  developer: {
    id: 'developer', name: 'Developer', icon: '💻',
    description: 'Unlock technical advantages',
    nodes: [
      { id: 'dev_1', name: 'Script Kiddie', level: 1, cost: 50, bonuses: { incomeBoost: 0.05 } },
      { id: 'dev_2', name: 'Programmer', level: 2, cost: 200, prerequisites: ['dev_1'], bonuses: { incomeBoost: 0.1 } },
      { id: 'dev_3', name: 'Engineer', level: 3, cost: 500, prerequisites: ['dev_2'], bonuses: { incomeBoost: 0.2 } },
      { id: 'dev_4', name: 'Architect', level: 4, cost: 1000, prerequisites: ['dev_3'], bonuses: { incomeBoost: 0.35, special: 'unlock_automation' } },
    ]
  },
  entertainer: {
    id: 'entertainer', name: 'Entertainer', icon: '🎭',
    description: 'Draw crowds and earn from performances',
    nodes: [
      { id: 'ent_1', name: 'Street Performer', level: 1, cost: 30, bonuses: { reputationGain: 0.1 } },
      { id: 'ent_2', name: 'Showman', level: 2, cost: 100, prerequisites: ['ent_1'], bonuses: { reputationGain: 0.2 } },
      { id: 'ent_3', name: 'Superstar', level: 3, cost: 300, prerequisites: ['ent_2'], bonuses: { reputationGain: 0.3, special: 'unlock_events' } },
    ]
  }
}

class SkillTreeEngine {
  constructor() {
    this._unlocked = {}
    this._points = 0
    this._trees = SKILL_TREES
  }

  getTree(id) { return this._trees[id] }
  getAllTrees() { return Object.values(this._trees) }

  isUnlocked(nodeId) { return !!this._unlocked[nodeId] }

  canUnlock(treeId, nodeId) {
    const tree = this._trees[treeId]
    if (!tree) return false
    const node = tree.nodes.find(n => n.id === nodeId)
    if (!node) return false
    if (this._unlocked[nodeId]) return false
    if (node.prerequisites) {
      for (const prereq of node.prerequisites) {
        if (!this._unlocked[prereq]) return false
      }
    }
    return true
  }

  unlock(treeId, nodeId) {
    if (!this.canUnlock(treeId, nodeId)) return false
    this._unlocked[nodeId] = true
    return true
  }

  getBonuses() {
    const bonuses = {}
    for (const [id] of Object.entries(this._unlocked)) {
      for (const tree of Object.values(this._trees)) {
        const node = tree.nodes.find(n => n.id === id)
        if (node && node.bonuses) {
          for (const [key, val] of Object.entries(node.bonuses)) {
            bonuses[key] = (bonuses[key] || 0) + val
          }
        }
      }
    }
    return bonuses
  }

  serialize() { return { unlocked: Object.keys(this._unlocked), points: this._points } }
  deserialize(data) {
    if (data) {
      this._unlocked = Object.fromEntries((data.unlocked || []).map(id => [id, true]))
      this._points = data.points || 0
    }
  }
}

const skillTree = new SkillTreeEngine()
export { skillTree, SkillTreeEngine, SKILL_TREES }
