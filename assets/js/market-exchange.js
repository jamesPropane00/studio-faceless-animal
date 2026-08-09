const $ = (selector) => document.querySelector(selector);
const applicationForm = $('#seller-application-form');
const sellForm = $('#sell-item-form');
const requestForm = $('#buyer-request-form');
const sellerStatus = $('#seller-account-status');
const sellerSignin = $('#seller-signin');
const sellerLocked = $('#seller-locked');
const requestSignin = $('#request-signin');

function currentSession() {
  try {
    const session = JSON.parse(localStorage.getItem('fas_user') || localStorage.getItem('fas_member') || 'null');
    return session?.username && session?.ph ? session : null;
  } catch {
    return null;
  }
}

const session = currentSession();

function show(element, visible) {
  element?.classList.toggle('market-hidden', !visible);
}

function message(form, text, success = false) {
  const output = form.querySelector('.exchange-message');
  output.textContent = text;
  output.classList.toggle('is-success', success);
  output.classList.toggle('is-error', !success && Boolean(text));
}

async function responseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The Market could not process that request.');
  return data;
}

function authenticatedFormData(form, type) {
  if (!session) throw new Error('Sign in with your Faceless Animal account first.');
  const data = new FormData(form);
  data.set('type', type);
  data.set('submitted_by_username', session.username);
  data.set('session_hash', session.ph);
  return data;
}

async function submitForm(form, type) {
  if (!form.reportValidity()) return;
  const button = form.querySelector('button[type="submit"],button:not([type])');
  button.disabled = true;
  message(form, 'Saving securely…');
  try {
    const response = await fetch('/api/market/intake', {
      method: 'POST',
      body: authenticatedFormData(form, type),
      credentials: 'same-origin',
    });
    const result = await responseJson(response);
    message(form, `${result.message} Reference: ${result.reference}`, true);
    if (type !== 'seller_application') form.reset();
    if (type === 'seller_application') await loadSellerStatus();
  } catch (error) {
    message(form, error.message);
  } finally {
    button.disabled = false;
  }
}

function renderSeller(seller) {
  sellerStatus.className = 'account-status';
  show(sellerSignin, false);
  show(applicationForm, false);
  show(sellerLocked, false);
  show(sellForm, false);
  if (!seller) {
    sellerStatus.textContent = 'No seller application yet';
    sellerStatus.classList.add('is-warning');
    show(applicationForm, true);
    return;
  }
  const label = `${seller.seller_code} · ${seller.status}`;
  sellerStatus.textContent = label;
  if (seller.status === 'approved') {
    show(sellForm, true);
    return;
  }
  sellerStatus.classList.add(seller.status === 'rejected' || seller.status === 'suspended' ? 'is-error' : 'is-warning');
  sellerLocked.textContent = seller.status === 'pending'
    ? 'Your seller application is awaiting administrator review. You cannot submit items yet.'
    : seller.status === 'rejected'
      ? `Your application needs changes before approval.${seller.review_notes ? ` Reviewer note: ${seller.review_notes}` : ''}`
      : seller.status === 'suspended'
        ? 'This seller account is suspended. Contact Market support before submitting items.'
        : 'This seller account is not currently allowed to submit items.';
  show(sellerLocked, true);
  if (seller.status === 'rejected') show(applicationForm, true);
}

async function loadSellerStatus() {
  if (!session) {
    sellerStatus.textContent = 'Sign in required';
    sellerStatus.className = 'account-status is-warning';
    show(sellerSignin, true);
    show(applicationForm, false);
    show(sellerLocked, false);
    show(sellForm, false);
    show(requestSignin, true);
    show(requestForm, false);
    return;
  }
  show(requestSignin, false);
  show(requestForm, true);
  try {
    const response = await fetch('/api/market/account', {
      headers: {
        'X-FAS-Username': session.username,
        Authorization: `Bearer ${session.ph}`,
      },
      credentials: 'same-origin',
    });
    const result = await responseJson(response);
    renderSeller(result.seller);
  } catch (error) {
    sellerStatus.textContent = error.message;
    sellerStatus.className = 'account-status is-error';
    show(applicationForm, false);
    show(sellForm, false);
    show(sellerLocked, true);
    sellerLocked.textContent = 'Seller onboarding is unavailable until the Market database setup is completed.';
  }
}

const adultCutoff = new Date();
adultCutoff.setFullYear(adultCutoff.getFullYear() - 18);
const birthInput = applicationForm.querySelector('[name="date_of_birth"]');
birthInput.max = adultCutoff.toISOString().slice(0, 10);

applicationForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitForm(applicationForm, 'seller_application');
});
sellForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const photos = sellForm.elements.photos.files;
  if (photos.length < 1 || photos.length > 5) return message(sellForm, 'Choose between 1 and 5 photos.');
  const total = [...photos].reduce((sum, file) => sum + file.size, 0);
  if ([...photos].some((file) => file.size > 8 * 1024 * 1024) || total > 25 * 1024 * 1024) {
    return message(sellForm, 'Each photo must be 8 MB or less and the combined upload must be 25 MB or less.');
  }
  submitForm(sellForm, 'sell');
});
requestForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitForm(requestForm, 'request');
});

loadSellerStatus();
