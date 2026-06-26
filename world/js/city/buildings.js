// BuildingRegistry — building type definitions and management.
// Legacy: BUILDING_TYPES constant in world.html
// Legacy: state.buildings array, placeBuildingAt(), openIncomePanel()

const BUILDING_TYPES = {
  house: { name: 'House', color: '#6B5B8A', height: 12, cost: 50, income: 0.5 },
  shop: { name: 'Shop', color: '#5B9CFF', height: 10, cost: 100, income: 1, glow: 'rgba(91,156,255,0.15)' },
  club: { name: 'Club', color: '#FF3CAC', height: 14, cost: 150, income: 2, glow: 'rgba(255,60,172,0.2)' },
  warehouse: { name: 'Warehouse', color: '#5A6A7A', height: 8, cost: 75, income: 1 },
  hide: { name: 'Hide', color: '#3A2A4A', height: 6, cost: 200, income: 3 },
  camp: { name: 'Camp', color: '#6A4A3A', height: 4, cost: 25, income: 0 }
}

class BuildingRegistry {
  get(id) { return BUILDING_TYPES[id] || null }
  getAll() { return Object.entries(BUILDING_TYPES).map(([id, data]) => ({ id, ...data })) }
  getByIncome(minIncome) { return this.getAll().filter(b => b.income >= minIncome) }
}

const buildingRegistry = new BuildingRegistry()
export { buildingRegistry, BuildingRegistry, BUILDING_TYPES }
