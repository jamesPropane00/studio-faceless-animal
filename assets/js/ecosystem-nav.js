(function () {
  'use strict';

  var links = [
    { href: 'index.html', label: 'Home' },
    { href: 'directory.html', label: 'Directory' },
    { href: 'market.html', label: 'Market', className: 'nav-market' },
    { href: 'tv.html', label: 'Faceless TV' },
    { href: 'radio.html', label: 'Radio' },
    { href: 'neon-dreams.html', label: 'Neon Dreams' },
    { href: 'world.html', label: 'World' },
    { href: 'courses.html', label: 'Courses', className: 'nav-courses' },
    { href: 'apps.html', label: 'More', className: 'nav-more' }
  ];

  function currentFile() {
    var file = window.location.pathname.split('/').pop().toLowerCase();
    if (!file || file === 'store') return file === 'store' ? 'store.html' : 'index.html';
    return file;
  }

  function makeLink(item, mobile) {
    var anchor = document.createElement('a');
    anchor.href = item.href;
    anchor.textContent = item.label;
    anchor.className = [mobile ? 'nav-featured' : '', item.className || ''].filter(Boolean).join(' ');
    if (currentFile() === item.href) anchor.setAttribute('aria-current', 'page');
    return anchor;
  }

  function fill(container, mobile) {
    container.replaceChildren();
    links.forEach(function (item) { container.appendChild(makeLink(item, mobile)); });
  }

  function setDesktopNav() {
    var navbar = document.querySelector('.navbar .navbar-inner');
    if (!navbar) return;
    var primary = navbar.querySelector('.primary-nav-buttons');
    if (!primary) {
      primary = document.createElement('div');
      primary.className = 'primary-nav-buttons';
      primary.setAttribute('aria-label', 'Primary navigation');
      var legacy = navbar.querySelector('.navbar-links');
      navbar.insertBefore(primary, legacy || navbar.querySelector('.nav-toggle'));
    }
    fill(primary, false);
  }

  function setMobileNav() {
    var menu = document.querySelector('.mobile-nav.tv-waffle-menu');
    if (!menu) return;
    var ecosystem = menu.querySelector('.ecosystem-mobile-links');
    if (!ecosystem) {
      ecosystem = document.createElement('div');
      ecosystem.className = 'ecosystem-mobile-links';
      ecosystem.setAttribute('aria-label', 'Primary destinations');
      menu.insertBefore(ecosystem, menu.firstChild);
    }
    fill(ecosystem, true);

    var primaryHrefs = links.map(function (item) { return item.href; });
    Array.from(menu.children).forEach(function (child) {
      if (child === ecosystem || child.tagName !== 'A') return;
      var href = (child.getAttribute('href') || '').replace(/^\//, '');
      if (primaryHrefs.indexOf(href) !== -1 || href === 'store.html' || href === 'store') child.remove();
    });
  }

  function setStoreNav() {
    var storeNav = document.querySelector('.shop-navlinks');
    if (!storeNav) return;
    fill(storeNav, false);
  }

  function setWorldNav() {
    if (currentFile() !== 'world.html' || document.querySelector('.navbar, .ecosystem-world-nav')) return;
    var nav = document.createElement('nav');
    nav.className = 'ecosystem-world-nav';
    nav.setAttribute('aria-label', 'Faceless Animal Studios navigation');
    links.forEach(function (item) { nav.appendChild(makeLink(item, false)); });
    document.body.insertBefore(nav, document.body.firstChild);
  }

  function init() {
    setDesktopNav();
    setMobileNav();
    setStoreNav();
    setWorldNav();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
