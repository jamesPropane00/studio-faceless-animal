/* Faceless Animal Studios — assets/script.js
   Handles: mobile nav toggle · session-aware nav · close on link click
   Smooth scroll is handled via CSS scroll-behavior: smooth in style.css
   ------------------------------------------------------------------ */

/* ================================================================
   GLOBAL SLOW-LOAD WIDGET
   Shows only when page load is slower than expected.
   ================================================================ */
(function () {
  'use strict';

  if (window.__fasSlowLoadWidgetInit) return;
  window.__fasSlowLoadWidgetInit = true;

  if (document.readyState === 'complete') return;

  var SHOW_AFTER_MS = 700;
  var MIN_VISIBLE_MS = 300;

  var shownAt = 0;
  var isShown = false;
  var isDone = false;
  var showTimer = null;
  var widgetEl = null;

  function injectStyle() {
    if (document.getElementById('fas-slow-load-style')) return;
    var style = document.createElement('style');
    style.id = 'fas-slow-load-style';
    style.textContent = '' +
      '.fas-load-widget{' +
      'position:fixed;right:14px;bottom:14px;z-index:2147483000;display:flex;align-items:center;gap:10px;' +
      'padding:10px 12px;border-radius:999px;background:rgba(11,11,12,0.92);color:#f4f4f4;' +
      'border:1px solid rgba(255,255,255,0.13);box-shadow:0 10px 34px rgba(0,0,0,0.46);' +
      'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font:600 12px/1.2 Inter,Arial,sans-serif;' +
      'opacity:0;transform:translateY(10px);transition:opacity .2s ease,transform .2s ease;pointer-events:none;' +
      '}' +
      '.fas-load-widget--show{opacity:1;transform:translateY(0);}' +
      '.fas-load-spinner{width:14px;height:14px;border-radius:999px;border:2px solid rgba(255,255,255,.25);border-top-color:#d7ba82;animation:fasLoadSpin .75s linear infinite;}' +
      '@keyframes fasLoadSpin{to{transform:rotate(360deg);}}' +
      '@media (max-width:640px){.fas-load-widget{right:10px;bottom:10px;padding:9px 11px;font-size:11px;}}';
    (document.head || document.documentElement).appendChild(style);
  }

  function show() {
    if (isDone || isShown) return;
    injectStyle();

    widgetEl = document.createElement('div');
    widgetEl.className = 'fas-load-widget';
    widgetEl.setAttribute('role', 'status');
    widgetEl.setAttribute('aria-live', 'polite');
    widgetEl.innerHTML = '<span class="fas-load-spinner" aria-hidden="true"></span><span>Loading fresh Signal...</span>';
    (document.body || document.documentElement).appendChild(widgetEl);

    requestAnimationFrame(function () {
      if (widgetEl) widgetEl.classList.add('fas-load-widget--show');
    });

    shownAt = Date.now();
    isShown = true;
  }

  function hideNow() {
    if (!widgetEl) return;
    widgetEl.classList.remove('fas-load-widget--show');
    setTimeout(function () {
      if (widgetEl && widgetEl.parentNode) widgetEl.parentNode.removeChild(widgetEl);
      widgetEl = null;
    }, 220);
  }

  function complete() {
    if (isDone) return;
    isDone = true;

    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }

    if (!isShown) return;
    var elapsed = Date.now() - shownAt;
    var wait = elapsed >= MIN_VISIBLE_MS ? 0 : (MIN_VISIBLE_MS - elapsed);
    setTimeout(hideNow, wait);
  }

  showTimer = setTimeout(show, SHOW_AFTER_MS);
  window.addEventListener('load', complete, { once: true });
  window.addEventListener('pagehide', complete, { once: true });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') complete();
  });
}());

/* ================================================================
   CACHE / SERVICE-WORKER SAFETY — runs before app init.
   Purpose: prevent stale service-worker/cache takeover on live
   and local builds when older mobile/browser caches are hanging on.
   ================================================================ */
(function () {
  'use strict';

  var CACHE_PURGE_KEY = 'fas_cache_purge_20260323';

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

  // Bump this value whenever you need to force-log out all existing sessions.
  var FORCE_SIGNOUT_VERSION = '20260323-global-logout-1';
  var FORCE_SIGNOUT_KEY = 'fas_force_signout_version';

  function getSession() {
    try { return JSON.parse(localStorage.getItem('fas_user') || 'null'); } catch(e) { return null; }
  }

  function clearSessionState() {
    try {
      localStorage.removeItem('fas_user');
      localStorage.removeItem('fas_member');
    } catch (e) {}
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

  function enforceGlobalSignout() {
    var sess = getSession();
    if (!sess || !sess.username) return;

    var seenVersion = '';
    try { seenVersion = String(localStorage.getItem(FORCE_SIGNOUT_KEY) || ''); } catch (e) {}
    if (seenVersion === FORCE_SIGNOUT_VERSION) return;

    clearSessionState();
    try { localStorage.setItem(FORCE_SIGNOUT_KEY, FORCE_SIGNOUT_VERSION); } catch (e) {}

    var path = String(window.location.pathname || '').toLowerCase();
    if (path.indexOf('/login.html') !== -1 || path === '/login') return;
    window.location.replace(rootHref('login.html') + '?forced=1');
  }

  function updateNav() {
    enforceGlobalSignout();

    var sess = getSession();

    // ── Body classes (always run, even when logged out) ──────────
    if (!sess || !sess.username) {
      document.body.classList.add('is-guest');
      return;
    }

    var display  = (sess.display || sess.username);
    var username = sess.username.toLowerCase();
    var plan     = sess.plan || 'free';
    var initial  = display.charAt(0).toUpperCase();
    var isAdmin  = hasAdminAccessRole(sess.role);
    var isPaid   = ['starter','pro','premium','access'].indexOf(plan) !== -1;

    // Track one visit event per pathname per browser tab session.
    try {
      var pathname = window.location.pathname || '/';
      var visitKey = 'fas_alive_seen_' + pathname;
      if (!sessionStorage.getItem(visitKey)) {
        sessionStorage.setItem(visitKey, '1');
        import('./js/member-db.js')
          .then(function(mod) {
            if (mod && typeof mod.trackMemberActivity === 'function') {
              return mod.trackMemberActivity(username, 'page_visit_session_start', {
                pagePath: pathname,
                source: 'client',
                momentumDelta: 1,
                context: {
                  plan: plan,
                },
              });
            }
          })
          .catch(function() {});
      }
    } catch (e) {}

    document.body.classList.add('is-logged-in');
    if (isPaid)    document.body.classList.add('is-member');
    if (plan === 'premium') document.body.classList.add('is-premium');
    if (isAdmin)   document.body.classList.add('is-admin');

    // ── Desktop nav: replace "Sign In" link with user pill ───────
    var ctaLinks = document.querySelectorAll('a.nav-cta');
    ctaLinks.forEach(function(a) {
      a.href = rootHref('dashboard.html');
      a.title = 'Your dashboard';
      a.innerHTML =
        '<span style="display:inline-flex;align-items:center;gap:6px;">' +
          '<span style="display:inline-flex;align-items:center;justify-content:center;' +
                'width:22px;height:22px;border-radius:50%;background:var(--purple-bright);' +
                'color:#fff;font-size:0.72rem;font-weight:800;flex-shrink:0;">' +
            initial +
          '</span>' +
          '<span style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">@' + username + '</span>' +
        '</span>';
      a.style.cssText = 'color:var(--purple-bright);border-color:rgba(139,92,246,0.5);' +
                        'background:rgba(139,92,246,0.1);padding:4px 10px;border-radius:20px;' +
                        'border:1px solid rgba(139,92,246,0.4);';
    });

    // ── Mobile nav: replace "Sign In" with dashboard section ─────
    var mobileNav = document.getElementById('mobile-menu');
    if (mobileNav) {
      // Replace the Sign In link
      mobileNav.querySelectorAll('a').forEach(function(a) {
        if (a.href && a.href.indexOf('login') !== -1 && a.textContent.indexOf('Sign') !== -1) {
          a.href = rootHref('dashboard.html');
          a.innerHTML =
            '<span style="display:inline-flex;align-items:center;gap:8px;">' +
              '<span style="display:inline-flex;align-items:center;justify-content:center;' +
                    'width:28px;height:28px;border-radius:50%;background:var(--purple-bright);' +
                    'color:#fff;font-size:0.85rem;font-weight:800;">' +
                initial +
              '</span>' +
              '<span>' +
                '<span style="display:block;font-size:0.78rem;color:var(--text-3);">Signed in as</span>' +
                '<span style="font-weight:800;color:var(--purple-bright);">@' + username + '</span>' +
              '</span>' +
            '</span>';
          a.style.cssText = 'display:flex;align-items:center;background:rgba(139,92,246,0.08);' +
                            'border:1px solid rgba(139,92,246,0.25);border-radius:10px;padding:10px 14px;';
        }
      });

      // Add admin radio link if admin
      if (isAdmin && !mobileNav.querySelector('.admin-radio-link')) {
        var ma = document.createElement('a');
        ma.href      = rootHref('admin/index.html');
        ma.textContent = '🛠 Admin Dashboard';
        ma.className = 'admin-radio-link';
        ma.style.cssText = 'color:var(--gold-bright);font-weight:700;font-size:0.9rem;';
        armSingleNavigation(ma);
        mobileNav.insertBefore(ma, mobileNav.firstChild);
      }
    }

    // ── Desktop nav: inject admin radio link ──────────────────────
    if (isAdmin) {
      var desktopNav = document.querySelector('.navbar-links');
      if (desktopNav && !desktopNav.querySelector('.admin-radio-link')) {
        var li = document.createElement('li');
        var a  = document.createElement('a');
        a.href      = rootHref('admin/index.html');
        a.textContent = '🛠 Admin Dashboard';
        a.className = 'admin-radio-link';
        a.title     = 'Admin Dashboard';
        a.style.cssText = 'color:var(--gold-bright);font-size:0.8rem;';
        armSingleNavigation(a);
        li.appendChild(a);
        // Insert before the CTA (last item)
        var ctaItem = desktopNav.querySelector('li:last-child');
        desktopNav.insertBefore(li, ctaItem);
      }
    }

    // ── Signed-in toast bar at top of page ───────────────────────
    if (!document.getElementById('fas-session-bar')) {
      var bar = document.createElement('div');
      bar.id  = 'fas-session-bar';
      var planBadge = isPaid
        ? '<span style="background:rgba(212,175,55,0.15);color:var(--gold-bright);border:1px solid rgba(212,175,55,0.3);border-radius:20px;padding:1px 8px;font-size:0.68rem;font-weight:700;margin-left:6px;">' + plan.toUpperCase() + '</span>'
        : '';
      bar.innerHTML =
        '<span style="display:inline-flex;align-items:center;justify-content:center;' +
              'width:18px;height:18px;border-radius:50%;background:var(--purple-bright);' +
              'color:#fff;font-size:0.65rem;font-weight:800;margin-right:6px;flex-shrink:0;">' +
          initial +
        '</span>' +
        '<span>Signed in as <strong style="color:var(--purple-bright);">@' + username + '</strong>' + planBadge + '</span>' +
        '<a href="' + rootHref('dashboard.html') + '" style="margin-left:auto;color:var(--purple-bright);font-weight:700;font-size:0.72rem;white-space:nowrap;text-decoration:none;">Dashboard →</a>';
      bar.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:10000;' +
        'display:flex;align-items:center;gap:6px;' +
        'padding:6px 16px;font-size:0.75rem;color:var(--text-2);' +
        'background:rgba(10,8,20,0.97);border-bottom:1px solid rgba(139,92,246,0.25);' +
        'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);';
      document.body.insertBefore(bar, document.body.firstChild);

      // Push page content down so bar doesn't overlap navbar
      var navbar = document.querySelector('.navbar');
      if (navbar) navbar.style.marginTop = '31px';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateNav);
  } else {
    updateNav();
  }
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
