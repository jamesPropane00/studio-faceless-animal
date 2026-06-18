/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — RADIO MATRIX CHAT
 *  assets/js/radio-chat.js
 *
 *  Provides Matrix-powered live chat for the radio page using
 *  the same Matrix account as chat.html (Signal Rooms).
 *
 *  USAGE:
 *    import { initRadioChat } from '/assets/js/radio-chat.js'
 *
 *    initRadioChat({
 *      feedEl:       document.getElementById('rp-chat-feed'),
 *      inputEl:      document.getElementById('rp-chat-input'),
 *      sendBtnEl:    document.getElementById('rp-send-btn'),
 *      tabEls:       document.querySelectorAll('.rp-room-tab'),
 *      activeCountEl: document.getElementById('rp-active-count-num'),
 *      listenerNumEl: document.getElementById('rp-listener-num'),
 *      pillNumEl:     document.getElementById('rp-listener-pill-num'),
 *      initialRoom:  'radio',
 *      getSession:   () => JSON.parse(localStorage.getItem('fas_user') || 'null'),
 *    })
 * ============================================================
 */

const MATRIX_BASE = 'https://matrix.org';
const MATRIX_SESSION_KEY = 'fas_matrix_session';
const HISTORY_LIMIT = 40;
const MAX_MSG_LEN = 300;
const SEND_DEBOUNCE = 1200;

// Character avatar pool — actual files from Faceless Animal Studios/Characters/
const CHAR_IMAGES = [
  'Faceless%20Animal%20Studios/Characters/file_00000000020471f5bfd56238a2c55242.png',
  'Faceless%20Animal%20Studios/Characters/file_00000000065071f58f80b8ccb3997a9a.png',
  'Faceless%20Animal%20Studios/Characters/file_000000001200720ca655cd8473ef2541.png',
  'Faceless%20Animal%20Studios/Characters/file_00000000424c71f58d53c77417910885.png',
  'Faceless%20Animal%20Studios/Characters/file_00000000a14c71fd915d9466c77ec0d1.png',
  'Faceless%20Animal%20Studios/Characters/file_00000000e96471fdb1f49655921c9a67.png',
  'Faceless%20Animal%20Studios/Characters/file_00000000048871fdb6116fd7d4db2321.png',
  'Faceless%20Animal%20Studios/Characters/file_000000000f38722f95a2252be10185bb.png',
];
const CHAR_NAMES = [
  'Artio & Nita', 'Milo & Vex', 'Rei & Shiro', 'Kalvin & Hara',
  'Roux & Roux', 'Sage & Olive', 'Luna & Ash', 'Nyx & Jax',
];
const BUBBLE_INTERVAL_MS = 28000; // ~28s between video room entry bubbles

// Room ID mapping - these are the Matrix room aliases/IDs for each radio room
const ROOM_MAP = {
  radio: '#radio:matrix.org',
  underground: '#underground-mix:matrix.org',
  gaming: '#gaming:matrix.org',
  latenight: '#latenight:matrix.org',
};

// Simulation data (fallback when Matrix not connected)
const SIM_ROOMS = {
  radio:       { name: 'DJ Faceless Animal Radio', count: 24 },
  underground: { name: 'Underground Mix Room',     count: 8  },
  gaming:      { name: 'Gaming Vibes Room',         count: 12 },
  latenight:   { name: 'Late Night Room',           count: 5  },
};

const SIM_MESSAGES = {
  radio: [
    { av: 'FA', username: 'FacelessFanz1',  message: 'Yo this track go hard 🔥' },
    { av: 'LS', username: 'LoverOfSoundz',  message: 'This mix is fire — Faceless never misses' },
    { av: 'MI', username: 'mfiniterlames',  message: "Tracklist looking sick, can't wait for the uploads 🎧" },
    { av: 'NG', username: 'NightGroover',   message: "When's the next drop? Need this in my rotation" },
    { av: 'DX', username: 'DrillXOff',      message: 'Back in the room 🔥' },
    { av: 'TB', username: 'TrapBase99',     message: 'This set is hitting different tonight' },
    { av: 'HG', username: 'HoodGroover',    message: 'No skips fr fr' },
    { av: 'BW', username: 'BeatWatcher',    message: 'Need this tracklist dropped ASAP' },
    { av: 'WV', username: 'WavRider',       message: 'Faceless always cooking something' },
  ],
  underground: [
    { av: 'UG', username: 'UndaGrounda',   message: 'Mix room is the wave fr 🌊' },
    { av: 'BB', username: 'BeatBuilder',   message: "Who's dropping next? Drop the link" },
    { av: 'MX', username: 'MixHunter',     message: 'Underground stays raw' },
    { av: 'PB', username: 'PurpleBeat',    message: 'Gems in here every time' },
    { av: 'CR', username: 'CrateDigga',    message: 'This room got different taste fr' },
  ],
  gaming: [
    { av: 'GR', username: 'GameRaveHQ',    message: 'This beat hits different while gaming 🎮' },
    { av: 'PW', username: 'PixelWave',     message: 'Late night ranked + this radio = undefeated' },
    { av: 'QP', username: 'QuikPlay',      message: 'Locked in, headphones on' },
    { av: 'LB', username: 'LoadBeatz',     message: 'Running this back for ranked' },
  ],
  latenight: [
    { av: 'LN', username: 'LateNightLow',  message: "Can't sleep. This room got me." },
    { av: 'MN', username: 'MidnightNode',  message: 'Perfect late session, no cap' },
    { av: 'NB', username: 'NightBlend',    message: 'Nobody sleeping on this 🌙' },
    { av: 'DP', username: 'DuskPhase',     message: 'Three AM energy, no cap' },
  ],
};

const SIM_BASE_COUNTS  = { radio: 20, underground: 6,  gaming: 10, latenight: 4  };
const SIM_MAX_COUNTS   = { radio: 34, underground: 15, gaming: 19, latenight: 10 };
const SIM_MSG_INTERVAL = 15000;
const SIM_COUNT_INTERVAL = 4500;

// ── Utilities ─────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function initials(username) {
  if (!username) return '?';
  return username.slice(0, 2).toUpperCase();
}

function readMatrixSession() {
  try { return JSON.parse(localStorage.getItem(MATRIX_SESSION_KEY) || 'null'); }
  catch (_) { return null; }
}

function displaySender(sender, matrixSession) {
  if (matrixSession && sender === matrixSession.user_id) {
    const siteSession = JSON.parse(localStorage.getItem('fas_user') || 'null');
    if (siteSession && siteSession.username) return siteSession.username;
  }
  const clean = String(sender || '').replace(/^@/, '').split(':')[0];
  return clean ? '@' + clean : '@faceless';
}

function eventText(event) {
  if (!event || event.type !== 'm.room.message' || !event.content) return '';
  if (event.content.msgtype === 'm.text' || event.content.msgtype === 'm.notice') return event.content.body || '';
  return event.content.body || '';
}

function matrixApi(path, options, session) {
  const init = options || {};
  const headers = init.headers || {};
  headers.Accept = 'application/json';
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (session && session.access_token) headers.Authorization = 'Bearer ' + session.access_token;
  return fetch(MATRIX_BASE + '/_matrix/client/v3' + path, Object.assign({}, init, { headers: headers }))
    .then(function (res) {
      return res.text().then(function (text) {
        const data = text ? JSON.parse(text) : {};
        if (!res.ok) {
          const err = new Error(data.error || data.errcode || ('Matrix request failed: ' + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
}

// ── Guest auto-registration ──────────────────────────────────────────

function registerGuest() {
  return fetch(MATRIX_BASE + '/_matrix/client/v3/register?kind=guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({})
  }).then(function(res) {
    return res.text().then(function(text) {
      if (!res.ok) throw new Error('Guest registration failed: ' + res.status);
      var data = text ? JSON.parse(text) : {};
      if (!data.access_token) throw new Error('No access_token in guest response');
      var session = { access_token: data.access_token, user_id: data.user_id, device_id: data.device_id, home_server: 'matrix.org', _guest: true };
      try { localStorage.setItem(MATRIX_SESSION_KEY, JSON.stringify(session)); } catch(e) {}
      return session;
    });
  });
}

// ── Main export ───────────────────────────────────────────────────────

export function initRadioChat(config) {
  const {
    feedEl,
    inputEl,
    sendBtnEl,
    tabEls,
    activeCountEl,
    listenerNumEl,
    pillNumEl,
    userListEl,
    onUserClick,
    initialRoom = 'radio',
    getSession,
    cssPrefix = 'rp',
    simulationMode = false,
    sendDebounceMs = SEND_DEBOUNCE,
    tierLimited = false,
  } = config;

  let matrixSession = readMatrixSession();
  let useLive = !!matrixSession && !!matrixSession.access_token && !simulationMode;

  if (!feedEl) return;

  // If no Matrix session, try guest auto-registration in background.
  // On success, hot-swap from simulation to live mode.
  if (!useLive && !simulationMode && !(matrixSession && matrixSession._guest)) {
    registerGuest()
      .then(function(guestSession) {
        if (guestSession && guestSession.access_token) {
          stopSimulation();
          matrixSession = readMatrixSession();
          useLive = true;
          switchRoom(activeRoom);
        }
      })
      .catch(function() {
        // Guest registration failed — stay in simulation mode
      });
  }

  function buildMsgEl(username, message, isSelf) {
    const el = document.createElement('article');
    el.className = 'matrix-message' + (isSelf ? ' is-me' : '');
    el.innerHTML = 
      '<strong>' + esc(username) + '</strong>' +
      '<time>' + new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) + '</time>' +
      '<p>' + esc(message) + '</p>';
    return el;
  }

  function buildSystemEl(text) {
    const el = document.createElement('p');
    el.className = 'matrix-empty';
    el.textContent = text;
    return el;
  }

  function randomCharIdx() {
    return Math.floor(Math.random() * CHAR_IMAGES.length);
  }

  function buildBubbleEl() {
    const idx = randomCharIdx();
    const el = document.createElement('div');
    el.className = 'room-chat-bubble';
    el.innerHTML =
      '<img src="' + CHAR_IMAGES[idx] + '" alt="" class="room-chat-bubble-avatar" loading="lazy">' +
      '<span class="room-chat-bubble-label"><strong>' + CHAR_NAMES[idx] + '</strong> joined video</span>' +
      '<span class="room-chat-bubble-icon">🎥</span>';
    return el;
  }

  function buildAvatarImg() {
    const idx = randomCharIdx();
    const img = document.createElement('img');
    img.className = 'room-chat-user-avatar';
    img.src = CHAR_IMAGES[idx];
    img.alt = '';
    img.loading = 'lazy';
    return img;
  }

  function appendMsg(msgEl) {
    if (!feedEl) return;
    feedEl.appendChild(msgEl);
    feedEl.scrollTop = feedEl.scrollHeight;
  }

  function clearFeed() {
    while (feedEl.firstChild) feedEl.removeChild(feedEl.firstChild);
  }

  function setCountDisplay(count) {
    if (activeCountEl) activeCountEl.textContent = count;
    if (listenerNumEl) listenerNumEl.textContent = count;
    if (pillNumEl) pillNumEl.textContent = count;
  }

  function setTabCount(roomId, count) {
    if (!tabEls) return;
    tabEls.forEach(function(t) {
      if (t.dataset.room === roomId) {
        const countSpan = t.querySelector('.rp-room-count, .rs-room-tab-count');
        if (countSpan) countSpan.textContent = count;
      }
    });
  }

  // ── Simulation mode ───────────────────────────────────────────────
  let simMsgIdxs = Object.fromEntries(Object.keys(SIM_MESSAGES).map(r => [r, 0]));
  let simCountTimerId = null;
  let simMsgTimerId = null;
  let simBubbleTimerId = null;

  function startSimulation() {
    renderSimMessages(activeRoom);

    simCountTimerId = setInterval(function() {
      Object.keys(SIM_ROOMS).forEach(function(id) {
        const r = SIM_ROOMS[id];
        const delta = Math.random() < 0.55 ? 1 : -1;
        r.count = clamp(r.count + delta, SIM_BASE_COUNTS[id], SIM_MAX_COUNTS[id]);
        setTabCount(id, r.count);
      });
      setCountDisplay(SIM_ROOMS[activeRoom] ? SIM_ROOMS[activeRoom].count : 24);
    }, SIM_COUNT_INTERVAL);

    simMsgTimerId = setInterval(function() {
      const msgs = SIM_MESSAGES[activeRoom];
      if (!msgs || !msgs.length) return;
      const idx = simMsgIdxs[activeRoom] % msgs.length;
      simMsgIdxs[activeRoom]++;
      const m = msgs[idx];
      appendMsg(buildMsgEl(m.username, m.message, false));
    }, SIM_MSG_INTERVAL);

    // Video room entry bubbles
    simBubbleTimerId = setInterval(function() {
      appendMsg(buildBubbleEl());
    }, BUBBLE_INTERVAL_MS);
  }

  function stopSimulation() {
    clearInterval(simCountTimerId);
    clearInterval(simMsgTimerId);
    clearInterval(simBubbleTimerId);
    simCountTimerId = null;
    simMsgTimerId = null;
    simBubbleTimerId = null;
  }

  function renderSimMessages(roomId) {
    clearFeed();
    const msgs = SIM_MESSAGES[roomId] || [];
    const show = msgs.slice(0, 4);
    show.forEach(function(m) {
      feedEl.appendChild(buildMsgEl(m.username, m.message, false, null));
    });
    // Start with a welcome bubble
    feedEl.appendChild(buildBubbleEl());
    feedEl.appendChild(buildSystemEl('Room is open. Move with the mix.'));
    feedEl.scrollTop = feedEl.scrollHeight;

    if (SIM_ROOMS[roomId]) {
      setCountDisplay(SIM_ROOMS[roomId].count);
    }
  }

  // ── Matrix chat ───────────────────────────────────────────────────
  let activeRoom = initialRoom;
  let syncRunning = false;
  let syncAbortController = null;
  let lastSyncToken = '';
  let sendDebouncing = false;
  let joinedRoomId = null;
  let liveBubbleTimerId = null;

  async function resolveRoomId(roomAlias) {
    if (!matrixSession || !matrixSession.access_token) return null;
    try {
      const data = await matrixApi('/directory/room/' + encodeURIComponent(roomAlias), {}, matrixSession);
      return data.room_id;
    } catch (err) {
      console.warn('[radio-chat] Could not resolve room alias:', roomAlias, err.message);
      return null;
    }
  }

  async function joinRoom(roomId) {
    if (!matrixSession || !matrixSession.access_token || !roomId) return false;
    try {
      await matrixApi('/rooms/' + encodeURIComponent(roomId) + '/join', { method: 'POST', body: '{}' }, matrixSession);
      return true;
    } catch (err) {
      console.warn('[radio-chat] Could not join room:', roomId, err.message);
      return false;
    }
  }

  async function loadHistory(roomId) {
    if (!useLive || !matrixSession || !matrixSession.access_token || !roomId) return false;

    clearFeed();
    feedEl.appendChild(buildSystemEl('Loading…'));

    try {
      const data = await matrixApi('/rooms/' + encodeURIComponent(roomId) + '/messages?dir=b&limit=' + HISTORY_LIMIT, {}, matrixSession);
      const events = (data.chunk || []).reverse();
      const messages = events.filter(function(e) { return !!eventText(e); });

      clearFeed();

      if (!messages.length) {
        feedEl.appendChild(buildSystemEl('Room is open. Move with the mix.'));
      } else {
        messages.forEach(function(event) {
          const sender = displaySender(event.sender, matrixSession);
          const isSelf = matrixSession && event.sender === matrixSession.user_id;
          feedEl.appendChild(buildMsgEl(sender, eventText(event), isSelf, null));
        });
      }
      feedEl.scrollTop = feedEl.scrollHeight;
      return true;
    } catch (err) {
      console.warn('[radio-chat] loadHistory error:', err.message);
      clearFeed();
      feedEl.appendChild(buildSystemEl('Could not load chat history.'));
      return false;
    }
  }

  function startSync(roomId) {
    if (syncRunning || !matrixSession || !matrixSession.access_token || !roomId) return;
    syncRunning = true;
    syncLoop(roomId);
    // Add occasional video room bubbles in live mode
    liveBubbleTimerId = setInterval(function() {
      appendMsg(buildBubbleEl());
    }, BUBBLE_INTERVAL_MS * 1.6);
  }

  function stopSync() {
    syncRunning = false;
    if (syncAbortController) {
      syncAbortController.abort();
      syncAbortController = null;
    }
    if (liveBubbleTimerId) {
      clearInterval(liveBubbleTimerId);
      liveBubbleTimerId = null;
    }
  }

  function syncLoop(roomId) {
    if (!syncRunning || !matrixSession || !matrixSession.access_token || !roomId) return;

    const syncPath = '/sync?timeout=30000&limit=20';
    syncAbortController = new AbortController();
    const headers = { Accept: 'application/json', Authorization: 'Bearer ' + matrixSession.access_token };

    fetch(MATRIX_BASE + '/_matrix/client/v3' + syncPath, { headers: headers, signal: syncAbortController.signal })
      .then(function(res) { return res.text().then(function(text) { return text ? JSON.parse(text) : {}; }); })
      .then(function(data) {
        if (!syncRunning) return;
        lastSyncToken = data.next_batch || lastSyncToken;

        const joined = (data.rooms && data.rooms.join) || {};
        const roomData = joined[roomId];
        if (roomData) {
          const timeline = roomData.timeline || {};
          if (timeline.events && timeline.events.length > 0) {
            timeline.events.forEach(function(event) {
              const text = eventText(event);
              if (!text) return;
              const sender = displaySender(event.sender, matrixSession);
              const isSelf = matrixSession && event.sender === matrixSession.user_id;
              appendMsg(buildMsgEl(sender, text, isSelf, null));
            });
          }
        }
        syncLoop(roomId);
      })
      .catch(function(err) {
        if (!syncRunning) return;
        if (err.name === 'AbortError') return;
        setTimeout(function() { syncLoop(roomId); }, 5000);
      });
  }

  async function switchRoom(roomId) {
    activeRoom = roomId;

    if (tabEls) {
      tabEls.forEach(function(t) {
        const on = t.dataset.room === roomId;
        t.classList.toggle('rp-room-tab--active', on);
        t.classList.toggle('rs-room-tab--active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    stopSync();

    if (!useLive) {
      renderSimMessages(roomId);
      return;
    }

    const roomAlias = ROOM_MAP[roomId];
    if (!roomAlias) {
      renderSimMessages(roomId);
      return;
    }

    const resolvedRoomId = await resolveRoomId(roomAlias);
    if (!resolvedRoomId) {
      renderSimMessages(roomId);
      return;
    }

    joinedRoomId = resolvedRoomId;
    const joined = await joinRoom(resolvedRoomId);
    if (!joined) {
      renderSimMessages(roomId);
      return;
    }

    const loaded = await loadHistory(resolvedRoomId);
    if (loaded) {
      startSync(resolvedRoomId);
    }
  }

  async function sendMessage() {
    if (sendDebouncing) return;
    if (!inputEl) return;

    const text = inputEl.value.trim();
    if (!text) return;
    if (text.length > MAX_MSG_LEN) {
      inputEl.value = inputEl.value.slice(0, MAX_MSG_LEN);
      return;
    }

    const sess = getSession ? getSession() : null;
    const username = (sess && sess.username) ? sess.username : null;
    if (!username) return;

    sendDebouncing = true;
    if (sendBtnEl) sendBtnEl.disabled = true;
    setTimeout(function() {
      sendDebouncing = false;
      if (sendBtnEl) sendBtnEl.disabled = false;
    }, sendDebounceMs);

    inputEl.value = '';

    if (!useLive || !matrixSession || !matrixSession.access_token || !joinedRoomId) {
      appendMsg(buildMsgEl(username, text, true, null));
      return;
    }

    const txn = Date.now().toString(36) + Math.random().toString(36).slice(2);
    try {
      await matrixApi('/rooms/' + encodeURIComponent(joinedRoomId) + '/send/m.room.message/' + txn, {
        method: 'PUT',
        body: JSON.stringify({ msgtype: 'm.text', body: text })
      }, matrixSession);
    } catch (err) {
      console.warn('[radio-chat] send error:', err.message);
      inputEl.value = text;
      appendMsg(buildSystemEl('Could not send. Try again.'));
    }
  }

  // ── Wire up events ────────────────────────────────────────────────
  function requestSend(e) {
    if (e) e.preventDefault();
    sendMessage();
  }

  if (sendBtnEl) {
    sendBtnEl.setAttribute('type', 'button');
    sendBtnEl.addEventListener('click', requestSend);
    sendBtnEl.addEventListener('touchend', requestSend, { passive: false });
  }
  if (inputEl) {
    inputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
    });
    inputEl.addEventListener('input', function() {
      if (inputEl.value.length > MAX_MSG_LEN) {
        inputEl.value = inputEl.value.slice(0, MAX_MSG_LEN);
      }
    });
  }

  // Also handle form submit if the compose area is a form
  var composeForm = inputEl ? inputEl.closest('form') : null;
  if (composeForm) {
    composeForm.addEventListener('submit', function(e) {
      e.preventDefault();
      sendMessage();
    });
  }

  if (tabEls) {
    tabEls.forEach(function(t) {
      t.addEventListener('click', function() {
        const roomId = t.dataset.room;
        if (roomId && roomId !== activeRoom) switchRoom(roomId);
      });
    });
  }

  // ── Initialize ────────────────────────────────────────────────────
  if (useLive) {
    switchRoom(activeRoom);
  } else {
    startSimulation();
  }

  // ── Tier-limited notice ───────────────────────────────────────────
  if (tierLimited && inputEl && inputEl.parentElement) {
    inputEl.disabled = true;
    inputEl.readOnly = true;
    inputEl.placeholder = 'Set a handle or sign in to join the room.';
    inputEl.setAttribute('aria-disabled', 'true');

    if (sendBtnEl) {
      sendBtnEl.disabled = true;
      sendBtnEl.setAttribute('aria-disabled', 'true');
      sendBtnEl.title = 'Set a handle or sign in to chat';
    }

    var limitNotice = document.createElement('p');
    limitNotice.style.cssText = [
      'font-size:0.7rem',
      'color:var(--text-3)',
      'letter-spacing:0.05em',
      'margin:0 0 0.3rem',
      'padding:0.3rem 0.5rem',
      'background:rgba(255,255,255,0.03)',
      'border-radius:6px',
      'border:1px solid rgba(255,255,255,0.06)',
    ].join(';');
    limitNotice.textContent = 'Set a handle or sign in to chat. Free members can join the room.';
    inputEl.parentElement.insertBefore(limitNotice, inputEl);
  }

  return { switchRoom };
}
