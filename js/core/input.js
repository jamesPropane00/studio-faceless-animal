/**
 * InputManager
 *
 * Centralized input handling: keyboard, mouse, touch, and gamepad.
 * Translates raw DOM events into game actions consumed by systems.
 *
 * Integration:
 *   engine.registerSystem('input', inputManager, 0)
 *   Other systems read input state via isKeyDown(), wasKeyPressed(), etc.
 *
 * TODO:
 *   - Add key binding / remapping UI
 *   - Add gesture recognition (swipe, pinch, long-press)
 *   - Add gamepad support
 *   - Add input recording / replay for debugging
 *   - Add action mapping (e.g., 'interact' → E / click / tap)
 *   - Add virtual joystick for mobile
 *
 * Event hooks:
 *   'keyDown' / 'keyUp'     — { key, code }
 *   'mouseDown' / 'mouseUp' — { button, x, y, wx, wy }
 *   'mouseMove'             — { x, y, wx, wy }
 *   'click'                 — { x, y, wx, wy, button }
 *   'touchStart' / 'touchEnd' — { touches }
 *   'action'                — { name }
 */

class InputManager {
  constructor() {
    /** @type {Set<string>} */
    this._keysDown = new Set()
    /** @type {Set<string>} */
    this._keysJustPressed = new Set()
    /** @type {Set<string>} */
    this._keysJustReleased = new Set()

    this._mouseX = 0
    this._mouseY = 0
    this._mouseWorldX = 0
    this._mouseWorldY = 0
    this._mouseDown = false
    this._mouseButton = -1

    this._touchActive = false
    this._touches = []

    this._enabled = true
    this._boundHandlers = []
  }

  /**
   * Attach all DOM event listeners. Call once during init.
   * @param {Function} [screenToWorld] - Optional coord converter
   */
  attach(screenToWorld) {
    this._screenToWorld = screenToWorld || ((x, y) => ({ x, y }))
    this._bind()
  }

  /** Detach all DOM event listeners. */
  detach() {
    for (const { target, type, handler } of this._boundHandlers) {
      target.removeEventListener(type, handler)
    }
    this._boundHandlers = []
    this._keysDown.clear()
    this._keysJustPressed.clear()
    this._keysJustReleased.clear()
  }

  /** Bind all DOM events. */
  _bind() {
    const kd = (e) => {
      if (!this._enabled) return
      if (!this._keysDown.has(e.code)) this._keysJustPressed.add(e.code)
      this._keysDown.add(e.code)
    }
    const ku = (e) => {
      this._keysDown.delete(e.code)
      this._keysJustReleased.add(e.code)
    }
    const mm = (e) => {
      this._mouseX = e.clientX
      this._mouseY = e.clientY
      const w = this._screenToWorld(e.clientX, e.clientY)
      this._mouseWorldX = w.x
      this._mouseWorldY = w.y
    }
    const md = (e) => { this._mouseDown = true; this._mouseButton = e.button }
    const mu = (e) => { this._mouseDown = false; this._mouseButton = -1 }
    const ts = (e) => { this._touchActive = true; this._touches = [...e.touches] }
    const te = (e) => { this._touchActive = false; this._touches = [] }

    document.addEventListener('keydown', kd)
    document.addEventListener('keyup', ku)
    document.addEventListener('mousemove', mm)
    document.addEventListener('mousedown', md)
    document.addEventListener('mouseup', mu)
    document.addEventListener('touchstart', ts, { passive: true })
    document.addEventListener('touchend', te, { passive: true })

    this._boundHandlers.push(
      { target: document, type: 'keydown', handler: kd },
      { target: document, type: 'keyup', handler: ku },
      { target: document, type: 'mousemove', handler: mm },
      { target: document, type: 'mousedown', handler: md },
      { target: document, type: 'mouseup', handler: mu },
      { target: document, type: 'touchstart', handler: ts },
      { target: document, type: 'touchend', handler: te },
    )
  }

  /** @param {string} code - KeyboardEvent.code */
  isKeyDown(code) { return this._keysDown.has(code) }

  /** Check if a key was pressed this frame. */
  wasKeyPressed(code) { return this._keysJustPressed.has(code) }

  /** Check if a key was released this frame. */
  wasKeyReleased(code) { return this._keysJustReleased.has(code) }

  /** @returns {{ x: number, y: number }} Mouse position in screen coords */
  getMousePosition() { return { x: this._mouseX, y: this._mouseY } }

  /** @returns {{ x: number, y: number }} Mouse position in world coords */
  getMouseWorld() { return { x: this._mouseWorldX, y: this._mouseWorldY } }

  isMouseDown() { return this._mouseDown }
  getMouseButton() { return this._mouseButton }
  isTouchActive() { return this._touchActive }
  getTouches() { return [...this._touches] }

  /** Clear per-frame state. Called at end of each tick. */
  endFrame() {
    this._keysJustPressed.clear()
    this._keysJustReleased.clear()
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { InputManager }
