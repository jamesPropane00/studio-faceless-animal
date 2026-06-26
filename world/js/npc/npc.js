// NPCSystem — NPC management.
// Legacy: state.npcs, updateNPCs(), generateNPCs(), assignNPCBuildings()
// Legacy: NPC_ROUTINES, NPC_BUILDER_WEIGHTS

const NPC_ROUTINES = {
  sleeper: { sleepStart: 0.85, sleepEnd: 0.25, workStart: 0.3, workEnd: 0.7 },
  early_bird: { sleepStart: 0.9, sleepEnd: 0.2, workStart: 0.22, workEnd: 0.65 },
  night_owl: { sleepStart: 0.95, sleepEnd: 0.35, workStart: 0.4, workEnd: 0.85 },
  wanderer: { sleepStart: 0.9, sleepEnd: 0.3, workStart: 0, workEnd: 1 }
}

class NPCSystem {
  constructor() {
    this.npcs = []
  }

  sync(state) {
    if (state) this.npcs = state.npcs || []
  }

  getInRadius(x, y, radius) {
    return this.npcs.filter(n => Math.abs(n.x - x) <= radius && Math.abs(n.y - y) <= radius)
  }
}

export { NPCSystem, NPC_ROUTINES }
