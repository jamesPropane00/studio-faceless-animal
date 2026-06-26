/**
 * NotificationSystem
 *
 * Manages toast-style notifications: messages that appear temporarily
 * and auto-dismiss. Supports types (info, success, warning, error),
 * duration, stacking, and actions.
 *
 * Integration:
 *   engine.registerSystem('notifications', notificationSystem, 210)
 *   Any system can emit notifications via the event bus.
 *
 * TODO:
 *   - Add notification queue and stacking
 *   - Add notification types and colors
 *   - Add auto-dismiss with configurable duration
 *   - Add click-to-dismiss
 *   - Add action buttons on notifications
 *   - Add notification history
 *   - Add priority system (urgent, normal, low)
 *   - Add mobile swipe-to-dismiss
 *   - Add notification sound effects
 *
 * Event hooks:
 *   'notificationAdded'   — { id, message, type }
 *   'notificationDismissed' — { id, reason }
 *   'notificationAction'  — { id, action }
 */

const NOTIFICATION_TYPES = { INFO: 'info', SUCCESS: 'success', WARNING: 'warning', ERROR: 'error' }

class Notification {
  /**
   * @param {string} message
   * @param {string} [type='info']
   * @param {number} [duration=3000]
   * @param {Function} [onClick]
   */
  constructor(message, type = 'info', duration = 3000, onClick = null) {
    this.id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    this.message = message
    this.type = type
    this.duration = duration
    this.onClick = onClick
    this.createdAt = Date.now()
    this.dismissed = false
  }
}

class NotificationSystem {
  constructor() {
    /** @type {Notification[]} */
    this._notifications = []
    this._maxVisible = 5
    this._enabled = true
  }

  /**
   * Add a notification.
   * @param {string} message
   * @param {string} [type='info']
   * @param {number} [duration=3000]
   * @param {Function} [onClick]
   * @returns {Notification}
   */
  add(message, type = 'info', duration = 3000, onClick = null) {
    const n = new Notification(message, type, duration, onClick)
    this._notifications.push(n)
    return n
  }

  /**
   * Dismiss a notification.
   * @param {string} id
   */
  dismiss(id) {
    const n = this._notifications.find(n => n.id === id)
    if (n) n.dismissed = true
  }

  /** Get active (undismissed) notifications. */
  getActive() {
    return this._notifications.filter(n => !n.dismissed)
  }

  /**
   * Update notifications. Called each frame.
   * Auto-dismisses expired notifications.
   */
  update() {
    const now = Date.now()
    this._notifications = this._notifications.filter(n => {
      if (n.dismissed) return false
      if (now - n.createdAt > n.duration) return false
      return true
    })
  }

  /** Clear all notifications. */
  clear() { this._notifications = [] }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { NotificationSystem, NOTIFICATION_TYPES }
