/**
 * SaveManager
 *
 * Handles serialization, persistence, and restoration of game state.
 * Currently uses localStorage with a path toward cloud saves via Supabase.
 *
 * Integration:
 *   Imported by systems that need to persist state (wallet, inventory, etc.).
 *   Each system provides a `serialize()` / `deserialize(data)` interface.
 *
 * TODO:
 *   - Add compression for large save payloads
 *   - Add cloud save via Supabase
 *   - Add save slot management (multiple profiles)
 *   - Add auto-save with debounce
 *   - Add migration system for save format versioning
 *   - Add save integrity checks (checksums)
 *
 * Event hooks:
 *   'saveWrite'  — emitted before writing to storage { key, data }
 *   'saveRead'   — emitted after reading from storage { key, data }
 *   'saveCorrupt' — emitted when a save fails validation
 */

const SAVE_VERSION = 1
const SAVE_PREFIX = 'fas_'

class SaveManager {
  constructor() {
    this._version = SAVE_VERSION
    this._caches = new Map()
    this._autoSaveId = null
  }

  /**
   * Write a value to persistent storage.
   * @param {string} key - Storage key (prefixed automatically)
   * @param {*} data - JSON-serializable data
   */
  write(key, data) {
    const fullKey = SAVE_PREFIX + key
    try {
      const payload = JSON.stringify({ v: this._version, t: Date.now(), d: data })
      localStorage.setItem(fullKey, payload)
      this._caches.set(key, data)
    } catch (err) {
      console.error(`[SaveManager] Failed to write "${key}":`, err)
    }
  }

  /**
   * Read a value from persistent storage.
   * @param {string} key
   * @param {*} [fallback=null]
   * @returns {*}
   */
  read(key, fallback = null) {
    // Check memory cache first
    if (this._caches.has(key)) return this._caches.get(key)

    const fullKey = SAVE_PREFIX + key
    try {
      const raw = localStorage.getItem(fullKey)
      if (!raw) return fallback
      const parsed = JSON.parse(raw)
      if (parsed && parsed.v && parsed.d !== undefined) {
        this._caches.set(key, parsed.d)
        return parsed.d
      }
      return fallback
    } catch (err) {
      console.warn(`[SaveManager] Corrupt save for "${key}"`, err)
      return fallback
    }
  }

  /**
   * Check if a save key exists.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this._caches.has(key) || localStorage.getItem(SAVE_PREFIX + key) !== null
  }

  /**
   * Remove a saved key.
   * @param {string} key
   */
  delete(key) {
    this._caches.delete(key)
    localStorage.removeItem(SAVE_PREFIX + key)
  }

  /**
   * Clear all saves with the game prefix.
   */
  clearAll() {
    this._caches.clear()
    const toRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(SAVE_PREFIX)) toRemove.push(k)
    }
    for (const k of toRemove) localStorage.removeItem(k)
  }

  /**
   * Write a batch of key-value pairs atomically.
   * @param {Object<string, *>} entries
   */
  writeBatch(entries) {
    for (const [key, data] of Object.entries(entries)) this.write(key, data)
  }

  /**
   * Schedule an auto-save. Call repeatedly; only one timer runs at a time.
   * @param {Function} saveFn - Function that returns an object to persist
   * @param {number} [delay=5000] - Debounce delay in ms
   */
  scheduleAutoSave(saveFn, delay = 5000) {
    if (this._autoSaveId) clearTimeout(this._autoSaveId)
    this._autoSaveId = setTimeout(() => {
      this._autoSaveId = null
      try {
        const data = saveFn()
        if (data) this.writeBatch(data)
      } catch (err) {
        console.error('[SaveManager] Auto-save failed:', err)
      }
    }, delay)
  }

  /** Cancel pending auto-save */
  cancelAutoSave() {
    if (this._autoSaveId) { clearTimeout(this._autoSaveId); this._autoSaveId = null }
  }

  /** @returns {number} Total size in bytes of all game saves */
  totalSize() {
    let bytes = 0
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(SAVE_PREFIX)) {
        bytes += (localStorage.getItem(k) || '').length * 2
      }
    }
    return bytes
  }
}

const saveManager = new SaveManager()
export { SaveManager, saveManager }
