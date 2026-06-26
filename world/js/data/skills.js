// SkillData — static skill tree definitions.

const skillTrees = [
  {
    id: 'gathering', name: 'Gathering', icon: '🌿',
    desc: 'Forage and harvest from the wilds.',
    nodes: [
      { id: 'foraging', name: 'Foraging', desc: 'Find herbs and items.', cost: 1, x: 0, y: 0 },
      { id: 'botany', name: 'Botany', desc: 'Identify rare plants.', cost: 2, x: 1, y: 0, requires: ['foraging'] },
      { id: 'master_forager', name: 'Master Forager', desc: 'Double yields.', cost: 3, x: 2, y: 0, requires: ['botany'] }
    ]
  },
  {
    id: 'farming', name: 'Farming', icon: '🌾',
    desc: 'Cultivate and manage crops.',
    nodes: [
      { id: 'tilling', name: 'Tilling', desc: 'Prepare soil.', cost: 1, x: 0, y: 0 },
      { id: 'irrigation', name: 'Irrigation', desc: 'Water efficiency.', cost: 2, x: 1, y: 0, requires: ['tilling'] },
      { id: 'green_thumb', name: 'Green Thumb', desc: 'Boost growth.', cost: 3, x: 2, y: 0, requires: ['irrigation'] }
    ]
  },
  {
    id: 'crafting', name: 'Crafting', icon: '🔨',
    desc: 'Create items and equipment.',
    nodes: [
      { id: 'basic_craft', name: 'Basic Craft', desc: 'Simple items.', cost: 1, x: 0, y: 0 },
      { id: 'refining', name: 'Refining', desc: 'Better quality.', cost: 2, x: 1, y: 0, requires: ['basic_craft'] },
      { id: 'masterwork', name: 'Masterwork', desc: 'Top-tier gear.', cost: 3, x: 2, y: 0, requires: ['refining'] }
    ]
  },
  {
    id: 'combat', name: 'Combat', icon: '⚔️',
    desc: 'Fight and defend.',
    nodes: [
      { id: 'brawling', name: 'Brawling', desc: 'Basic fighting.', cost: 1, x: 0, y: 0 },
      { id: 'tactics', name: 'Tactics', desc: 'Battle planning.', cost: 2, x: 1, y: 0, requires: ['brawling'] },
      { id: 'warrior', name: 'Warrior', desc: 'Elite fighter.', cost: 3, x: 2, y: 0, requires: ['tactics'] }
    ]
  },
  {
    id: 'stealth', name: 'Stealth', icon: '👤',
    desc: 'Move unseen.',
    nodes: [
      { id: 'sneak', name: 'Sneak', desc: 'Move quietly.', cost: 1, x: 0, y: 0 },
      { id: 'shadow_meld', name: 'Shadow Meld', desc: 'Blend in.', cost: 2, x: 1, y: 0, requires: ['sneak'] },
      { id: 'ghost', name: 'Ghost', desc: 'Vanish', cost: 3, x: 2, y: 0, requires: ['shadow_meld'] }
    ]
  },
  {
    id: 'charisma', name: 'Charisma', icon: '💬',
    desc: 'Persuade and lead.',
    nodes: [
      { id: 'charm', name: 'Charm', desc: 'Friendly approach.', cost: 1, x: 0, y: 0 },
      { id: 'negotiate', name: 'Negotiate', desc: 'Better deals.', cost: 2, x: 1, y: 0, requires: ['charm'] },
      { id: 'leadership', name: 'Leadership', desc: 'Inspire others.', cost: 3, x: 2, y: 0, requires: ['negotiate'] }
    ]
  },
  {
    id: 'exploration', name: 'Exploration', icon: '🧭',
    desc: 'Discover new places.',
    nodes: [
      { id: 'scout', name: 'Scout', desc: 'See farther.', cost: 1, x: 0, y: 0 },
      { id: 'pathfinder', name: 'Pathfinder', desc: 'Fast travel.', cost: 2, x: 1, y: 0, requires: ['scout'] },
      { id: 'cartographer', name: 'Cartographer', desc: 'Uncover map.', cost: 3, x: 2, y: 0, requires: ['pathfinder'] }
    ]
  },
  {
    id: 'business', name: 'Business', icon: '📊',
    desc: 'Manage income and trade.',
    nodes: [
      { id: 'haggle', name: 'Haggle', desc: 'Better prices.', cost: 1, x: 0, y: 0 },
      { id: 'investment', name: 'Investment', desc: 'Passive income.', cost: 2, x: 1, y: 0, requires: ['haggle'] },
      { id: 'magnate', name: 'Magnate', desc: 'Empire building.', cost: 3, x: 2, y: 0, requires: ['investment'] }
    ]
  },
  {
    id: 'survival', name: 'Survival', icon: '🏕️',
    desc: 'Thrive in the wild.',
    nodes: [
      { id: 'camping', name: 'Camping', desc: 'Rest anywhere.', cost: 1, x: 0, y: 0 },
      { id: 'tracking', name: 'Tracking', desc: 'Find creatures.', cost: 2, x: 1, y: 0, requires: ['camping'] },
      { id: 'survivor', name: 'Survivor', desc: 'Extreme resilience.', cost: 3, x: 2, y: 0, requires: ['tracking'] }
    ]
  }
]

function getSkillTree(id) { return skillTrees.find(t => t.id === id) || null }
function getSkillNode(treeId, nodeId) { const t = getSkillTree(treeId); return t ? t.nodes.find(n => n.id === nodeId) || null : null }

export { skillTrees, getSkillTree, getSkillNode }
