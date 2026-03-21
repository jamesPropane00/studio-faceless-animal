/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — RADIO REALTIME CHAT
 *  assets/js/radio-chat.js
 *
 *  Provides Supabase Realtime live chat for the radio page and
 *  music page embedded radio section.
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
 *
 * ────────────────────────────────────────────────────────────
 *  DATABASE SETUP (one-time — do this in Supabase Dashboard)
 * ────────────────────────────────────────────────────────────
 *
 *  1. Run this SQL in Supabase → SQL Editor:
 *
 *    create table if not exists messages (
 *      id          uuid primary key default gen_random_uuid(),
 *      room_name   text not null,
 *      username    text not null,
 *      message     text not null,
 *      created_at  timestamptz not null default now()
 *    );
 *
 *    -- Row-level security: anyone can insert; anyone can read
 *    alter table messages enable row level security;
 *
 *    create policy "Public read"
 *      on messages for select using (true);
 *
 *    create policy "Public insert"
 *      on messages for insert with check (
 *        length(message) > 0 and length(message) <= 300
 *      );
 *
 *    -- Index for efficient room queries
 *    create index if not exists messages_room_created
 *      on messages (room_name, created_at desc);
 *
 *  2. Enable Realtime for the messages table:
 *     Supabase Dashboard → Database → Replication
 *     → Toggle ON for 'messages' table
 *     (You'll see "Source" in the tables list — flip the toggle)
 *
 *  3. After enabling replication, restart this page.
 *     Realtime chat will activate automatically when SUPABASE_READY = true.
 *
 * ────────────────────────────────────────────────────────────
 *  FALLBACK:
 *    If SUPABASE_READY is false (env vars not set), the module
 *    runs in simulation mode: counts fluctuate, static messages
 *    rotate on a timer. Everything looks live but nothing persists.
 * ============================================================
 */

import { supabase, SUPABASE_READY } from './supabase-client.js'

// ── Constants ────────────────────────────────────────────────────────
const MAX_MSG_LEN    = 300
const SEND_DEBOUNCE  = 1200
const HISTORY_LIMIT  = 40
const SIM_MSG_INTERVAL = 15000
const SIM_COUNT_INTERVAL = 4500

// ── Simulation data (fallback when Supabase not ready) ────────────────
const SIM_ROOMS = {
  radio:       { name: 'DJ Faceless Animal Radio', count: 24 },
  underground: { name: 'Underground Mix Room',     count: 8  },
  gaming:      { name: 'Gaming Vibes Room',         count: 12 },
  latenight:   { name: 'Late Night Room',           count: 5  },
}

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
}

const SIM_BASE_COUNTS  = { radio: 20, underground: 6,  gaming: 10, latenight: 4  }
const SIM_MAX_COUNTS   = { radio: 34, underground: 15, gaming: 19, latenight: 10 }

// ── Utilities ─────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function initials(username) {
  if (!username) return '?'
  return username.slice(0, 2).toUpperCase()
}

// ── Message DOM builder (prefix = 'rp' for radio.html, 'rs' for music.html) ──
function makeMsgBuilders(prefix) {
  function buildMsgEl(username, message, isSelf, avatarHint) {
    const av  = avatarHint || initials(username)
    const el  = document.createElement('div')
    el.className = prefix + '-msg' + (isSelf ? ' ' + prefix + '-msg--self' : '')
    el.innerHTML =
      `<div class="${prefix}-avatar" aria-hidden="true">${esc(av)}</div>` +
      `<div class="${prefix}-msg-body">` +
        `<span class="${prefix}-handle">${esc(username)}</span>` +
        `<p class="${prefix}-msg-text">${esc(message)}</p>` +
      `</div>`
    return el
  }

  function buildSystemEl(text) {
    const el = document.createElement('div')
    el.className = prefix + '-msg ' + prefix + '-msg--system'
    el.innerHTML = `<p>${esc(text)}</p>`
    return el
  }

  return { buildMsgEl, buildSystemEl }
}

function appendMsg(feedEl, msgEl) {
  if (!feedEl) return
  feedEl.appendChild(msgEl)
  feedEl.scrollTop = feedEl.scrollHeight
}

// ── Main export ───────────────────────────────────────────────────────

/**
 * initRadioChat(config)
 *
 * config = {
 *   feedEl:         HTMLElement  — chat message list container
 *   inputEl:        HTMLElement  — text input
 *   sendBtnEl:      HTMLElement  — send button
 *   tabEls:         NodeList     — room tab elements (with data-room)
 *   activeCountEl:  HTMLElement? — "N in the room" number span
 *   listenerNumEl:  HTMLElement? — listener count in station strip
 *   pillNumEl:      HTMLElement? — listener count in pill badge
 *   initialRoom:    string       — default room name (e.g. 'radio')
 *   getSession:     function()   — returns { username } or null
 *   cssPrefix:      string       — CSS class prefix: 'rp' (radio.html) or 'rs' (music.html)
 *   simulationMode: boolean      — force simulation even if SUPABASE_READY is true
 *                                  (useful for dev/testing before messages table is created)
 *   sendDebounceMs: number       — ms between sends (default 1200). Set higher for free-tier rate limiting.
 *   tierLimited:    boolean      — if true, show a "limited chat" notice and apply tier restrictions
 * }
 */
export function initRadioChat(config) {
  const {
    feedEl,
    inputEl,
    sendBtnEl,
    tabEls,
    activeCountEl,
    listenerNumEl,
    pillNumEl,
    initialRoom = 'radio',
    getSession,
    cssPrefix = 'rp',
    simulationMode = false,
    sendDebounceMs = SEND_DEBOUNCE,
    tierLimited    = false,
  } = config

  // Whether to use live Supabase or simulation.
  // Simulation runs when:
  //   a) SUPABASE_READY is false (no credentials), OR
  //   b) simulationMode is explicitly true, OR
  //   c) runtime connection check fails (loadHistory errors → fallback)
  let useLive = SUPABASE_READY && !simulationMode

  if (!feedEl) return

  const { buildMsgEl, buildSystemEl } = makeMsgBuilders(cssPrefix)

  let activeRoom       = initialRoom
  let channel          = null
  let sendDebouncing   = false
  let simMsgIdxs       = Object.fromEntries(Object.keys(SIM_MESSAGES).map(r => [r, 0]))
  let simCountTimerId  = null
  let simMsgTimerId    = null

  function insertRoomNotice(text) {
    if (!feedEl || !feedEl.parentElement) return
    const parent = feedEl.parentElement
    if (parent.querySelector('.' + cssPrefix + '-room-note')) return

    const note = document.createElement('p')
    note.className = cssPrefix + '-room-note'
    note.style.cssText = [
      'font-size:0.68rem',
      'color:var(--text-3)',
      'letter-spacing:0.05em',
      'margin:0 0 0.45rem',
      'padding:0.35rem 0.55rem',
      'background:rgba(255,255,255,0.03)',
      'border:1px solid rgba(255,255,255,0.07)',
      'border-radius:7px',
    ].join(';')
    note.textContent = text
    parent.insertBefore(note, feedEl)
  }

  function clearLiveRoomCounts() {
    if (activeCountEl) activeCountEl.textContent = '—'
    if (tabEls) {
      tabEls.forEach(function(t) {
        const countSpan = t.querySelector('.rp-room-count, .rs-room-tab-count')
        if (countSpan) countSpan.textContent = '—'
      })
    }
  }

  // ── Update count displays ─────────────────────────────────────────
  function setCountDisplay(count) {
    if (activeCountEl) activeCountEl.textContent = count
    if (listenerNumEl) listenerNumEl.textContent = count
    if (pillNumEl)     pillNumEl.textContent     = count
  }

  // ── Tab count badge update ────────────────────────────────────────
  function setTabCount(roomId, count) {
    if (!tabEls) return
    tabEls.forEach(function(t) {
      if (t.dataset.room === roomId) {
        const countSpan = t.querySelector('.rp-room-count, .rs-room-tab-count')
        if (countSpan) countSpan.textContent = count
      }
    })
  }

  // ── Simulation mode ───────────────────────────────────────────────
  function startSimulation() {
    // Render initial seed messages for active room
    renderSimMessages(activeRoom)

    // Count fluctuation
    simCountTimerId = setInterval(function() {
      Object.keys(SIM_ROOMS).forEach(function(id) {
        const r = SIM_ROOMS[id]
        const delta = Math.random() < 0.55 ? 1 : -1
        r.count = clamp(r.count + delta, SIM_BASE_COUNTS[id], SIM_MAX_COUNTS[id])
        setTabCount(id, r.count)
      })
      setCountDisplay(SIM_ROOMS[activeRoom] ? SIM_ROOMS[activeRoom].count : 24)
    }, SIM_COUNT_INTERVAL)

    // Auto-inject messages
    simMsgTimerId = setInterval(function() {
      const msgs = SIM_MESSAGES[activeRoom]
      if (!msgs || !msgs.length) return
      const idx = simMsgIdxs[activeRoom] % msgs.length
      simMsgIdxs[activeRoom]++
      const m = msgs[idx]
      appendMsg(feedEl, buildMsgEl(m.username, m.message, false, m.av))
    }, SIM_MSG_INTERVAL)
  }

  function stopSimulation() {
    clearInterval(simCountTimerId)
    clearInterval(simMsgTimerId)
    simCountTimerId = null
    simMsgTimerId   = null
  }

  function renderSimMessages(roomId) {
    clearFeed()
    const msgs = SIM_MESSAGES[roomId] || []
    const show  = msgs.slice(0, 4)
    show.forEach(function(m) {
      feedEl.appendChild(buildMsgEl(m.username, m.message, false, m.av))
    })
    feedEl.appendChild(buildSystemEl('Room is open. Move with the mix.'))
    feedEl.scrollTop = feedEl.scrollHeight

    // Set count
    if (SIM_ROOMS[roomId]) {
      setCountDisplay(SIM_ROOMS[roomId].count)
    }
  }

  // ── Feed management ───────────────────────────────────────────────
  function clearFeed() {
    while (feedEl.firstChild) feedEl.removeChild(feedEl.firstChild)
  }

  // ── Supabase Realtime ─────────────────────────────────────────────

  /**
   * Load recent messages for a room from the messages table.
   * Returns true on success, false on error (caller falls back to simulation).
   */
  async function loadHistory(roomId) {
    if (!useLive || !supabase) return false

    clearFeed()
    feedEl.appendChild(buildSystemEl('Loading…'))

    const { data, error } = await supabase
      .from('messages')
      .select('username, message, created_at')
      .eq('room_name', roomId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)

    clearFeed()

    if (error) {
      // Runtime error (e.g. table not created yet) → fall back to simulation
      console.info('[FAS] radio-chat: loadHistory error — switching to simulation mode.', error.message)
      useLive = false
      startSimulation()
      return false
    }

    // Render oldest-first (empty room shows system message only)
    const rows = data ? [...data].reverse() : []
    rows.forEach(function(row) {
      feedEl.appendChild(buildMsgEl(row.username, row.message, false, null))
    })
    feedEl.appendChild(buildSystemEl('Room is open. Move with the mix.'))
    feedEl.scrollTop = feedEl.scrollHeight
    return true
  }

  /**
   * Subscribe to INSERT events on messages WHERE room_name = roomId.
   *
   * To enable realtime: Supabase Dashboard → Database → Replication
   * → toggle ON for 'messages' table
   */
  function subscribeRoom(roomId) {
    if (!useLive || !supabase) return

    // Unsubscribe previous channel
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }

    const channelName = `radio-chat-${roomId}-${Date.now()}`
    channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'messages',
          filter: `room_name=eq.${roomId}`,
        },
        function(payload) {
          const row  = payload.new
          if (!row || !row.username || !row.message) return
          const sess = getSession ? getSession() : null
          const self = sess && sess.username && sess.username.toLowerCase() === row.username.toLowerCase()
          appendMsg(feedEl, buildMsgEl(row.username, row.message, self, null))
        }
      )
      .subscribe()
  }

  /**
   * Switch to a new room: update UI, reload history, re-subscribe.
   */
  async function switchRoom(roomId) {
    activeRoom = roomId

    // Update tab active state
    if (tabEls) {
      tabEls.forEach(function(t) {
        const on = t.dataset.room === roomId
        t.classList.toggle('rp-room-tab--active', on)
        t.classList.toggle('rs-room-tab--active', on)
        t.setAttribute('aria-selected', on ? 'true' : 'false')
      })
    }

    // Simulation mode: render static messages
    if (!useLive) {
      renderSimMessages(roomId)
      return
    }

    // Live mode (loadHistory falls back to simulation on error)
    const ok = await loadHistory(roomId)
    if (ok) subscribeRoom(roomId)
  }

  // ── Send message ──────────────────────────────────────────────────
  async function sendMessage() {
    if (sendDebouncing) return
    if (!inputEl) return

    const text = inputEl.value.trim()
    if (!text) return
    if (text.length > MAX_MSG_LEN) {
      inputEl.value = inputEl.value.slice(0, MAX_MSG_LEN)
      return
    }

    const sess     = getSession ? getSession() : null
    const username = (sess && sess.username) ? sess.username : null
    if (!username) return

    // Debounce (rate varies by tier: free users get longer cooldown)
    sendDebouncing = true
    if (sendBtnEl) sendBtnEl.disabled = true
    setTimeout(function() {
      sendDebouncing = false
      if (sendBtnEl) sendBtnEl.disabled = false
    }, sendDebounceMs)

    inputEl.value = ''

    if (!useLive || !supabase) {
      // Simulation mode: optimistic local render
      appendMsg(feedEl, buildMsgEl(username, text, true, null))
      return
    }

    // Insert into messages table (no .select() — Realtime handles display)
    const { error } = await supabase
      .from('messages')
      .insert({
        room_name: activeRoom,
        username:  username,
        message:   text,
      })

    if (error) {
      // Optimistic rollback — add error note
      console.warn('[FAS] radio-chat: insert error', error.message)
      appendMsg(feedEl, buildSystemEl('Could not send. Try again.'))
    }
  }

  // ── Wire up events ────────────────────────────────────────────────
  if (sendBtnEl) {
    sendBtnEl.addEventListener('click', sendMessage)
  }
  if (inputEl) {
    inputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); sendMessage() }
    })
    // Enforce max length display
    inputEl.addEventListener('input', function() {
      if (inputEl.value.length > MAX_MSG_LEN) {
        inputEl.value = inputEl.value.slice(0, MAX_MSG_LEN)
      }
    })
  }

  // Tab switching
  if (tabEls) {
    tabEls.forEach(function(t) {
      t.addEventListener('click', function() {
        const roomId = t.dataset.room
        if (roomId && roomId !== activeRoom) switchRoom(roomId)
      })
    })
  }

  // ── Initialize ────────────────────────────────────────────────────
  if (useLive) {
    clearLiveRoomCounts()
    insertRoomNotice('Rooms switch chat threads. Member counts are not live yet.')

    // loadHistory falls back to simulation automatically on error
    loadHistory(activeRoom).then(function(ok) {
      if (ok) subscribeRoom(activeRoom)
    })
  } else {
    // Simulation fallback (no credentials or simulationMode=true)
    insertRoomNotice('Demo mode: room counts and message activity are simulated.')
    startSimulation()
  }

  // ── Tier-limited notice ───────────────────────────────────────────
  // Free users: lock input/send UI so visible state matches permissions.
  if (tierLimited && inputEl && inputEl.parentElement) {
    inputEl.disabled = true
    inputEl.readOnly = true
    inputEl.placeholder = 'Chat is members-only. Upgrade to join the room.'
    inputEl.setAttribute('aria-disabled', 'true')

    if (sendBtnEl) {
      sendBtnEl.disabled = true
      sendBtnEl.setAttribute('aria-disabled', 'true')
      sendBtnEl.title = 'Members-only chat'
    }

    var limitNotice = document.createElement('p')
    limitNotice.style.cssText = [
      'font-size:0.7rem',
      'color:var(--text-3)',
      'letter-spacing:0.05em',
      'margin:0 0 0.3rem',
      'padding:0.3rem 0.5rem',
      'background:rgba(255,255,255,0.03)',
      'border-radius:6px',
      'border:1px solid rgba(255,255,255,0.06)',
    ].join(';')
    limitNotice.textContent = '🔒 Free access — chat sending is locked. Upgrade to join the room.'
    inputEl.parentElement.insertBefore(limitNotice, inputEl)
  }

  // ── Expose switchRoom for external room switching hooks ────────────
  return { switchRoom }
}
