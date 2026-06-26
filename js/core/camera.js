/**
 * Camera
 *
 * Manages the viewport: position, zoom, smoothing, and screen-to-world
 * coordinate conversions. Designed for isometric tile-based rendering.
 *
 * Integration:
 *   The camera is consumed by the Renderer and by input handlers for
 *   click-to-world coordinate mapping.
 *
 * TODO:
 *   - Add camera bounds / constraints per region
 *   - Add smooth follow target (player, NPC, point of interest)
 *   - Add camera shake effect
 *   - Add zoom-to-fit for world map view
 *   - Add edge-scrolling support
 *
 * Event hooks:
 *   'cameraMoved'  — { x, y }
 *   'cameraZoomed' — { zoom }
 */

class Camera {
  constructor() {
    this.x = 0
    this.y = 0
    this.zoom = 1
    this.targetZoom = 1
    this._minZoom = 0.15
    this._maxZoom = 2.0
    this._smoothing = 0.1
    this._followTarget = null
    this._followOffsetX = 0
    this._followOffsetY = 0
  }

  /**
   * Set camera position directly.
   * @param {number} x
   * @param {number} y
   */
  setPosition(x, y) {
    this.x = x
    this.y = y
  }

  /**
   * Set zoom level with clamping.
   * @param {number} z
   */
  setZoom(z) {
    this.targetZoom = Math.max(this._minZoom, Math.min(this._maxZoom, z))
  }

  /**
   * Adjust zoom by a delta (e.g., from scroll wheel).
   * @param {number} delta
   */
  zoomBy(delta) {
    this.setZoom(this.targetZoom + delta)
  }

  /**
   * Make the camera smoothly follow a target.
   * @param {Object} target - Must have { x, y } properties
   * @param {number} [offsetX=0]
   * @param {number} [offsetY=0]
   */
  follow(target, offsetX = 0, offsetY = 0) {
    this._followTarget = target
    this._followOffsetX = offsetX
    this._followOffsetY = offsetY
  }

  /** Stop following the current target. */
  unfollow() {
    this._followTarget = null
  }

  /**
   * Smoothly interpolate camera toward target. Call each frame.
   * @param {number} dt
   */
  update(dt) {
    if (this._followTarget) {
      const targetIsoX = (this._followTarget.x - this._followTarget.y) * 8
      const targetIsoY = (this._followTarget.x + this._followTarget.y) * 4
      this.x += (targetIsoX + this._followOffsetX - this.x) * this._smoothing
      this.y += (targetIsoY + this._followOffsetY - this.y) * this._smoothing
    }
    this.zoom += (this.targetZoom - this.zoom) * this._smoothing
  }

  /**
   * Convert world coordinates to screen coordinates.
   * @param {number} wx - World x
   * @param {number} wy - World y
   * @returns {{ x: number, y: number }}
   */
  worldToScreen(wx, wy) {
    const tileW = 16 * this.zoom
    const tileH = 8 * this.zoom
    const sx = (wx - wy) * (tileW / 2) - this.x + this._width / 2
    const sy = (wx + wy) * (tileH / 2) - this.y + this._height / 2
    return { x: sx, y: sy }
  }

  /**
   * Convert screen coordinates to world coordinates.
   * @param {number} sx - Screen x
   * @param {number} sy - Screen y
   * @returns {{ x: number, y: number }}
   */
  screenToWorld(sx, sy) {
    const tileW = 16 * this.zoom
    const tileH = 8 * this.zoom
    const mx = sx - this._width / 2 + this.x
    const my = sy - this._height / 2 + this.y
    const wx = (mx / (tileW / 2) + my / (tileH / 2)) / 2
    const wy = (my / (tileH / 2) - mx / (tileW / 2)) / 2
    return { x: wx, y: wy }
  }

  /**
   * Check if a world position is within the visible viewport.
   * @param {number} wx
   * @param {number} wy
   * @param {number} [margin=0]
   * @returns {boolean}
   */
  isVisible(wx, wy, margin = 0) {
    const s = this.worldToScreen(wx, wy)
    return s.x >= -margin && s.x <= this._width + margin &&
           s.y >= -margin && s.y <= this._height + margin
  }

  /** @returns {Object} Viewport bounds in world coords */
  getBounds() {
    const topLeft = this.screenToWorld(0, 0)
    const bottomRight = this.screenToWorld(this._width, this._height)
    return { minX: topLeft.x, maxX: bottomRight.x, minY: topLeft.y, maxY: bottomRight.y }
  }

  /** Internal: update viewport dimensions from canvas size. */
  _setViewport(w, h) {
    this._width = w
    this._height = h
  }

  setMinZoom(z) { this._minZoom = z }
  setMaxZoom(z) { this._maxZoom = z }
  setSmoothing(s) { this._smoothing = s }
  getSmoothing() { return this._smoothing }
}

export { Camera }
