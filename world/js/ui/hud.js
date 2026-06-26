// HUD display — heads-up display elements.
// Legacy: HUD rendering lives in world.html (drawHud, updateHud)
// Legacy DOM IDs: #hud-coins, #hud-time, #hud-region, #hud-health

class HUDSystem {
  constructor() {
    this.coinsEl = document.getElementById('hud-coins')
    this.timeEl = document.getElementById('hud-time')
    this.regionEl = document.getElementById('hud-region')
    this.healthEl = document.getElementById('hud-health')
  }

  updateCoins(amount) { if (this.coinsEl) this.coinsEl.textContent = Math.floor(amount) }

  updateTime(timeString) { if (this.timeEl) this.timeEl.textContent = timeString }

  updateRegion(name) { if (this.regionEl) this.regionEl.textContent = name }

  updateHealth(hp, maxHp) {
    if (this.healthEl) this.healthEl.textContent = `${Math.ceil(hp)}/${maxHp}`
  }

  setVisible(visible) {
    const hud = document.getElementById('hud')
    if (hud) hud.style.display = visible ? 'flex' : 'none'
  }
}

const hud = new HUDSystem()
export { hud, HUDSystem }
