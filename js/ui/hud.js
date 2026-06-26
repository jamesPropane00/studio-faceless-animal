/**
 * HUDSystem
 *
 * Main heads-up display manager. Renders player stats, health bars,
 * coin counter, region label, crosshair, and other persistent UI.
 *
 * Integration:
 *   engine.registerSystem('hud', hudSystem, 200)
 *   Renders on top of the game canvas each frame.
 *
 * TODO:
 *   - Add stat bars (HP, hunger, stamina, experience)
 *   - Add coin/rep display with animated counters
 *   - Add region name banner on travel
 *   - Add crosshair / cursor indicator
 *   - Add notification area (incoming messages)
 *   - Add minimap overlay toggle
 *   - Add context-sensitive action prompts
 *   - Add HUD configuration (position, visibility)
 *   - Add accessibility options (font size, color blind)
 *   - Add HUD animations
 *
 * Event hooks:
 *   'hudUpdate'     — { stat, oldValue, newValue }
 *   'hudNotification' — { message, type, duration }
 *   'hudConfigChanged' — { setting, value }
 */

class HUDSystem {
  constructor() {
    this._visible = true
    this._elements = {}
    this._enabled = true
  }

  /**
   * Register a HUD element.
   * @param {string} name
   * @param {Object} element - { render, update, visible }
   */
  registerElement(name, element) {
    this._elements[name] = element
  }

  /** Remove a HUD element. */
  unregisterElement(name) {
    delete this._elements[name]
  }

  /**
   * Update all HUD elements. Called each frame.
   * @param {number} dt
   */
  update(dt) {
    for (const el of Object.values(this._elements)) {
      if (el.update) el.update(dt)
    }
  }

  /**
   * Render all HUD elements. Called after game world render.
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!this._visible) return
    for (const el of Object.values(this._elements)) {
      if (el.visible !== false && el.render) el.render(ctx)
    }
  }

  show() { this._visible = true }
  hide() { this._visible = false }
  toggle() { this._visible = !this._visible }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { HUDSystem }
