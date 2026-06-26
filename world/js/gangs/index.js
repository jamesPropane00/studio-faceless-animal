// GangSystemWrapper — wraps the legacy gang system from world.html.
// Legacy: state.userGang, state.npcGangMap, gang API calls
// Legacy functions: loadMyGang(), loadAllGangs(), createGang(), joinGang(), leaveGang(), recruitNPC()

class GangSystemWrapper {
  constructor() {
    this.userGang = null
    this._influences = []
  }

  sync(state) {
    if (state) {
      this.userGang = state.userGang || null
      this._influences = state.districtInfluences || []
    }
  }

  getInfluences() { return [...this._influences] }
  isInGang() { return !!this.userGang }
}

export { GangSystemWrapper }
