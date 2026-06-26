// Camera — isometric camera management.
// Legacy camera state: state.camera = { x, y, zoom, targetZoom }
// Legacy functions: worldToScreen(), screenToWorld()

class Camera {
  constructor() {
    this.x = 0
    this.y = 0
    this.zoom = 1
    this._targetZoom = 1
    this._smoothing = 0.15
  }

  follow(targetX, targetY, tileW = 64, tileH = 32) {
    const targetIsoX = (targetX - targetY) * (tileW / 2)
    const targetIsoY = (targetX + targetY) * (tileH / 2)
    this.x += (targetIsoX - this.x) * this._smoothing
    this.y += (targetIsoY - this.y) * this._smoothing
    this.zoom += (this._targetZoom - this.zoom) * 0.1
  }

  setZoom(z) { this._targetZoom = Math.max(0.3, Math.min(3, z)) }
  getTargetZoom() { return this._targetZoom }

  worldToScreen(wx, wy, tileW = 64, tileH = 32, logicalW = 0, logicalH = 0) {
    const iso_x = (wx - wy) * (tileW / 2)
    const iso_y = (wx + wy) * (tileH / 2)
    return {
      x: (iso_x - this.x) * this.zoom + logicalW / 2,
      y: (iso_y - this.y) * this.zoom + logicalH / 2
    }
  }

  screenToWorld(sx, sy, tileW = 64, tileH = 32, logicalW = 0, logicalH = 0) {
    const rx = (sx - logicalW / 2) / this.zoom + this.x
    const ry = (sy - logicalH / 2) / this.zoom + this.y
    const wx = (rx / (tileW / 2) + ry / (tileH / 2)) / 2
    const wy = (ry / (tileH / 2) - rx / (tileW / 2)) / 2
    return { x: wx, y: wy }
  }
}

export { Camera }
