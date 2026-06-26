/**
 * PanelSystem
 *
 * Manages UI panels: inventory, map, settings, farm overlay, etc.
 * Handles stacking, focus, show/hide transitions, and drag.
 *
 * Integration:
 *   engine.registerSystem('panels', panelSystem, 205)
 *   Other systems register their panels with the panel system.
 *
 * TODO:
 *   - Add panel stack management (z-order, focus)
 *   - Add show/hide animations
 *   - Add draggable panels
 *   - Add resizable panels
 *   - Add panel templates (list, grid, form)
 *   - Add close-all-panels handler
 *   - Add panel state persistence
 *   - Add mobile panel adaptations (bottom sheet, full screen)
 *   - Add panel event hooks
 *
 * Event hooks:
 *   'panelOpened'   — { id, type }
 *   'panelClosed'   — { id }
 *   'panelFocused'  — { id }
 *   'panelMoved'    — { id, x, y }
 *   'panelResized'  — { id, w, h }
 */

class Panel {
  /**
   * @param {string} id
   * @param {string} title
   * @param {Function} renderContent - Returns HTML string
   * @param {Object} [options]
   */
  constructor(id, title, renderContent, options = {}) {
    this.id = id
    this.title = title
    this.renderContent = renderContent
    this.options = options
    this.visible = false
    this.zIndex = 0
    this.x = options.x || 0
    this.y = options.y || 0
    this.w = options.w || 300
    this.h = options.h || 400
  }

  open() { this.visible = true }
  close() { this.visible = false }
  toggle() { this.visible = !this.visible }
}

class PanelSystem {
  constructor() {
    /** @type {Map<string, Panel>} */
    this._panels = new Map()
    this._zCounter = 0
    this._enabled = true
  }

  /**
   * Register a panel.
   * @param {Panel} panel
   */
  registerPanel(panel) {
    this._panels.set(panel.id, panel)
  }

  /**
   * Open a panel by id.
   * @param {string} id
   */
  open(id) {
    const p = this._panels.get(id)
    if (p) {
      p.open()
      p.zIndex = ++this._zCounter
    }
  }

  /**
   * Close a panel by id.
   * @param {string} id
   */
  close(id) {
    const p = this._panels.get(id)
    if (p) p.close()
  }

  /** Close all panels. */
  closeAll() {
    for (const p of this._panels.values()) p.close()
  }

  /**
   * Toggle a panel.
   * @param {string} id
   */
  toggle(id) {
    const p = this._panels.get(id)
    if (p) {
      if (!p.visible) p.zIndex = ++this._zCounter
      p.toggle()
    }
  }

  /**
   * Bring a panel to focus.
   * @param {string} id
   */
  focus(id) {
    const p = this._panels.get(id)
    if (p) p.zIndex = ++this._zCounter
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { PanelSystem, Panel }
