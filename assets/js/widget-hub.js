import { initRadioChat } from './radio-chat.js';
import { requestDMConnection } from './dm.js';

const WIDGETS = [
  { id: 'radio', label: 'Radio', icon: 'RD' },
  { id: 'chat', label: 'Chat', icon: 'CH' },
  { id: 'messages', label: 'Messenger', icon: 'DM' },
  { id: 'tv', label: 'TV', icon: 'TV' },
  { id: 'vault', label: 'Vault', icon: 'VT' },
  { id: 'profile', label: 'Profile', icon: 'ME' },
];

let hubEl = null;
let activeWidget = null;
let chatApi = null;

function getSession() {
  try { return JSON.parse(localStorage.getItem('fas_user') || 'null'); } catch { return null; }
}

function maskIconSvg() {
  return `
    <svg viewBox="0 0 64 64" role="img" aria-label="Faceless Animal widgets">
      <path d="M13 22c3-8 10-13 19-13s16 5 19 13l6-6c2-2 5-1 5 2 0 8-4 14-9 17v5c0 11-8 19-21 19S11 51 11 40v-5C6 32 2 26 2 18c0-3 3-4 5-2l6 6Z" fill="#f7f8ff"/>
      <path d="M16 28c4-6 9-9 16-9s12 3 16 9v12c0 9-6 15-16 15s-16-6-16-15V28Z" fill="#080a10"/>
      <path d="M22 34c3-2 6-3 10-3s7 1 10 3c-2 4-5 6-10 6s-8-2-10-6Z" fill="#21f4d0"/>
      <path d="M27 46h10" stroke="#f7f8ff" stroke-width="3" stroke-linecap="round"/>
      <path d="M18 21l-7-8M46 21l7-8" stroke="#8b5cf6" stroke-width="4" stroke-linecap="round"/>
    </svg>`;
}

function createHub() {
  if (document.getElementById('fas-widget-hub')) return;

  hubEl = document.createElement('div');
  hubEl.id = 'fas-widget-hub';
  hubEl.className = 'fas-widget-hub';
  hubEl.innerHTML = `
    <section class="fas-widget-hub__panel" id="fas-widget-hub-panel" aria-label="Widget hub">
      <header class="fas-widget-hub__head">
        <button class="fas-widget-hub__back" type="button" aria-label="Back to all widgets" hidden>&lt;</button>
        <span class="fas-widget-hub__active-icon" aria-hidden="true" hidden>FA</span>
        <div class="fas-widget-hub__title-wrap">
          <p class="fas-widget-hub__eyebrow">Faceless Animal</p>
          <h2 class="fas-widget-hub__title">Widget Hub</h2>
        </div>
        <button class="fas-widget-hub__close" type="button" aria-label="Close widget hub">x</button>
      </header>
      <div class="fas-widget-hub__body"></div>
    </section>
    <button class="fas-widget-hub__toggle" type="button" aria-label="Open widget hub" aria-expanded="false">
      <span class="fas-widget-hub__toggle-icon">${maskIconSvg()}</span>
      <span class="fas-widget-hub__toggle-text">FA</span>
    </button>`;

  document.body.appendChild(hubEl);
  wireHub();
  renderGrid();
}

function wireHub() {
  const toggle = hubEl.querySelector('.fas-widget-hub__toggle');
  const close = hubEl.querySelector('.fas-widget-hub__close');
  const back = hubEl.querySelector('.fas-widget-hub__back');

  toggle.addEventListener('click', () => {
    hubEl.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', hubEl.classList.contains('is-open') ? 'true' : 'false');
  });
  close.addEventListener('click', () => {
    hubEl.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  });
  back.addEventListener('click', renderGrid);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && hubEl.classList.contains('is-open')) {
      hubEl.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}

function setHeader(mode) {
  const back = hubEl.querySelector('.fas-widget-hub__back');
  const activeIcon = hubEl.querySelector('.fas-widget-hub__active-icon');
  const title = hubEl.querySelector('.fas-widget-hub__title');
  const toggleText = hubEl.querySelector('.fas-widget-hub__toggle-text');

  activeWidget = mode && mode.id ? mode : null;
  hubEl.classList.toggle('is-widget', !!activeWidget);
  back.hidden = !activeWidget;
  activeIcon.hidden = !activeWidget;
  activeIcon.textContent = activeWidget ? activeWidget.icon : 'FA';
  title.textContent = activeWidget ? activeWidget.label : 'Widget Hub';
  toggleText.textContent = activeWidget ? activeWidget.icon : 'FA';
}

function bodyEl() {
  return hubEl.querySelector('.fas-widget-hub__body');
}

function renderGrid() {
  setHeader(null);
  bodyEl().innerHTML = `
    <div class="fas-widget-hub__grid">
      ${WIDGETS.map(widget => `
        <button class="fas-widget-hub__tile" type="button" data-widget="${widget.id}" aria-label="Open ${esc(widget.label)} widget">
          <span class="fas-widget-hub__tile-icon" aria-hidden="true">${esc(widget.icon)}</span>
          <span class="fas-widget-hub__tile-label">${esc(widget.label)}</span>
        </button>`).join('')}
    </div>`;

  bodyEl().querySelectorAll('[data-widget]').forEach(btn => {
    btn.addEventListener('click', () => openWidget(btn.dataset.widget));
  });
}

function openWidget(id) {
  const widget = WIDGETS.find(item => item.id === id);
  if (!widget) return;
  setHeader(widget);

  if (id === 'radio') renderRadioWidget();
  if (id === 'chat') renderChatWidget();
  if (id === 'messages') renderMessagesWidget();
  if (id === 'tv') renderTVWidget();
  if (id === 'vault') renderVaultWidget();
  if (id === 'profile') renderProfileWidget();
}

function renderRadioWidget() {
  bodyEl().innerHTML = `
    <div class="fas-widget-pane">
      <div class="fas-widget-pane__hero">
        <p class="fas-widget-pane__label">Radio Controls</p>
        <h3 class="fas-widget-pane__title" id="fas-widget-radio-title">${esc(currentStationLabel())}</h3>
        <p class="fas-widget-pane__text">Control the radio page without leaving the floating hub.</p>
      </div>
      <div class="fas-widget-hub__station-row">
        <button class="fas-widget-hub__station" type="button" data-station="1">Stn 1</button>
        <button class="fas-widget-hub__station" type="button" data-station="2">Stn 2</button>
        <button class="fas-widget-hub__station" type="button" data-station="3">Spotify</button>
        <button class="fas-widget-hub__station" type="button" data-station="4">Stn 4</button>
        <button class="fas-widget-hub__station" type="button" data-station="5">Stn 5</button>
        <button class="fas-widget-hub__station" type="button" data-station="tv">TV</button>
      </div>
      <div class="fas-widget-pane__actions">
        <button class="fas-widget-hub__btn fas-widget-hub__btn--primary" type="button" data-radio-action="play">Play / Pause</button>
        <button class="fas-widget-hub__btn" type="button" data-radio-action="prev">Back</button>
        <button class="fas-widget-hub__btn" type="button" data-radio-action="next">Skip</button>
      </div>
    </div>`;

  bodyEl().querySelectorAll('[data-station]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.querySelector(`.rp-station-btn[data-station="${btn.dataset.station}"]`);
      if (target) target.click();
      updateRadioTitleSoon();
    });
  });
  bodyEl().querySelectorAll('[data-radio-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const map = { play: '#rp-play-pause', prev: '#rp-skip-back', next: '#rp-skip-fwd' };
      const target = document.querySelector(map[btn.dataset.radioAction]);
      if (target) target.click();
      updateRadioTitleSoon();
    });
  });
}

function renderChatWidget() {
  bodyEl().innerHTML = `
    <div class="fas-widget-pane">
      <div class="fas-widget-hub__chat-users" id="fas-widget-chat-users"></div>
      <div class="fas-widget-hub__chat-feed" id="fas-widget-chat-feed" role="log" aria-label="Widget chat"></div>
      <div class="fas-widget-hub__chat-input-row">
        <input class="fas-widget-hub__chat-input" id="fas-widget-chat-input" maxlength="300" placeholder="Type a message..." autocomplete="off" />
        <button class="fas-widget-hub__chat-send" id="fas-widget-chat-send" type="button" aria-label="Send">&gt;</button>
      </div>
    </div>`;

  const feed = bodyEl().querySelector('#fas-widget-chat-feed');
  const origAppend = feed.appendChild.bind(feed);
  feed.appendChild = function(node) {
    const result = origAppend(node);
    feed.scrollTop = feed.scrollHeight;
    return result;
  };

  chatApi = initRadioChat({
    feedEl: feed,
    inputEl: bodyEl().querySelector('#fas-widget-chat-input'),
    sendBtnEl: bodyEl().querySelector('#fas-widget-chat-send'),
    tabEls: null,
    userListEl: bodyEl().querySelector('#fas-widget-chat-users'),
    onUserClick: requestChatConnection,
    initialRoom: 'radio',
    getSession,
    cssPrefix: 'fas-widget',
  });
}

function renderMessagesWidget() {
  const sess = getSession();
  bodyEl().innerHTML = `
    <div class="fas-widget-pane">
      <div class="fas-widget-pane__hero">
        <p class="fas-widget-pane__label">Messenger</p>
        <h3 class="fas-widget-pane__title">${sess && sess.username ? '@' + esc(sess.username) : 'Sign in required'}</h3>
        <p class="fas-widget-pane__text">Connection requests and private messages live in Messenger.</p>
      </div>
      <div class="fas-widget-pane__actions">
        <a class="fas-widget-hub__btn fas-widget-hub__btn--primary" href="messages.html">Open Messenger</a>
        <a class="fas-widget-hub__btn" href="chat.html">Open Global Chat</a>
      </div>
    </div>`;
}

function renderTVWidget() {
  bodyEl().innerHTML = `
    <div class="fas-widget-pane">
      <div class="fas-widget-pane__hero">
        <p class="fas-widget-pane__label">TV</p>
        <h3 class="fas-widget-pane__title">Faceless Animal TV</h3>
        <p class="fas-widget-pane__text">Jump the radio player to the video channel and keep watching.</p>
      </div>
      <div class="fas-widget-pane__actions">
        <button class="fas-widget-hub__btn fas-widget-hub__btn--primary" type="button" id="fas-widget-tv-open">Play TV Here</button>
        <a class="fas-widget-hub__btn" href="tv.html">Open TV Page</a>
      </div>
    </div>`;
  bodyEl().querySelector('#fas-widget-tv-open').addEventListener('click', () => {
    const tvBtn = document.querySelector('.rp-station-btn[data-station="tv"]');
    if (tvBtn) tvBtn.click();
  });
}

function renderVaultWidget() {
  bodyEl().innerHTML = `
    <div class="fas-widget-pane">
      <div class="fas-widget-pane__hero">
        <p class="fas-widget-pane__label">Vault</p>
        <h3 class="fas-widget-pane__title">Signal Credits</h3>
        <p class="fas-widget-pane__text">Open your dashboard vault and member tools.</p>
      </div>
      <div class="fas-widget-pane__actions">
        <a class="fas-widget-hub__btn fas-widget-hub__btn--primary" href="dashboard.html">Open Dashboard</a>
        <a class="fas-widget-hub__btn" href="pricing.html">Membership</a>
      </div>
    </div>`;
}

function renderProfileWidget() {
  const sess = getSession();
  bodyEl().innerHTML = `
    <div class="fas-widget-pane">
      <div class="fas-widget-pane__hero">
        <p class="fas-widget-pane__label">Profile</p>
        <h3 class="fas-widget-pane__title">${sess && sess.username ? '@' + esc(sess.username) : 'Guest'}</h3>
        <p class="fas-widget-pane__text">${sess && sess.username ? 'Your active member session is loaded.' : 'Sign in or pick a handle to unlock member tools.'}</p>
      </div>
      <div class="fas-widget-pane__actions">
        <a class="fas-widget-hub__btn fas-widget-hub__btn--primary" href="${sess && sess.username ? 'dashboard.html' : 'login.html?redirect=radio.html'}">${sess && sess.username ? 'Dashboard' : 'Sign In'}</a>
        <button class="fas-widget-hub__btn" type="button" id="fas-widget-handle">Set Handle</button>
      </div>
    </div>`;
  bodyEl().querySelector('#fas-widget-handle').addEventListener('click', () => {
    const handleBtn = document.getElementById('rp-set-handle-btn');
    if (handleBtn) handleBtn.click();
  });
}

async function requestChatConnection(targetUsername, ctx) {
  const current = getSession();
  const btn = ctx && ctx.button;
  if (!current || !current.username) {
    window.location.href = 'login.html?redirect=radio.html';
    return;
  }
  if (!targetUsername || targetUsername.toLowerCase() === current.username.toLowerCase()) return;
  if (btn) {
    btn.disabled = true;
    btn.classList.add('rp-user-pill--pending');
  }
  const { data, error } = await requestDMConnection(current.username, targetUsername);
  if (btn) btn.disabled = false;
  if (error) {
    window.alert(error);
    if (btn) btn.classList.remove('rp-user-pill--pending');
    return;
  }
  if (data && data.state === 'connected') {
    if (window.confirm('@' + targetUsername + ' is already connected. Open Messenger?')) {
      window.location.href = 'messages.html?to=' + encodeURIComponent(targetUsername);
    }
    return;
  }
  if (btn) btn.classList.add('rp-user-pill--requested');
  window.alert('Connection request sent to @' + targetUsername + '. Messenger unlocks after they accept and trade Signal IDs.');
}

function currentStationLabel() {
  const label = document.getElementById('rp-now-playing');
  if (label && label.textContent.trim()) return label.textContent.trim();
  const active = document.querySelector('.rp-station-btn--active');
  return active ? active.textContent.trim() : 'Radio';
}

function updateRadioTitleSoon() {
  window.setTimeout(() => {
    const title = document.getElementById('fas-widget-radio-title');
    if (title) title.textContent = currentStationLabel();
  }, 120);
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createHub);
} else {
  createHub();
}

export { createHub };
