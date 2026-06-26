// SaveManager — persistence wrapper.
// Legacy game uses localStorage directly (e.g. 'fas_farm_data').
// This module provides a unified save/load interface for future migration.

const SAVE_KEYS = {
  FARM_DATA: 'fas_farm_data',
  PLAYER_STATE: 'fas_player_state',
  SETTINGS: 'fas_settings'
}

class SaveManager {
  constructor() {
    this._prefix = 'fas_'
  }

  save(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)) } catch (e) { console.warn('[Save]', e) }
  }

  load(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : fallback
    } catch { return fallback }
  }

  remove(key) {
    try { localStorage.removeItem(key) } catch {}
  }

  // Farm data (legacy, used by world.html)
  getFarmData() { return this.load(SAVE_KEYS.FARM_DATA, { crops: [], inventory: { corn: 0, wheat: 0, veggies: 0 } }) }
  saveFarmData(data) { this.save(SAVE_KEYS.FARM_DATA, data) }

  // Player settings
  getSettings() { return this.load(SAVE_KEYS.SETTINGS, { farmAmbience: true }) }
  saveSettings(settings) { this.save(SAVE_KEYS.SETTINGS, settings) }
}

const saveManager = new SaveManager()
export { saveManager, SaveManager, SAVE_KEYS }
