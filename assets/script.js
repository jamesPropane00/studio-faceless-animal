/* Faceless Animal Studios — assets/script.js
   Handles: mobile nav toggle · session-aware nav · close on link click
   Smooth scroll is handled via CSS scroll-behavior: smooth in style.css
   ------------------------------------------------------------------ */

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

  function updateNav() {
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
