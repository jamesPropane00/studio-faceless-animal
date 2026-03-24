/* Faceless Animal Studios — assets/script.js
   Handles: mobile nav toggle · session-aware nav · close on link click
   Smooth scroll is handled via CSS scroll-behavior: smooth in style.css
   ------------------------------------------------------------------ */

/* ================================================================
   CACHE / SERVICE-WORKER SAFETY — runs before app init.
   Purpose: prevent stale service-worker/cache takeover on live
   and local builds when older mobile/browser caches are hanging on.
   ================================================================ */
(function () {
  'use strict';

  var CACHE_PURGE_KEY = 'fas_cache_purge_20260322';

  function isLocalDevHost() {
    var host = String(window.location.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    if (host.endsWith('.local')) return true;
    return window.location.protocol === 'file:';
  }

  var isLocalDev = isLocalDevHost();

  // Add no-cache meta directives during local testing only.
  // This helps prevent stale HTML/assets from browser cache.
  if (isLocalDev) {
    try {
      var head = document.head || document.getElementsByTagName('head')[0];
      if (head) {
        var tags = [
          { h: 'Cache-Control', c: 'no-store, no-cache, must-revalidate, max-age=0' },
          { h: 'Pragma', c: 'no-cache' },
          { h: 'Expires', c: '0' }
        ];
        for (var i = 0; i < tags.length; i++) {
          var meta = document.createElement('meta');
          meta.setAttribute('http-equiv', tags[i].h);
          meta.setAttribute('content', tags[i].c);
          head.appendChild(meta);
        }
      }
    } catch (e) {}
  }

  function clearBrowserCachesOnce() {
    try {
      if (!('caches' in window) || typeof caches.keys !== 'function') return;
      var alreadyPurged = false;
      try {
        alreadyPurged = localStorage.getItem(CACHE_PURGE_KEY) === '1';
      } catch (storageErr) {}
      if (alreadyPurged && !isLocalDev) return;

      caches.keys()
        .then(function (keys) {
          return Promise.all((keys || []).map(function (key) { return caches.delete(key); }));
        })
        .then(function () {
          try { localStorage.setItem(CACHE_PURGE_KEY, '1'); } catch (storageErr) {}
        })
        .catch(function () {});
    } catch (e3) {}
  }

  // Neutralize any previously installed service workers from older builds.
  // The repo currently has no registration code, but mobile browsers may still
  // hold on to older workers from past deploys or prior experiments.
  try {
    if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for (let registration of (registrations || [])) {
          registration.unregister();
        }
        return registrations;
      }).then(function () {
        clearBrowserCachesOnce();
      }).catch(function () {
        clearBrowserCachesOnce();
      });
      return;
    }
  } catch (e2) {}

  clearBrowserCachesOnce();
}());

/* ================================================================
   SESSION-AWARE NAV — runs on every page that loads this script.
   Reads fas_user from localStorage and updates nav + adds a
   signed-in bar so the site always knows who is logged in.
   ================================================================ */
(function () {
  'use strict';

  function getSession() {
    try { return JSON.parse(localStorage.getItem('fas_user') || 'null'); } catch(e) { return null; }
  }

  function rootHref(target) {
    return '/' + String(target || '').replace(/^\/+/, '');
  }

  function hasAdminAccessRole(role) {
    var normalized = String(role || '').toLowerCase();
    return normalized === 'super_admin' || normalized === 'admin';
  }

  function armSingleNavigation(link) {
    if (!link || link.dataset.navGuardBound === '1') return;
    link.dataset.navGuardBound = '1';
    link.addEventListener('click', function(e) {
      if (link.dataset.navPending === '1') {
        e.preventDefault();
        return;
      }
      link.dataset.navPending = '1';
      link.style.pointerEvents = 'none';
      link.setAttribute('aria-disabled', 'true');
    });
  }

  // No session-aware nav logic on index page. Navigation is always public and direct.
}());
(function () {
  'use strict';

  function closeMobileNav(toggle, nav) {
    nav.classList.remove('open');
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  function init() {
    var toggle = document.querySelector('.nav-toggle');
    var nav    = document.getElementById('mobile-menu');
    if (!toggle || !nav) return;

    /* Open / close on hamburger click */
    toggle.addEventListener('click', function () {
      var opening = !nav.classList.contains('open');
      nav.classList.toggle('open', opening);
      toggle.classList.toggle('open', opening);
      toggle.setAttribute('aria-expanded', String(opening));
    });

    /* Close when any link inside the mobile nav is clicked */
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeMobileNav(toggle, nav);
    });

    /* Close when clicking outside the nav or toggle */
    document.addEventListener('click', function (e) {
      if (!toggle.contains(e.target) && !nav.contains(e.target)) {
        closeMobileNav(toggle, nav);
      }
    });
  }

  /* Run after DOM is ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());

/* ================================================================
   NATIVE SERVICES PROMOTION LAYER — separate from core logic.
   Quiet, optional, and removable by deleting this block.
   ================================================================ */
(function () {
  'use strict';

  var SERVICE_PROMO = {
    label: 'View Services',
    href: 'services.html',
    subtitle: 'Custom builds, hosting, and systems by Faceless Animal Studios.'
  };

  function getPromoForPlacement() {
    return SERVICE_PROMO;
  }

  function renderInlinePromo(el) {
    if (!el) return;
    el.innerHTML = '<span style="color:var(--text-3);">Built by Faceless Animal Studios.</span> <a href="services.html" style="color:var(--text-2);text-decoration:underline;text-underline-offset:2px;">Need a site like this? →</a>';
    if (el.style && el.style.display === 'none') el.style.display = '';
  }

  function injectFooterPromo() {
    if (document.getElementById('fas-footer-promo')) return;

    var footerCol = document.querySelector('.footer .footer-col--right') || document.querySelector('.footer-inner .footer-col:last-child');
    if (!footerCol) return;

    var p = document.createElement('p');
    p.id = 'fas-footer-promo';
    p.className = 'footer-copy';
    p.style.marginTop = '0.45rem';
    p.innerHTML = '<a href="services.html" style="color:var(--text-3);text-decoration:underline;text-underline-offset:2px;">Need a build like this? Services →</a>';
    footerCol.appendChild(p);
  }

  function initPromoLayer() {
    renderInlinePromo(document.getElementById('fas-promo-entry'));
    injectFooterPromo();
  }

  window.FASPromoLayer = {
    links: [SERVICE_PROMO],
    getPromoForPlacement: getPromoForPlacement
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPromoLayer);
  } else {
    initPromoLayer();
  }
}());

/* ================================================================
   SIGNAL PULSE WIDGET LOADER — global ambient activity layer.
   Loads a separate module so this file stays decoupled from pulse logic.
   ================================================================ */
(function () {
  'use strict';

  function loadSignalPulse() {
    if (window.__FAS_DISABLE_SIGNAL_PULSE) return;
    if (window.__FAS_SIGNAL_PULSE_LOADING) return;
    window.__FAS_SIGNAL_PULSE_LOADING = true;

    var paths = [
      '/assets/js/signal-pulse.js?v=20260322',
      'assets/js/signal-pulse.js?v=20260322',
      '../assets/js/signal-pulse.js?v=20260322'
    ];

    function tryLoad(index) {
      if (index >= paths.length) return;
      import(paths[index]).catch(function () {
        tryLoad(index + 1);
      });
    }

    tryLoad(0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSignalPulse);
  } else {
    loadSignalPulse();
  }
}());

/* ================================================================
   SIGNAL PHONE LAUNCHER — global floating entry point.
   Separate from radio internals and safe to remove independently.
   ================================================================ */
(function () {
  'use strict';

  function getSession() {
    try { return JSON.parse(localStorage.getItem('fas_user') || 'null'); } catch (_) { return null; }
  }

  function currentPath() {
    return String(window.location.pathname || '').toLowerCase();
  }

  function shouldHideLauncher() {
    var path = currentPath();
    return path.endsWith('/phone.html') || path === '/phone.html';
  }

  function computeBottomOffset() {
    var selectors = [
      '.radio-widget',
      '#radio-widget',
      '.fas-radio-widget',
      '#fas-radio-widget',
      '[data-radio-widget]',
      '[data-player-bar]',
      '[data-audio-player]'
    ];
    var maxBottom = 96;
    selectors.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (el) {
        var style = window.getComputedStyle(el);
        if (style.position !== 'fixed') return;
        var rect = el.getBoundingClientRect();
        var overlapHeight = Math.max(0, window.innerHeight - rect.top);
        if (overlapHeight + 14 > maxBottom) maxBottom = overlapHeight + 14;
      });
    });
    return maxBottom;
  }

  function launcherHref() {
    var sess = getSession();
    if (sess && sess.username) return 'phone.html';
    return 'login.html?redirect=phone.html';
  }

  function ensureLauncher() {
    if (shouldHideLauncher()) return;
    if (document.getElementById('fas-phone-launcher')) return;

    var a = document.createElement('a');
    a.id = 'fas-phone-launcher';
    a.className = 'fas-phone-launcher';
    a.href = launcherHref();
    a.setAttribute('aria-label', 'Open Signal Phone');
    a.innerHTML = '<span class="fas-phone-launcher-icon" aria-hidden="true">Phone</span><span class="fas-phone-launcher-text">Signal Phone</span>';
    document.body.appendChild(a);

    function placeLauncher() {
      var bottom = computeBottomOffset();
      a.style.setProperty('--fas-phone-bottom', bottom + 'px');
    }

    placeLauncher();
    window.addEventListener('resize', placeLauncher, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureLauncher);
  } else {
    ensureLauncher();
  }
}());


/* ================================================================
   CONTACT / INQUIRY FORMS — submit to /api/contact (server-side)
   ================================================================ */
(function () {
  'use strict';

  function collectFormData(form) {
    var fd = new FormData(form);
    var obj = {};
    fd.forEach(function (v, k) { obj[k] = v; });
    return obj;
  }

  function submitToContact(form, successCb, errorCb) {
    var data = collectFormData(form);

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.ok) {
          successCb();
        } else {
          errorCb(json.error || 'Something went wrong. Email djfacelessanimal@gmail.com directly.');
        }
      })
      .catch(function () {
        errorCb('Could not send. Email djfacelessanimal@gmail.com directly.');
      });
  }

  function initInquiryForm() {
    var form     = document.getElementById('inquiry-form');
    var thankyou = document.getElementById('inq-thankyou');
    var errorEl  = document.getElementById('inq-error');
    var submitBtn = document.getElementById('inq-submit');
    if (!form || !thankyou || !errorEl || !submitBtn) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;

      errorEl.textContent = '';
      submitBtn.disabled = true;
      submitBtn.classList.add('sending');

      submitToContact(form, function () {
        form.style.display     = 'none';
        thankyou.style.display = 'flex';
        thankyou.classList.add('visible');
      }, function (msg) {
        errorEl.textContent = msg;
        submitBtn.disabled = false;
        submitBtn.classList.remove('sending');
      });
    });
  }

  function initSpecialRequestForm() {
    var form     = document.getElementById('sr-form');
    var thankyou = document.getElementById('sr-thankyou');
    var errorEl  = document.getElementById('sr-error');
    var submitBtn = document.getElementById('sr-submit');
    if (!form || !thankyou || !errorEl || !submitBtn) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;

      errorEl.textContent = '';
      submitBtn.disabled = true;
      submitBtn.classList.add('sending');

      submitToContact(form, function () {
        form.style.display     = 'none';
        thankyou.style.display = 'flex';
        thankyou.classList.add('visible');
      }, function (msg) {
        errorEl.textContent = msg;
        submitBtn.disabled = false;
        submitBtn.classList.remove('sending');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initInquiryForm();
      initSpecialRequestForm();
    });
  } else {
    initInquiryForm();
    initSpecialRequestForm();
  }
}());
