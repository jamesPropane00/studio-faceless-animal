(function () {
  'use strict';

  var API = {
    channels: '/api/tv/channels',
    uploads: '/api/tv/uploads',
  };

  var state = {
    session: null,
    owner: null,
    channels: [],
    uploads: [],
    activeFilter: 'all',
    activeChannelSlug: '',
    localMode: true,
  };

  var el = {};
  var MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem('fas_user') || 'null');
    } catch (err) {
      return null;
    }
  }

  function authHeaders() {
    if (!state.session) return {};
    return { 'x-fas-user': JSON.stringify(state.session) };
  }

  function setStatus(node, message, tone) {
    if (!node) return;
    node.textContent = message || '';
    node.style.color = tone === 'error' ? '#ff7a8c' : '#21f4d0';
  }

  function localCacheKey(name) {
    return 'fas_tv_' + name;
  }

  function readLocalJson(name, fallback) {
    try {
      return JSON.parse(localStorage.getItem(localCacheKey(name)) || 'null') || fallback;
    } catch (err) {
      return fallback;
    }
  }

  function writeLocalJson(name, value) {
    try {
      localStorage.setItem(localCacheKey(name), JSON.stringify(value));
    } catch (err) {}
  }

  function cleanOrigin(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function apiUrl(path, origin) {
    var cleanPath = String(path || '');
    if (!origin) return cleanPath;
    return cleanOrigin(origin) + '/' + cleanPath.replace(/^\/+/, '');
  }

  function tvOrigins() {
    var current = window.location && window.location.origin ? window.location.origin : '';
    var configured = cleanOrigin(window.FAS_TV_ORIGIN);
    var origins = [];

    if (configured) origins.push(configured);
    origins.push('');

    return origins.filter(function (origin, index) {
      if (origin && current && origin === current) return index === origins.indexOf(origin);
      return origins.indexOf(origin) === index;
    });
  }

  function sourceFromStoragePath(item) {
    var storagePath = item && item.storage_path ? String(item.storage_path).replace(/^\/+/, '') : '';
    var cfg = window.__FAS_CONFIG || {};
    var supabaseUrl = cleanOrigin(cfg.supabaseUrl || cfg.SUPABASE_URL);
    if (!storagePath || !supabaseUrl) return '';
    return supabaseUrl + '/storage/v1/object/public/tv-media/' + storagePath;
  }

  function videoSource(item) {
    if (!item) return '';
    return item.source_url ||
      item.external_video_url ||
      item.video_url ||
      item.playback_url ||
      item.src ||
      item.url ||
      sourceFromStoragePath(item) ||
      '';
  }

  function embedSource(item) {
    if (!item) return '';
    return item.embed_url || item.external_embed_url || item.iframe_url || '';
  }

  function hasPlayableVideo(item) {
    return Boolean(videoSource(item) || embedSource(item));
  }

  function uploadKey(item) {
    if (!item) return '';
    return String(item.id || item.external_video_id || item.storage_path || videoSource(item) || embedSource(item) || item.title || '').trim();
  }

  function currentChannelSlug() {
    if (state.activeChannelSlug) return state.activeChannelSlug;
    try {
      var params = new URLSearchParams(window.location.search || '');
      return slugify(params.get('channel') || params.get('channel_slug') || params.get('channelSlug') || '');
    } catch (err) {
      return '';
    }
  }

  function channelMatches(item, channelSlug) {
    if (!item || !channelSlug) return false;
    return [
      item.channel_slug,
      item.channel,
      item.channel_name,
      item.channel_id,
    ].some(function (value) {
      return slugify(value) === channelSlug;
    });
  }

  function firstPlayableUpload(uploads) {
    var playable = (uploads || []).filter(hasPlayableVideo);
    var channelSlug = currentChannelSlug() || slugify(state.owner && state.owner.channel_slug);
    if (channelSlug) {
      var channelFirst = playable.find(function (item) {
        return channelMatches(item, channelSlug);
      });
      if (channelFirst) return channelFirst;
    }
    return playable[0] || null;
  }

  function slugify(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function inferFilter(item) {
    var basis = [
      item.filter,
      item.channel_slug,
      item.channel_name,
      item.title,
      item.description,
    ].filter(Boolean).join(' ').toLowerCase();
    if (basis.indexOf('music') !== -1 || basis.indexOf('radio') !== -1) return 'music';
    if (basis.indexOf('neon') !== -1 || basis.indexOf('dream') !== -1) return 'neon-dreams';
    if (basis.indexOf('street') !== -1 || basis.indexOf('report') !== -1) return 'street';
    if (basis.indexOf('archive') !== -1 || basis.indexOf('vault') !== -1) return 'archive';
    return 'creator';
  }

  function ownerChannel() {
    return {
      id: 'owner-faceless-tv',
      channel_slug: 'faceless-animal-studios',
      channel_name: 'Faceless Animal Studios',
      channel_kind: 'owner',
      visibility: 'public',
      description: 'The owner channel that anchors the entire Faceless TV network.',
      username: 'facelessanimalstudios',
      display_name: 'Faceless Animal',
      is_owner: true,
      is_featured: true,
      parent_slug: null,
      invite_code: null,
      cover_url: 'assets/neon-dreams/covers/cover-thumb.jpg',
      external_channel_url: 'https://tv.facelessanimalstudios.com',
    };
  }

  function normalizeChannels(payload) {
    var owner = payload && payload.owner ? payload.owner : ownerChannel();
    var all = [owner].concat(payload && payload.channels ? payload.channels : [], payload && payload.mine ? payload.mine : []);
    var seen = {};
    var list = [];
    all.forEach(function (item) {
      if (!item) return;
      var key = String(item.channel_slug || item.id || item.channel_name || '').trim().toLowerCase();
      if (!key || seen[key]) return;
      seen[key] = true;
      list.push(item);
    });
    return { owner: owner, list: list };
  }

  function normalizeUploads(payload) {
    var all = []
      .concat(payload && payload.uploads ? payload.uploads : [])
      .concat(payload && payload.videos ? payload.videos : [])
      .concat(payload && payload.items ? payload.items : [])
      .concat(payload && payload.data ? payload.data : [])
      .concat(payload && payload.mine_uploads ? payload.mine_uploads : []);
    var seen = {};
    var list = [];
    all.forEach(function (item) {
      if (!item) return;
      var key = String(item.id || item.external_video_id || item.storage_path || item.source_url || item.title || '').trim().toLowerCase();
      if (key && seen[key]) return;
      if (key) seen[key] = true;
      list.push(item);
    });
    return list;
  }

  function renderOwner(owner) {
    var ownerTitle = qs('.tv-channel-owner h3');
    var ownerCopy = qs('.tv-channel-owner p');
    if (ownerTitle) ownerTitle.textContent = owner.channel_name || 'Faceless Animal Studios';
    if (ownerCopy) {
      ownerCopy.textContent = owner.description || 'The central channel that anchors the whole network. Users experience the branches, not the plumbing.';
    }
  }

  function renderChannelRow(channels) {
    var row = qs('.tv-channel-row');
    if (!row) return;

    var list = channels.filter(function (item) { return !item.is_owner; }).slice(0, 4);
    if (!list.length) {
      row.innerHTML = [
        '<article class="tv-channel-badge"><strong>LUX</strong><span>Architect lane</span></article>',
        '<article class="tv-channel-badge"><strong>NEON DREAMS</strong><span>Story and lore</span></article>',
        '<article class="tv-channel-badge"><strong>RADIO VISUALS</strong><span>Performance feed</span></article>',
        '<article class="tv-channel-badge"><strong>MEMBER CHANNELS</strong><span>Creator uploads</span></article>',
      ].join('');
      return;
    }

    row.innerHTML = list.map(function (item) {
      return [
        '<article class="tv-channel-badge">',
          '<strong>' + escapeHtml(item.channel_name || item.channel_slug || 'Channel') + '</strong>',
          '<span>' + escapeHtml((item.visibility || 'public') + ' / ' + (item.channel_kind || 'member')) + '</span>',
        '</article>',
      ].join('');
    }).join('');
  }

  function renderChannelSelect(channels) {
    if (!el.channelSelect) return;
    var list = channels.slice();
    if (!list.length) {
      el.channelSelect.innerHTML = '<option value="">Sign in to load channels</option>';
      el.channelSelect.disabled = true;
      return;
    }

    el.channelSelect.disabled = false;
    el.channelSelect.innerHTML = list.map(function (item) {
      var label = item.is_owner ? 'Owner / ' + (item.channel_name || item.channel_slug) : (item.channel_name || item.channel_slug);
      return '<option value="' + escapeHtml(item.channel_slug || '') + '">' + escapeHtml(label) + '</option>';
    }).join('');
  }

  function renderMyChannels(channels) {
    if (!el.myChannels) return;
    el.channelCount.textContent = String(channels.length);

    if (!channels.length) {
      el.myChannels.innerHTML = '<div class="tv-empty">No channels yet. Claim the first lane and the rest of the network can branch from there.</div>';
      return;
    }

    el.myChannels.innerHTML = channels.map(function (item) {
      var visibility = item.visibility || 'public';
      var invite = item.invite_code ? '<span>Invite: ' + escapeHtml(item.invite_code) + '</span>' : '';
      return [
        '<div class="tv-list-item">',
          '<strong>' + escapeHtml(item.channel_name || item.channel_slug) + '</strong>',
          '<span>' + escapeHtml(item.channel_slug || '') + ' / ' + escapeHtml(visibility) + '</span>',
          invite,
        '</div>',
      ].join('');
    }).join('');
  }

  function renderRecentUploads(uploads) {
    if (!el.recentUploads) return;
    var playable = uploads.filter(hasPlayableVideo);
    el.uploadCount.textContent = String(playable.length);

    if (!playable.length) {
      el.recentUploads.innerHTML = '<div class="tv-empty">No videos loaded from the channel archive yet.</div>';
      return;
    }

    el.recentUploads.innerHTML = playable.slice(0, 10).map(function (item) {
      var source = videoSource(item);
      var preview = source ? '<video class="tv-upload-preview" controls autoplay loop muted playsinline preload="auto" src="' + escapeHtml(source) + '"></video>' : '';
      return [
        '<div class="tv-list-item">',
          '<strong>' + escapeHtml(item.title || 'Untitled broadcast') + '</strong>',
          '<span>' + escapeHtml((item.channel_slug || 'channel') + ' / ' + (item.visibility || 'public') + ' / ' + (item.status || 'published')) + '</span>',
          preview,
        '</div>',
      ].join('');
    }).join('');

    activateVideos(el.recentUploads);
  }

  function renderCards(items) {
    if (!el.grid) return;

    var sourceItems = items.filter(hasPlayableVideo);
    var visible = sourceItems.filter(function (item) {
      return state.activeFilter === 'all' || inferFilter(item) === state.activeFilter;
    });
    if (el.archiveCount) el.archiveCount.textContent = String(visible.length);

    if (!visible.length) {
      el.grid.innerHTML = '<div class="tv-empty">No playable videos are available in this channel archive yet.</div>';
      renderFirstChannelVideo(sourceItems);
      return;
    }

    el.grid.innerHTML = visible.map(function (item) {
      var image = item.thumb_url || item.image || 'assets/neon-dreams/covers/cover-thumb.jpg';
      var title = item.title || 'Untitled broadcast';
      var description = item.copy || item.description || 'Faceless TV broadcast';
      var channel = item.channel || item.channel_name || item.channel_slug || 'Faceless TV';
      var duration = item.duration_label || (item.duration_seconds ? Math.max(1, Math.round(Number(item.duration_seconds) / 60)) + ' min' : (item.status || 'Video'));
      var source = videoSource(item);
      var embed = embedSource(item);
      var key = uploadKey(item);
      return [
        '<article class="tv-card" tabindex="0" data-key="' + escapeHtml(key) + '" data-title="' + escapeHtml(title) + '" data-copy="' + escapeHtml(description) + '" data-image="' + escapeHtml(image) + '" data-source="' + escapeHtml(source) + '" data-embed="' + escapeHtml(embed) + '">',
          '<div class="tv-thumb">',
            source
              ? '<video class="tv-thumb-video" controls autoplay loop muted playsinline preload="auto" src="' + escapeHtml(source) + '" poster="' + escapeHtml(image) + '"></video>'
              : '<iframe src="' + escapeHtml(embed) + '" title="' + escapeHtml(title) + '" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>',
            '<span class="tv-play" aria-hidden="true">&gt;</span>',
            '<span class="tv-meta">' + escapeHtml(duration) + '</span>',
          '</div>',
          '<div class="tv-card-body">',
            '<h3>' + escapeHtml(title) + '</h3>',
            '<p>' + escapeHtml(channel + ' / ' + description) + '</p>',
          '</div>',
        '</article>',
      ].join('');
    }).join('');

    activateVideos(el.grid);

    qsa('.tv-card', el.grid).forEach(function (card) {
      card.addEventListener('click', function () {
        featureCard(card);
      });
      card.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          featureCard(card);
        }
      });
    });

    renderFirstChannelVideo(sourceItems);
  }

  function renderFirstChannelVideo(items) {
    var first = firstPlayableUpload(items);
    if (!first) {
      renderEmptyFeature();
      return;
    }
    featureUpload(first);
    setActiveCard(uploadKey(first));
  }

  function renderEmptyFeature() {
    if (!el.screen || !el.featureTitle || !el.featureCopy) return;
    el.featureTitle.textContent = 'No Videos Loaded';
    el.featureCopy.textContent = 'The TV page is waiting for published videos from the channel archive.';
    el.screen.innerHTML = [
      '<div class="tv-screen-placeholder">',
        '<div>',
          '<strong>Archive Empty</strong>',
          '<span>No playable video URL was returned by the channel archive.</span>',
        '</div>',
      '</div>',
    ].join('');
  }

  function featureCard(card) {
    if (!el.screen || !el.featureTitle || !el.featureCopy) return;
    var title = card.getAttribute('data-title') || 'Selected Broadcast';
    var copy = card.getAttribute('data-copy') || '';
    var source = card.getAttribute('data-source') || '';
    var embed = card.getAttribute('data-embed') || '';
    var key = card.getAttribute('data-key') || '';

    el.featureTitle.textContent = title;
    el.featureCopy.textContent = copy;
    setActiveCard(key);

    if (source) {
      el.screen.innerHTML = '<video controls autoplay loop muted playsinline preload="auto" src="' + escapeHtml(source) + '"></video>';
      activateVideos(el.screen);
      return;
    }

    if (embed) {
      el.screen.innerHTML = '<iframe src="' + escapeHtml(embed) + '" title="' + escapeHtml(title) + '" loading="eager" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>';
      return;
    }

    renderEmptyFeature();
  }

  function featureUpload(item) {
    if (!el.screen || !el.featureTitle || !el.featureCopy) return;
    var title = item.title || 'Selected Broadcast';
    var copy = item.copy || item.description || 'Faceless TV broadcast';
    var source = videoSource(item);
    var embed = embedSource(item);
    var key = uploadKey(item);

    el.featureTitle.textContent = title;
    el.featureCopy.textContent = copy;
    setActiveCard(key);

    if (source) {
      el.screen.innerHTML = '<video controls autoplay loop muted playsinline preload="auto" src="' + escapeHtml(source) + '"></video>';
      activateVideos(el.screen);
      return;
    }

    if (embed) {
      el.screen.innerHTML = '<iframe src="' + escapeHtml(embed) + '" title="' + escapeHtml(title) + '" loading="eager" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>';
      return;
    }

    renderEmptyFeature();
  }

  function setActiveCard(key) {
    if (!el.grid) return;
    qsa('.tv-card', el.grid).forEach(function (card) {
      card.classList.toggle('is-active', Boolean(key) && card.getAttribute('data-key') === key);
    });
  }

  function syncFilterButtons() {
    qsa('.tv-filter').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-filter') === state.activeFilter);
    });
  }

  function activateVideos(root) {
    if (!root) return;
    qsa('video', root).forEach(function (video) {
      try {
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.loop = true;
        video.preload = 'auto';

        var startPreview = function () {
          try {
            if (video.ended && Number.isFinite(video.duration)) video.currentTime = 0;
            var playPromise = video.play();
            if (playPromise && typeof playPromise.catch === 'function') {
              playPromise.catch(function () {});
            }
          } catch (err) {}
        };

        if (video.readyState >= 2) {
          startPreview();
        } else {
          video.addEventListener('loadeddata', startPreview, { once: true });
          video.addEventListener('canplay', startPreview, { once: true });
          video.load();
        }
      } catch (err) {}
    });
  }

  function setShellMode() {
    if (el.sourceLabel) {
      el.sourceLabel.textContent = state.localMode ? 'Local Preview' : 'Faceless TV';
    }
    if (el.uploadLink) {
      el.uploadLink.href = state.session ? '#tv-studio' : 'login.html?redirect=tv.html#tv-studio';
      el.uploadLink.textContent = state.session ? 'Create Channel' : 'Sign In';
    }
  }

  function syncFormAvailability() {
    var locked = !state.session;
    qsa('#tv-channel-form input, #tv-channel-form textarea, #tv-channel-form select, #tv-channel-form button').forEach(function (node) {
      node.disabled = locked;
    });
    qsa('#tv-upload-form input, #tv-upload-form textarea, #tv-upload-form select, #tv-upload-form button').forEach(function (node) {
      node.disabled = locked;
    });
    if (locked) {
      setStatus(el.channelStatus, 'Sign in to create a channel.', 'error');
      setStatus(el.uploadStatus, 'Sign in to upload video.', 'error');
    }
  }

  async function fetchJson(url, options) {
    var res = await fetch(url, options || {});
    var data = null;
    try {
      data = await res.json();
    } catch (err) {
      data = null;
    }
    if (!res.ok) {
      var message = data && (data.error || data.message) ? (data.error || data.message) : ('Request failed: ' + res.status);
      throw new Error(message);
    }
    return data;
  }

  async function fetchTvJson(path, options) {
    var origins = tvOrigins();
    var lastError = null;

    for (var i = 0; i < origins.length; i += 1) {
      try {
        return await fetchJson(apiUrl(path, origins[i]), options);
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('TV archive request failed.');
  }

  async function loadNetwork() {
    state.session = getSession();
    state.localMode = !window.FAS_TV_ORIGIN;
    setShellMode();
    syncFormAvailability();

    var headers = authHeaders();
    var channelPayload = null;
    var uploadPayload = null;

    try {
      channelPayload = await fetchTvJson(API.channels, { headers: headers });
      uploadPayload = await fetchTvJson(API.uploads, { headers: headers });
      state.localMode = false;
    } catch (err) {
      console.info('[TV] network load fallback:', err && err.message ? err.message : err);
      channelPayload = readLocalJson('channels_cache', { owner: ownerChannel(), channels: [], mine: [] });
      uploadPayload = readLocalJson('uploads_cache', { uploads: [], mine_uploads: [] });
      state.localMode = true;
    }

    var normalizedChannels = normalizeChannels(channelPayload);
    var uploads = normalizeUploads(uploadPayload);

    state.owner = normalizedChannels.owner;
    state.channels = normalizedChannels.list;
    state.uploads = uploads;
    writeLocalJson('channels_cache', channelPayload);
    writeLocalJson('uploads_cache', uploadPayload);

    var ownedChannels = state.channels.filter(function (item) {
      if (item.is_owner) return true;
      return state.session && String(item.username || '').toLowerCase() === String(state.session.username || '').toLowerCase();
    });

    renderOwner(state.owner);
    renderChannelRow(state.channels);
    renderChannelSelect(ownedChannels);
    renderMyChannels(state.session ? ownedChannels : []);
    renderRecentUploads(state.session ? state.uploads : uploadPayload.uploads || []);
    renderCards(state.uploads);
    activateVideos(el.recentUploads);
    syncFilterButtons();
    setShellMode();
  }

  function bindFilterRail() {
    qsa('.tv-filter').forEach(function (button) {
      button.addEventListener('click', function () {
        state.activeFilter = button.getAttribute('data-filter') || 'all';
        syncFilterButtons();
        renderCards(state.uploads);
      });
    });
  }

  function bindChannelForm() {
    if (!el.channelForm) return;

    el.channelForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (!state.session) {
        setStatus(el.channelStatus, 'Sign in first.', 'error');
        return;
      }

      var payload = {
        channel_name: el.channelForm.channel_name.value,
        channel_slug: el.channelForm.channel_slug.value,
        visibility: el.channelForm.visibility.value,
        description: el.channelForm.description.value,
      };

      setStatus(el.channelStatus, 'Creating channel...');
      try {
        var result = await fetchJson(API.channels, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify(payload),
        });
        setStatus(el.channelStatus, 'Channel created: ' + (result.channel && (result.channel.channel_name || result.channel.channel_slug) || 'ready'), 'success');
        el.channelForm.reset();
        await loadNetwork();
      } catch (err) {
        if (!state.localMode) {
          setStatus(el.channelStatus, err.message || 'Could not create channel.', 'error');
          return;
        }
        var localChannels = readLocalJson('channels_cache', { owner: ownerChannel(), channels: [], mine: [] });
        var created = {
          id: 'local-' + Date.now(),
          account_id: state.session && state.session.account_id || null,
          username: state.session && state.session.username || 'guest',
          display_name: state.session && (state.session.display || state.session.display_name) || 'Guest',
          channel_slug: slugify(payload.channel_slug || payload.channel_name),
          channel_name: payload.channel_name,
          channel_kind: 'member',
          visibility: payload.visibility,
          description: payload.description,
          parent_slug: 'faceless-animal-studios',
          invite_code: payload.visibility === 'private' ? 'TV-LOCAL-0000' : null,
          is_owner: false,
          is_featured: false,
        };
        localChannels.mine = localChannels.mine || [];
        localChannels.channels = localChannels.channels || [];
        localChannels.channels.push(created);
        localChannels.mine.push(created);
        writeLocalJson('channels_cache', localChannels);
        setStatus(el.channelStatus, 'Saved in Faceless TV test mode.', 'success');
        el.channelForm.reset();
        await loadNetwork();
      }
    });
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || '');
        var comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = function () {
        reject(new Error('Could not read file.'));
      };
      reader.readAsDataURL(file);
    });
  }

  function bindUploadForm() {
    if (!el.uploadForm) return;

    el.uploadForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (!state.session) {
        setStatus(el.uploadStatus, 'Sign in first.', 'error');
        return;
      }

      var channelSlug = el.uploadForm.channel_id.value;
      var title = el.uploadForm.title.value;
      var description = el.uploadForm.description.value;
      var visibility = el.uploadForm.visibility.value;
      var file = el.uploadForm.file.files && el.uploadForm.file.files[0] ? el.uploadForm.file.files[0] : null;
      var fileBase64 = null;

      if (!channelSlug) {
        setStatus(el.uploadStatus, 'Choose a channel.', 'error');
        return;
      }
      if (!title) {
        setStatus(el.uploadStatus, 'Enter a title.', 'error');
        return;
      }
      if (!file) {
        setStatus(el.uploadStatus, 'Choose a video file.', 'error');
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setStatus(el.uploadStatus, '50MB max while Faceless TV is in test mode. Choose a smaller video for now.', 'error');
        return;
      }

      setStatus(el.uploadStatus, 'Uploading...');
      try {
        fileBase64 = await readFileAsBase64(file);
        var result = await fetchJson(API.uploads, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify({
            channel_slug: channelSlug,
            title: title,
            description: description,
            visibility: visibility,
            file_name: file.name,
            file_type: file.type || 'video/mp4',
            file_size_bytes: file.size,
            file_b64: fileBase64,
          }),
        });
        setStatus(el.uploadStatus, 'Upload published: ' + (result.upload && result.upload.title ? result.upload.title : 'done'), 'success');
        el.uploadForm.reset();
        await loadNetwork();
      } catch (err) {
        if (!state.localMode) {
          setStatus(el.uploadStatus, err.message || 'Upload failed.', 'error');
          return;
        }
        var localUploads = readLocalJson('uploads_cache', { uploads: [], mine_uploads: [] });
        var previewUrl = fileBase64 ? ('data:' + (file.type || 'video/mp4') + ';base64,' + fileBase64) : URL.createObjectURL(file);
        var createdUpload = {
          id: 'local-' + Date.now(),
          username: state.session && state.session.username || 'guest',
          channel_slug: channelSlug,
          title: title,
          description: description,
          visibility: visibility,
          status: 'published',
          file_name: file.name,
          file_type: file.type || 'video/mp4',
          file_size_bytes: file.size,
          source_url: previewUrl,
          external_video_url: previewUrl,
          duration_seconds: null,
          is_published: true,
          thumb_url: 'assets/neon-dreams/covers/cover-thumb.jpg',
        };
        localUploads.uploads = localUploads.uploads || [];
        localUploads.mine_uploads = localUploads.mine_uploads || [];
        localUploads.uploads.unshift(createdUpload);
        localUploads.mine_uploads.unshift(createdUpload);
        writeLocalJson('uploads_cache', localUploads);
        setStatus(el.uploadStatus, 'Saved in Faceless TV test mode.', 'success');
        el.uploadForm.reset();
        await loadNetwork();
      }
    });
  }

  function initDom() {
    el.grid = qs('#tv-grid');
    el.screen = qs('#tv-screen');
    el.featureTitle = qs('#tv-feature-title');
    el.featureCopy = qs('#tv-feature-copy');
    el.sourceLabel = qs('#tv-source-label');
    el.uploadLink = qs('#tv-upload-link');
    el.channelSelect = qs('#tv-upload-channel');
    el.myChannels = qs('#tv-my-channels');
    el.recentUploads = qs('#tv-recent-uploads');
    el.channelCount = qs('#tv-channel-count');
    el.uploadCount = qs('#tv-upload-count');
    el.archiveCount = qs('#tv-archive-count');
    el.channelStatus = qs('#tv-channel-status');
    el.uploadStatus = qs('#tv-upload-status');
    el.channelForm = qs('#tv-channel-form');
    el.uploadForm = qs('#tv-upload-form');
    state.activeChannelSlug = currentChannelSlug();
  }

  function boot() {
    initDom();
    bindFilterRail();
    bindChannelForm();
    bindUploadForm();
    loadNetwork();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());

