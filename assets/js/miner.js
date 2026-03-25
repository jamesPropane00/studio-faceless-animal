import { getSession } from './member-db.js'

const FLOW_TICK_INTERVAL_MS = 15000

let session = null
let vaultSnapshot = {
  credits_balance: 0,
  flow_rate_per_min: 0,
  flow_earned_today: 0,
  daily_cap: 0,
  vault_tier_label: 'Free',
  ticked_at: '',
}
let feed = []
let flowTimer = null
let nextTickAt = 0
let pulseEngineOnline = false

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function qs(id) {
  return document.getElementById(id)
}

function fmtSc(v) {
  const n = Number(v || 0)
  if (!Number.isFinite(n)) return '0 Signal Coin (SC)'
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' Signal Coin (SC)'
}

function fmtRate(v) {
  const n = Number(v || 0)
  if (!Number.isFinite(n)) return '0.00 SC / min'
  return n.toFixed(2) + ' SC / min'
}

function nowStamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function pushFeed(text, level) {
  feed.unshift({ text: String(text || ''), ts: new Date().toISOString(), level: level || 'normal' })
  feed = feed.slice(0, 24)
  renderFeed()
}

function renderFeed() {
  const list = qs('miner-feed')
  if (!list) return
  if (!feed.length) {
    list.innerHTML = '<div class="feed-item"><p>No flow events yet.</p><small>now</small></div>'
    return
  }

  list.innerHTML = feed.map((row) => {
    const color = row.level === 'ok'
      ? 'status-good'
      : row.level === 'warn'
        ? 'status-warn'
        : row.level === 'bad'
          ? 'status-bad'
          : 'status-hot'

    return ''
      + '<div class="feed-item">'
      + '<p class="' + color + '">' + escHtml(row.text) + '</p>'
      + '<small>' + escHtml(new Date(row.ts).toLocaleString()) + '</small>'
      + '</div>'
  }).join('')
}

function readEngineStatus() {
  const now = Date.now()
  const tickedAt = Date.parse(String(vaultSnapshot.ticked_at || '')) || 0
  const elapsed = tickedAt ? now - tickedAt : Number.POSITIVE_INFINITY

  const cap = Number(vaultSnapshot.daily_cap)
  const earned = Number(vaultSnapshot.flow_earned_today || 0)
  if (Number.isFinite(cap) && cap > 0 && earned >= cap) {
    return { label: 'Cycle Complete', cls: 'status-good' }
  }

  if (elapsed <= FLOW_TICK_INTERVAL_MS * 1.3) {
    return { label: 'Flow Active', cls: 'status-good' }
  }

  if (elapsed <= FLOW_TICK_INTERVAL_MS * 3) {
    return { label: 'Cooling Down', cls: 'status-warn' }
  }

  return { label: 'Idle', cls: 'status-hot' }
}

function timeToUtcMidnight() {
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0))
  const delta = Math.max(0, end.getTime() - now.getTime())
  const h = Math.floor(delta / 3600000)
  const m = Math.floor((delta % 3600000) / 60000)
  const s = Math.floor((delta % 60000) / 1000)
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
}

function nextCycleCountdown() {
  const delta = Math.max(0, nextTickAt - Date.now())
  const sec = Math.floor(delta / 1000)
  const mm = Math.floor(sec / 60)
  const ss = sec % 60
  return String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
}

function renderSnapshot() {
  const status = readEngineStatus()

  const stateEl = qs('miner-veil-engine-state')
  if (stateEl) {
    stateEl.textContent = status.label
    stateEl.className = status.cls
  }

  const pulseEl = qs('miner-pulse-engine-state')
  if (pulseEl) {
    pulseEl.textContent = pulseEngineOnline ? 'Pulse Stream Online (Staged)' : 'Staged'
    pulseEl.className = pulseEngineOnline ? 'status-good' : 'status-warn'
  }

  const userEl = qs('miner-user')
  if (userEl) userEl.textContent = '@' + String(session && session.username || 'guest').toLowerCase()

  const balanceEl = qs('miner-sc-balance')
  if (balanceEl) balanceEl.textContent = fmtSc(vaultSnapshot.credits_balance) // Signal Coin (SC)

  const veilLayerEl = qs('miner-veil-layer')
  if (veilLayerEl) veilLayerEl.textContent = String(vaultSnapshot.vault_tier_label || 'Free') // Veil is a tier/layer, not a balance

  const flowEl = qs('miner-flow-rate')
  if (flowEl) flowEl.textContent = fmtRate(vaultSnapshot.flow_rate_per_min)

  const dailyEl = qs('miner-daily-cap')
  if (dailyEl) {
    const cap = Number(vaultSnapshot.daily_cap)
    const earned = Number(vaultSnapshot.flow_earned_today || 0)
    if (Number.isFinite(cap) && cap > 0) {
      dailyEl.textContent = earned.toFixed(2) + ' / ' + cap.toFixed(2) + ' SC'
    } else {
      dailyEl.textContent = earned.toFixed(2) + ' / uncapped'
    }
  }

  const resetEl = qs('miner-reset-timer')
  if (resetEl) resetEl.textContent = timeToUtcMidnight()

  const cycleEl = qs('miner-cycle-timer')
  if (cycleEl) cycleEl.textContent = nextCycleCountdown()

  const liveTag = qs('miner-live-tag')
  if (liveTag) liveTag.textContent = status.label === 'Flow Active' ? 'Online' : 'Standby'
}

async function postMember(path, payload) {
  // Force API_BASE to deployed endpoint (never localhost)
  const API_BASE = '';
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const status = res.status;
  const raw = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  console.log('[miner] postMember', { path, status, raw, parsed });
  if (!res.ok || !parsed || parsed.ok !== true) {
    throw new Error(`API ${path} failed (status ${status}): ${(parsed && parsed.error) || raw || 'Unknown error'}`);
  }
  return parsed;
}

function applySnapshot(data) {
  if (!data || typeof data !== 'object') return

  if (Object.prototype.hasOwnProperty.call(data, 'credits_balance')) {
    vaultSnapshot.credits_balance = Math.max(0, Number(data.credits_balance || 0))
  }
  if (Object.prototype.hasOwnProperty.call(data, 'flow_rate_per_min')) {
    vaultSnapshot.flow_rate_per_min = Math.max(0, Number(data.flow_rate_per_min || 0))
  }
  if (Object.prototype.hasOwnProperty.call(data, 'flow_earned_today')) {
    vaultSnapshot.flow_earned_today = Math.max(0, Number(data.flow_earned_today || 0))
  }
  if (Object.prototype.hasOwnProperty.call(data, 'daily_cap')) {
    vaultSnapshot.daily_cap = data.daily_cap == null ? null : Math.max(0, Number(data.daily_cap || 0))
  }
    if (Object.prototype.hasOwnProperty.call(data, 'vault_tier_label')) {
      vaultSnapshot.vault_tier_label = String(data.vault_tier_label || 'Free');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'veil_level')) {
      vaultSnapshot.veil_level = Number(data.veil_level || 0);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'veil_label')) {
      vaultSnapshot.veil_label = String(data.veil_label || '');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'veil_multiplier')) {
      vaultSnapshot.veil_multiplier = Number(data.veil_multiplier || 1);
    }
  if (Object.prototype.hasOwnProperty.call(data, 'ticked_at')) {
    vaultSnapshot.ticked_at = String(data.ticked_at || '')
  }
}

async function tickFlow(reason) {
  if (!session || !session.username || !session.ph) return

  const note = qs('miner-note')
  try {
    const data = await postMember('/api/member/vault-flow-tick', {
      username: String(session.username || '').toLowerCase(),
      ph: String(session.ph || ''),
    })
    applySnapshot(data)
    renderSnapshot()
    nextTickAt = Date.now() + FLOW_TICK_INTERVAL_MS
    if (note) note.textContent = reason || 'Flow Active. Reactor synced.'
    pushFeed('Veil Engine tick complete. ' + fmtSc(data.generated || 0) + ' generated.', 'ok')
  } catch (err) {
    nextTickAt = Date.now() + 5000;
    if (note) note.textContent = String((err && err.message) || 'Flow tick failed.');
    pushFeed('Veil Engine tick failed: ' + String((err && err.message) || 'Unknown error'), 'bad');
  }
}

async function loadActivitySummary() {
  if (!session || !session.username || !session.ph) return
  try {
    const data = await postMember('/api/member/vault-activity', {
      username: String(session.username || '').toLowerCase(),
      ph: String(session.ph || ''),
    })
    const rows = Array.isArray(data.activity) ? data.activity.slice(0, 6) : []
    rows.reverse().forEach((row) => {
      if (row.kind === 'spend') {
        pushFeed('Vault spend: ' + String(row.spend_type || 'action') + ' for ' + fmtSc(row.spent || 0), 'warn')
      } else {
        const dir = row.direction === 'sent' ? 'Sent' : 'Received'
        pushFeed(dir + ' transfer ' + fmtSc(row.amount || 0) + ' with ' + String(row.counterparty_code || 'counterparty'), 'normal')
      }
    })
  } catch {
    pushFeed('Activity relay unavailable right now.', 'warn')
  }
}

function bindActions() {
  qs('miner-start-veil')?.addEventListener('click', () => {
    tickFlow('Veil Engine ignition accepted. Flow cycle engaged.')
  })

  qs('miner-refresh')?.addEventListener('click', () => {
    tickFlow('Reactor refreshed. Vault link validated.')
  })

  qs('miner-start-pulse')?.addEventListener('click', () => {
    pulseEngineOnline = !pulseEngineOnline
    renderSnapshot()
    const note = qs('miner-note')
    if (pulseEngineOnline) {
      if (note) note.textContent = 'Pulse Stream Online in staged mode. No pulse balance endpoint is active yet.'
      pushFeed('Pulse Engine toggled to staged online mode.', 'warn')
    } else {
      if (note) note.textContent = 'Pulse Stream returned to staged standby.'
      pushFeed('Pulse Engine set to standby.', 'normal')
    }
  })
}

function bootTicker() {
  if (flowTimer) clearInterval(flowTimer)
  flowTimer = setInterval(() => {
    renderSnapshot()
  }, 1000)

  setInterval(() => {
    if (!session || !session.username || !session.ph) return
    if (Date.now() >= nextTickAt) {
      tickFlow('Auto flow cycle complete. Reactor steady.')
    }
  }, 1000)
}

function showGate(isOpen) {
  const gate = qs('miner-gate')
  const app = qs('miner-app')
  if (!gate || !app) return
  gate.style.display = isOpen ? '' : 'none'
  app.style.display = isOpen ? 'none' : ''
}

async function initMiner() {
  session = getSession()
  if (!session || !session.username || !session.ph) {
    showGate(true)
    return
  }

  showGate(false)
  bindActions()
  bootTicker()
  renderFeed()
  renderSnapshot()

  pushFeed('Vault Link Established for @' + String(session.username).toLowerCase() + '.', 'ok')
  await tickFlow('Signal Reactor online. Initial flow tick complete.')
  await loadActivitySummary()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMiner)
} else {
  initMiner()
}
