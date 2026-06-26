/**
 * OverlaySystem
 *
 * Manages screen overlays: modal dialogs, full-screen effects,
 * loading screens, flash effects, transitions, and tooltips.
 *
 * Integration:
 *   engine.registerSystem('overlays', overlaySystem, 220)
 *   Other systems use overlays for modal prompts and visual effects.
 *
 * TODO:
 *   - Add modal dialog queue
 *   - Add full-screen overlay effects (night, weather, damage flash)
 *   - Add loading/progress overlay
 *   - Add screen transition effects (fade, slide, zoom)
 *   - Add tooltip system
 *   - Add context menu overlay
 *   - Add tutorial / hint highlight overlay
 *   - Add overlay z-ordering
 *   - Add overlay animation (enter, exit)
 *   - Add overlay event hooks
 *
 * Event hooks:
 *   'overlayOpened'  — { id, type }
 *   'overlayClosed'  — { id }
 *   'overlayClicked' — { id, x, y }
 */

const OVERLAY_TYPES = {
  MODAL: 'modal',
  FULLSCREEN: 'fullscreen',
  LOADING: 'loading',
  TRANSITION: 'transition',
  TOOLTIP: 'tooltip',
  CONTEXT_MENU: 'contextMenu'
}

class Overlay {
  /**
   * @param {string} id
   * @param {string} type
   * @param {Function} render - Returns HTML string
   * @param {Object} [options]
   */
  constructor(id, type, render, options = {}) {
    this.id = id
    this.type = type
    this.render = render
    this.options = options
    this.visible = false
    this.zIndex = 1000
  }
}

class OverlaySystem {
  constructor() {
    /** @type {Map<string, Overlay>} */
    this._overlays = new Map()
    this._zCounter = 1000
    this._enabled = true
  }

  /**
   * Register an overlay.
   * @param {Overlay} overlay
   */
  registerOverlay(overlay) {
    this._overlays.set(overlay.id, overlay)
  }

  /**
   * Show an overlay.
   * @param {string} id
   */
  show(id) {
    const o = this._overlays.get(id)
    if (o) {
      o.visible = true
      o.zIndex = ++this._zCounter
    }
  }

  /**
   * Hide an overlay.
   * @param {string} id
   */
  hide(id) {
    const o = this._overlays.get(id)
    if (o) o.visible = false
  }

  /** Hide all visible overlays. */
  hideAll() {
    for (const o of this._overlays.values()) o.visible = false
  }

  /**
   * Get visible overlays sorted by z-order.
   * @returns {Overlay[]}
   */
  getVisible() {
    return [...this._overlays.values()]
      .filter(o => o.visible)
      .sort((a, b) => a.zIndex - b.zIndex)
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { OverlaySystem, Overlay, OVERLAY_TYPES }
