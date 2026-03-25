// Pulse Coin Frontend Integration
// All balance and transaction data comes from backend APIs only.

const pulseApi = {
  async getBalance() {
    try {
      const res = await fetch('/api/pulse/balance', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load balance');
      return data;
    } catch (err) {
      throw new Error(err.message || 'Network error');
    }
  },

  async deposit(amount) {
    try {
      const body = Number.isInteger(amount)
        ? { amount_cents: amount }
        : { amount_usd: Number(amount) };
      const res = await fetch('/api/pulse/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Deposit failed');
      return data;
    } catch (err) {
      throw new Error(err.message || 'Network error');
    }
  },

  async transfer(recipientId, amount) {
    try {
      const body = {
        recipient_id: recipientId,
        ...(Number.isInteger(amount)
          ? { amount_cents: amount }
          : { amount_usd: Number(amount) }),
      };
      const res = await fetch('/api/pulse/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Transfer failed');
      return data;
    } catch (err) {
      throw new Error(err.message || 'Network error');
    }
  },

  async withdraw(amount) {
    try {
      const body = Number.isInteger(amount)
        ? { amount_cents: amount }
        : { amount_usd: Number(amount) };
      const res = await fetch('/api/pulse/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Withdraw failed');
      return data;
    } catch (err) {
      throw new Error(err.message || 'Network error');
    }
  },
};

// UI Bindings and State

async function loadPulseBalance() {
  const el = document.getElementById('pulseBalance');
  if (el) el.textContent = '...';
  try {
    const data = await pulseApi.getBalance();
    if (el) el.textContent = data.pulse_balance !== undefined
      ? Number(data.pulse_balance).toFixed(2)
      : '0.00';
  } catch (err) {
    if (el) el.textContent = 'Error';
    showPulseMessage(err.message, true);
  }
}

function showPulseMessage(msg, isError = false) {
  let el = document.getElementById('pulseStatus');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pulseStatus';
    el.style.marginTop = '8px';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.color = isError ? 'red' : 'green';
  setTimeout(() => { el.textContent = ''; }, 4000);
}

function getPulseAmountInput() {
  const input = document.getElementById('pulseAmountInput');
  if (!input) return null;
  const val = input.value.trim();
  if (!val) return null;
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function getPulseRecipientInput() {
  const input = document.getElementById('pulseRecipientInput');
  if (!input) return null;
  return input.value.trim();
}

// Event Handlers

async function handleDepositPulse() {
  const amount = getPulseAmountInput();
  if (!amount) return showPulseMessage('Enter a valid amount.', true);
  try {
    showPulseMessage('Depositing...');
    await pulseApi.deposit(amount);
    showPulseMessage('Deposit successful.');
    await loadPulseBalance();
  } catch (err) {
    showPulseMessage(err.message, true);
  }
}

async function handleTransferPulse() {
  const amount = getPulseAmountInput();
  const recipientId = getPulseRecipientInput();
  if (!amount) return showPulseMessage('Enter a valid amount.', true);
  if (!recipientId) return showPulseMessage('Enter a recipient ID.', true);
  try {
    showPulseMessage('Transferring...');
    await pulseApi.transfer(recipientId, amount);
    showPulseMessage('Transfer successful.');
    await loadPulseBalance();
  } catch (err) {
    showPulseMessage(err.message, true);
  }
}

async function handleWithdrawPulse() {
  const amount = getPulseAmountInput();
  if (!amount) return showPulseMessage('Enter a valid amount.', true);
  try {
    showPulseMessage('Withdrawing...');
    await pulseApi.withdraw(amount);
    showPulseMessage('Withdrawal requested.');
    await loadPulseBalance();
  } catch (err) {
    showPulseMessage(err.message, true);
  }
}

// Bind UI Events (call once on page load)
function bindPulseUiEvents() {
  const depositBtn = document.getElementById('depositBtn');
  if (depositBtn) depositBtn.addEventListener('click', handleDepositPulse);

  const transferBtn = document.getElementById('transferBtn');
  if (transferBtn) transferBtn.addEventListener('click', handleTransferPulse);

  const withdrawBtn = document.getElementById('withdrawBtn');
  if (withdrawBtn) withdrawBtn.addEventListener('click', handleWithdrawPulse);
}

// On page load
export function initPulseUI() {
  bindPulseUiEvents();
  loadPulseBalance();
}

document.addEventListener('DOMContentLoaded', initPulseUI);
