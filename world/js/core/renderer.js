// Renderer — canvas abstraction and rendering pipeline.
// Legacy rendering lives in world.html (render(), drawTile(), drawBuilding(), etc.)
// Canvas: #gameCanvas, ctx = canvas.getContext('2d')

// Legacy globals: canvas, ctx, miniCanvas, miniCtx, tileCache, minimapCache
// Legacy functions: render(), resize(), worldToScreen(), screenToWorld()

class Renderer {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this._dpr = Math.min(window.devicePixelRatio || 1, 2)
  }

  resize(w, h) {
    this.canvas.width = w * this._dpr
    this.canvas.height = h * this._dpr
    this.canvas.style.width = w + 'px'
    this.canvas.style.height = h + 'px'
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0)
  }

  getLogicalWidth() { return this.canvas.width / this._dpr }
  getLogicalHeight() { return this.canvas.height / this._dpr }

  clear(color = '#0a0b10') {
    this.ctx.fillStyle = color
    this.ctx.fillRect(0, 0, this.getLogicalWidth(), this.getLogicalHeight())
  }
}

export { Renderer }
