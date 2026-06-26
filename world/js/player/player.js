// Player — player state management.
// Legacy player state: state.player = { x, y, tx, ty, speed, color, name }

class Player {
  constructor() {
    this.x = 0; this.y = 0
    this.tx = 0; this.ty = 0
    this.speed = 3.5
    this.color = '#a78bfa'
    this.name = ''
  }

  sync(state) {
    if (state) {
      this.x = state.x || 0
      this.y = state.y || 0
      this.tx = state.tx != null ? state.tx : this.x
      this.ty = state.ty != null ? state.ty : this.y
    }
  }

  getPosition() { return { x: this.x, y: this.y } }
}

export { Player }
