(function () {
  'use strict';

  var primary = [
    ['index.html', 'Home'],
    ['directory.html', 'Directory'],
    ['market.html', 'Market'],
    ['tv.html', 'Faceless TV'],
    ['radio.html', 'Radio'],
    ['neon-dreams.html', 'Neon Dreams'],
    ['world.html', 'World'],
    ['courses.html', 'Courses'],
    ['apps.html', 'More']
  ];

  var utilities = [
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

  function makeLink(item, compact) {
    var anchor = document.createElement('a');
    anchor.href = '/' + item[0];
    anchor.textContent = item[1];
    anchor.className = 'fas-nav-link' + (compact ? ' fas-nav-link-compact' : '');
    if (currentFile() === item[0].toLowerCase()) anchor.setAttribute('aria-current', 'page');
    return anchor;
  }

  function applyEcosystemNav() {
    var desktop = document.querySelector('#fas-canonical-nav .fas-nav-primary');
    var launcher = document.getElementById('fas-app-launcher-menu');
    if (!desktop || !launcher) return;

    desktop.replaceChildren();
    primary.forEach(function (item) { desktop.appendChild(makeLink(item, true)); });

    var auth = launcher.querySelector('.fas-nav-auth');
    var title = document.createElement('div');
    title.className = 'fas-launcher-title';
    title.innerHTML = '<span>Faceless ecosystem</span><small>All systems</small>';
    launcher.replaceChildren(title);
    primary.concat(utilities).forEach(function (item) { launcher.appendChild(makeLink(item, false)); });
    if (auth) launcher.appendChild(auth);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyEcosystemNav);
  else applyEcosystemNav();
}());
