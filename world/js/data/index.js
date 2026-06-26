// Data registry barrel — re-exports all data modules.

export { buildings, group_colors, getBuilding, getBuildingsByCost, getBuildingsByIncome, BUILDING_TYPES, DISTRICT_TYPE_COLORS, DISTRICT_TYPE_ICONS, DISTRICT_TYPE_LABELS } from './buildings.js'
export { creatures, getCreature, getCreaturesByHabitat, getCreaturesByRarity } from './creatures.js'
export { regions, getRegion, getConnectedRegions, REGIONS, NEIGHBORHOOD_THEMES } from './regions.js'
export { items, getItem, GOD_POWERS, CROP_TYPES } from './items.js'
export { gangs, getGang } from './gangs.js'
export { skillTrees, getSkillTree, getSkillNode } from './skills.js'
