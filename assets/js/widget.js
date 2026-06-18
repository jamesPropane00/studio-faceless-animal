/* ── Unified Floating Widget — shared loader + utilities ── */

var CHARACTERS = [
  'Faceless%20Animal%20Studios/Characters/file_00000000020471f5bfd56238a2c55242.png',
  'Faceless%20Animal%20Studios/Characters/file_00000000065071f58f80b8ccb3997a9a.png',
  'Faceless%20Animal%20Studios/Characters/file_000000001200720ca655cd8473ef2541.png',
  'Faceless%20Animal%20Studios/Characters/file_00000000424c71f58d53c77417910885.png',
  'Faceless%20Animal%20Studios/Characters/file_00000000a14c71fd915d9466c77ec0d1.png',
  'Faceless%20Animal%20Studios/Characters/file_00000000e96471fdb1f49655921c9a67.png'
];

export function formatBytes(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export function getSession() {
  try { return JSON.parse(localStorage.getItem('fas_user') || 'null'); } catch(e) { return null; }
}

export function pickWatermark(el) {
  if (!el) return;
  var idx = Math.floor(Math.random() * CHARACTERS.length);
  el.style.setProperty('--watermark', 'url(' + CHARACTERS[idx] + ')');
}

export async function postToDirectory(session, title, signal_type, contentTemplate) {
  try {
    var mod = await import('./services/board.js');
    var username = (session && session.username) || 'unknown';
    var display_name = (session && session.display) || username;
    var content = contentTemplate.replace('{title}', title || '').replace('{display}', display_name || username);
    var result = await mod.createBoardPost({
      username: username,
      content: content,
      signal_type: signal_type,
      display_name: display_name
    });
    if (result && result.error) console.warn('[uw] dir post err:', result.error);
  } catch(e) { console.warn('[uw] dir post fail:', e); }
}

export function initFloatingWidget(config) {
  var root = document.getElementById(config.rootId);
  if (!root) return null;

  var panel = root.querySelector('.uw-panel');
  var toggle = root.querySelector('.uw-toggle');
  var closeBtn = root.querySelector('.uw-close');
  var watermark = root.querySelector('.uw-watermark');

  function open() {
    if (!panel) return;
    pickWatermark(watermark);
    root.classList.add('is-open');
    panel.removeAttribute('hidden');
    panel.setAttribute('aria-hidden', 'false');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    if (config.onOpen) config.onOpen(root);
  }

  function close() {
    if (!panel) return;
    root.classList.remove('is-open');
    panel.setAttribute('hidden', '');
    panel.setAttribute('aria-hidden', 'true');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    if (config.onClose) config.onClose(root);
  }

  if (toggle) toggle.addEventListener('click', function(e) {
    e.stopPropagation();
    if (root.classList.contains('is-open')) close(); else open();
  });

  if (closeBtn) closeBtn.addEventListener('click', close);

  if (config.openTriggers) {
    config.openTriggers.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(el) {
        el.addEventListener('click', open);
      });
    });
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && root.classList.contains('is-open')) close();
  });

  return { open: open, close: close, root: root };
}
