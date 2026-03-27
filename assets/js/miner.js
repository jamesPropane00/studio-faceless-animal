const CLAIM_AMOUNT = 60;
const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const claimBtn = document.getElementById("claimSignalBtn");
const balanceEl = document.getElementById("vaultBalance");
const timerEl = document.getElementById("cycleTimer");
const statusEl = document.getElementById("veilEngineStatus");
const feedEl = document.getElementById("liveFeed");

function getBalance() {
  return Number(localStorage.getItem("fas_signal_balance") || "0");
}

function setBalance(value) {
  localStorage.setItem("fas_signal_balance", String(value));
}

function getLastClaimAt() {
  return Number(localStorage.getItem("fas_last_claim_at") || "0");
}

function setLastClaimAt(value) {
  localStorage.setItem("fas_last_claim_at", String(value));
}

function formatDuration(ms) {
  if (ms <= 0) return "READY";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

function addFeedMessage(message) {
  if (!feedEl) return;
  feedEl.innerHTML = `<div>${message}</div>`;
}

function render() {
  const balance = getBalance();
  const lastClaimAt = getLastClaimAt();
  const remaining = (lastClaimAt + CLAIM_COOLDOWN_MS) - Date.now();

  if (balanceEl) balanceEl.textContent = balance;
  if (timerEl) timerEl.textContent = formatDuration(remaining);

  if (statusEl) {
    if (remaining <= 0) {
      statusEl.textContent = "Ready to collect";
      statusEl.classList.remove("status-warn");
      statusEl.classList.add("status-good");
    } else {
      statusEl.textContent = "Cooldown active";
      statusEl.classList.remove("status-good");
      statusEl.classList.add("status-warn");
    }
  }
}

function handleClaimClick() {
  const now = Date.now();
  const lastClaimAt = getLastClaimAt();
  const elapsed = now - lastClaimAt;

  if (elapsed >= CLAIM_COOLDOWN_MS) {
    const newBalance = getBalance() + CLAIM_AMOUNT;
    setBalance(newBalance);
    setLastClaimAt(now);
    addFeedMessage(`+${CLAIM_AMOUNT} SC collected. Redirecting to radio...`);
  } else {
    addFeedMessage("Cooldown active. Redirecting to radio...");
  }

  render();

  setTimeout(() => {
    window.location.href = "radio.html";
  }, 150);
}

if (claimBtn) {
  claimBtn.addEventListener("click", handleClaimClick);
}

render();
setInterval(render, 1000);

window.addEventListener('beforeunload', () => {
  localStorage.removeItem("fas_signal_balance");
  localStorage.removeItem("fas_last_claim_at");
});