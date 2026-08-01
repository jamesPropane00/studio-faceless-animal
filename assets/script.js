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
          { h: 'Cache-Control', c: 'no-store, no-cache, max-age=0' },
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
   CANONICAL SITE NAVIGATION — one sleek Neon-style bar everywhere.
   ================================================================ */
(function () {
  'use strict';

  function currentPath() {
    var file = location.pathname.split('/').pop() || 'index.html';
    return file.toLowerCase();
  }

  function navLink(href, label, compact) {
    var active = currentPath() === href.toLowerCase();
    return '<a href="/' + href + '" class="fas-nav-link' + (compact ? ' fas-nav-link-compact' : '') + '"' + (active ? ' aria-current="page"' : '') + '>' + label + '</a>';
  }

  function initCanonicalNav() {
    if (!document.body || document.getElementById('fas-canonical-nav')) return;
    var oldNav = document.querySelector('nav.navbar, nav.site-nav, header nav[aria-label*="navigation" i]');
    var oldMobile = document.getElementById('mobile-menu');
    var nav = document.createElement('nav');
    nav.id = 'fas-canonical-nav';
    nav.className = 'fas-canonical-nav';
    nav.setAttribute('aria-label', 'Main navigation');
    nav.innerHTML = '<div class="fas-nav-shell">' +
      '<a class="fas-nav-brand" href="/index.html"><span>FACELESS</span><b>ANIMAL</b><small>STUDIOS</small></a>' +
      '<div class="fas-nav-primary" aria-label="Primary links">' +
        navLink('directory.html', 'Directory', true) +
        navLink('radio.html', 'Radio', true) +
        navLink('tv.html', 'Faceless TV', true) +
        navLink('neon-dreams.html', 'Neon Dreams', true) +
        navLink('store.html', 'Store', true) +
      '</div>' +
      '<div class="fas-nav-actions">' +
        navLink('dashboard.html', 'Dashboard', false) +
        '<a class="fas-nav-auth" href="/login.html">Sign In</a>' +
      '</div>' +
      '<button id="fas-app-launcher-toggle" class="fas-nav-toggle" type="button" aria-label="Open full app launcher" aria-expanded="false" aria-controls="fas-app-launcher-menu"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></button>' +
    '</div>';

    var mobile = document.createElement('div');
    mobile.id = 'fas-app-launcher-menu';
    mobile.className = 'fas-mobile-nav';
    mobile.setAttribute('role', 'navigation');
    mobile.setAttribute('aria-label', 'Full app launcher');
    mobile.innerHTML = '<div class="fas-launcher-title"><span>All systems</span><small>Faceless Animal network</small></div>' +
      navLink('directory.html', 'Directory') + navLink('radio.html', 'Radio') +
      navLink('pulse.html', 'Pulse Stage') + navLink('chat.html', 'Rooms') +
      navLink('tv.html', 'Faceless TV') + navLink('phone.html', 'Phone') +
      navLink('neon-dreams.html', 'Neon Dreams') + navLink('news.html', 'News') +
      navLink('store.html', 'Store') + navLink('wallet.html', 'Vault') +
      navLink('apps.html', 'Apps') + navLink('ai.html', 'AI') +
      navLink('canvas.html', 'Canvas') + navLink('world.html', 'World') +
      navLink('live-rap-room.html', 'Live Rap Room') +
      navLink('dashboard.html', 'Dashboard') +
      '<a class="fas-nav-auth" href="/login.html">Sign In</a>';

    if (oldMobile) oldMobile.remove();
    if (oldNav) oldNav.replaceWith(nav);
    else document.body.insertBefore(nav, document.body.firstChild);
    nav.insertAdjacentElement('afterend', mobile);

    var launcherToggle = document.getElementById('fas-app-launcher-toggle');
    function closeLauncher() {
      mobile.classList.remove('open');
      launcherToggle.classList.remove('open');
      launcherToggle.setAttribute('aria-expanded', 'false');
    }
    launcherToggle.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var opening = !mobile.classList.contains('open');
      mobile.classList.toggle('open', opening);
      launcherToggle.classList.toggle('open', opening);
      launcherToggle.setAttribute('aria-expanded', String(opening));
    });
    mobile.addEventListener('click', function (event) { event.stopPropagation(); });
    document.addEventListener('click', closeLauncher);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeLauncher();
    });

    if (!document.getElementById('fas-canonical-nav-style')) {
      var style = document.createElement('style');
      style.id = 'fas-canonical-nav-style';
      style.textContent = '.fas-canonical-nav{position:sticky;top:0;z-index:10040;width:100%;border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(9,8,14,.96),rgba(7,6,11,.88));box-shadow:0 14px 44px rgba(0,0,0,.24);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}.fas-nav-shell{width:min(1480px,100%);min-height:62px;margin:auto;padding:0 clamp(14px,2.4vw,34px);display:flex;align-items:center;gap:clamp(14px,2vw,28px);box-sizing:border-box}.fas-nav-brand{display:inline-flex;align-items:baseline;gap:4px;flex:0 0 auto;color:#fff!important;text-decoration:none!important;font:900 13px/1 Inter,system-ui,sans-serif;letter-spacing:.055em}.fas-nav-brand b{color:#ec4899}.fas-nav-brand small{color:#8b5cf6;font-size:8px;letter-spacing:.16em}.fas-nav-primary{display:flex;align-items:center;gap:4px;min-width:0}.fas-nav-link{position:relative;display:inline-flex;align-items:center;min-height:34px;padding:0 9px;border-radius:999px;color:rgba(255,255,255,.72)!important;text-decoration:none!important;font:700 11px/1 Inter,system-ui,sans-serif;white-space:nowrap;transition:color .18s ease,background .18s ease,box-shadow .18s ease}.fas-nav-link:hover,.fas-nav-link[aria-current=page]{color:#fff!important;background:rgba(255,255,255,.075);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}.fas-nav-link[aria-current=page]::after{content:"";position:absolute;left:35%;right:35%;bottom:3px;height:2px;border-radius:9px;background:linear-gradient(90deg,#8b5cf6,#ec4899);box-shadow:0 0 10px rgba(236,72,153,.8)}.fas-nav-actions{display:flex;align-items:center;gap:5px;margin-left:auto}.fas-nav-auth{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 11px;border:1px solid rgba(236,72,153,.38);border-radius:999px;background:linear-gradient(135deg,rgba(139,92,246,.14),rgba(236,72,153,.16));color:#fff!important;text-decoration:none!important;font:800 10px/1 Inter,system-ui,sans-serif;letter-spacing:.05em;white-space:nowrap}.fas-nav-auth:hover{border-color:rgba(236,72,153,.75);box-shadow:0 0 24px rgba(236,72,153,.14)}.fas-nav-toggle{display:grid!important;grid-template-columns:repeat(3,4px);grid-auto-rows:4px;gap:3px;width:36px;height:36px;margin-left:4px;padding:7px;border:1px solid rgba(255,255,255,.13);border-radius:11px;background:rgba(255,255,255,.045);place-content:center;cursor:pointer}.fas-nav-toggle i{display:block;width:4px;height:4px;border-radius:50%;background:#fff;box-shadow:0 0 7px rgba(236,72,153,.55);transition:background .18s ease,transform .18s ease}.fas-nav-toggle:hover,.fas-nav-toggle.open{border-color:rgba(236,72,153,.55);background:rgba(236,72,153,.1)}.fas-nav-toggle:hover i,.fas-nav-toggle.open i{background:#ec4899;transform:scale(1.12)}.fas-mobile-nav{display:none;position:fixed;z-index:10030;top:62px;right:10px;width:min(390px,calc(100vw - 20px));max-height:calc(100dvh - 76px);overflow:auto;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:18px;background:linear-gradient(160deg,rgba(16,11,22,.98),rgba(7,6,11,.98));box-shadow:0 28px 90px rgba(0,0,0,.62),0 0 40px rgba(139,92,246,.08);backdrop-filter:blur(22px)}.fas-mobile-nav.open{display:grid!important;grid-template-columns:1fr 1fr;gap:4px}.fas-launcher-title{grid-column:1/-1;display:flex;align-items:end;justify-content:space-between;padding:8px 9px 12px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:5px}.fas-launcher-title span{color:#fff;font:900 12px/1 Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase}.fas-launcher-title small{color:rgba(255,255,255,.45);font:600 9px/1 Inter,sans-serif}.fas-mobile-nav .fas-nav-link,.fas-mobile-nav .fas-nav-auth{justify-content:flex-start;min-height:42px;padding:0 13px;border-radius:10px}.fas-mobile-nav .fas-nav-auth{grid-column:1/-1;margin-top:5px;justify-content:center}@media(max-width:980px){.fas-nav-primary{gap:0}.fas-nav-link-compact{padding:0 6px;font-size:10px}.fas-nav-actions>.fas-nav-link{display:none}}@media(max-width:760px){.fas-nav-shell{min-height:58px}.fas-nav-primary,.fas-nav-actions{display:none}.fas-nav-toggle{margin-left:auto}.fas-mobile-nav{top:60px}.fas-nav-brand{font-size:12px}}@media(max-width:420px){.fas-mobile-nav.open{grid-template-columns:1fr}.fas-launcher-title,.fas-mobile-nav .fas-nav-auth{grid-column:1}}';
      document.head.appendChild(style);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCanonicalNav);
  else initCanonicalNav();
}());

/* ================================================================
   SESSION-AWARE NAV — runs on every page that loads this script.
   Reads fas_user from localStorage and updates nav + adds a
   signed-in bar so the site always knows who is logged in.
   ================================================================ */
(function () {
  'use strict';

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem('fas_user') || localStorage.getItem('fas_member') || 'null');
    } catch(e) { return null; }
  }

  function sessionUsername(session) {
    return String(
      session && (session.username || session.user_name || session.handle || session.profile && session.profile.username) || ''
    ).trim().replace(/^@/, '').toLowerCase();
  }

  function clearSession() {
    localStorage.removeItem('fas_user');
    localStorage.removeItem('fas_member');
  }

  function authClick(event) {
    if (!getSession()) return;
    event.preventDefault();
    clearSession();
    window.dispatchEvent(new CustomEvent('fas:session-changed'));
    location.href = '/index.html';
  }

  function initSessionNav() {
    var session = getSession();
    var signedIn = Boolean(session && sessionUsername(session));
    var label = signedIn ? 'Log Out' : 'Sign In';

    document.querySelectorAll('a[href$="login.html"], a[href*="login.html?"]').forEach(function(link) {
      link.textContent = label;
      link.href = signedIn ? '#logout' : '/login.html';
      link.removeEventListener('click', authClick);
      if (signedIn) link.addEventListener('click', authClick);
    });

  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSessionNav);
  else initSessionNav();
  window.addEventListener('fas:session-changed', initSessionNav);
}());
(function () {
  'use strict';

  function closeMobileNav(toggle, nav) {
    nav.classList.remove('open');
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
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
      document.body.classList.toggle('nav-open', opening);
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

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        closeMobileNav(toggle, nav);
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 640 && nav.classList.contains('open')) {
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
    // Only load on network.html (main board page)
    var isNetworkPage = /network\.html(\?|#|$)/.test(window.location.pathname);
    if (!isNetworkPage) return;
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
    if (window.FAS_DISABLE_PHONE_LAUNCHER === true) return true;
    if (document.body && document.body.hasAttribute('data-disable-phone-launcher')) return true;
    return path.endsWith('/phone.html') || path === '/phone.html'
      || path.endsWith('/phone') || path === '/phone';
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
