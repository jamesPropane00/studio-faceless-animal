// DistrictSystem — district management.
// Legacy: state.districts, state.districtInfluences
// Legacy: computeDistrictThemes(), getDistrictAtTile(), refreshDistricts()

const DISTRICT_TYPE_ICONS = {
  house: '🏠', shop: '🏪', club: '🎵', warehouse: '📦', hide: '🕶', camp: '⛺'
}

const DISTRICT_TYPE_LABELS = {
  house: 'Residential', shop: 'Commercial', club: 'Entertainment',
  warehouse: 'Industrial', hide: 'Hidden', camp: 'Outskirts'
}

class DistrictSystem {
  constructor() {
    this.districts = []
  }

  getAtTile(tx, ty) {
    for (const d of this.districts) {
      const dx = tx - d.center_x, dy = ty - d.center_y
      if (dx * dx + dy * dy <= d.radius * d.radius) return d
    }
    return null
  }

  sync(state) {
    if (state) this.districts = state.districts || []
  }
}

export { DistrictSystem, DISTRICT_TYPE_ICONS, DISTRICT_TYPE_LABELS }
