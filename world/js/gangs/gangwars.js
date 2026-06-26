// GangWarSystem — district conflict simulation.
// Tiny NPC mob fights with damage markers and aftermath hooks.
// No detailed gore.

class GangWarEvent {
  constructor(districtId, gangs) {
    this.id = `gangwar_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    this.districtId = districtId
    this.gangs = gangs.map(g => ({ ...g, hp: 50, maxHp: 50, damage: 0 }))
    this.state = 'pending' // pending, active, finished
    this.progress = 0
    this.duration = 30 // seconds
  }
}

class GangWarSystem {
  constructor() {
    this._wars = []
    this._history = []
  }

  startWar(districtId, gangs) {
    const existing = this._wars.find(w => w.districtId === districtId && w.state === 'active')
    if (existing) return null
    const war = new GangWarEvent(districtId, gangs)
    war.state = 'active'
    this._wars.push(war)
    return war
  }

  update(dt) {
    for (const war of this._wars) {
      if (war.state !== 'active') continue
      war.progress += dt / war.duration

      // Simulate damage each tick
      for (const gang of war.gangs) {
        const incoming = war.gangs
          .filter(g => g.id !== gang.id && g.hp > 0)
          .length
        if (incoming > 0) {
          gang.hp -= dt * (2 + Math.random() * 2)
          gang.damage = Math.max(0, gang.maxHp - Math.max(0, gang.hp))
          gang.hp = Math.max(0, gang.hp)
        }
      }

      // Deal damage markers
      if (Math.random() < 0.1) {
        this._history.push({
          time: Date.now(),
          warId: war.id,
          districtId: war.districtId,
          type: 'damage',
          gangs: war.gangs.filter(g => g.damage > 0).map(g => ({ id: g.id, damage: g.damage }))
        })
      }

      // Check for end
      const aliveGangs = war.gangs.filter(g => g.hp > 0)
      if (aliveGangs.length <= 1 || war.progress >= 1) {
        war.state = 'finished'
        const winner = aliveGangs.length === 1 ? aliveGangs[0] : null
        this._history.push({
          time: Date.now(),
          warId: war.id,
          districtId: war.districtId,
          type: 'aftermath',
          winner: winner ? { id: winner.id, name: winner.name } : null,
          stalemate: !winner
        })
      }
    }
  }

  getActiveWars() { return this._wars.filter(w => w.state === 'active') }
  getFinishedWars() { return this._wars.filter(w => w.state === 'finished') }

  getHistory() { return [...this._history] }
}

const gangWars = new GangWarSystem()
export { gangWars, GangWarSystem }
