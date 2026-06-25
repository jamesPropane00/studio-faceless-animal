// ============================================================
//  Faceless Animal Studios � World account module
//  assets/js/world-account.js
//
//  Owns the in-world account UI:
//    - Account button in the top HUD (next to brand)
//    - Modal with Sign In / Create Account / Sign Out tabs
//    - Wires to assets/js/auth.js for all auth operations
//
//  USAGE:
//    import { mountWorldAccount } from '/assets/js/world-account.js'
//    mountWorldAccount({ state, showToast, fetchPlayerState })
//
//  The state object is the live `state` from world.html.
//  showToast + fetchPlayerState are passed in so this module
//  stays decoupled from world.html internals.
// ============================================================

import { signIn, createAccount, getStoredSession, clearStoredSession } from './auth.js'

const SESSION_KEY = 'fas_user'

// ---- helpers ---------------------------------------------------------

function readSession () {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') } catch (e) { return null }
}

function injectStyles () {
  if (document.getElementById('world-account-styles')) return
  const css = `
    .account-btn{display:inline-flex;align-items:center;gap:0.4rem;background:rgba(18,20,30,0.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--border);border-radius:var(--radius);padding:0.4rem 0.7rem;color:var(--text);font:inherit;font-size:0.72rem;font-weight:600;cursor:pointer;max-width:160px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .account-btn:hover{border-color:rgba(167,139,250,0.45)}
    .account-btn.signed-in{border-color:rgba(74,222,128,0.4)}
    .account-icon{font-size:0.85rem}
    .acct-modal{position:fixed;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px}
    .acct-modal[hidden]{display:none}
    .acct-card{width:min(380px,100%);background:rgba(18,20,30,0.96);border:1px solid var(--border);border-radius:14px;padding:1rem 1.1rem;display:flex;flex-direction:column;gap:0.75rem;max-height:90vh;overflow:auto}
    .acct-head{display:flex;align-items:center;justify-content:space-between;gap:0.5rem;border-bottom:1px solid var(--border);padding-bottom:0.6rem}
    .acct-tabs{display:flex;gap:0.25rem}
    .acct-tab{background:transparent;border:1px solid var(--border);color:var(--dim);font:inherit;font-size:0.72rem;font-weight:600;padding:0.35rem 0.6rem;border-radius:8px;cursor:pointer}
    .acct-tab.active{color:var(--text);background:rgba(167,139,250,0.15);border-color:rgba(167,139,250,0.4)}
    .acct-close{background:transparent;border:0;color:var(--dim);font-size:1.05rem;cursor:pointer;padding:0.2rem 0.4rem}
    .acct-close:hover{color:var(--text)}
    .acct-form{display:flex;flex-direction:column;gap:0.4rem}
    .acct-form[hidden]{display:none}
    .acct-label{font-size:0.65rem;font-weight:700;color:var(--dim);text-transform:uppercase;letter-spacing:0.05em;margin-top:0.25rem}
    .acct-input{background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:8px;padding:0.55rem 0.65rem;color:var(--text);font:inherit;font-size:0.85rem;outline:none}
    .acct-input:focus{border-color:rgba(167,139,250,0.6)}
    .acct-error{font-size:0.7rem;color:#fb7185;min-height:1em;font-weight:600}
    .acct-btn{padding:0.6rem 0.9rem;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--text);font:inherit;font-size:0.8rem;font-weight:700;cursor:pointer}
    .acct-btn:disabled{opacity:0.5;cursor:not-allowed}
    .acct-btn.primary{background:linear-gradient(135deg,#7c3aed,#a78bfa);border-color:transparent;color:#fff}
    .acct-btn.ghost{background:transparent;color:var(--dim);font-size:0.7rem}
    .acct-foot{display:flex;justify-content:center;border-top:1px solid var(--border);padding-top:0.6rem}
  `
  const tag = document.createElement('style')
  tag.id = 'world-account-styles'
  tag.textContent = css
  document.head.appendChild(tag)
}

function injectButton () {
  const btn = document.createElement('button')
  btn.className = 'account-btn'
  btn.id = 'btnAccount'
  btn.type = 'button'
  btn.title = 'Sign in or create an account'
  btn.innerHTML = '<span class="account-icon">\u{1F464}</span><span class="account-name" id="accountName">Guest</span>'
  // Append directly to body with fixed positioning (CSS handles layout)
  document.body.appendChild(btn)
  return btn
}

function injectModal () {
  const wrap = document.createElement('div')
  wrap.className = 'acct-modal'
  wrap.id = 'acctModal'
  wrap.hidden = true
  wrap.innerHTML = `
    <div class="acct-card">
      <div class="acct-head">
        <div class="acct-tabs">
          <button type="button" class="acct-tab active" data-tab="signin">Sign In</button>
          <button type="button" class="acct-tab" data-tab="create">Create Account</button>
        </div>
        <button type="button" class="acct-close" id="acctClose" aria-label="Close">\u2715</button>
      </div>

      <form id="acct-signin-form" class="acct-form" data-tab="signin" novalidate>
        <label class="acct-label">Username or Signal ID</label>
        <input type="text" class="acct-input" id="acct-signin-id" autocomplete="username" spellcheck="false" autocapitalize="none" required />
        <label class="acct-label">Password</label>
        <input type="password" class="acct-input" id="acct-signin-pw" autocomplete="current-password" required />
        <div class="acct-error" id="acct-signin-error" role="alert"></div>
        <button type="submit" class="acct-btn primary" id="acct-signin-btn">Sign In</button>
      </form>

      <form id="acct-create-form" class="acct-form" data-tab="create" hidden novalidate>
        <label class="acct-label">Username (3-40 chars, a-z 0-9 _ -)</label>
        <input type="text" class="acct-input" id="acct-create-username" autocomplete="username" spellcheck="false" autocapitalize="none" required />
        <label class="acct-label">Display name (optional)</label>
        <input type="text" class="acct-input" id="acct-create-display" autocomplete="nickname" maxlength="60" />
        <label class="acct-label">Password (min 8 chars)</label>
        <input type="password" class="acct-input" id="acct-create-pw" autocomplete="new-password" required />
        <div class="acct-error" id="acct-create-error" role="alert"></div>
        <button type="submit" class="acct-btn primary" id="acct-create-btn">Create Account</button>
      </form>

      <div class="acct-foot">
        <button type="button" class="acct-btn ghost" id="acctSignOut">Sign Out</button>
      </div>
    </div>
  `
  document.body.appendChild(wrap)
  return wrap
}

// ---- main mount ------------------------------------------------------

export function mountWorldAccount ({ state, showToast, fetchPlayerState }) {
  if (!state) throw new Error('mountWorldAccount: state is required')
  const toast = typeof showToast === 'function' ? showToast : (t, d) => console.log('[toast]', t, d)
  const refresh = typeof fetchPlayerState === 'function' ? fetchPlayerState : () => {}

  injectStyles()

  if (!document.querySelector('.hud.hud-top')) {
    console.warn('[WORLD] mountWorldAccount: .hud.hud-top not found')
    return
  }
  injectButton()
  injectModal()

  const modal = document.getElementById('acctModal')
  const btn = document.getElementById('btnAccount')

  // -- badge -----------------------------------------------------------
  function updateBadge () {
    const nameEl = document.getElementById('accountName')
    const stored = readSession()
    if (stored && stored.username) {
      nameEl.textContent = stored.display || stored.username
      btn.classList.add('signed-in')
      btn.title = `Signed in as ${stored.username} \u2014 click to manage`
    } else {
      nameEl.textContent = 'Guest'
      btn.classList.remove('signed-in')
      btn.title = 'Sign in or create an account'
    }
  }

  // -- open / close / tab ----------------------------------------------
  function openModal (tab) {
    modal.hidden = false
    setTab(tab || 'signin')
    const first = modal.querySelector('.acct-form:not([hidden]) input')
    if (first) setTimeout(() => first.focus(), 50)
  }
  function closeModal () {
    modal.hidden = true
    document.getElementById('acct-signin-error').textContent = ''
    document.getElementById('acct-create-error').textContent = ''
  }
  function setTab (tab) {
    modal.querySelectorAll('.acct-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab))
    modal.querySelectorAll('.acct-form').forEach(f => { f.hidden = (f.dataset.tab !== tab) })
    document.getElementById('acct-signin-error').textContent = ''
    document.getElementById('acct-create-error').textContent = ''
  }

  // -- apply session to state -----------------------------------------
  function applySessionToState (session) {
    if (!session || !session.username) return
    state.userId = session.account_id || session.username
    state.username = session.display || session.username
    if (state.player) state.player.name = state.username
  }

  // -- sign in ---------------------------------------------------------
  async function handleSignIn (e) {
    e.preventDefault()
    const idEl = document.getElementById('acct-signin-id')
    const pwEl = document.getElementById('acct-signin-pw')
    const btnS = document.getElementById('acct-signin-btn')
    const errEl = document.getElementById('acct-signin-error')
    errEl.textContent = ''
    btnS.disabled = true
    try {
      const { success, error, session } = await signIn(idEl.value.trim(), pwEl.value)
      if (!success) { errEl.textContent = error || 'Sign-in failed.'; return }
      applySessionToState(session)
      await refresh()
      updateBadge()
      closeModal()
      toast('Signed In', `Welcome back, ${state.username}`)
    } catch (err) {
      console.error('[WORLD] signIn exception:', err)
      errEl.textContent = (err && err.message) || 'Sign-in failed.'
    } finally {
      btnS.disabled = false
    }
  }

  // -- create ----------------------------------------------------------
  async function handleCreate (e) {
    e.preventDefault()
    const uEl = document.getElementById('acct-create-username')
    const dEl = document.getElementById('acct-create-display')
    const pEl = document.getElementById('acct-create-pw')
    const btnC = document.getElementById('acct-create-btn')
    const errEl = document.getElementById('acct-create-error')
    errEl.textContent = ''
    btnC.disabled = true
    try {
      const username = uEl.value.trim().toLowerCase()
      const display = dEl.value.trim() || username
      const { success, error, session } = await createAccount(username, pEl.value, display)
      if (!success) { errEl.textContent = error || 'Account creation failed.'; return }
      applySessionToState(session)
      await refresh()
      updateBadge()
      closeModal()
      toast('Account Created', `Welcome, ${state.username}`)
    } catch (err) {
      console.error('[WORLD] createAccount exception:', err)
      errEl.textContent = (err && err.message) || 'Account creation failed.'
    } finally {
      btnC.disabled = false
    }
  }

  // -- sign out --------------------------------------------------------
  function handleSignOut () {
    clearStoredSession()
    state.userId = 'local_' + Math.random().toString(36).slice(2, 8)
    state.username = 'guest_' + state.userId.slice(6)
    if (state.player) state.player.name = state.username
    refresh()
    updateBadge()
    closeModal()
    toast('Signed Out', 'You are now playing as a guest.')
  }

  // -- wire ------------------------------------------------------------
  btn.addEventListener('click', () => openModal('signin'))
  modal.querySelector('#acctClose').addEventListener('click', closeModal)
  modal.querySelectorAll('.acct-tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)))
  modal.querySelector('#acct-signin-form').addEventListener('submit', handleSignIn)
  modal.querySelector('#acct-create-form').addEventListener('submit', handleCreate)
  modal.querySelector('#acctSignOut').addEventListener('click', handleSignOut)
  modal.addEventListener('click', (e) => { if (e.target.id === 'acctModal') closeModal() })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal() })
  window.addEventListener('storage', (e) => { if (e.key === SESSION_KEY) updateBadge() })

  // initial hydration from stored session
  const existing = getStoredSession()
  if (existing && existing.username) applySessionToState(existing)
  updateBadge()
}
