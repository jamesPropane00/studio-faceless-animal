// InfrastructureSystem — public works items (trees, lights, benches, etc.)
// Legacy: state.infrastructure, placeInfrastructure(), drawInfrastructure()

const INFRA_COSTS = {
  tree: 5, bench: 5, light: 10, garden: 15,
  graffiti: 10, fence: 10, fountain: 25
}

class InfrastructureSystem {
  getCost(type) { return INFRA_COSTS[type] || 0 }
  getAllTypes() { return Object.keys(INFRA_COSTS) }
}

export { InfrastructureSystem, INFRA_COSTS }
