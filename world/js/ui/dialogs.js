// DialogSystem — simple confirm/alert/prompt dialogs.
// Uses overlay element if available, otherwise fallback to window methods.

class DialogSystem {
  constructor() {
    this.overlay = document.getElementById('overlay')
  }

  alert(message, title = '') {
    return new Promise(resolve => {
      if (!this.overlay) { window.alert(message); return resolve() }
      const contentEl = document.getElementById('overlay-content')
      if (contentEl) {
        contentEl.innerHTML = `<div style="background:#1e1e2e;padding:24px;border-radius:12px;max-width:400px">
          ${title ? `<h3 style="margin:0 0 12px;color:#a78bfa">${title}</h3>` : ''}
          <p style="margin:0 0 16px;color:#ccc">${message}</p>
          <button id="dialog-ok" style="background:#6366f1;color:#fff;border:none;padding:8px 24px;border-radius:8px;cursor:pointer">OK</button>
        </div>`
      }
      this.overlay.style.display = 'flex'
      document.getElementById('dialog-ok')?.addEventListener('click', () => {
        this.overlay.style.display = 'none'
        resolve()
      })
    })
  }

  confirm(message, title = '') {
    return new Promise(resolve => {
      if (!this.overlay) { return resolve(window.confirm(message)) }
      const contentEl = document.getElementById('overlay-content')
      if (contentEl) {
        contentEl.innerHTML = `<div style="background:#1e1e2e;padding:24px;border-radius:12px;max-width:400px">
          ${title ? `<h3 style="margin:0 0 12px;color:#a78bfa">${title}</h3>` : ''}
          <p style="margin:0 0 16px;color:#ccc">${message}</p>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button id="dialog-yes" style="background:#22c55e;color:#fff;border:none;padding:8px 24px;border-radius:8px;cursor:pointer">Yes</button>
            <button id="dialog-no" style="background:#6b7280;color:#fff;border:none;padding:8px 24px;border-radius:8px;cursor:pointer">No</button>
          </div>
        </div>`
      }
      this.overlay.style.display = 'flex'
      document.getElementById('dialog-yes')?.addEventListener('click', () => { this.overlay.style.display = 'none'; resolve(true) })
      document.getElementById('dialog-no')?.addEventListener('click', () => { this.overlay.style.display = 'none'; resolve(false) })
    })
  }
}

const dialogs = new DialogSystem()
export { dialogs, DialogSystem }
