// BuildingData — static building type registry.
// Source: BUILDING_TYPES from world.html

const buildings = [
  { id: 'house', name: 'House', color: '#6B5B8A', height: 12, cost: 50, income: 0.5 },
  { id: 'shop', name: 'Shop', color: '#5B9CFF', height: 10, cost: 100, income: 1, glow: 'rgba(91,156,255,0.15)' },
  { id: 'club', name: 'Club', color: '#FF3CAC', height: 14, cost: 150, income: 2, glow: 'rgba(255,60,172,0.2)' },
  { id: 'warehouse', name: 'Warehouse', color: '#5A6A7A', height: 8, cost: 75, income: 1 },
  { id: 'hide', name: 'Hide', color: '#3A2A4A', height: 6, cost: 200, income: 3 },
  { id: 'camp', name: 'Camp', color: '#6A4A3A', height: 4, cost: 25, income: 0 }
]

const group_colors = { residential: '#6B5B8A', commercial: '#5B9CFF', entertainment: '#FF3CAC', industrial: '#5A6A7A', special: '#3A2A4A', basic: '#6A4A3A' }

function getBuilding(id) { return buildings.find(b => b.id === id) || null }
function getBuildingsByCost(maxCost) { return buildings.filter(b => b.cost <= maxCost) }
function getBuildingsByIncome(minIncome) { return buildings.filter(b => b.income >= minIncome) }

export { buildings, group_colors, getBuilding, getBuildingsByCost, getBuildingsByIncome }
