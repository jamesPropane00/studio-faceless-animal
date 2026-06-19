/**
 * Signal Phone — Notification Manager
 * Handles ringtone, toast notifications, browser notifications, and call alerts.
 */

const RINGTONE_URL = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACAf39/f4B/f3+AgH9/f3+Af39/gIB/f39/gH9/f3+AgH9/f3+Af39/gIB/f39/gH9/f38AgH9/f3+Af39/gIB/f39/gH9/f38AgH9/f3+Af39/gIB/f3+AgH9/f38AgH9/f3+Af39/gIB/f3+Af39/gIB/f3+AgH9/f4CAf39/gH9/gIB/f39/gH9/gICAf39/gH9/gICAf39/gH9/gICAf39/gH9/gICAf39/gH9/gICAf39/gH9/gICAf4B/f4B/f4CAf4B/f3+AgH+Af3+Af3+AgH+Af3+Af3+AgICAeCCAfn+AgH+Af3+Af3+AgH+Af3+Af3+AgH+Af3+Af3+AgICAeCCAfn+AgH+Af3+Af3+AgH+Af3+Af3+Af4BAf3+Af3+AgICAeCCAfn+AgH+Af3+Af3+AgH+Af3+Af3+Af4B/f3+Af3+AgICAeCCAfn+AgH+Af3+Af3+AgH+Af3+Af3+Af4A/f4B/f3+AgICAeCCAfn+AgH+Af3+Af3+AgH+Af3+Af3+Af4B/f3+Af3+AgICAeCCAfn+AgH+Af3+Af3+AgH+Af3+Af3+Af4B/f3+Af3+AgICAuF+Af3+AgH+Af3+Af3+AgH+Af39/gH9/gICAf39/gH9/gICAf39/gH9/gICAf39/gH9/gICAf39/gH9/gICAf39/gH9/gICAv1+Af3+AgH+Af3+Af3+AgH+Af39/gH9/gICAf3+AgH9/f4CAf3+AgH9/f4CAf3+AgH9/f4CAf39/gH9/f4B/f3+Af39/f3+Af39/gH9/f4B/f3+Af39/f4CAf39/gIB/f3+AgH9/f4B/f39/gIB/f3+AgH9/f4B/f39/gH9/f3+Af3+Af39/f3+Af39/gH9/f4B/f39/gH9/f3+Af39/gH9/f4B/f39/gH9/f3+Af39/gH9/f4CAf39/gH9/fwCAf39/gH+Af4B/f39/gH+Af4B/f39/gH+Af4B/f3+Af4B/f3+Af3+Af3+Af3+Af3+Af3+Af3+Af39/f3+Af3+Af3+Af39/f3+Af3+Af39/f3+Af39/gH+Af39/gH+Af39/gH+Af3+Af4B/f3+Af4B/f3+Af4B/f39/gH+Af39/gH+Af39/gH+Af39/gH+Af39/gH+Af39/gH+Af39/gH+Af39/gH+Af39/gH+Af39/gH+Af39/gH+Af39/gH+Af4B/f3+AP4B/f3+AP4B/f39/AH+Af39/gD+Af39/gH9/f4B/f39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+AP4B/f3+Af4B/f3+Af4B/f39/AH+Af39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f3+AP4B/f3+Af4B/f3+Af4B/f3+AP4B/f39/gH9/f4B/f39/gH9/f4A'

class NotificationManager {
  constructor() {
    this._audioCtx = null
    this._ringtoneBuffer = null
    this._ringtoneSource = null
    this._ringtoneGain = null
    this._toastContainer = null
    this._permission = 'default'
    this._toastTimeout = null
    this._initToastContainer()
    this._initAudio()
  }

  _initAudio() {
    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    } catch {
      this._audioCtx = null
    }
  }

  _initToastContainer() {
    if (document.getElementById('sig-toast-container')) return
    const el = document.createElement('div')
    el.id = 'sig-toast-container'
    el.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;display:flex;flex-direction:column;gap:8px;max-width:340px;pointer-events:none'
    document.body.appendChild(el)
    this._toastContainer = el
  }

  requestPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(p => { this._permission = p })
    }
  }

  showToast({ title, message, type = 'info', duration = 4000, onClick }) {
    const colors = {
      info: 'rgba(0,255,65,0.12)',
      call: 'rgba(0,150,255,0.15)',
      error: 'rgba(255,50,50,0.15)',
      message: 'rgba(139,92,246,0.15)',
    }
    const borderColors = {
      info: '#00ff41',
      call: '#0096ff',
      error: '#ff3232',
      message: '#8b5cf6',
    }
    const el = document.createElement('div')
    el.style.cssText = `
      pointer-events:auto;background:${colors[type] || colors.info};
      border:1px solid ${borderColors[type] || borderColors.info};
      border-radius:12px;padding:12px 16px;color:#e0e0e0;font-family:inherit;
      font-size:0.82rem;backdrop-filter:blur(12px);
      transform:translateX(120%);opacity:0;
      transition:transform 0.3s ease,opacity 0.3s ease;cursor:pointer;
      box-shadow:0 4px 20px rgba(0,0,0,0.4)
    `
    el.innerHTML = `<strong style="color:${borderColors[type] || borderColors.info};display:block;margin-bottom:4px;font-size:0.78rem;">${title}</strong><span>${message}</span>`
    if (onClick) el.addEventListener('click', onClick)
    this._toastContainer.appendChild(el)
    requestAnimationFrame(() => {
      el.style.transform = 'translateX(0)'
      el.style.opacity = '1'
    })
    if (duration > 0) {
      setTimeout(() => {
        el.style.transform = 'translateX(120%)'
        el.style.opacity = '0'
        setTimeout(() => el.remove(), 300)
      }, duration)
    }
    return el
  }

  showBrowserNotification({ title, body, tag, onClick }) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    try {
      const n = new Notification(title, { body, tag: tag || 'sig-phone', icon: '/assets/favicon.png' })
      if (onClick) n.onclick = () => { window.focus(); onClick() }
    } catch {}
  }

  startRingtone(loop = true) {
    this.stopRingtone()
    if (!this._audioCtx) return
    try {
      const osc = this._audioCtx.createOscillator()
      const gain = this._audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(440, this._audioCtx.currentTime)
      osc.frequency.setValueAtTime(880, this._audioCtx.currentTime + 0.15)
      osc.frequency.setValueAtTime(440, this._audioCtx.currentTime + 0.3)
      gain.gain.setValueAtTime(0.3, this._audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, this._audioCtx.currentTime + 0.5)
      osc.connect(gain)
      gain.connect(this._audioCtx.destination)
      osc.start()
      osc.stop(this._audioCtx.currentTime + 0.5)
      if (loop) {
        this._ringtoneInterval = setInterval(() => {
          if (this._audioCtx && this._ringtoneInterval) {
            const o = this._audioCtx.createOscillator()
            const g = this._audioCtx.createGain()
            o.type = 'sine'
            o.frequency.setValueAtTime(440, this._audioCtx.currentTime)
            o.frequency.setValueAtTime(880, this._audioCtx.currentTime + 0.15)
            o.frequency.setValueAtTime(440, this._audioCtx.currentTime + 0.3)
            g.gain.setValueAtTime(0.3, this._audioCtx.currentTime)
            g.gain.exponentialRampToValueAtTime(0.01, this._audioCtx.currentTime + 0.5)
            o.connect(g)
            g.connect(this._audioCtx.destination)
            o.start()
            o.stop(this._audioCtx.currentTime + 0.5)
          }
        }, 1000)
      }
    } catch {}
  }

  stopRingtone() {
    if (this._ringtoneInterval) {
      clearInterval(this._ringtoneInterval)
      this._ringtoneInterval = null
    }
  }

  playNotificationSound() {
    if (!this._audioCtx) return
    try {
      const osc = this._audioCtx.createOscillator()
      const gain = this._audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(660, this._audioCtx.currentTime)
      osc.frequency.setValueAtTime(880, this._audioCtx.currentTime + 0.08)
      gain.gain.setValueAtTime(0.2, this._audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, this._audioCtx.currentTime + 0.2)
      osc.connect(gain)
      gain.connect(this._audioCtx.destination)
      osc.start()
      osc.stop(this._audioCtx.currentTime + 0.2)
    } catch {}
  }

  vibrate(pattern) {
    if (navigator.vibrate) {
      navigator.vibrate(pattern || [200, 100, 200])
    }
  }
}

export const notifs = new NotificationManager()
export default NotificationManager
