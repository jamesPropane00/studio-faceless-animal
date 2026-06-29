(function () {
  'use strict';

  var API = {
    channels: '/api/tv/channels',
    uploads: '/api/tv/uploads',
    comments: '/api/tv/comments',
    reactions: '/api/tv/reactions',
  };

  var state = {
    session: null,
    owner: null,
    channels: [],
    uploads: [],
    activeFilter: 'all',
    activeChannelSlug: '',
    playlist: [],
    playlistIndex: -1,
    autoplaying: false,
    localMode: true,
    soundUnlocked: false,
    activeCommentTarget: null,
    activeReactionTarget: null,
    activeShareTarget: null,
    lineupKey: '',
    lineupTimer: null,
    manualSelection: false,
    inlineArchiveCard: null,
    resumeMode: false,
    compressedUploadFile: null,
    compressionBusy: false,
  };

  var el = {};
  var MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
  var FALLBACK_SUPABASE_URL = 'https://ghufaozjwondqcrcucjs.supabase.co';
  var FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_kixI74nB7Drt6mQKooaXHg_nPoE0h_-';

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

  function formatBytes(bytes) {
    var size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0) return '0 MB';
    if (size >= 1024 * 1024 * 1024) return (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    return (size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 1 : 2) + ' MB';
  }

  function updateUploadSizeNote(file) {
    if (!el.uploadSizeNote) return;
    if (state.compressedUploadFile) {
      el.uploadSizeNote.textContent = 'Compressed file ready: ' + formatBytes(state.compressedUploadFile.size) + '.';
      el.uploadSizeNote.style.color = state.compressedUploadFile.size <= MAX_UPLOAD_BYTES ? '#21f4d0' : '#ff7a8c';
      return;
    }
    if (!file) {
      el.uploadSizeNote.textContent = 'Choose a video to see its file size.';
      el.uploadSizeNote.style.color = '';
      return;
    }
    var sizeText = formatBytes(file.size);
    var limitText = formatBytes(MAX_UPLOAD_BYTES);
    var overLimit = file.size > MAX_UPLOAD_BYTES;
    el.uploadSizeNote.textContent = overLimit
      ? sizeText + ' selected. Limit is ' + limitText + ' right now.'
      : sizeText + ' selected. Limit is ' + limitText + '.';
    el.uploadSizeNote.style.color = overLimit ? '#ff7a8c' : '#21f4d0';
  }

  function selectedUploadFile() {
    if (state.compressedUploadFile) return state.compressedUploadFile;
    if (!el.uploadForm || !el.uploadForm.file) return null;
    return el.uploadForm.file.files && el.uploadForm.file.files[0] ? el.uploadForm.file.files[0] : null;
  }

  function uploadOriginalFile() {
    if (!el.uploadForm || !el.uploadForm.file) return null;
    return el.uploadForm.file.files && el.uploadForm.file.files[0] ? el.uploadForm.file.files[0] : null;
  }

  function setCompressionStatus(message, tone) {
    if (!el.compressStatus) return;
    el.compressStatus.textContent = message || '';
    el.compressStatus.style.color = tone === 'error' ? '#ff7a8c' : (tone === 'warn' ? '#d4b56c' : '#21f4d0');
  }

  function showCompressionWidget() {
    if (!el.compressWidget) return;
    el.compressWidget.hidden = false;
    el.compressWidget.setAttribute('aria-hidden', 'false');
    updateCompressionEstimate();
  }

  function hideCompressionWidget() {
    if (!el.compressWidget || state.compressionBusy) return;
    el.compressWidget.hidden = true;
    el.compressWidget.setAttribute('aria-hidden', 'true');
  }

  function compressionBitrate(width, height) {
    var longSide = Math.max(Number(width || 0), Number(height || 0));
    if (longSide >= 1280) return 1800000;
    if (longSide >= 854) return 1200000;
    return 850000;
  }

  function targetCompressionSize(width, height, duration) {
    var bitrate = compressionBitrate(width, height);
    return Math.round((Number(duration || 0) * bitrate / 8) * 1.14);
  }

  function compressionTarget(width, height) {
    var w = Number(width || 0);
    var h = Number(height || 0);
    if (!w || !h) return { width: 640, height: 380 };
    var portrait = h > w;
    var maxLongSide = 720;
    var longSide = Math.max(w, h);
    var scale = longSide > maxLongSide ? maxLongSide / longSide : 1;
    var targetW = Math.round(w * scale);
    var targetH = Math.round(h * scale);
    if (Math.min(w, h) >= 380 && Math.min(targetW, targetH) < 380) {
      var minScale = 380 / Math.min(w, h);
      targetW = Math.round(w * minScale);
      targetH = Math.round(h * minScale);
    }
    if (portrait) {
      targetW = Math.max(214, targetW);
      targetH = Math.max(380, targetH);
    } else {
      targetW = Math.max(380, targetW);
      targetH = Math.max(214, targetH);
    }
    return {
      width: Math.max(2, targetW - (targetW % 2)),
      height: Math.max(2, targetH - (targetH % 2)),
    };
  }

  function readVideoMetadata(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = function () {
        var meta = {
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
          duration: video.duration || 0,
        };
        URL.revokeObjectURL(url);
        resolve(meta);
      };
      video.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read that video.'));
      };
      video.src = url;
    });
  }

  async function updateCompressionEstimate() {
    var file = uploadOriginalFile();
    if (!el.compressEstimate) return;
    if (!file) {
      el.compressEstimate.textContent = 'Choose a video first.';
      if (el.compressStart) el.compressStart.disabled = true;
      return;
    }
    if (state.compressedUploadFile) {
      el.compressEstimate.textContent = 'Ready to upload: ' + formatBytes(state.compressedUploadFile.size) + '.';
      if (el.compressStart) el.compressStart.disabled = true;
      return;
    }
    try {
      var meta = await readVideoMetadata(file);
      var target = compressionTarget(meta.width, meta.height);
      var estimate = targetCompressionSize(target.width, target.height, meta.duration);
      var canFit = estimate <= MAX_UPLOAD_BYTES;
      el.compressEstimate.textContent = 'Estimate: about ' + formatBytes(estimate) + ' at ' + target.width + 'x' + target.height + '. ' + (canFit ? 'Likely under 50MB.' : 'May still be over 50MB.');
      if (el.compressStart) el.compressStart.disabled = false;
    } catch (err) {
      el.compressEstimate.textContent = 'Estimate unavailable for this file.';
      if (el.compressStart) el.compressStart.disabled = !window.MediaRecorder;
    }
  }

  function setCompressionProgress(percent) {
    if (!el.compressProgress) return;
    var value = Math.max(0, Math.min(100, Number(percent || 0)));
    el.compressProgress.style.setProperty('--progress', value + '%');
    el.compressProgress.setAttribute('aria-valuenow', String(Math.round(value)));
  }

  function compressVideoFile(file) {
    return new Promise(function (resolve, reject) {
      if (!window.MediaRecorder) {
        reject(new Error('This browser cannot compress video on this page.'));
        return;
      }

      var url = URL.createObjectURL(file);
      var source = document.createElement('video');
      source.src = url;
      source.muted = false;
      source.playsInline = true;
      source.setAttribute('playsinline', '');
      source.setAttribute('webkit-playsinline', '');
      source.preload = 'auto';

      source.onloadedmetadata = function () {
        var target = compressionTarget(source.videoWidth, source.videoHeight);
        var canvas = document.createElement('canvas');
        canvas.width = target.width;
        canvas.height = target.height;
        var ctx = canvas.getContext('2d', { alpha: false });
        var fps = 24;
        var stream = canvas.captureStream ? canvas.captureStream(fps) : null;
        var audioContext = null;
        if (!stream || !ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('This browser cannot compress video on this page.'));
          return;
        }
        try {
          var AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            audioContext = new AudioContextClass();
            var sourceNode = audioContext.createMediaElementSource(source);
            var destinationNode = audioContext.createMediaStreamDestination();
            var silentGain = audioContext.createGain();
            silentGain.gain.value = 0;
            sourceNode.connect(destinationNode);
            sourceNode.connect(silentGain);
            silentGain.connect(audioContext.destination);
            destinationNode.stream.getAudioTracks().forEach(function (track) {
              stream.addTrack(track);
            });
          }
        } catch (err) {
          audioContext = null;
        }
        var closeAudio = function () {
          if (audioContext && typeof audioContext.close === 'function') {
            audioContext.close().catch(function () {});
          }
        };
        var bitrate = compressionBitrate(target.width, target.height);
        var chunks = [];
        var mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : (MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm');
        var recorder = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: bitrate,
        });
        var drawing = true;
        var draw = function () {
          if (!drawing) return;
          try {
            ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
          } catch (err) {}
          setCompressionProgress(source.duration ? (source.currentTime / source.duration) * 100 : 0);
          window.requestAnimationFrame(draw);
        };
        recorder.ondataavailable = function (event) {
          if (event.data && event.data.size) chunks.push(event.data);
        };
        recorder.onerror = function () {
          drawing = false;
          closeAudio();
          URL.revokeObjectURL(url);
          reject(new Error('Compression failed in this browser.'));
        };
        recorder.onstop = function () {
          drawing = false;
          closeAudio();
          URL.revokeObjectURL(url);
          setCompressionProgress(100);
          var blob = new Blob(chunks, { type: 'video/webm' });
          var name = file.name.replace(/\.[^.]+$/, '') + '-compressed.webm';
          resolve(new File([blob], name, { type: 'video/webm', lastModified: Date.now() }));
        };
        source.onended = function () {
          if (recorder.state !== 'inactive') recorder.stop();
        };
        recorder.start(1000);
        draw();
        if (audioContext && audioContext.state === 'suspended') {
          audioContext.resume().catch(function () {});
        }
        source.play().catch(function () {
          source.muted = true;
          source.play().catch(function () {
            if (recorder.state !== 'inactive') recorder.stop();
            reject(new Error('Tap Compress again if your phone blocked playback.'));
          });
        });
      };
      source.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Could not load that video for compression.'));
      };
    });
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

  function localReactionKey(target) {
    return 'reaction_' + (target && (target.uploadId || target.uploadKey) || 'none');
  }

  function localReactionCountsKey(target) {
    return 'reaction_counts_' + (target && (target.uploadId || target.uploadKey) || 'none');
  }

  function readReactionChoice(target) {
    try {
      return localStorage.getItem(localCacheKey(localReactionKey(target))) || '';
    } catch (err) {
      return '';
    }
  }

  function writeReactionChoice(target, choice) {
    try {
      var key = localCacheKey(localReactionKey(target));
      if (choice) {
        localStorage.setItem(key, choice);
      } else {
        localStorage.removeItem(key);
      }
    } catch (err) {}
  }

  function numberFromItem(item, names) {
    for (var i = 0; i < names.length; i += 1) {
      var value = Number(item && item[names[i]]);
      if (Number.isFinite(value) && value >= 0) return Math.floor(value);
    }
    return 0;
  }

  function reactionTargetFromItem(item) {
    var target = commentTargetFromItem(item);
    target.likes = numberFromItem(item, ['likes', 'like_count', 'upvotes', 'upvote_count']);
    target.dislikes = numberFromItem(item, ['dislikes', 'dislike_count', 'downvotes', 'downvote_count']);
    target.title = item && (item.title || item.name) || '';
    target.media = videoSource(item) || item && (item.thumb_url || item.image) || '';
    return target;
  }

  function reactionTargetFromCard(card) {
    var target = commentTargetFromCard(card);
    target.likes = Number(card.getAttribute('data-likes') || 0);
    target.dislikes = Number(card.getAttribute('data-dislikes') || 0);
    target.title = card.getAttribute('data-title') || '';
    target.media = card.getAttribute('data-source') || card.getAttribute('data-image') || '';
    return target;
  }

  function reactionTargetFromKey(uploadKeyValue) {
    var item = (state.uploads || []).find(function (upload) {
      return uploadKey(upload) === uploadKeyValue;
    });
    return item ? reactionTargetFromItem(item) : { uploadKey: uploadKeyValue, uploadId: '', likes: 0, dislikes: 0 };
  }

  function seedReactionCounts(target) {
    var cached = readLocalJson(localReactionCountsKey(target), null);
    if (cached) return cached;
    return {
      likes: Math.max(0, Number(target && target.likes || 0)),
      dislikes: Math.max(0, Number(target && target.dislikes || 0)),
    };
  }

  function renderReactions(target) {
    if (!el.likeButton || !el.dislikeButton || !el.likeCount || !el.dislikeCount || !el.reactionNote) return;
    state.activeReactionTarget = target || null;
    if (!target || !target.uploadKey) {
      el.likeCount.textContent = '0';
      el.dislikeCount.textContent = '0';
      el.likeButton.classList.remove('active');
      el.dislikeButton.classList.remove('active');
      el.likeButton.disabled = true;
      el.dislikeButton.disabled = true;
      el.reactionNote.textContent = '';
      return;
    }

    var counts = seedReactionCounts(target);
    var choice = readReactionChoice(target);
    el.likeCount.textContent = String(counts.likes || 0);
    el.dislikeCount.textContent = String(counts.dislikes || 0);
    el.likeButton.classList.toggle('active', choice === 'like');
    el.dislikeButton.classList.toggle('active', choice === 'dislike');
    el.likeButton.disabled = false;
    el.dislikeButton.disabled = false;
    el.reactionNote.textContent = choice ? 'Reaction saved.' : '';
  }

  function renderChannelVideoActions(root) {
    var base = root || el.channelPageGrid;
    var cards = base && base.matches && base.matches('[data-channel-video-key]')
      ? [base]
      : qsa('[data-channel-video-key]', base);
    cards.forEach(function (node) {
      var target = reactionTargetFromKey(node.getAttribute('data-channel-video-key') || '');
      var counts = seedReactionCounts(target);
      var choice = readReactionChoice(target);
      var like = qs('[data-channel-video-like]', node);
      var dislike = qs('[data-channel-video-dislike]', node);
      if (like) {
        like.classList.toggle('active', choice === 'like');
        like.querySelector('span').textContent = String(counts.likes || 0);
      }
      if (dislike) {
        dislike.classList.toggle('active', choice === 'dislike');
        dislike.querySelector('span').textContent = String(counts.dislikes || 0);
      }
    });
  }

  function shareUrlForTarget(target) {
    var base = window.location && window.location.href ? window.location.href : 'tv.html';
    var url;
    try {
      url = new URL(base);
    } catch (err) {
      url = new URL('tv.html', window.location && window.location.origin ? window.location.origin : document.baseURI);
    }
    url.searchParams.delete('v');
    if (target && target.uploadKey) {
      url.searchParams.set('video', target.uploadKey);
    }
    url.hash = 'tv-watch';
    return url.toString();
  }

  function titleForTarget(target) {
    return target && (target.title || target.name) || 'Faceless TV video';
  }

  function renderShare(target) {
    state.activeShareTarget = target || null;
    if (!el.shareButton || !el.shareNote) return;
    if (!target || !target.uploadKey) {
      el.shareButton.disabled = true;
      el.shareNote.textContent = '';
      return;
    }
    el.shareButton.disabled = false;
    el.shareNote.textContent = '';
  }

  function renderFeatureWire(target) {
    if (!el.featureWire) return;
    if (!target || !target.uploadKey || !window.FASStreetWire) {
      el.featureWire.innerHTML = '';
      return;
    }
    el.featureWire.innerHTML = window.FASStreetWire.markup(
      'tv-' + target.uploadKey,
      titleForTarget(target),
      shareUrlForTarget(target),
      target.media || ''
    );
    window.FASStreetWire.bindAll(el.featureWire);
  }

  function fallbackCopyText(text) {
    var input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    input.setSelectionRange(0, input.value.length);
    var copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (err) {
      copied = false;
    }
    document.body.removeChild(input);
    return copied;
  }

  async function shareActiveVideo() {
    var target = state.activeShareTarget || state.activeReactionTarget;
    if (!target || !target.uploadKey || !el.shareNote) return;
    var url = shareUrlForTarget(target);
    try {
      if (navigator.share) {
        await navigator.share({
          title: titleForTarget(target),
          text: titleForTarget(target),
          url: url,
        });
        el.shareNote.textContent = 'Shared.';
        return;
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else if (!fallbackCopyText(url)) {
        throw new Error('copy failed');
      }
      el.shareNote.textContent = 'Link copied.';
    } catch (err) {
      el.shareNote.textContent = url;
    }
  }

  async function shareTarget(target, noteNode) {
    if (!target || !target.uploadKey || !noteNode) return;
    var url = shareUrlForTarget(target);
    try {
      if (navigator.share) {
        await navigator.share({
          title: titleForTarget(target),
          text: titleForTarget(target),
          url: url,
        });
        noteNode.textContent = 'Shared.';
        return;
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else if (!fallbackCopyText(url)) {
        throw new Error('copy failed');
      }
      noteNode.textContent = 'Link copied.';
    } catch (err) {
      noteNode.textContent = url;
    }
  }

  async function saveVideoReaction(target, choice, afterRender) {
    if (!target || !target.uploadKey || !choice) return;
    var previous = readReactionChoice(target);
    var next = previous === choice ? '' : choice;
    var counts = seedReactionCounts(target);

    if (previous === 'like') counts.likes = Math.max(0, counts.likes - 1);
    if (previous === 'dislike') counts.dislikes = Math.max(0, counts.dislikes - 1);
    if (next === 'like') counts.likes += 1;
    if (next === 'dislike') counts.dislikes += 1;

    writeReactionChoice(target, next);
    writeLocalJson(localReactionCountsKey(target), counts);
    if (afterRender) afterRender(target);

    fetchJson(API.reactions, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upload_id: target.uploadId || null,
        upload_key: target.uploadKey,
        reaction: next || 'clear',
      }),
    }).then(function (payload) {
      if (!payload || !payload.counts) return;
      writeLocalJson(localReactionCountsKey(target), {
        likes: Math.max(0, Number(payload.counts.likes || 0)),
        dislikes: Math.max(0, Number(payload.counts.dislikes || 0)),
      });
      if (afterRender) afterRender(target);
    }).catch(function () {});
  }

  async function reactToVideo(choice) {
    saveVideoReaction(state.activeReactionTarget, choice, renderReactions);
  }

  function cleanOrigin(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function supabaseConfig() {
    var cfg = window.__FAS_CONFIG || {};
    return {
      url: cleanOrigin(cfg.supabaseUrl || cfg.SUPABASE_URL || FALLBACK_SUPABASE_URL),
      key: cfg.supabaseAnonKey || cfg.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY,
    };
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

  function isVideoUrl(value) {
    return /\.(mp4|mov|m4v|webm|ogg)(\?.*)?$/i.test(String(value || ''));
  }

  function uploadKey(item) {
    if (!item) return '';
    return String(item.comment_key || item.id || item.external_video_id || item.storage_path || videoSource(item) || embedSource(item) || item.title || '').trim();
  }

  function uuidOrEmpty(value) {
    var raw = String(value || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : '';
  }

  function commentTargetFromItem(item) {
    if (!item) return null;
    var key = uploadKey(item);
    if (!key) return null;
    return {
      uploadId: uuidOrEmpty(item.id),
      uploadKey: key,
    };
  }

  function commentTargetFromCard(card) {
    if (!card) return null;
    var key = card.getAttribute('data-key') || '';
    if (!key) return null;
    return {
      uploadId: uuidOrEmpty(card.getAttribute('data-upload-id') || ''),
      uploadKey: key,
    };
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

  function currentVideoKey() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      return String(params.get('video') || params.get('upload') || params.get('upload_key') || '').trim();
    } catch (err) {
      return '';
    }
  }

  function channelMatches(item, channelSlug) {
    if (!item || !channelSlug) return false;
    var wanted = looseChannelSlug(channelSlug);
    return [
      item.channel_slug,
      item.channel,
      item.channel_name,
      item.channel_id,
      item.external_channel_id,
      item.parent_slug,
    ].some(function (value) {
      return looseChannelSlug(value) === wanted;
    });
  }

  function looseChannelSlug(value) {
    return slugify(value).replace(/[_-]+/g, '');
  }

  function channelSlugOf(item) {
    return slugify(item && (item.channel_slug || item.channel || item.channel_name || item.id));
  }

  function channelPageUrl(item) {
    var slug = channelSlugOf(item);
    return slug ? 'tv.html?channel=' + encodeURIComponent(slug) + '#tv-channel-page' : 'tv.html';
  }

  function channelImage(item) {
    return item && (item.cover_url || item.avatar_url || item.profile_pic_url || item.image_url || item.photo_url) || 'assets/neon-dreams/covers/cover-thumb.jpg';
  }

  function ownerChannelSlug() {
    return slugify(state.owner && state.owner.channel_slug || 'faceless-animal-studios');
  }

  function uploadChannelSlug(item) {
    return channelSlugOf(item);
  }

  function uploadChannelName(item) {
    return item && (item.channel_name || item.channel || item.channel_slug || item.display_name || item.username) || '';
  }

  function channelCreditFromItem(item) {
    var slug = uploadChannelSlug(item);
    if (!slug || slug === ownerChannelSlug()) return null;
    return {
      slug: slug,
      name: uploadChannelName(item) || slug.replace(/-/g, ' '),
    };
  }

  function channelCreditFromCard(card) {
    var slug = slugify(card && card.getAttribute('data-channel-slug'));
    if (!slug || slug === ownerChannelSlug()) return null;
    return {
      slug: slug,
      name: card.getAttribute('data-channel-name') || slug.replace(/-/g, ' '),
    };
  }

  function renderChannelCredit(credit) {
    if (!el.channelCredit) return;
    if (!credit || !credit.slug) {
      el.channelCredit.hidden = true;
      el.channelCredit.innerHTML = '';
      return;
    }
    el.channelCredit.hidden = false;
    el.channelCredit.innerHTML = [
      '<span>Channel</span>',
      '<a href="tv.html?channel=' + encodeURIComponent(credit.slug) + '#tv-channel-page">' + escapeHtml(credit.name) + '</a>',
    ].join('');
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

  function easternParts(date) {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(date || new Date());
      var out = {};
      parts.forEach(function (part) {
        if (part.type !== 'literal') out[part.type] = part.value;
      });
      return {
        year: Number(out.year),
        month: Number(out.month),
        day: Number(out.day),
        hour: Number(out.hour),
        minute: Number(out.minute),
      };
    } catch (err) {
      var fallback = date || new Date();
      return {
        year: fallback.getFullYear(),
        month: fallback.getMonth() + 1,
        day: fallback.getDate(),
        hour: fallback.getHours(),
        minute: fallback.getMinutes(),
      };
    }
  }

  function dateKeyFromParts(parts) {
    return [
      String(parts.year).padStart(4, '0'),
      String(parts.month).padStart(2, '0'),
      String(parts.day).padStart(2, '0'),
    ].join('-');
  }

  function previousEasternDateKey(parts) {
    var utc = Date.UTC(parts.year, parts.month - 1, parts.day) - 24 * 60 * 60 * 1000;
    var prev = new Date(utc);
    return [
      String(prev.getUTCFullYear()).padStart(4, '0'),
      String(prev.getUTCMonth() + 1).padStart(2, '0'),
      String(prev.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }

  function currentLineupKey() {
    var parts = easternParts(new Date());
    var dateKey = dateKeyFromParts(parts);
    if (parts.hour < 9) return previousEasternDateKey(parts) + '-18';
    if (parts.hour < 12) return dateKey + '-09';
    if (parts.hour < 18) return dateKey + '-12';
    return dateKey + '-18';
  }

  function seedFromString(value) {
    var hash = 2166136261;
    var text = String(value || '');
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    var value = seed >>> 0;
    return function () {
      value = Math.imul(value + 0x6D2B79F5, 1);
      var t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleItems(items, seedKey) {
    var list = (items || []).slice();
    var random = seededRandom(seedFromString(seedKey));
    for (var i = list.length - 1; i > 0; i -= 1) {
      var j = Math.floor(random() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function buildPlaylist(items) {
    var playable = (items || []).filter(hasPlayableVideo);
    var channelSlug = currentChannelSlug() || slugify(state.owner && state.owner.channel_slug);
    var channelItems = channelSlug
      ? playable.filter(function (item) { return channelMatches(item, channelSlug); })
      : [];
    var base = channelItems.length ? channelItems : playable;
    state.lineupKey = currentLineupKey();
    state.playlist = shuffleItems(base, state.lineupKey + ':' + (channelSlug || 'all'));
    state.playlistIndex = state.playlist.length ? 0 : -1;
  }

  function currentPlaylistUpload() {
    if (!state.playlist.length || state.playlistIndex < 0) return null;
    return state.playlist[state.playlistIndex] || null;
  }

  function playNextUpload() {
    if (state.manualSelection) return;
    if (!state.playlist.length) return;
    if (state.playlist.length === 1) {
      state.playlistIndex = 0;
    } else {
      state.playlistIndex = (state.playlistIndex + 1) % state.playlist.length;
    }
    state.autoplaying = true;
    featureUpload(currentPlaylistUpload());
  }

  function playPlaylistOffset(offset) {
    if (!state.playlist.length) buildPlaylist(state.uploads || []);
    if (!state.playlist.length) return;
    if (state.playlist.length === 1) {
      state.playlistIndex = 0;
    } else {
      state.playlistIndex = (state.playlistIndex + offset + state.playlist.length) % state.playlist.length;
    }
    state.autoplaying = true;
    state.manualSelection = false;
    featureUpload(currentPlaylistUpload());
    setActiveCard(uploadKey(currentPlaylistUpload()));
  }

  function scheduleLineupRefresh() {
    if (state.lineupTimer) window.clearTimeout(state.lineupTimer);
    state.lineupTimer = window.setTimeout(function () {
      var nextKey = currentLineupKey();
      if (nextKey !== state.lineupKey) {
        renderCards(state.uploads || []);
      }
      scheduleLineupRefresh();
    }, 60 * 1000);
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

  function readSoundUnlocked() {
    try {
      return localStorage.getItem('fas_tv_sound_unlocked') === '1';
    } catch (err) {
      return false;
    }
  }

  function writeSoundUnlocked() {
    state.soundUnlocked = true;
    try {
      localStorage.setItem('fas_tv_sound_unlocked', '1');
    } catch (err) {}
  }

  function mainVideoMarkup(source) {
    var button = state.soundUnlocked ? '' : '<button class="tv-sound-toggle" type="button" data-tv-sound-toggle aria-label="Turn on TV sound">Sound</button>';
    return '<video class="tv-main-video" controls autoplay muted playsinline preload="metadata" src="' + escapeHtml(source) + '"></video>' + button;
  }

  function stopActivePlayback() {
    if (!el.screen) return;
    qsa('video, iframe', el.screen).forEach(function (node) {
      try {
        if (node.tagName && node.tagName.toLowerCase() === 'video') {
          node.pause();
          node.removeAttribute('src');
          node.load();
        } else if (node.tagName && node.tagName.toLowerCase() === 'iframe') {
          node.src = 'about:blank';
        }
      } catch (err) {}
    });
  }

  function renderResumeTVPrompt() {
    if (!el.screen) return;
    el.screen.classList.remove('is-portrait', 'is-landscape');
    el.screen.removeAttribute('data-tv-ratio');
    el.screen.style.aspectRatio = '';
    el.screen.style.maxWidth = '';
    el.screen.innerHTML = [
      '<button class="tv-resume" id="tv-resume" type="button">',
        '<span>TV paused</span>',
        '<strong>Resume Scheduled TV</strong>',
      '</button>',
    ].join('');
    state.resumeMode = true;
  }

  function resumeScheduledTV() {
    state.manualSelection = false;
    state.resumeMode = false;
    stopInlineArchivePlayback(null);
    var current = currentPlaylistUpload() || firstPlayableUpload(state.uploads || []);
    if (current) {
      featureUpload(current);
      setActiveCard(uploadKey(current));
      return;
    }
    renderEmptyFeature();
  }

  function playMainVideoNow(root) {
    var video = root && root.querySelector ? root.querySelector('.tv-main-video') : null;
    if (!video) return;
    var start = function () {
      try {
        var playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(function () {});
        }
      } catch (err) {}
    };
    if (video.readyState >= 2) {
      start();
    } else {
      video.addEventListener('loadeddata', start, { once: true });
      video.addEventListener('canplay', start, { once: true });
    }
  }

  function restoreInlineArchiveCard(card) {
    if (!card) return;
    var thumb = card.querySelector('.tv-thumb');
    if (!thumb) return;
    card.classList.remove('is-inline-playing', 'is-inline-portrait');
    thumb.removeAttribute('data-tv-ratio');
    var source = card.getAttribute('data-source') || '';
    var image = card.getAttribute('data-image') || 'assets/neon-dreams/covers/cover-thumb.jpg';
    var duration = card.getAttribute('data-duration') || 'Video';
    var embed = card.getAttribute('data-embed') || '';
    thumb.innerHTML = [
      source
        ? '<video class="tv-thumb-video" muted playsinline preload="metadata" src="' + escapeHtml(source) + '#t=0.1"></video>'
        : '<div class="tv-screen-preview"><img src="' + escapeHtml(image) + '" alt="" loading="lazy" /></div>',
      '<button class="tv-play" type="button" aria-label="Play ' + escapeHtml(card.getAttribute('data-title') || 'video') + '"><span class="tv-play-mark" aria-hidden="true"><i></i><i></i></span></button>',
      '<span class="tv-meta">' + escapeHtml(duration) + '</span>',
    ].join('');
    activateVideos(thumb);
  }

  function stopInlineArchivePlayback(exceptCard) {
    if (state.inlineArchiveCard && state.inlineArchiveCard !== exceptCard) {
      qsa('video, iframe', state.inlineArchiveCard).forEach(function (node) {
        try {
          if (node.tagName && node.tagName.toLowerCase() === 'video') {
            node.pause();
            node.removeAttribute('src');
            node.load();
          } else if (node.tagName && node.tagName.toLowerCase() === 'iframe') {
            node.src = 'about:blank';
          }
        } catch (err) {}
      });
      restoreInlineArchiveCard(state.inlineArchiveCard);
      state.inlineArchiveCard = null;
    }
  }

  function playArchiveCardInline(card) {
    if (!card) return;
    var thumb = card.querySelector('.tv-thumb');
    if (!thumb) return;
    var source = card.getAttribute('data-source') || '';
    var embed = card.getAttribute('data-embed') || '';
    var title = card.getAttribute('data-title') || 'Selected Broadcast';

    stopInlineArchivePlayback(card);
    state.inlineArchiveCard = card;
    card.classList.add('is-inline-playing');

    if (source) {
      thumb.innerHTML = '<video class="tv-inline-video" controls autoplay playsinline preload="metadata" src="' + escapeHtml(source) + '"></video>';
      var video = thumb.querySelector('.tv-inline-video');
      if (video) {
        video.muted = false;
        video.defaultMuted = false;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.addEventListener('loadedmetadata', function () { syncInlineArchiveRatio(video, card); });
        video.addEventListener('loadeddata', function () { syncInlineArchiveRatio(video, card); });
        video.addEventListener('canplay', function () { syncInlineArchiveRatio(video, card); });
        video.addEventListener('playing', function () { syncInlineArchiveRatio(video, card); });
        syncInlineArchiveRatio(video, card);
        queueInlineRatioChecks(video, card);
        var playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(function () {});
        }
        bindInlineArchiveSwipe(video, card);
        video.addEventListener('ended', function () { playArchiveOffset(card, 1); });
      }
      return;
    }

    if (embed) {
      thumb.innerHTML = '<iframe class="tv-inline-frame" src="' + escapeHtml(embed) + '" title="' + escapeHtml(title) + '" loading="eager" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>';
    }
  }

  function syncInlineArchiveRatio(video, card) {
    if (!video || !card) return;
    var thumb = card.querySelector('.tv-thumb');
    if (!thumb) return;
    var w = Number(video.videoWidth || 0);
    var h = Number(video.videoHeight || 0);
    var portrait = w > 0 && h > 0 && h > w;
    card.classList.toggle('is-inline-portrait', portrait);
    thumb.setAttribute('data-tv-ratio', portrait ? 'portrait' : 'landscape');
  }

  function queueInlineRatioChecks(video, card) {
    [80, 240, 700, 1400].forEach(function (delay) {
      window.setTimeout(function () { syncInlineArchiveRatio(video, card); }, delay);
    });
  }

  function playArchiveOffset(card, offset) {
    var cards = qsa('.tv-card', el.grid);
    var index = cards.indexOf(card);
    if (index < 0 || !cards.length) return;
    var next = cards[(index + offset + cards.length) % cards.length];
    if (next) featureCard(next);
  }

  function bindInlineArchiveSwipe(surface, card) {
    if (!surface || surface.dataset.tvSwipeBound === '1') return;
    surface.dataset.tvSwipeBound = '1';
    var startX = 0;
    var startY = 0;
    surface.addEventListener('touchstart', function (event) {
      var touch = event.touches && event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
    }, { passive: true });
    surface.addEventListener('touchend', function (event) {
      var touch = event.changedTouches && event.changedTouches[0];
      if (!touch) return;
      var dx = touch.clientX - startX;
      var dy = touch.clientY - startY;
      if (Math.abs(dx) < 54 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      playArchiveOffset(card, dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function syncScreenRatio(video) {
    if (!el.screen || !video || !video.classList.contains('tv-main-video')) return;
    var w = Number(video.videoWidth || 0);
    var h = Number(video.videoHeight || 0);
    var portrait = w > 0 && h > 0 && h > w;
    var ratio = portrait ? 'portrait' : 'landscape';
    el.screen.classList.toggle('is-portrait', portrait);
    el.screen.classList.toggle('is-landscape', !portrait);
    el.screen.setAttribute('data-tv-ratio', ratio);
    el.screen.style.aspectRatio = portrait ? '9 / 16' : '16 / 9';
    el.screen.style.maxWidth = portrait ? 'min(100%, 420px)' : '';
  }

  function queueRatioChecks(video) {
    [80, 240, 700, 1400].forEach(function (delay) {
      window.setTimeout(function () { syncScreenRatio(video); }, delay);
    });
  }

  function bindSoundToggle(root) {
    var button = root && root.querySelector ? root.querySelector('[data-tv-sound-toggle]') : null;
    var video = root && root.querySelector ? root.querySelector('.tv-main-video') : null;
    if (!button || !video) return;
    button.addEventListener('click', function () {
      writeSoundUnlocked();
      video.muted = false;
      video.defaultMuted = false;
      video.volume = 0.78;
      button.remove();
      var playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () {});
      }
    });
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
    var ownerCopy = qs('.tv-channel-owner-copy');
    var ownerLink = qs('#tv-owner-channel-link');
    if (ownerTitle) ownerTitle.textContent = owner.channel_name || 'Faceless Animal Studios';
    if (ownerCopy) {
      ownerCopy.textContent = owner.description || 'The central channel that anchors the whole network. Users experience the branches, not the plumbing.';
    }
    if (ownerLink) ownerLink.href = channelPageUrl(owner);
  }

  function channelVideoCount(uploads, channelSlug) {
    if (!channelSlug) return 0;
    return (uploads || []).filter(function (item) {
      return hasPlayableVideo(item) && channelMatches(item, channelSlug);
    }).length;
  }

  function renderChannelRow(channels, uploads) {
    var row = qs('.tv-channel-row');
    if (!row) return;

    var list = channels.filter(function (item) { return !item.is_owner; }).sort(function (a, b) {
      return String(a.channel_name || a.channel_slug || '').localeCompare(String(b.channel_name || b.channel_slug || ''));
    });
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
      var slug = channelSlugOf(item);
      var count = channelVideoCount(uploads, slug);
      var label = count + ' video' + (count === 1 ? '' : 's');
      return [
        '<a class="tv-channel-badge" href="' + escapeHtml(channelPageUrl(item)) + '">',
          '<img src="' + escapeHtml(channelImage(item)) + '" alt="" loading="lazy" />',
          '<span>',
            '<strong>' + escapeHtml(item.channel_name || item.channel_slug || 'Channel') + '</strong>',
            '<small>' + escapeHtml((item.visibility || 'public') + ' / ' + label) + '</small>',
          '</span>',
        '</a>',
      ].join('');
    }).join('');
  }

  function renderChannelPage(channels, uploads) {
    if (!el.channelPage) return;
    var slug = currentChannelSlug();
    if (!slug) {
      el.channelPage.hidden = true;
      return;
    }

    var channel = (channels || []).find(function (item) {
      return channelSlugOf(item) === slug;
    }) || null;
    var videos = (uploads || []).filter(function (item) {
      return hasPlayableVideo(item) && channelMatches(item, slug);
    });
    var name = channel && (channel.channel_name || channel.channel_slug) || slug.replace(/-/g, ' ');
    var description = channel && channel.description || 'Creator videos from this Faceless TV channel.';
    var image = channelImage(channel);

    el.channelPage.hidden = false;
    if (el.channelPageImage) el.channelPageImage.src = image;
    if (el.channelPageImage) el.channelPageImage.alt = '';
    if (el.channelPageTitle) el.channelPageTitle.textContent = name;
    if (el.channelPageCopy) el.channelPageCopy.textContent = description;
    if (el.channelPageMeta) el.channelPageMeta.textContent = videos.length + ' video' + (videos.length === 1 ? '' : 's');
    if (!el.channelPageGrid) return;

    if (!videos.length) {
      el.channelPageGrid.innerHTML = '<div class="tv-empty">No public videos are on this channel yet.</div>';
      return;
    }

    el.channelPageGrid.innerHTML = videos.map(function (item) {
      var source = videoSource(item);
      var imageUrl = item.thumb_url || item.image || image;
      var key = uploadKey(item);
      var title = item.title || 'Untitled broadcast';
      var target = reactionTargetFromItem(item);
      var counts = seedReactionCounts(target);
      return [
        '<article class="tv-channel-video" data-channel-video-key="' + escapeHtml(key) + '">',
          '<a class="tv-channel-video-main" href="tv.html?channel=' + encodeURIComponent(slug) + '&video=' + encodeURIComponent(key) + '#tv-watch">',
            '<span class="tv-channel-video-thumb">',
              source
                ? '<video muted playsinline preload="metadata" src="' + escapeHtml(source) + '#t=0.1"></video>'
                : '<img src="' + escapeHtml(imageUrl) + '" alt="" loading="lazy" />',
            '</span>',
            '<strong>' + escapeHtml(title) + '</strong>',
            '<small>' + escapeHtml(item.description || item.copy || 'Faceless TV video') + '</small>',
          '</a>',
          '<div class="tv-channel-video-actions">',
            '<button type="button" data-channel-video-like>Like <span>' + escapeHtml(counts.likes || 0) + '</span></button>',
            '<button type="button" data-channel-video-dislike>Dislike <span>' + escapeHtml(counts.dislikes || 0) + '</span></button>',
            '<button type="button" data-channel-video-share>Share</button>',
            '<a href="tv.html?channel=' + encodeURIComponent(slug) + '&video=' + encodeURIComponent(key) + '#tv-comments">Comment</a>',
          '</div>',
          '<small class="tv-channel-video-note" aria-live="polite"></small>',
        '</article>',
      ].join('');
    }).join('');

    activateVideos(el.channelPageGrid);
    bindChannelVideoActions(el.channelPageGrid);
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
          '<strong><a href="' + escapeHtml(channelPageUrl(item)) + '">' + escapeHtml(item.channel_name || item.channel_slug) + '</a></strong>',
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
      var preview = source ? '<video class="tv-upload-preview" muted playsinline preload="metadata" src="' + escapeHtml(source) + '#t=0.1"></video>' : '';
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

  function localCommentsKey(target) {
    return 'comments_' + (target && (target.uploadId || target.uploadKey) || 'none');
  }

  function commentCategory(key) {
    return 'comment:' + String(key || '').slice(0, 120);
  }

  function normalizeSharedComment(row) {
    return {
      id: row.id || row.created_at || ('shared-comment-' + Date.now()),
      username: row.author_username || row.username || 'member',
      display_name: row.author_username || row.username || 'Member',
      body_text: row.body_text || row.post_text || '',
      created_at: row.created_at || new Date().toISOString(),
    };
  }

  function mergeComments() {
    var merged = [];
    var seen = {};
    Array.prototype.slice.call(arguments).forEach(function (list) {
      (list || []).forEach(function (item) {
        if (!item || !item.body_text) return;
        var sig = String(item.username || item.display_name || '') + '|' + String(item.body_text || '');
        if (seen[sig]) return;
        seen[sig] = true;
        merged.push(item);
      });
    });
    return merged.sort(function (a, b) {
      return Number(new Date(a.created_at || 0)) - Number(new Date(b.created_at || 0));
    });
  }

  async function fetchSharedPostComments(key) {
    var cfg = supabaseConfig();
    if (!cfg.url || !cfg.key || !key) return [];
    var headers = {
      apikey: cfg.key,
      Authorization: 'Bearer ' + cfg.key,
    };
    var category = encodeURIComponent(commentCategory(key));
    var signalUrl = cfg.url
      + '/rest/v1/signal_posts'
      + '?select=id,author_username,body_text,category,post_type,created_at'
      + '&moderation_state=eq.approved'
      + '&visibility=eq.public'
      + '&category=eq.' + category
      + '&order=created_at.asc'
      + '&limit=200';
    var boardUrl = cfg.url
      + '/rest/v1/board_posts'
      + '?select=id,username,post_text,category,created_at'
      + '&is_approved=eq.true'
      + '&visibility_status=eq.visible'
      + '&category=eq.' + category
      + '&order=created_at.asc'
      + '&limit=200';
    var results = await Promise.all([
      fetchJson(signalUrl, { headers: headers }).catch(function () { return []; }),
      fetchJson(boardUrl, { headers: headers }).catch(function () { return []; }),
    ]);
    return mergeComments(
      (results[0] || []).map(normalizeSharedComment),
      (results[1] || []).map(normalizeSharedComment)
    );
  }

  async function persistSharedPostComment(key, bodyText) {
    var cfg = supabaseConfig();
    if (!cfg.url || !cfg.key || !key || !bodyText) throw new Error('Shared comments unavailable.');
    var session = state.session || {};
    var headers = {
      apikey: cfg.key,
      Authorization: 'Bearer ' + cfg.key,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };
    var signalPayload = {
      author_username: String(session.username || 'guest').toLowerCase(),
      post_type: 'comment',
      category: commentCategory(key),
      body_text: bodyText,
      moderation_state: 'approved',
      visibility: 'public',
    };
    try {
      return await fetchJson(cfg.url + '/rest/v1/signal_posts?select=id,author_username,body_text,category,created_at', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(signalPayload),
      });
    } catch (err) {
      return fetchJson(cfg.url + '/rest/v1/board_posts?select=id,username,post_text,category,created_at', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          username: String(session.username || 'guest').toLowerCase(),
          post_text: bodyText,
          category: commentCategory(key),
          is_approved: true,
          visibility_status: 'visible',
        }),
      });
    }
  }

  function renderComments(comments, message) {
    if (!el.commentsList || !el.commentCount) return;
    var list = comments || [];
    el.commentCount.textContent = String(list.length);
    if (message) {
      el.commentsList.innerHTML = '<div class="tv-empty">' + escapeHtml(message) + '</div>';
      return;
    }
    if (!list.length) {
      el.commentsList.innerHTML = '<div class="tv-empty">No comments yet.</div>';
      return;
    }
    el.commentsList.innerHTML = list.map(function (item) {
      var name = item.display_name || item.username || 'Member';
      return [
        '<article class="tv-comment">',
          '<strong>@' + escapeHtml(String(name).replace(/^@/, '')) + '</strong>',
          '<span>' + escapeHtml(item.body_text || '') + '</span>',
        '</article>',
      ].join('');
    }).join('');
  }

  function setCommentNote(message, tone) {
    if (!el.commentNote) return;
    el.commentNote.textContent = message || '';
    el.commentNote.style.color = tone === 'error' ? '#ff7a8c' : '#21f4d0';
  }

  async function loadCommentsForTarget(target) {
    state.activeCommentTarget = target || null;
    setCommentNote(state.session ? '' : 'Sign in to comment.', state.session ? 'success' : 'error');
    if (!target || !target.uploadKey) {
      renderComments([], 'Select a video to load comments.');
      return;
    }

    renderComments([], 'Loading comments...');
    var sharedComments = await fetchSharedPostComments(target.uploadKey).catch(function () { return []; });
    try {
      var params = new URLSearchParams();
      if (target.uploadId) params.set('upload_id', target.uploadId);
      params.set('upload_key', target.uploadKey);
      var payload = await fetchTvJson(API.comments + '?' + params.toString(), { headers: authHeaders() });
      renderComments(mergeComments(payload && payload.comments ? payload.comments : [], sharedComments));
    } catch (err) {
      var cached = readLocalJson(localCommentsKey(target), []);
      var merged = mergeComments(sharedComments, cached);
      if (merged.length) {
        renderComments(merged);
        return;
      }
      renderComments([], 'Comments are unavailable right now.');
    }
  }

  function renderCards(items) {
    if (!el.grid) return;

    var channelSlug = currentChannelSlug();
    var sourceItems = items.filter(hasPlayableVideo).filter(function (item) {
      return !channelSlug || channelMatches(item, channelSlug);
    });
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
      var channelSlug = uploadChannelSlug(item);
      var channelName = uploadChannelName(item);
      var duration = item.duration_label || (item.duration_seconds ? Math.max(1, Math.round(Number(item.duration_seconds) / 60)) + ' min' : (item.status || 'Video'));
      var source = videoSource(item);
      var embed = embedSource(item);
      var key = uploadKey(item);
      var uploadId = uuidOrEmpty(item.id);
      var likes = numberFromItem(item, ['likes', 'like_count', 'upvotes', 'upvote_count']);
      var dislikes = numberFromItem(item, ['dislikes', 'dislike_count', 'downvotes', 'downvote_count']);
      var fileType = item.file_type || '';
      return [
        '<article class="tv-card" tabindex="0" data-key="' + escapeHtml(key) + '" data-upload-id="' + escapeHtml(uploadId) + '" data-title="' + escapeHtml(title) + '" data-copy="' + escapeHtml(description) + '" data-image="' + escapeHtml(image) + '" data-duration="' + escapeHtml(duration) + '" data-source="' + escapeHtml(source) + '" data-embed="' + escapeHtml(embed) + '" data-likes="' + escapeHtml(likes) + '" data-dislikes="' + escapeHtml(dislikes) + '" data-file-type="' + escapeHtml(fileType) + '" data-channel-slug="' + escapeHtml(channelSlug) + '" data-channel-name="' + escapeHtml(channelName) + '">',
          '<div class="tv-thumb">',
            source
              ? '<video class="tv-thumb-video" muted playsinline preload="metadata" src="' + escapeHtml(source) + '#t=0.1"></video>'
              : '<div class="tv-screen-preview"><img src="' + escapeHtml(image) + '" alt="" loading="lazy" /></div>',
            '<button class="tv-play" type="button" aria-label="Play ' + escapeHtml(title) + '"><span class="tv-play-mark" aria-hidden="true"><i></i><i></i></span></button>',
            '<span class="tv-meta">' + escapeHtml(duration) + '</span>',
          '</div>',
          '<div class="tv-card-body">',
            '<h3>' + escapeHtml(title) + '</h3>',
            '<p>' + escapeHtml(channel + ' / ' + description) + '</p>',
          '</div>',
          window.FASStreetWire
            ? window.FASStreetWire.markup('tv-' + key, title, shareUrlForTarget({ uploadKey: key }), source || image)
            : '',
        '</article>',
      ].join('');
    }).join('');

    activateVideos(el.grid);
    if (window.FASStreetWire) window.FASStreetWire.bindAll(el.grid);

    qsa('.tv-card', el.grid).forEach(function (card) {
      var playButton = card.querySelector('.tv-play');
      if (playButton) playButton.addEventListener('click', function (event) {
        event.stopPropagation();
        featureCard(card);
      });
      card.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          featureCard(card);
        }
      });
    });

    startScheduledPlaylist(sourceItems);
  }

  function startScheduledPlaylist(items) {
    buildPlaylist(items);
    var requestedKey = currentVideoKey();
    var requested = requestedKey
      ? (items || []).find(function (item) { return uploadKey(item) === requestedKey; })
      : null;
    var first = requested || currentPlaylistUpload() || firstPlayableUpload(items);
    if (!first) {
      renderEmptyFeature();
      return;
    }
    state.autoplaying = true;
    featureUpload(first);
    setActiveCard(uploadKey(first));
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
    stopActivePlayback();
    state.resumeMode = false;
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
    el.screen.classList.remove('is-portrait', 'is-landscape');
    el.screen.removeAttribute('data-tv-ratio');
    el.screen.style.aspectRatio = '';
    el.screen.style.maxWidth = '';
    renderChannelCredit(null);
    renderReactions(null);
    renderShare(null);
    renderFeatureWire(null);
    loadCommentsForTarget(null);
  }

  function featureCard(card) {
    if (!el.featureTitle || !el.featureCopy) return;
    var title = card.getAttribute('data-title') || 'Selected Broadcast';
    var copy = card.getAttribute('data-copy') || '';
    var key = card.getAttribute('data-key') || '';

    state.autoplaying = false;
    state.manualSelection = true;
    stopActivePlayback();
    renderResumeTVPrompt();
    syncPlaylistToKey(key);
    el.featureTitle.textContent = title;
    el.featureCopy.textContent = copy;
    renderChannelCredit(channelCreditFromCard(card));
    setActiveCard(key);
    var target = reactionTargetFromCard(card);
    renderReactions(target);
    renderShare(target);
    renderFeatureWire(target);
    loadCommentsForTarget(commentTargetFromCard(card));
    playArchiveCardInline(card);
  }

  function featureUpload(item) {
    if (!el.screen || !el.featureTitle || !el.featureCopy) return;
    var title = item.title || 'Selected Broadcast';
    var copy = item.copy || item.description || 'Faceless TV broadcast';
    var source = videoSource(item);
    var embed = embedSource(item);
    var key = uploadKey(item);

    state.manualSelection = false;
    state.resumeMode = false;
    stopInlineArchivePlayback(null);
    el.featureTitle.textContent = title;
    el.featureCopy.textContent = copy;
    renderChannelCredit(channelCreditFromItem(item));
    setActiveCard(key);
    var target = reactionTargetFromItem(item);
    renderReactions(target);
    renderShare(target);
    renderFeatureWire(target);
    loadCommentsForTarget(commentTargetFromItem(item));

    if (source) {
      stopActivePlayback();
      el.screen.innerHTML = mainVideoMarkup(source);
      activateVideos(el.screen);
      return;
    }

    if (embed) {
      stopActivePlayback();
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

  function syncPlaylistToKey(key) {
    if (!key || !state.playlist.length) return;
    var index = state.playlist.findIndex(function (item) {
      return uploadKey(item) === key;
    });
    if (index >= 0) state.playlistIndex = index;
  }

  function syncFilterButtons() {
    qsa('.tv-filter').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-filter') === state.activeFilter);
    });
  }

  function activateVideos(root) {
    if (!root) return;
    bindSoundToggle(root);
    qsa('video', root).forEach(function (video) {
      try {
        var isMain = video.classList.contains('tv-main-video');
        var isInlineArchive = video.classList.contains('tv-inline-video');
        video.muted = isMain ? !state.soundUnlocked : true;
        video.defaultMuted = video.muted;
        video.playsInline = true;
        video.autoplay = isMain || isInlineArchive;
        video.loop = !isMain && !isInlineArchive;
        video.preload = 'metadata';

        if (isInlineArchive) {
          video.controls = true;
          return;
        }

        if (!isMain) {
          video.autoplay = false;
          video.controls = false;
          video.pause();
          video.addEventListener('error', function () {
            var thumb = video.closest ? video.closest('.tv-thumb, .tv-channel-video-thumb') : null;
            if (thumb) thumb.classList.add('is-video-preview-unavailable');
          }, { once: true });
          video.addEventListener('loadedmetadata', function () {
            try {
              if (Number.isFinite(video.duration) && video.duration > 0.2) video.currentTime = 0.1;
            } catch (err) {}
          }, { once: true });
          return;
        }

        if (isMain) {
          video.addEventListener('loadedmetadata', function () { syncScreenRatio(video); });
          video.addEventListener('loadeddata', function () { syncScreenRatio(video); });
          video.addEventListener('canplay', function () { syncScreenRatio(video); });
          video.addEventListener('playing', function () { syncScreenRatio(video); });
          video.addEventListener('resize', function () { syncScreenRatio(video); });
          syncScreenRatio(video);
          queueRatioChecks(video);
          if (!state.manualSelection) {
            video.addEventListener('ended', playNextUpload, { once: true });
          }
          video.addEventListener('error', function () {
            if (!state.manualSelection) window.setTimeout(playNextUpload, 800);
          }, { once: true });
        }

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
      el.uploadLink.textContent = state.session ? 'Upload Video' : 'Sign In';
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
    qsa('#tv-comment-form input, #tv-comment-form button').forEach(function (node) {
      node.disabled = locked;
    });
    if (locked) {
      setStatus(el.channelStatus, 'Sign in to create a channel.', 'error');
      setStatus(el.uploadStatus, 'Sign in to upload video.', 'error');
      setCommentNote('Sign in to comment.', 'error');
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

  function communityVideoUploadFromRow(row, sourceName) {
    var mediaUrl = row && (row.media_url || row.image_url || row.video_url || '');
    if (!row || !isVideoUrl(mediaUrl)) return null;
    var body = String(row.body_text || row.post_text || row.body || row.dek || row.video_description || '').trim();
    var title = row.video_title || row.title || (body ? body.slice(0, 90) : 'Community video');
    return {
      id: row.id,
      external_video_id: sourceName + '-' + row.id,
      comment_key: row.id,
      username: row.author_username || row.username || 'member',
      channel_slug: 'faceless-animal-studios',
      channel_name: 'Faceless Animal Studios',
      title: title,
      description: row.video_description || body || 'Community video from the directory feed.',
      visibility: 'public',
      status: 'published',
      post_type: row.post_type || row.category || 'video',
      source_url: mediaUrl,
      external_video_url: mediaUrl,
      created_at: row.created_at,
      is_published: true,
      thumb_url: 'assets/neon-dreams/covers/cover-thumb.jpg',
    };
  }

  async function fetchCommunityVideoUploads() {
    var cfg = supabaseConfig();
    if (!cfg.url || !cfg.key) return [];
    var headers = {
      apikey: cfg.key,
      Authorization: 'Bearer ' + cfg.key,
    };
    var urls = [
      {
        source: 'signal-wire',
        url: cfg.url
          + '/rest/v1/signal_wire_posts'
          + '?select=id,author_username,title,dek,body,category,media_url,media_type,video_title,video_description,published_at,created_at'
          + '&status=eq.published'
          + '&publish_to_tv=eq.true'
          + '&media_url=not.is.null'
          + '&order=published_at.desc'
          + '&limit=40',
      },
      {
        source: 'signal',
        url: cfg.url
          + '/rest/v1/signal_posts'
          + '?select=id,author_username,body_text,post_type,category,media_url,created_at'
          + '&moderation_state=eq.approved'
          + '&visibility=eq.public'
          + '&media_url=not.is.null'
          + '&order=created_at.desc'
          + '&limit=40',
      },
      {
        source: 'board',
        url: cfg.url
          + '/rest/v1/board_posts'
          + '?select=id,username,post_text,category,image_url,created_at'
          + '&is_approved=eq.true'
          + '&visibility_status=eq.visible'
          + '&image_url=not.is.null'
          + '&order=created_at.desc'
          + '&limit=40',
      },
    ];

    try {
      var results = await Promise.all(urls.map(function (entry) {
        return fetchJson(entry.url, { headers: headers })
          .then(function (rows) {
            return (Array.isArray(rows) ? rows : []).map(function (row) {
              return communityVideoUploadFromRow(row, entry.source);
            }).filter(Boolean);
          })
          .catch(function () { return []; });
      }));
      return results.reduce(function (all, rows) {
        return all.concat(rows);
      }, []);
    } catch (err) {
      console.info('[TV] community video fallback unavailable:', err && err.message ? err.message : err);
      return [];
    }
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

    var communityUploads = await fetchCommunityVideoUploads();
    var mergedUploadPayload = Object.assign({}, uploadPayload || {}, {
      uploads: []
        .concat(uploadPayload && uploadPayload.uploads ? uploadPayload.uploads : [])
        .concat(communityUploads),
    });

    var normalizedChannels = normalizeChannels(channelPayload);
    var uploads = normalizeUploads(mergedUploadPayload);

    state.owner = normalizedChannels.owner;
    state.channels = normalizedChannels.list;
    state.uploads = uploads;
    writeLocalJson('channels_cache', channelPayload);
    writeLocalJson('uploads_cache', mergedUploadPayload);

    var ownedChannels = state.channels.filter(function (item) {
      if (item.is_owner) return Boolean(state.session);
      return state.session && String(item.username || '').toLowerCase() === String(state.session.username || '').toLowerCase();
    });

    renderOwner(state.owner);
    renderChannelRow(state.channels, state.uploads);
    renderChannelPage(state.channels, state.uploads);
    renderChannelSelect(ownedChannels);
    renderMyChannels(state.session ? ownedChannels : []);
    renderRecentUploads(state.session ? state.uploads : mergedUploadPayload.uploads || []);
    renderCards(state.uploads);
    activateVideos(el.recentUploads);
    syncFilterButtons();
    setShellMode();
    scheduleLineupRefresh();
    document.dispatchEvent(new CustomEvent('fas:tv-ready', {
      detail: {
        channels: state.channels.slice(),
        session: state.session,
      },
    }));
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
        cover_url: el.channelForm.cover_url ? el.channelForm.cover_url.value : '',
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
          cover_url: payload.cover_url || 'assets/neon-dreams/covers/cover-thumb.jpg',
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

  function bindUploadForm() {
    if (!el.uploadForm) return;

    var fileInput = el.uploadForm.file;
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var chosenFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        state.compressedUploadFile = null;
        setCompressionProgress(0);
        setCompressionStatus('');
        updateUploadSizeNote(chosenFile);
        if (el.compressOpen) el.compressOpen.disabled = !chosenFile;
        if (!chosenFile) hideCompressionWidget();
        updateCompressionEstimate();
      });
    }

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
      var file = selectedUploadFile();
      updateUploadSizeNote(file);

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
        var formData = new FormData();
        formData.append('channel_slug', channelSlug);
        formData.append('title', title);
        formData.append('description', description);
        formData.append('visibility', visibility);
        formData.append('file_name', file.name);
        formData.append('file_type', file.type || 'video/mp4');
        formData.append('file_size_bytes', String(file.size));
        formData.append('file', file, file.name);

        var result = await fetchJson(API.uploads, {
          method: 'POST',
          headers: authHeaders(),
          body: formData,
        });
        setStatus(el.uploadStatus, 'Upload published: ' + (result.upload && result.upload.title ? result.upload.title : 'done'), 'success');
        el.uploadForm.reset();
        state.compressedUploadFile = null;
        if (el.compressOpen) el.compressOpen.disabled = true;
        hideCompressionWidget();
        updateUploadSizeNote(null);
        setCompressionProgress(0);
        setCompressionStatus('');
        await loadNetwork();
      } catch (err) {
        if (!state.localMode) {
          setStatus(el.uploadStatus, err.message || 'Upload failed.', 'error');
          return;
        }
        var localUploads = readLocalJson('uploads_cache', { uploads: [], mine_uploads: [] });
        var previewUrl = URL.createObjectURL(file);
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
        state.compressedUploadFile = null;
        if (el.compressOpen) el.compressOpen.disabled = true;
        hideCompressionWidget();
        updateUploadSizeNote(null);
        setCompressionProgress(0);
        setCompressionStatus('');
        await loadNetwork();
      }
    });
  }

  function bindCompressionControls() {
    if (el.compressOpen) {
      el.compressOpen.addEventListener('click', function () {
        showCompressionWidget();
      });
    }
    if (el.compressClose) {
      el.compressClose.addEventListener('click', function () {
        hideCompressionWidget();
      });
    }
    if (el.compressStart) {
      el.compressStart.addEventListener('click', async function () {
        var file = uploadOriginalFile();
        if (!file) {
          setCompressionStatus('Choose a video first.', 'error');
          return;
        }
        if (state.compressionBusy) return;
        state.compressionBusy = true;
        el.compressStart.disabled = true;
        setCompressionProgress(0);
        setCompressionStatus('Compressing on this screen. This can take longer than a normal upload.', 'warn');
        try {
          var compressed = await compressVideoFile(file);
          state.compressedUploadFile = compressed;
          updateUploadSizeNote(compressed);
          updateCompressionEstimate();
          setCompressionStatus(
            compressed.size <= MAX_UPLOAD_BYTES
              ? 'Done. The compressed video will upload when you press Upload Video.'
              : 'Done, but it may still be over 50MB. Try a shorter video if upload blocks it.',
            compressed.size <= MAX_UPLOAD_BYTES ? 'success' : 'warn'
          );
        } catch (err) {
          setCompressionStatus(err.message || 'Compression failed in this browser.', 'error');
        } finally {
          state.compressionBusy = false;
          if (el.compressStart && !state.compressedUploadFile) el.compressStart.disabled = false;
        }
      });
    }
  }

  function bindCommentForm() {
    if (!el.commentForm) return;

    el.commentForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (!state.session) {
        setCommentNote('Sign in to comment.', 'error');
        return;
      }
      if (!state.activeCommentTarget || !state.activeCommentTarget.uploadKey) {
        setCommentNote('Select a video first.', 'error');
        return;
      }

      var bodyText = (el.commentInput && el.commentInput.value || '').trim();
      if (!bodyText) {
        setCommentNote('Write a comment first.', 'error');
        return;
      }

      setCommentNote('Posting...');
      try {
        var result = await fetchJson(API.comments, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify({
            upload_id: state.activeCommentTarget.uploadId || null,
            upload_key: state.activeCommentTarget.uploadKey,
            body_text: bodyText,
          }),
        });
        if (el.commentInput) el.commentInput.value = '';
        setCommentNote('Comment posted.', 'success');
        await persistSharedPostComment(state.activeCommentTarget.uploadKey, bodyText).catch(function () {});
        await loadCommentsForTarget(state.activeCommentTarget);
      } catch (err) {
        var sharedSaved = null;
        try {
          sharedSaved = await persistSharedPostComment(state.activeCommentTarget.uploadKey, bodyText);
        } catch (_) {}
        var cached = readLocalJson(localCommentsKey(state.activeCommentTarget), []);
        var fallbackComment = sharedSaved && sharedSaved[0] ? normalizeSharedComment(sharedSaved[0]) : {
          id: 'local-comment-' + Date.now(),
          username: state.session.username || 'member',
          display_name: state.session.display || state.session.display_name || state.session.username || 'Member',
          body_text: bodyText,
          created_at: new Date().toISOString(),
        };
        cached.push(fallbackComment);
        if (!sharedSaved) writeLocalJson(localCommentsKey(state.activeCommentTarget), cached);
        if (el.commentInput) el.commentInput.value = '';
        setCommentNote(sharedSaved ? 'Comment posted.' : 'Saved in Faceless TV test mode.', 'success');
        await loadCommentsForTarget(state.activeCommentTarget);
      }
    });
  }

  function bindReactionButtons() {
    if (el.likeButton) {
      el.likeButton.addEventListener('click', function () {
        reactToVideo('like');
      });
    }
    if (el.dislikeButton) {
      el.dislikeButton.addEventListener('click', function () {
        reactToVideo('dislike');
      });
    }
  }

  function bindShareButton() {
    if (!el.shareButton) return;
    el.shareButton.addEventListener('click', function () {
      shareActiveVideo();
    });
  }

  function bindChannelVideoActions(root) {
    if (!root) return;
    qsa('[data-channel-video-key]', root).forEach(function (card) {
      if (card.getAttribute('data-actions-bound') === '1') return;
      card.setAttribute('data-actions-bound', '1');
      var key = card.getAttribute('data-channel-video-key') || '';
      var target = reactionTargetFromKey(key);
      var note = qs('.tv-channel-video-note', card);
      var refresh = function () { renderChannelVideoActions(card); };
      var like = qs('[data-channel-video-like]', card);
      var dislike = qs('[data-channel-video-dislike]', card);
      var share = qs('[data-channel-video-share]', card);
      if (like) {
        like.addEventListener('click', function () {
          saveVideoReaction(target, 'like', refresh);
        });
      }
      if (dislike) {
        dislike.addEventListener('click', function () {
          saveVideoReaction(target, 'dislike', refresh);
        });
      }
      if (share) {
        share.addEventListener('click', function () {
          shareTarget(target, note);
        });
      }
    });
  }

  function bindTvSwipe() {
    if (!el.screen) return;
    var startX = 0;
    var startY = 0;
    var startTime = 0;

    el.screen.addEventListener('touchstart', function (event) {
      if (!event.touches || event.touches.length !== 1) return;
      var touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
    }, { passive: true });

    el.screen.addEventListener('touchend', function (event) {
      if (!startTime || !event.changedTouches || event.changedTouches.length !== 1) return;
      var touch = event.changedTouches[0];
      var dx = touch.clientX - startX;
      var dy = touch.clientY - startY;
      var elapsed = Date.now() - startTime;
      startTime = 0;
      if (elapsed > 900) return;
      if (Math.abs(dx) < 54 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
      playPlaylistOffset(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function initDom() {
    el.grid = qs('#tv-grid');
    el.screen = qs('#tv-screen');
    el.featureTitle = qs('#tv-feature-title');
    el.featureCopy = qs('#tv-feature-copy');
    el.channelCredit = qs('#tv-channel-credit');
    el.sourceLabel = qs('#tv-source-label');
    el.uploadLink = qs('#tv-upload-link');
    el.channelSelect = qs('#tv-upload-channel');
    el.myChannels = qs('#tv-my-channels');
    el.recentUploads = qs('#tv-recent-uploads');
    el.channelCount = qs('#tv-channel-count');
    el.uploadCount = qs('#tv-upload-count');
    el.archiveCount = qs('#tv-archive-count');
    el.channelPage = qs('#tv-channel-page');
    el.channelPageImage = qs('#tv-channel-page-image');
    el.channelPageTitle = qs('#tv-channel-page-title');
    el.channelPageCopy = qs('#tv-channel-page-copy');
    el.channelPageMeta = qs('#tv-channel-page-meta');
    el.channelPageGrid = qs('#tv-channel-page-grid');
    el.channelStatus = qs('#tv-channel-status');
    el.uploadStatus = qs('#tv-upload-status');
    el.uploadSizeNote = qs('#tv-upload-size');
    el.compressOpen = qs('#tv-compress-open');
    el.compressWidget = qs('#tv-compress-widget');
    el.compressClose = qs('#tv-compress-close');
    el.compressStart = qs('#tv-compress-start');
    el.compressStatus = qs('#tv-compress-status');
    el.compressEstimate = qs('#tv-compress-estimate');
    el.compressProgress = qs('#tv-compress-progress');
    el.commentsList = qs('#tv-comments-list');
    el.commentCount = qs('#tv-comment-count');
    el.likeButton = qs('#tv-like-button');
    el.dislikeButton = qs('#tv-dislike-button');
    el.likeCount = qs('#tv-like-count');
    el.dislikeCount = qs('#tv-dislike-count');
    el.reactionNote = qs('#tv-reaction-note');
    el.shareButton = qs('#tv-share-button');
    el.shareNote = qs('#tv-share-note');
    el.commentForm = qs('#tv-comment-form');
    el.commentInput = qs('#tv-comment-input');
    el.commentNote = qs('#tv-comment-note');
    el.channelForm = qs('#tv-channel-form');
    el.uploadForm = qs('#tv-upload-form');
    el.featureWire = qs('#tv-feature-street-wire');
    state.activeChannelSlug = currentChannelSlug();
  }

  function boot() {
    initDom();
    window.FAS_TV = {
      state: state,
      loadNetwork: loadNetwork,
    };
    state.soundUnlocked = readSoundUnlocked();
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('#tv-resume') : null;
      if (!target) return;
      event.preventDefault();
      resumeScheduledTV();
    });
    bindFilterRail();
    bindChannelForm();
    bindUploadForm();
    bindCompressionControls();
    bindReactionButtons();
    bindShareButton();
    bindTvSwipe();
    bindCommentForm();
    loadNetwork();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());

