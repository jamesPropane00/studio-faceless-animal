(function () {
  'use strict';

  var primary = [
    ['directory.html', 'Directory', 'nav-directory'],
    ['market.html', 'Market', 'nav-market'],
    ['tv.html', 'Faceless TV', 'nav-tv'],
    ['radio.html', 'Radio', 'nav-radio'],
    ['neon-dreams.html', 'Neon Dreams Club', 'nav-neon-dreams'],
    ['courses.html', 'Courses', 'nav-courses']
  ];

  var utilities = [
    ['index.html', 'Home'],
    ['world.html', 'World'],
    ['apps.html', 'More'],
    ['routedrop/routedrop-million-car-army/app/index.html', 'RouteDrop'],
    ['pulse.html', 'Pulse Stage'],
    ['chat.html', 'Rooms'],
    ['phone.html', 'Signal Phone'],
    ['news.html', 'News'],
    ['wallet.html', 'Secure Wallet'],
    ['ai.html', 'AI'],
    ['canvas.html', 'Canvas'],
    ['live-rap-room.html', 'Live Rap Room'],
    ['dashboard.html', 'Dashboard']
  ];

  function currentFile() {
    return (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  }

  function makeLink(item, compact, featured) {
    var anchor = document.createElement('a');
    anchor.href = '/' + item[0];
    anchor.textContent = item[1];
    anchor.className = ['fas-nav-link', compact ? 'fas-nav-link-compact' : '', featured ? 'nav-featured' : '', item[2] || ''].filter(Boolean).join(' ');
    if (currentFile() === item[0].toLowerCase()) anchor.setAttribute('aria-current', 'page');
    return anchor;
  }

  function applyEcosystemNav() {
    var desktop = document.querySelector('#fas-canonical-nav .fas-nav-primary');
    var launcher = document.getElementById('fas-app-launcher-menu');
    if (!desktop || !launcher) return;

    desktop.replaceChildren();
    primary.forEach(function (item) { desktop.appendChild(makeLink(item, true, true)); });

    var auth = launcher.querySelector('.fas-nav-auth');
    var title = document.createElement('div');
    title.className = 'fas-launcher-title';
    title.innerHTML = '<span>Faceless ecosystem</span><small>All systems</small>';
    launcher.replaceChildren(title);
    primary.forEach(function (item) { launcher.appendChild(makeLink(item, false, true)); });
    utilities.forEach(function (item) { launcher.appendChild(makeLink(item, false, false)); });
    if (auth) launcher.appendChild(auth);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyEcosystemNav);
  else applyEcosystemNav();
}());
