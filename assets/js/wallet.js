import { getSession } from './member-db.js'

let session = null
let snapshot = {
  credits_balance: 0,
  flow_rate_per_min: 0,
  flow_earned_today: 0,
  daily_cap: 0,
  vault_tier_label: 'Free',
}
let activity = []
let transferBusy = false

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
  if (!Number.isFinite(n)) return '0 SC'
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' SC'
}

function normalizeSignalCode(raw) {
  return String(raw || '').trim().replace(/\s+/g, '').toUpperCase()
}

function isSignalCode(value) {
  return /^SIG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/i.test(String(value || ''))
}

function showGate(isOpen) {
  const gate = qs('wallet-gate')
  const app = qs('wallet-app')
  if (!gate || !app) return
  gate.style.display = isOpen ? '' : 'none'
  app.style.display = isOpen ? 'none' : ''
}

async function postMember(path, payload) {
  // Force API_BASE to deployed endpoint (never localhost)
  const API_BASE = ''
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  let data = null
  try { data = await res.json() } catch { data = null }
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.error) || 'Request failed.')
  }
  return data
}

function applySnapshot(data) {
  if (!data || typeof data !== 'object') return

  if (Object.prototype.hasOwnProperty.call(data, 'credits_balance')) {
    snapshot.credits_balance = Math.max(0, Number(data.credits_balance || 0))
  }
  if (Object.prototype.hasOwnProperty.call(data, 'flow_rate_per_min')) {
    snapshot.flow_rate_per_min = Math.max(0, Number(data.flow_rate_per_min || 0))
  }
  if (Object.prototype.hasOwnProperty.call(data, 'flow_earned_today')) {
    snapshot.flow_earned_today = Math.max(0, Number(data.flow_earned_today || 0))
  }
  if (Object.prototype.hasOwnProperty.call(data, 'daily_cap')) {
    snapshot.daily_cap = data.daily_cap == null ? null : Math.max(0, Number(data.daily_cap || 0))
  }
  if (Object.prototype.hasOwnProperty.call(data, 'vault_tier_label')) {
    snapshot.vault_tier_label = String(data.vault_tier_label || 'Free')
  }
}

function renderTransferPreview() {
  const code = normalizeSignalCode(qs('wallet-transfer-code')?.value)
  const amountRaw = Number(qs('wallet-transfer-amount')?.value || 0)
  const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : 0
  const fee = amount * 0.3
  const receive = Math.max(0, amount - fee)

  const validCode = isSignalCode(code)

  const sendEl = qs('wallet-preview-send')
  const feeEl = qs('wallet-preview-fee')
  const recvEl = qs('wallet-preview-receive')
  const targetEl = qs('wallet-preview-target')
  const btn = qs('wallet-transfer-btn')

  if (sendEl) sendEl.textContent = fmtSc(amount)
  if (feeEl) feeEl.textContent = fmtSc(fee)
  if (recvEl) recvEl.textContent = fmtSc(receive)
  if (targetEl) targetEl.textContent = validCode ? code : 'Signal Code required'

  if (btn) btn.disabled = transferBusy || !validCode || amount <= 0
}

function renderSnapshot() {
  const userEl = qs('wallet-user')
  if (userEl) userEl.textContent = '@' + String(session && session.username || 'guest').toLowerCase()

  const scEl = qs('wallet-sc-balance')
  if (scEl) scEl.textContent = fmtSc(snapshot.credits_balance)

  const tierEl = qs('wallet-veil-tier')
  if (tierEl) tierEl.textContent = String(snapshot.vault_tier_label || 'Free')

  const rateEl = qs('wallet-flow-rate')
  if (rateEl) rateEl.textContent = Number(snapshot.flow_rate_per_min || 0).toFixed(2) + ' SC / min'

  const dailyEl = qs('wallet-daily-progress')
  if (dailyEl) {
    const earned = Number(snapshot.flow_earned_today || 0)
    const cap = Number(snapshot.daily_cap)
    if (Number.isFinite(cap) && cap > 0) {
      dailyEl.textContent = earned.toFixed(2) + ' / ' + cap.toFixed(2) + ' SC'
    } else {
      dailyEl.textContent = earned.toFixed(2) + ' / uncapped'
    }
  }

  const statusEl = qs('wallet-engine-status')
  if (statusEl) {
    const cap = Number(snapshot.daily_cap)
    const earned = Number(snapshot.flow_earned_today || 0)
    statusEl.textContent = Number.isFinite(cap) && cap > 0 && earned >= cap ? 'Cycle Complete' : 'Flow Active'
  }

  renderTrends()
}

function renderActivity() {
  const list = qs('wallet-activity-list')
  if (!list) return

  if (!Array.isArray(activity) || !activity.length) {
    list.innerHTML = ''
      + '<div class="activity-item">'
      + '<p>No activity available right now.</p>'
      + '<small>Transfer/spend history loads from Vault activity route.</small>'
      + '</div>'
    return
  }

  list.innerHTML = activity.map((row) => {
    if (row.kind === 'spend') {
      return ''
        + '<div class="activity-item">'
        + '<p>Vault Spend: ' + escHtml(String(row.spend_type || 'action')) + ' - ' + escHtml(fmtSc(row.spent || 0)) + '</p>'
        + '<small>' + escHtml(new Date(row.created_at).toLocaleString()) + '</small>'
        + '</div>'
    }

    const direction = row.direction === 'sent' ? 'Transfer Out' : 'Transfer In'
    const detail = row.direction === 'sent'
      ? 'Sent ' + fmtSc(row.gross_amount || row.amount || 0) + ' to ' + String(row.counterparty_code || 'target')
      : 'Received ' + fmtSc(row.amount_received || row.amount || 0) + ' from ' + String(row.counterparty_code || 'source')

    const feeText = 'Fee: ' + fmtSc(row.fee || 0)
    const reversed = row.reversed === true
      ? '<small style="color:#ffb965;">Reversed by admin: ' + escHtml(String(row.reversal_reason || 'No reason')) + '</small>'
      : ''

    return ''
      + '<div class="activity-item">'
      + '<p>' + escHtml(direction) + ' - ' + escHtml(detail) + '</p>'
      + '<small>' + escHtml(feeText) + '</small>'
      + reversed
      + '<small>' + escHtml(new Date(row.created_at).toLocaleString()) + '</small>'
      + '</div>'
  }).join('')
}

function renderTrends() {
  const earned = Math.max(0, Number(snapshot.flow_earned_today || 0))
  const cap = Number(snapshot.daily_cap)
  const dailyPct = Number.isFinite(cap) && cap > 0 ? Math.min(100, (earned / cap) * 100) : Math.min(100, earned > 0 ? 100 : 0)

  let out = 0
  let inn = 0
  activity.forEach((row) => {
    if (row.kind !== 'transfer') return
    if (row.direction === 'sent') out += Number(row.gross_amount || row.amount || 0)
    if (row.direction === 'received') inn += Number(row.amount_received || row.amount || 0)
  })

  const maxTransfer = Math.max(out, inn, 1)
  const outPct = Math.min(100, (out / maxTransfer) * 100)
  const inPct = Math.min(100, (inn / maxTransfer) * 100)

  const dailyBar = qs('wallet-trend-daily')
  const outBar = qs('wallet-trend-out')
  const inBar = qs('wallet-trend-in')

  if (dailyBar) dailyBar.style.width = dailyPct.toFixed(1) + '%'
  if (outBar) outBar.style.width = outPct.toFixed(1) + '%'
  if (inBar) inBar.style.width = inPct.toFixed(1) + '%'

  const dailyTxt = qs('wallet-trend-daily-text')
  const outTxt = qs('wallet-trend-out-text')
  const inTxt = qs('wallet-trend-in-text')

  if (dailyTxt) dailyTxt.textContent = dailyPct.toFixed(0) + '%'
  if (outTxt) outTxt.textContent = outPct.toFixed(0) + '%'
  if (inTxt) inTxt.textContent = inPct.toFixed(0) + '%'
}

async function refreshWallet() {
  if (!session || !session.username || !session.ph) return
  const note = qs('wallet-transfer-note-text')

  try {
    const tick = await postMember('/api/member/vault-flow-tick', {
      username: String(session.username || '').toLowerCase(),
      ph: String(session.ph || ''),
    })
    applySnapshot(tick)

    const hist = await postMember('/api/member/vault-activity', {
      username: String(session.username || '').toLowerCase(),
      ph: String(session.ph || ''),
    })
    activity = Array.isArray(hist.activity) ? hist.activity : []

    renderSnapshot()
    renderActivity()
    renderTransferPreview()
    if (note) note.textContent = 'Wallet refreshed from live Vault routes.'
  } catch (err) {
    if (note) note.textContent = String((err && err.message) || 'Wallet refresh failed.')
  }
}

async function submitTransfer() {
  if (transferBusy || !session || !session.username || !session.ph) return

  const codeInput = qs('wallet-transfer-code')
  const amountInput = qs('wallet-transfer-amount')
  const noteInput = qs('wallet-transfer-note')
  const stateEl = qs('wallet-transfer-note-text')

  const recipient = normalizeSignalCode(codeInput && codeInput.value)
  const amount = Number(amountInput && amountInput.value)
  const note = String(noteInput && noteInput.value || '').trim().slice(0, 240)

  if (!isSignalCode(recipient)) {
    if (stateEl) stateEl.textContent = 'Recipient Signal Code is required.'
    return
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    if (stateEl) stateEl.textContent = 'Amount must be greater than zero.'
    return
  }

  transferBusy = true
  renderTransferPreview()
  if (stateEl) stateEl.textContent = 'Submitting transfer...'

  try {
    const data = await postMember('/api/member/vault-transfer', {
      username: String(session.username || '').toLowerCase(),
      ph: String(session.ph || ''),
      recipient_code: recipient,
      send_amount: amount,
      note,
    })

    applySnapshot(data)
    activity = [
      {
        kind: 'transfer',
        direction: 'sent',
        gross_amount: Number(data.transfer && data.transfer.sent || amount),
        fee: Number(data.transfer && data.transfer.fee || 0),
        amount_received: Number(data.transfer && data.transfer.received || 0),
        counterparty_code: String(data.transfer && data.transfer.recipient_code || recipient),
        created_at: new Date().toISOString(),
      },
    ].concat(activity).slice(0, 40)

    if (codeInput) codeInput.value = ''
    if (amountInput) amountInput.value = ''
    if (noteInput) noteInput.value = ''

    renderSnapshot()
    renderActivity()
    renderTransferPreview()

    if (stateEl) stateEl.textContent = 'Transfer sent: ' + fmtSc(data.transfer && data.transfer.sent) + ' to ' + String(data.transfer && data.transfer.recipient_code || recipient)
  } catch (err) {
    if (stateEl) stateEl.textContent = String((err && err.message) || 'Transfer failed.')
  } finally {
    transferBusy = false
    renderTransferPreview()
  }
}

function bindActions() {
  qs('wallet-transfer-code')?.addEventListener('input', renderTransferPreview)
  qs('wallet-transfer-amount')?.addEventListener('input', renderTransferPreview)
  qs('wallet-transfer-note')?.addEventListener('input', renderTransferPreview)
  qs('wallet-transfer-btn')?.addEventListener('click', submitTransfer)
  qs('wallet-refresh-btn')?.addEventListener('click', refreshWallet)
}

async function initWallet() {
  session = getSession()
  if (!session || !session.username || !session.ph) {
    showGate(true)
    return
  }

  showGate(false)
  bindActions()
  renderSnapshot()
  renderActivity()
  renderTransferPreview()
  await refreshWallet()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWallet)
} else {
  initWallet()
}
