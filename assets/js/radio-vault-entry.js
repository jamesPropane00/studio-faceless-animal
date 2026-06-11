function readSession() {
  try {
    var session = JSON.parse(localStorage.getItem('fas_user') || 'null')
    return session && session.username ? session : null
  } catch (_) {
    return null
  }
}

function byId(id) {
  return document.getElementById(id)
}

function formatSc(value) {
  var n = Number(value || 0)
  if (!Number.isFinite(n)) return '0 Signal Coin (SC)'
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' Signal Coin (SC)'
}

function setStatus(stateText, dotMode) {
  var statusTextEl = byId('rp-vault-status-text')
  var dotEl = byId('rp-vault-status-dot')
  if (statusTextEl) statusTextEl.textContent = stateText || 'Idle'
  if (!dotEl) return

  dotEl.classList.remove('rp-vault-status-dot--active', 'rp-vault-status-dot--warn')
  if (dotMode === 'active') dotEl.classList.add('rp-vault-status-dot--active')
  if (dotMode === 'warn') dotEl.classList.add('rp-vault-status-dot--warn')
}

async function fetchVaultSnapshot(session) {
  // Force API_BASE to deployed endpoint (never localhost)
  var API_BASE = ''
  var res = await fetch(API_BASE + '/api/member/vault-flow-tick', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: String(session.username || '').toLowerCase(),
      ph: String(session.ph || ''),
    }),
  })

  var data = null
  try {
    data = await res.json()
  } catch (_) {
    data = null
  }

  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.error) || 'Vault route unavailable right now.')
  }

  return data
}

async function initRadioVaultEntry() {
  var veilEl = byId('rp-vault-veil-val')
  var pulseEl = byId('rp-vault-pulse-val')
  var noteEl = byId('rp-vault-note')

  if (!veilEl || !pulseEl || !noteEl) return

  var session = readSession()
  if (!session || !session.username || !session.ph) {
    veilEl.textContent = '--'
    pulseEl.textContent = '--'
    setStatus('Idle', 'warn')
    noteEl.textContent = 'Sign in to load your live Vault snapshot.'
    return
  }

  try {
    var snapshot = await fetchVaultSnapshot(session)
    veilEl.textContent = formatSc(snapshot.credits_balance) // Signal Coin (SC)
    pulseEl.textContent = 'Not exposed yet (Staged)'

    var generated = Number(snapshot.generated || 0)
    var flowRate = Number(snapshot.flow_rate_per_min || 0)
    if (generated > 0.0001 || flowRate > 0) {
      setStatus('Flow Running', 'active')
      noteEl.textContent = 'Flow running. Veil Engine active. Pulse rail is snapshot-only here.'
    } else {
      setStatus('Active', 'active')
      noteEl.textContent = 'Vault active. Open Miner or Wallet for full controls.'
    }
  } catch (err) {
    veilEl.textContent = '--'
    pulseEl.textContent = 'Not exposed yet'
    setStatus('Idle', 'warn')
    noteEl.textContent = String((err && err.message) || 'Could not load Vault snapshot.')
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRadioVaultEntry)
} else {
  initRadioVaultEntry()
}
