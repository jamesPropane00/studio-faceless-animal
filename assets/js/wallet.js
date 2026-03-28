// Wallet.js — Faceless Animal Studios
// Uses localStorage for Signal Coin balance (fas_signal_balance)

function qs(id) {
  return document.getElementById(id)
}

function fmtSc(v) {
  const n = Number(v || 0)
  if (!Number.isFinite(n)) return '0 SC'
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' SC'
}

function updateWalletBalance() {
  const scEl = qs('wallet-sc-balance')
  const raw = localStorage.getItem('fas_signal_balance')
  const balance = parseInt(raw || '0', 10)
  if (scEl) scEl.textContent = fmtSc(balance)
  // Optionally update last refresh time
  const refreshEl = qs('wallet-last-refresh')
  if (refreshEl) refreshEl.textContent = new Date().toLocaleTimeString()
  }

  // Listen for localStorage changes (live update across tabs/windows)
  window.addEventListener('storage', function(event) {
    if (event.key === 'fas_signal_balance') {
      updateWalletBalance();
    }
  });

function initWallet() {
  updateWalletBalance()
  setInterval(updateWalletBalance, 3000)
  // Bind refresh button
  const refreshBtn = qs('wallet-refresh-btn')
  if (refreshBtn) refreshBtn.addEventListener('click', updateWalletBalance)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWallet)
} else {
  initWallet()
}
