// OverlaySystem — full-screen overlays (loading, travel, dialogs).
// Legacy: showOverlay(), hideOverlay()
// Legacy DOM IDs: #overlay, #overlay-content

class OverlaySystem {
  constructor() {
    this.overlay = document.getElementById('overlay')
  }

  show(content, closable = true) {
    if (!this.overlay) return
    const contentEl = document.getElementById('overlay-content')
    if (contentEl) contentEl.innerHTML = content
    this.overlay.style.display = 'flex'
    if (closable) this.overlay.onclick = (e) => { if (e.target === this.overlay) this.hide() }
  }

  hide() {
    if (this.overlay) this.overlay.style.display = 'none'
  }

  isVisible() { return this.overlay && this.overlay.style.display === 'flex' }
}

const overlays = new OverlaySystem()
export { overlays, OverlaySystem }
