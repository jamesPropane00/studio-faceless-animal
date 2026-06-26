/**
 * Renderer
 *
 * Abstraction over the canvas rendering pipeline.
 * Manages the render loop, layer ordering, and draw-call batching.
 * Designed to be registered with SimulationEngine.
 *
 * Integration:
 *   engine.registerSystem('renderer', renderer, 200)
 *   Systems register draw layers and provide render callbacks.
 *   The renderer calls each layer's draw() in order.
 *
 * TODO:
 *   - Add render layers with z-ordering
 *   - Add offscreen canvas caching for static tiles
 *   - Add DPR scaling (high-DPI displays)
 *   - Add WebGL fallback / acceleration
 *   - Add frame budget tracking and throttling
 *   - Add debug overlay (FPS, draw calls, etc.)
 *   - Add screen shake / post-processing effects
 *
 * Event hooks:
 *   'beforeRender' — emitted before any layer draws
 *   'afterRender'  — emitted after all layers draw
 *   'layerAdded'   — emitted when a render layer is registered
 */

class RenderLayer {
  constructor(name, drawFn, priority = 100) {
    this.name = name
    this.draw = drawFn
    this.priority = priority
    this.enabled = true
  }
}

class Renderer {
  constructor() {
    /** @type {RenderLayer[]} */
    this._layers = []
    this._canvas = null
    this._ctx = null
    this._width = 0
    this._height = 0
    this._dpr = 1
    this._frameCount = 0
    this._enabled = true
    this._debug = false
  }

  /**
   * Attach the renderer to a canvas element.
   * @param {HTMLCanvasElement} canvas
   */
  attach(canvas) {
    this._canvas = canvas
    this._ctx = canvas.getContext('2d')
    this._updateSize()
  }

  /** @returns {CanvasRenderingContext2D} */
  getContext() {
    return this._ctx
  }

  /** @returns {HTMLCanvasElement} */
  getCanvas() {
    return this._canvas
  }

  /** Update internal size from canvas dimensions. */
  _updateSize() {
    if (!this._canvas) return
    this._dpr = Math.min(window.devicePixelRatio || 1, 2)
    this._width = this._canvas.width / this._dpr
    this._height = this._canvas.height / this._dpr
  }

  /**
   * Register a render layer.
   * @param {string} name
   * @param {Function} drawFn - Receives (ctx, w, h)
   * @param {number} [priority=100] - Lower = drawn first
   * @returns {RenderLayer}
   */
  addLayer(name, drawFn, priority = 100) {
    const layer = new RenderLayer(name, drawFn, priority)
    this._layers.push(layer)
    this._layers.sort((a, b) => a.priority - b.priority)
    return layer
  }

  /**
   * Remove a render layer by name.
   * @param {string} name
   */
  removeLayer(name) {
    this._layers = this._layers.filter(l => l.name !== name)
  }

  /** Execute the render pass. Called from the game loop. */
  render() {
    if (!this._enabled || !this._ctx) return

    this._updateSize()
    const ctx = this._ctx
    const w = this._width
    const h = this._height

    // Clear
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height)

    // Draw each layer in priority order
    for (const layer of this._layers) {
      if (!layer.enabled) continue
      try {
        layer.draw(ctx, w, h)
      } catch (err) {
        console.error(`[Renderer] Layer "${layer.name}" error:`, err)
        layer.enabled = false
      }
    }

    this._frameCount++
  }

  /** Toggle debug overlay. */
  setDebug(enabled) { this._debug = enabled }
  isDebug() { return this._debug }

  /** @returns {Object} Render statistics */
  getStats() {
    return {
      frames: this._frameCount,
      layers: this._layers.length,
      width: this._width,
      height: this._height,
      dpr: this._dpr
    }
  }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }

  /** Handle window resize. */
  resize() {
    this._updateSize()
  }
}

export { Renderer, RenderLayer }
