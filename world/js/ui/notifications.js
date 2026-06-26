// NotificationSystem — in-game notifications.
// Legacy: showNotification(), state.notifications
// Legacy DOM ID: #notification-container

class NotificationSystem {
  constructor() {
    this.container = null
    this._timeouts = new Map()
  }

  init() {
    this.container = document.getElementById('notification-container')
    if (!this.container) {
      this.container = document.createElement('div')
      this.container.id = 'notification-container'
      this.container.style.cssText = 'position:fixed;top:60px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none'
      document.body.appendChild(this.container)
    }
  }

  show(message, type = 'info', duration = 3000) {
    if (!this.container) this.init()
    const el = document.createElement('div')
    el.style.cssText = `padding:8px 16px;border-radius:8px;background:${
      type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : type === 'warning' ? '#f59e0b' : '#6366f1'
    };color:#fff;font-size:14px;opacity:0;transform:translateX(20px);transition:all 0.3s`
    el.textContent = message
    this.container.appendChild(el)
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateX(0)' })
    const tid = setTimeout(() => {
      el.style.opacity = '0'; el.style.transform = 'translateX(20px)'
      setTimeout(() => el.remove(), 300)
    }, duration)
    this._timeouts.set(el, tid)
    return el
  }

  success(msg, dur = 3000) { return this.show(msg, 'success', dur) }
  error(msg, dur = 4000) { return this.show(msg, 'error', dur) }
  warning(msg, dur = 3500) { return this.show(msg, 'warning', dur) }
  info(msg, dur = 3000) { return this.show(msg, 'info', dur) }
}

const notifications = new NotificationSystem()
export { notifications, NotificationSystem }
