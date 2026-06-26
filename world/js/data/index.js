// Data registry barrel — re-exports all data modules.

export { buildings, group_colors, getBuilding, getBuildingsByCost, getBuildingsByIncome } from './buildings.js'
export { creatures, getCreature, getCreaturesByHabitat, getCreaturesByRarity } from './creatures.js'
export { regions, getRegion, getConnectedRegions } from './regions.js'
export { items, getItem } from './items.js'
export { gangs, getGang } from './gangs.js'
export { skillTrees, getSkillTree, getSkillNode } from './skills.js'
