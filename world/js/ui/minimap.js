// Minimap — world minimap display.
// Legacy: drawMinimap() in world.html
// Legacy DOM ID: #minimap-canvas

class MinimapSystem {
  constructor() {
    this.canvas = document.getElementById('minimap-canvas')
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null
    this.visible = true
  }

  setVisible(v) { this.visible = v; if (this.canvas) this.canvas.style.display = v ? 'block' : 'none' }

  clear() { if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height) }

  drawPlayer(x, y) {
    if (!this.ctx || !this.visible) return
    this.ctx.fillStyle = '#fff'
    this.ctx.beginPath()
    this.ctx.arc(x, y, 3, 0, Math.PI * 2)
    this.ctx.fill()
  }
}

const minimap = new MinimapSystem()
export { minimap, MinimapSystem }
