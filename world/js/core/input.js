// InputManager — keyboard, mouse, touch input.
// Legacy input handling lives in world.html (setupKeyboard, setupMouse, setupTouch).
// Legacy state keys: state.keys (Set), state.mouse, state.joystick

class InputManager {
  constructor() {
    this.keys = new Set()
    this.mouse = { x: 0, y: 0, down: false, dragging: false }
    this.joystick = { active: false, dx: 0, dy: 0 }
    this._canvas = null
  }

  attach(canvas) {
    this._canvas = canvas
    // Legacy: all input event listeners are set up in world.html
    // This module will take over input management during migration
  }

  isKeyDown(key) { return this.keys.has(key) }
  getMovement() {
    let dx = 0, dy = 0
    if (this.joystick.active) {
      dx = this.joystick.dx; dy = this.joystick.dy
    } else {
      if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1
      if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1
      if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1
      if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1
    }
    return { dx, dy }
  }
}

export { InputManager }
