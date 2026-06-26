// PanelSystem — game panel management.
// Legacy: openPanel(), closePanel(), state.activePanel
// Legacy DOM IDs: #game-panel, #panel-title, #panel-content
// Legacy panels: 'farm', 'buildings', 'npc', 'income', 'inventory', 'gang', 'map', 'skills', 'reputation'

const PANEL_TYPES = {
  farm: { id: 'farm', title: 'Farm', icon: '🌾', width: 600 },
  buildings: { id: 'buildings', title: 'Buildings', icon: '🏗️', width: 600 },
  npc: { id: 'npc', title: 'NPCs', icon: '👥', width: 500 },
  income: { id: 'income', title: 'Income', icon: '💰', width: 400 },
  inventory: { id: 'inventory', title: 'Inventory', icon: '🎒', width: 500 },
  gang: { id: 'gang', title: 'Gang', icon: '💀', width: 600 },
  map: { id: 'map', title: 'World Map', icon: '🗺️', width: 700 },
  skills: { id: 'skills', title: 'Skills', icon: '⭐', width: 600 },
  reputation: { id: 'reputation', title: 'Reputation', icon: '🏆', width: 500 }
}

class PanelSystem {
  constructor() {
    this.container = document.getElementById('game-panel')
    this.titleEl = document.getElementById('panel-title')
    this.contentEl = document.getElementById('panel-content')
    this.activePanel = null
  }

  open(type, contentHTML) {
    if (this.titleEl && PANEL_TYPES[type]) {
      this.titleEl.textContent = `${PANEL_TYPES[type].icon} ${PANEL_TYPES[type].title}`
    }
    if (this.contentEl && contentHTML) this.contentEl.innerHTML = contentHTML
    if (this.container) {
      this.container.style.display = 'flex'
      if (PANEL_TYPES[type]) this.container.style.width = `${PANEL_TYPES[type].width}px`
    }
    this.activePanel = type
  }

  close() {
    if (this.container) this.container.style.display = 'none'
    this.activePanel = null
  }

  isOpen(type) { return this.activePanel === type }
}

const panels = new PanelSystem()
export { panels, PanelSystem, PANEL_TYPES }
