/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — PERSISTENT FLOATING RADIO WIDGET
 *  assets/js/radio-widget.js
 *
 *  Full-featured radio widget that lives on every page:
 *   • Hidden YouTube iframe — plays continuously as you browse
 *   • Play/Pause · Skip Back · Skip Forward
 *   • Volume slider + mute toggle
 *   • 3-station switcher (two YT playlists + Spotify)
 *   • Expandable panel with Radio info + Live Chat tabs
 *   • Live chat feed from Supabase (messages table, room: radio)
 *   • DM notification badge (unread messages)
 *   • Member sign-in awareness
 *   • sessionStorage persistence (station, volume, playing state)
 * ============================================================
 */
(function () {
  'use strict';

  /* ── Skip on radio.html (full player handles itself there) ── */
  // var path = window.location.pathname;
  // if (path === '/radio.html' || path.endsWith('/radio.html')) return;

  /* ── Read Supabase config (set by env.js) ──────────────────── */
  var cfg      = (window.__FAS_CONFIG) || {};
  var SB_URL   = cfg.supabaseUrl     || 'https://ghufaozjwondqcrcucjs.supabase.co';
  var SB_KEY   = cfg.supabaseAnonKey || 'sb_publishable_kixI74nB7Drt6mQKooaXHg_nPoE0h_-';
  var SB_READY = !!(SB_URL && SB_KEY);

  /* ── Session helper ────────────────────────────────────────── */
  function getSession() {
    try { return JSON.parse(localStorage.getItem('fas_user') || 'null'); } catch(e) { return null; }
  }

  /* ── Stations config ───────────────────────────────────────── */
  var STATIONS = {
    '1': {
      label: 'Station 1 · Original',
      type: 'audio',
      tracks: [],
    },
    '2': { label: 'Station 2 · Mix',       type: 'yt',      listId: 'PLuaOk7bBVKJTqt9w6hS_MxjeQHGURWaBN' },
    '3': { label: 'Station 3 · Spotify',   type: 'spotify', listId: null },
  };

  /* ── Persistent state (sessionStorage) ─────────────────────── */
  var PRE = 'fas_rw_';
  function ss(k, v) { if (v === undefined) return sessionStorage.getItem(PRE + k); sessionStorage.setItem(PRE + k, String(v)); }

  var activeStation = ss('station') || '1';
  var volume        = parseInt(ss('volume') || '80', 10);
  var muted         = ss('muted') === '1';
  var trackIndex    = parseInt(ss('track_index') || '0', 10);
  var currentTime   = parseFloat(ss('current_time') || '0');
  var isPlaying     = ss('is_playing') === '1';
  var playing       = false;           // live state — can't persist across pages cleanly
  var activeTab     = 'radio';

  /* ── Count simulation ──────────────────────────────────────── */
  var listenerCount = 24 + Math.floor(Math.random() * 8);
  function tickCount() {
    listenerCount = Math.max(14, Math.min(44, listenerCount + (Math.random() < 0.55 ? 1 : -1)));
    var el = document.getElementById('fas-rw-count');
    if (el) el.textContent = listenerCount;
  }

  /* ── YouTube IFrame API ─────────────────────────────────────── */
  var ytReady     = false;
  var ytPlayer    = null;
  var pendingPlay = false;   // true if user clicked play before player was ready

  window.onYouTubeIframeAPIReady = function () {
    ytReady = true;
    var st  = STATIONS[activeStation];
    if (st.type !== 'yt') return;
    ytPlayer = new YT.Player('fas-rw-yt-iframe', {
      playerVars: {
        listType:  'playlist',
        list:       st.listId,
        autoplay:  0,
        controls:  0,
        rel:       0,
        modestbranding: 1,
        iv_load_policy: 3,
      },
      events: {
        onReady:       onYTReady,
        onStateChange: onYTState,
      },
    });
  };

  function loadYTAPI() {
    if (document.getElementById('yt-api-script')) return;
    var s = document.createElement('script');
    s.id  = 'yt-api-script';
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  }

  function onYTReady(e) {
    if (muted) e.target.mute();
    e.target.setVolume(volume);
    if (pendingPlay) {
      pendingPlay = false;
      ytCmd('playVideo');
    }
  }

  function onYTState(e) {
    var isPlaying = (e.data === YT.PlayerState.PLAYING);
    playing = isPlaying;
    setPlayIcon(isPlaying);
    if (isPlaying) updateNowPlaying();
  }

  function ytCmd(fn) {
    if (ytPlayer && ytPlayer[fn]) { try { ytPlayer[fn](); } catch(e2) {} }
  }

  /* ── HTML5 Audio player (Station 1) ────────────────────────── */
  var audioEl       = null;
  var audioTrackIdx = 0;

  function initAudio() {
    if (audioEl) return;
    audioEl = document.createElement('audio');
    audioEl.preload = 'metadata';
    audioEl.style.display = 'none';
    document.body.appendChild(audioEl);
    audioEl.addEventListener('ended',  function() { audioSkip(1, true); });
    audioEl.addEventListener('error',  function() { audioSkip(1, true); });
    audioEl.addEventListener('play',   function() { playing = true;  setPlayIcon(true);  updateNowPlayingAudio(); ss('is_playing', '1'); });
    audioEl.addEventListener('pause',  function() { playing = false; setPlayIcon(false); ss('is_playing', '0'); });
    audioEl.addEventListener('timeupdate', function() {
      var now = Date.now();
      if (!window.rwLastSaveTime || now - window.rwLastSaveTime > 5000) {
        ss('current_time', audioEl.currentTime);
        window.rwLastSaveTime = now;
      }
    });
  }

  function loadAudioTrack(idx, autoplay) {
    var tracks = STATIONS['1'].tracks;
    if (!audioEl) initAudio();
    if (!tracks || !tracks.length) {
      setNowPlayingText('No tracks loaded yet');
      setPlayIcon(false);
      return;
    }
    idx = ((idx % tracks.length) + tracks.length) % tracks.length;
    audioTrackIdx = idx;
    ss('track_index', idx);
    audioEl.src = tracks[idx].src;
    audioEl.addEventListener('loadedmetadata', function() {
      var savedTime = parseFloat(ss('current_time') || '0');
      if (savedTime > 0 && savedTime < audioEl.duration) {
        audioEl.currentTime = savedTime;
      }
      var savedPlaying = ss('is_playing') === '1';
      if (savedPlaying) {
        audioEl.play().catch(function() {});
      }
    }, { once: true });
    setNowPlayingText(tracks[idx].title || ('Track ' + (idx + 1)));
    if (autoplay) { audioEl.play().catch(function() {}); }
  }

  function audioPlayPause() {
    var tracks = STATIONS['1'].tracks;
    if (!audioEl) initAudio();
    if (!tracks || !tracks.length) return;
    if (!audioEl.src || audioEl.src === window.location.href) {
      loadAudioTrack(0, true);
      return;
    }
    if (audioEl.paused) { audioEl.play().catch(function() {}); }
    else { audioEl.pause(); }
  }

  function audioSkip(dir, auto) {
    var tracks = STATIONS['1'].tracks;
    if (!tracks || !tracks.length) return;
    loadAudioTrack(audioTrackIdx + dir, auto || playing);
  }

  function audioSetVolume(v) {
    if (audioEl) audioEl.volume = Math.max(0, Math.min(1, v / 100));
  }

  function audioMute(m) {
    if (audioEl) audioEl.muted = m;
  }

  function audioStop() {
    if (audioEl) { audioEl.pause(); audioEl.src = ''; }
    playing = false;
    setPlayIcon(false);
  }

  function setNowPlayingText(text) {
    var el = document.getElementById('fas-rw-now-playing');
    if (el) el.textContent = text;
  }

  function updateNowPlayingAudio() {
    var tracks = STATIONS['1'].tracks;
    if (!tracks || !tracks.length) { setNowPlayingText('No tracks loaded yet'); return; }
    var t = tracks[audioTrackIdx];
    setNowPlayingText(t ? (t.title || ('Track ' + (audioTrackIdx + 1))) : STATIONS['1'].label);
  }

  function setPlayIcon(isPlaying) {
    var btn = document.getElementById('fas-rw-play-btn');
    if (btn) btn.innerHTML = isPlaying ? '&#x23F8;' : '&#x25B6;';
    var btn2 = document.getElementById('fas-rw-play-btn2');
    if (btn2) btn2.innerHTML = isPlaying ? '&#x23F8;' : '&#x25B6;';
  }

  function updateNowPlaying() {
    if (!ytPlayer || !ytPlayer.getVideoData) return;
    try {
      var data  = ytPlayer.getVideoData();
      var title = (data && data.title) ? data.title : 'DJ Faceless Animal Radio';
      var el    = document.getElementById('fas-rw-now-playing');
      if (el) el.textContent = title;
    } catch(e) {}
  }

  /* ── Switch station ─────────────────────────────────────────── */
  function switchStation(id) {
    if (!STATIONS[id]) return;
    var prev = activeStation;
    activeStation = id;
    ss('station', id);

    var st = STATIONS[id];

    /* Update station buttons */
    document.querySelectorAll('.fas-rw-st-btn').forEach(function(b) {
      var on = b.dataset.station === id;
      b.classList.toggle('fas-rw-st-btn--active', on);
    });

    /* Update label in bar */
    var labelEl = document.getElementById('fas-rw-station-label');
    if (labelEl) labelEl.textContent = st.label;

    var controls = document.querySelector('.fas-rw-controls');
    var spotifyInfo = document.getElementById('fas-rw-spotify-info');

    /* ── Stop the previous station ── */
    if (prev === '1') {
      audioStop();
    } else if (prev === '2') {
      ytCmd('pauseVideo');
      playing     = false;
      pendingPlay = false;
    }

    /* ── Start the new station ── */
    if (st.type === 'audio') {
      /* Hide YT iframe, show audio controls */
      var ytWrap = document.getElementById('fas-rw-yt-wrap');
      if (ytWrap) ytWrap.style.display = 'none';
      if (controls)    controls.style.display    = '';
      if (spotifyInfo) spotifyInfo.style.display = 'none';
      initAudio();
      updateNowPlayingAudio();

    } else if (st.type === 'yt') {
      var ytWrap2 = document.getElementById('fas-rw-yt-wrap');
      if (ytWrap2) ytWrap2.style.display = '';
      if (controls)    controls.style.display    = '';
      if (spotifyInfo) spotifyInfo.style.display = 'none';

      if (ytReady && ytPlayer && ytPlayer.loadPlaylist) {
        try { ytPlayer.loadPlaylist({ list: st.listId, listType: 'playlist' }); }
        catch(e) {}
      } else {
        /* YT not loaded yet — load it now */
        loadYTAPI();
      }
      setPlayIcon(false);
      setNowPlayingText(st.label);

    } else if (st.type === 'spotify') {
      if (controls)    controls.style.display    = 'none';
      if (spotifyInfo) spotifyInfo.style.display = '';
      setPlayIcon(false);
      setNowPlayingText('Spotify — Open Radio page to listen');
    }
  }

  /* ── Chat ───────────────────────────────────────────────────── */
  var chatUnread    = 0;
  var chatLoaded    = false;
  var chatSubscription = null;

  function sbFetch(path2, params) {
    if (!SB_READY) return Promise.resolve([]);
    var qs = params ? '?' + Object.entries(params).map(function(e) {
      return encodeURIComponent(e[0]) + '=' + encodeURIComponent(e[1]);
    }).join('&') : '';
    return fetch(SB_URL + '/rest/v1/' + path2 + qs, {
      headers: {
        'apikey':        SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type':  'application/json',
      },
    })
    .then(function(r) { return r.ok ? r.json() : []; })
    .catch(function() { return []; });
  }

  function sbPost(path2, body) {
    if (!SB_READY) return Promise.resolve({ ok: false });
    return fetch(SB_URL + '/rest/v1/' + path2, {
      method: 'POST',
      headers: {
        'apikey':        SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify(body),
    });
  }

  function loadChat() {
    if (!SB_READY) {
      var feed = document.getElementById('fas-rw-chat-feed');
      if (feed) feed.innerHTML = '<p class="fas-rw-chat-offline">Chat connects when Supabase is live.</p>';
      return;
    }
    sbFetch('messages', {
      select: 'id,username,message,created_at',
      room_name: 'eq.radio',
      order: 'created_at.desc',
      limit: '20',
    }).then(function(rows) {
      chatLoaded = true;
      rows = (rows || []).reverse();
      var feed = document.getElementById('fas-rw-chat-feed');
      if (!feed) return;
      feed.innerHTML = '';
      if (!rows.length) {
        feed.innerHTML = '<p class="fas-rw-chat-empty">Be the first to send a message.</p>';
        return;
      }
      rows.forEach(function(row) { appendChatMsg(row, false); });
      feed.scrollTop = feed.scrollHeight;
    });

    /* Subscribe Realtime via WebSocket */
    subscribeChat();
  }

  function appendChatMsg(row, scroll) {
    var feed = document.getElementById('fas-rw-chat-feed');
    if (!feed) return;
    var empty = feed.querySelector('.fas-rw-chat-empty');
    if (empty) empty.remove();

    var msg = document.createElement('div');
    msg.className = 'fas-rw-chat-msg';
    msg.innerHTML =
      '<span class="fas-rw-chat-user">' + escHtml(row.username) + '</span>' +
      '<span class="fas-rw-chat-text">' + escHtml(row.message)  + '</span>';
    feed.appendChild(msg);
    if (scroll !== false) feed.scrollTop = feed.scrollHeight;

    /* Badge: if chat tab not active */
    if (activeTab !== 'chat') {
      chatUnread++;
      updateChatBadge();
    }
  }

  function updateChatBadge() {
    var badge = document.getElementById('fas-rw-chat-badge');
    if (badge) {
      badge.textContent = chatUnread > 0 ? chatUnread : '';
      badge.style.display = chatUnread > 0 ? 'inline-flex' : 'none';
    }
    /* Also update bar bubble if panel closed */
    var barBadge = document.getElementById('fas-rw-bar-chat-badge');
    if (barBadge) {
      barBadge.textContent = chatUnread > 0 ? chatUnread : '';
      barBadge.style.display = chatUnread > 0 ? 'inline-flex' : 'none';
    }
  }

  function subscribeChat() {
    if (!SB_READY || !window.RealtimeChannel) return;
    /* We use the lightweight Supabase Realtime JS directly if available.
       Otherwise, we poll every 12s as a fallback. */
    startChatPoll();
  }

  var lastChatId = null;
  var chatPollTimer = null;
  function startChatPoll() {
    if (chatPollTimer) return;
    chatPollTimer = setInterval(function() {
      sbFetch('messages', {
        select: 'id,username,message,created_at',
        room_name: 'eq.radio',
        order: 'created_at.desc',
        limit: '5',
      }).then(function(rows) {
        if (!rows || !rows.length) return;
        var newest = rows[0];
        if (lastChatId && newest.id !== lastChatId) {
          /* new messages since last check */
          var feed = document.getElementById('fas-rw-chat-feed');
          if (feed) {
            rows.reverse().forEach(function(row) {
              if (row.id !== lastChatId) appendChatMsg(row, true);
            });
          }
        }
        lastChatId = newest.id;
      });
    }, 12000);
  }

  /* ── DM badge ───────────────────────────────────────────────── */
  function loadDMBadge() {
    var sess = getSession();
    if (!sess || !sess.username) return;
    if (!SB_READY) return;

    sbFetch('dm_messages', {
      select: 'id',
      recipient: 'eq.' + sess.username.toLowerCase(),
      read_at:   'is.null',
    }).then(function(rows) {
      var count = (rows || []).length;
      var badge = document.getElementById('fas-rw-dm-badge');
      if (badge) {
        badge.textContent = count > 0 ? count : '';
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
      }
    });
  }

  /* ── Send chat message ─────────────────────────────────────── */
  function sendChat() {
    var input = document.getElementById('fas-rw-chat-input');
    if (!input) return;
    var text  = input.value.trim();
    if (!text) return;
    var sess  = getSession();
    if (!sess) { window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search); return; }

    sbPost('messages', {
      room_name: 'radio',
      username:  sess.username,
      message:   text,
    }).then(function() {
      input.value = '';
      /* Optimistic UI */
      appendChatMsg({ username: sess.username, message: text, created_at: new Date().toISOString() }, true);
    });
  }

  /* ── Escape util ────────────────────────────────────────────── */
  function escHtml(str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* ── Build widget HTML ─────────────────────────────────────── */
  function injectWidget() {
    if (document.getElementById('fas-radio-widget')) return;

    var sess = getSession();

    var widget = document.createElement('div');
    widget.id = 'fas-radio-widget';
    widget.setAttribute('role', 'complementary');
    widget.setAttribute('aria-label', 'DJ Faceless Animal Radio');

    widget.innerHTML = [

      /* ── Hidden YouTube player ── */
      '<div id="fas-rw-yt-wrap" style="position:fixed;bottom:0;left:-1px;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;z-index:-1;" aria-hidden="true">',
        '<iframe id="fas-rw-yt-iframe" frameborder="0" allowfullscreen',
          ' allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"',
        '></iframe>',
      '</div>',

      /* ── Spotify launch note (hidden by default) ── */
      '<div id="fas-rw-spotify-info" style="display:none;"></div>',

      /* ══ EXPANDED PANEL ══════════════════════════════════════ */
      '<div id="fas-rw-panel" role="region" aria-label="Radio panel" aria-hidden="true">',

        /* Tab bar */
        '<div class="fas-rw-tabs" role="tablist">',
          '<button class="fas-rw-tab fas-rw-tab--active" role="tab" aria-selected="true"  data-tab="radio" id="fas-rw-tab-radio-btn">',
            '&#x1F4FB; Radio',
          '</button>',
          '<button class="fas-rw-tab" role="tab" aria-selected="false" data-tab="chat"  id="fas-rw-tab-chat-btn">',
            '&#x1F4AC; Chat',
            '<span id="fas-rw-chat-badge" class="fas-rw-badge" style="display:none;">0</span>',
          '</button>',
          '<button class="fas-rw-tab" role="tab" aria-selected="false" data-tab="msgs"  id="fas-rw-tab-msgs-btn">',
            '&#x2709; Messages',
            '<span id="fas-rw-dm-badge" class="fas-rw-badge" style="display:none;">0</span>',
          '</button>',
        '</div>',

        /* ── Radio tab ── */
        '<div class="fas-rw-tab-body" id="fas-rw-tabpanel-radio" role="tabpanel">',
          /* Station picker */
          '<div class="fas-rw-station-row" role="group" aria-label="Station">',
            '<button class="fas-rw-st-btn fas-rw-st-btn--active" data-station="1">',
              '<span class="fas-rw-st-dot fas-rw-st-dot--on"></span> Stn 1',
            '</button>',
            '<button class="fas-rw-st-btn" data-station="2">',
              '<span class="fas-rw-st-dot fas-rw-st-dot--on"></span> Stn 2',
            '</button>',
            '<button class="fas-rw-st-btn" data-station="3">',
              '<span class="fas-rw-st-dot fas-rw-st-dot--spotify"></span> Spotify',
            '</button>',
          '</div>',
          /* Now playing */
          '<p class="fas-rw-now-playing-label">Now Playing</p>',
          '<p class="fas-rw-now-playing-title" id="fas-rw-now-playing">' + STATIONS[activeStation].label + '</p>',
          /* Panel controls */
          '<div class="fas-rw-panel-ctrl" id="fas-rw-panel-ctrl">',
            '<button class="fas-rw-ctrl-btn" id="fas-rw-prev-btn2"  title="Previous">&#x23EE;</button>',
            '<button class="fas-rw-ctrl-btn fas-rw-ctrl-btn--play" id="fas-rw-play-btn2" title="Play/Pause">&#x25B6;</button>',
            '<button class="fas-rw-ctrl-btn" id="fas-rw-next-btn2"  title="Next">&#x23ED;</button>',
          '</div>',
          /* Spotify station note */
          '<div class="fas-rw-spotify-panel" id="fas-rw-spotify-panel" style="display:none;">',
            '<p style="font-size:0.78rem;color:var(--text-2);text-align:center;padding:0.5rem;">',
              '&#x1F3B5; Spotify station — open the full radio page to listen.',
            '</p>',
            '<a href="radio.html" class="fas-rw-open-link">Open Radio Page &rarr;</a>',
          '</div>',
          /* Full page link */
          '<a href="radio.html" class="fas-rw-open-link" style="margin-top:0.75rem;">Open Full Radio Page &rarr;</a>',
          /* Listener count */
          '<p class="fas-rw-listener-note">&#x25CF; <span id="fas-rw-count-panel">24</span> listening now</p>',
        '</div>',

        /* ── Chat tab ── */
        '<div class="fas-rw-tab-body" id="fas-rw-tabpanel-chat" role="tabpanel" style="display:none;">',
          '<div class="fas-rw-chat-feed" id="fas-rw-chat-feed">',
            '<p class="fas-rw-chat-empty">Loading chat&hellip;</p>',
          '</div>',
          sess
            ? '<div class="fas-rw-chat-bar">' +
                '<input type="text" class="fas-rw-chat-input" id="fas-rw-chat-input" placeholder="Say something&hellip;" maxlength="280" autocomplete="off" />' +
                '<button class="fas-rw-chat-send" id="fas-rw-chat-send">&#x2192;</button>' +
              '</div>'
            : '<div class="fas-rw-chat-gate">' +
                '<a href="login.html" class="fas-rw-open-link">Sign in to chat &rarr;</a>' +
              '</div>',
        '</div>',

        /* ── Messages tab ── */
        '<div class="fas-rw-tab-body" id="fas-rw-tabpanel-msgs" role="tabpanel" style="display:none;">',
          sess
            ? '<div class="fas-rw-msgs-preview" id="fas-rw-msgs-preview"><p class="fas-rw-chat-empty">Loading messages&hellip;</p></div>' +
              '<a href="messages.html" class="fas-rw-open-link" style="margin-top:0.75rem;">Open Full Inbox &rarr;</a>'
            : '<div class="fas-rw-chat-gate">' +
                '<p style="font-size:0.8rem;color:var(--text-2);margin-bottom:0.6rem;">Sign in to see your messages.</p>' +
                '<a href="login.html" class="fas-rw-open-link">Sign In &rarr;</a>' +
              '</div>',
        '</div>',

      '</div>',
      /* ══ END PANEL ══════════════════════════════════════════ */

      /* ══ BOTTOM BAR (always visible) ════════════════════════ */
      '<div id="fas-rw-bar" tabindex="0" role="button" aria-expanded="false" aria-controls="fas-rw-panel" aria-label="DJ Faceless Animal Radio">',

        /* Left: boombox + live dot + label */
        '<div class="fas-rw-bar-left">',
          '<span class="fas-rw-boombox" aria-hidden="true">&#x1F4FB;</span>',
          '<span class="fas-rw-live-dot" aria-hidden="true"></span>',
          '<div class="fas-rw-label">',
            '<span class="fas-rw-station" id="fas-rw-station-label">' + STATIONS[activeStation].label + '</span>',
            '<span class="fas-rw-meta">Live &middot; <span id="fas-rw-count">24</span> in the room</span>',
          '</div>',
        '</div>',

        /* Center: playback controls */
        '<div class="fas-rw-controls">',
          '<button class="fas-rw-ctrl-btn" id="fas-rw-prev-btn"  title="Previous" aria-label="Previous">&#x23EE;</button>',
          '<button class="fas-rw-ctrl-btn fas-rw-ctrl-btn--play" id="fas-rw-play-btn" title="Play/Pause" aria-label="Play/Pause">&#x25B6;</button>',
          '<button class="fas-rw-ctrl-btn" id="fas-rw-next-btn"  title="Next" aria-label="Next">&#x23ED;</button>',
        '</div>',

        /* Right: volume + chat badge + expand + dismiss */
        '<div class="fas-rw-bar-right">',
          '<span class="fas-rw-vol-icon" id="fas-rw-vol-icon" title="Mute/Unmute" role="button" tabindex="0" aria-label="Mute">&#x1F50A;</span>',
          '<input type="range" class="fas-rw-vol-slider" id="fas-rw-vol-slider"',
            ' min="0" max="100" value="' + volume + '"',
            ' aria-label="Volume" title="Volume" />',
          '<button class="fas-rw-bar-icon-btn" id="fas-rw-bar-chat-btn" title="Chat" aria-label="Toggle chat">',
            '&#x1F4AC;',
            '<span id="fas-rw-bar-chat-badge" class="fas-rw-badge" style="display:none;">0</span>',
          '</button>',
          '<button class="fas-rw-expand-btn" id="fas-rw-expand-btn" aria-label="Expand radio widget">&#x2191;</button>',
          '<button class="fas-rw-dismiss"     id="fas-rw-dismiss"    aria-label="Dismiss radio widget">&#x2715;</button>',
        '</div>',

      '</div>',
      /* ══ END BAR ════════════════════════════════════════════ */

    ].join('');

    document.body.appendChild(widget);
    wireEvents();
    /* Only load YouTube API if the active station needs it */
    if (STATIONS[activeStation] && STATIONS[activeStation].type === 'yt') loadYTAPI();
    setInterval(tickCount, 6000);
    loadDMBadge();
    setInterval(loadDMBadge, 60000);

    /* Load Station 1 tracks from server */
    fetch('/api/radio/tracks')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (Array.isArray(data.tracks) && data.tracks.length) {
          STATIONS['1'].tracks = data.tracks;
          if (STATIONS['1'].tracks.length > 0) {
            var savedIdx = parseInt(ss('track_index') || '0', 10);
            if (savedIdx >= 0 && savedIdx < STATIONS['1'].tracks.length) {
              loadAudioTrack(savedIdx, false);
            }
          }
        }
      })
      .catch(function() { /* no tracks yet */ });

    /* Sync initial station */
    switchStation(activeStation);
  }

  /* ── Wire all events ────────────────────────────────────────── */
  function wireEvents() {

    /* ── Bar click → toggle panel ── */
    var bar = document.getElementById('fas-rw-bar');
    if (bar) {
      bar.addEventListener('click', function(e) {
        if (
          e.target.closest('#fas-rw-dismiss') ||
          e.target.closest('#fas-rw-expand-btn') ||
          e.target.closest('.fas-rw-controls') ||
          e.target.closest('.fas-rw-vol-slider') ||
          e.target.closest('#fas-rw-vol-icon') ||
          e.target.closest('#fas-rw-bar-chat-btn')
        ) return;
        togglePanel();
      });
      bar.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel(); }
      });
    }

    /* ── Expand button ── */
    var expandBtn = document.getElementById('fas-rw-expand-btn');
    if (expandBtn) expandBtn.addEventListener('click', function(e) { e.stopPropagation(); togglePanel(); });

    /* ── Bar chat button → open panel on chat tab ── */
    var barChatBtn = document.getElementById('fas-rw-bar-chat-btn');
    if (barChatBtn) barChatBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      openPanel();
      switchTab('chat');
    });

    /* ── Dismiss ── */
    var dismissBtn = document.getElementById('fas-rw-dismiss');
    if (dismissBtn) dismissBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      sessionStorage.setItem('fas_rw_dismissed', '1');
      var w = document.getElementById('fas-radio-widget');
      if (w) {
        w.style.transform = 'translateY(110%)';
        w.style.opacity   = '0';
        setTimeout(function() { if (w.parentNode) w.parentNode.removeChild(w); }, 380);
      }
    });

    /* ── Playback controls (bar + panel) ── */
    function handlePrev() {
      if (STATIONS[activeStation].type === 'audio') { audioSkip(-1, false); }
      else { ytCmd('previousVideo'); }
    }
    function handleNext() {
      if (STATIONS[activeStation].type === 'audio') { audioSkip(1, false); }
      else { ytCmd('nextVideo'); }
    }

    var playBtn = document.getElementById('fas-rw-play-btn');
    if (playBtn) playBtn.addEventListener('click', function(e) { e.stopPropagation(); togglePlay(); });
    var prevBtn = document.getElementById('fas-rw-prev-btn');
    if (prevBtn) prevBtn.addEventListener('click', function(e) { e.stopPropagation(); handlePrev(); });
    var nextBtn = document.getElementById('fas-rw-next-btn');
    if (nextBtn) nextBtn.addEventListener('click', function(e) { e.stopPropagation(); handleNext(); });

    var playBtn2 = document.getElementById('fas-rw-play-btn2');
    if (playBtn2) playBtn2.addEventListener('click', function() { togglePlay(); });
    var prevBtn2 = document.getElementById('fas-rw-prev-btn2');
    if (prevBtn2) prevBtn2.addEventListener('click', function() { handlePrev(); });
    var nextBtn2 = document.getElementById('fas-rw-next-btn2');
    if (nextBtn2) nextBtn2.addEventListener('click', function() { handleNext(); });

    /* ── Volume slider ── */
    var volSlider = document.getElementById('fas-rw-vol-slider');
    if (volSlider) volSlider.addEventListener('input', function() {
      volume = parseInt(this.value, 10);
      ss('volume', volume);
      audioSetVolume(volume);
      if (ytPlayer && ytPlayer.setVolume) {
        try { ytPlayer.setVolume(volume); if (volume > 0) { ytPlayer.unMute(); muted = false; ss('muted','0'); updateVolIcon(); } } catch(e) {}
      }
    });

    /* ── Mute toggle ── */
    var volIcon = document.getElementById('fas-rw-vol-icon');
    if (volIcon) {
      var muteToggle = function(e) {
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
        if (e.type === 'keydown') e.preventDefault();
        muted = !muted;
        ss('muted', muted ? '1' : '0');
        audioMute(muted);
        if (muted) { ytCmd('mute'); } else { ytCmd('unMute'); }
        updateVolIcon();
      };
      volIcon.addEventListener('click', muteToggle);
      volIcon.addEventListener('keydown', muteToggle);
    }

    /* ── Tabs ── */
    document.querySelectorAll('.fas-rw-tab').forEach(function(btn) {
      btn.addEventListener('click', function() { switchTab(btn.dataset.tab); });
    });

    /* ── Station buttons ── */
    document.querySelectorAll('.fas-rw-st-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { switchStation(btn.dataset.station); });
    });

    /* ── Chat send ── */
    var sendBtn = document.getElementById('fas-rw-chat-send');
    if (sendBtn) sendBtn.addEventListener('click', sendChat);
    var chatInput = document.getElementById('fas-rw-chat-input');
    if (chatInput) chatInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });

    /* Close panel on Escape */
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closePanel();
    });
  }

  /* ── Panel helpers ─────────────────────────────────────────── */
  var panelOpen = false;
  function togglePanel() { panelOpen ? closePanel() : openPanel(); }
  function openPanel() {
    panelOpen = true;
    var p = document.getElementById('fas-rw-panel');
    var bar = document.getElementById('fas-rw-bar');
    var btn = document.getElementById('fas-rw-expand-btn');
    if (p)   { p.classList.add('fas-rw-panel--open'); p.removeAttribute('aria-hidden'); }
    if (bar) bar.setAttribute('aria-expanded', 'true');
    if (btn) btn.innerHTML = '&#x2193;';
    if (activeTab === 'chat' && !chatLoaded) loadChat();
    if (activeTab === 'msgs') loadMsgPreview();
  }
  function closePanel() {
    panelOpen = false;
    var p = document.getElementById('fas-rw-panel');
    var bar = document.getElementById('fas-rw-bar');
    var btn = document.getElementById('fas-rw-expand-btn');
    if (p)   { p.classList.remove('fas-rw-panel--open'); p.setAttribute('aria-hidden', 'true'); }
    if (bar) bar.setAttribute('aria-expanded', 'false');
    if (btn) btn.innerHTML = '&#x2191;';
  }

  /* ── Tab switching ─────────────────────────────────────────── */
  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.fas-rw-tab').forEach(function(b) {
      var on = b.dataset.tab === tab;
      b.classList.toggle('fas-rw-tab--active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ['radio','chat','msgs'].forEach(function(t) {
      var panel = document.getElementById('fas-rw-tabpanel-' + t);
      if (panel) panel.style.display = (t === tab) ? '' : 'none';
    });
    if (tab === 'chat') {
      if (!chatLoaded) loadChat();
      chatUnread = 0;
      updateChatBadge();
    }
    if (tab === 'msgs') loadMsgPreview();
  }

  /* ── Play toggle ───────────────────────────────────────────── */
  function togglePlay() {
    var st = STATIONS[activeStation];
    if (st.type === 'audio') {
      audioPlayPause();
      return;
    }
    if (st.type !== 'yt') return;
    if (!ytPlayer) {
      pendingPlay = !pendingPlay;
      var _pb  = document.getElementById('fas-rw-play-btn');
      var _pb2 = document.getElementById('fas-rw-play-btn2');
      var _ico = pendingPlay ? '&#x27F3;' : '&#x25B6;';
      if (_pb)  _pb.innerHTML  = _ico;
      if (_pb2) _pb2.innerHTML = _ico;
      return;
    }
    if (playing) { ytCmd('pauseVideo'); } else { ytCmd('playVideo'); }
  }

  /* ── Volume icon ───────────────────────────────────────────── */
  function updateVolIcon() {
    var el = document.getElementById('fas-rw-vol-icon');
    if (el) el.innerHTML = muted || volume === 0 ? '&#x1F507;' : '&#x1F50A;';
  }

  /* ── DM messages preview ───────────────────────────────────── */
  function loadMsgPreview() {
    var sess = getSession();
    if (!sess) return;
    var container = document.getElementById('fas-rw-msgs-preview');
    if (!container) return;
    if (!SB_READY) { container.innerHTML = '<p class="fas-rw-chat-empty">Connect Supabase to see messages.</p>'; return; }

    sbFetch('dm_messages', {
      select: 'sender,message,created_at,read_at',
      recipient: 'eq.' + sess.username.toLowerCase(),
      order: 'created_at.desc',
      limit: '5',
    }).then(function(rows) {
      if (!rows || !rows.length) {
        container.innerHTML = '<p class="fas-rw-chat-empty">No messages yet.</p>';
        return;
      }
      container.innerHTML = '';
      rows.forEach(function(row) {
        var item = document.createElement('a');
        item.href = 'messages.html?with=' + encodeURIComponent(row.sender);
        item.className = 'fas-rw-msg-item' + (!row.read_at ? ' fas-rw-msg-item--unread' : '');
        item.innerHTML =
          '<span class="fas-rw-msg-from">@' + escHtml(row.sender) + '</span>' +
          '<span class="fas-rw-msg-text">' + escHtml((row.message || '').slice(0, 50)) + '</span>';
        container.appendChild(item);
      });
    });
  }

  /* ── Footer badge ──────────────────────────────────────────── */
  function injectFooterBadge() {
    var footerRight = document.querySelector('.footer-col--right');
    if (!footerRight || footerRight.querySelector('.fas-radio-active-badge')) return;
    var badge = document.createElement('p');
    badge.className = 'fas-radio-active-badge';
    badge.innerHTML =
      '<span class="fas-radio-active-badge-dot" aria-hidden="true"></span>' +
      '<a href="radio.html" style="color:inherit;text-decoration:none;">Radio Active</a>';
    footerRight.appendChild(badge);
  }

  /* ── Init ───────────────────────────────────────────────────── */
  function init() {
    if (sessionStorage.getItem('fas_rw_dismissed') === '1') { injectFooterBadge(); return; }
    injectWidget();
    injectFooterBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
