// FarmSystem — farm management.
// Legacy: farm data in localStorage ('fas_farm_data'), CROP_TYPES
// Legacy: getFarmData(), plantCrop(), harvestCrop(), sendFoodToCity()

const CROP_TYPES = {
  corn: { name: 'Corn', icon: '🌽', growthTime: 45000, stages: 3, yield: 2, color: '#fbbf24' },
  wheat: { name: 'Wheat', icon: '🌾', growthTime: 30000, stages: 3, yield: 1, color: '#eab308' },
  veggies: { name: 'Vegetables', icon: '🥕', growthTime: 60000, stages: 4, yield: 3, color: '#4ade80' }
}

const FARM_CAPS = {
  butterflies: 6, bees: 4, leaves: 8, clouds: 3,
  birds: 2, animals: 14, workers: 4
}

class FarmSystem {
  constructor() {
    this._data = { crops: [], inventory: { corn: 0, wheat: 0, veggies: 0 } }
  }

  getCrop(type) { return CROP_TYPES[type] || null }
  getAllCrops() { return Object.entries(CROP_TYPES).map(([id, c]) => ({ id, ...c })) }

  getData() { return this._data }
  loadData(data) { if (data) this._data = data }

  getInventory() { return { ...this._data.inventory } }
  getCrops() { return [...(this._data.crops || [])] }
}

export { FarmSystem, CROP_TYPES, FARM_CAPS }
