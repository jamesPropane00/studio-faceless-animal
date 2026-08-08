(function () {
  'use strict';

  var primary = [
    ['directory.html', 'Directory', 'nav-directory', 'Find creators and services'],
    ['market.html', 'Market', 'nav-market', 'Shop underground releases'],
    ['tv.html', 'Faceless TV', 'nav-tv', 'Watch original programming'],
    ['radio.html', 'Radio', 'nav-radio', 'Hear the underground live'],
    ['neon-dreams.html', 'Neon Dreams Club', 'nav-neon-dreams', 'Enter the creative community'],
    ['courses.html', 'Courses', 'nav-courses', 'Build skills and grow']
  ];

  var primaryGroups = [
    ['Explore', primary.slice(0, 2)],
    ['Watch & listen', primary.slice(2, 4)],
    ['Community & learning', primary.slice(4, 6)]
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

  function makeFeaturedLauncherLink(item) {
    var anchor = makeLink(item, false, true);
    anchor.classList.add('fas-launcher-featured-link');

    var signal = document.createElement('span');
    signal.className = 'fas-launcher-signal';
    signal.setAttribute('aria-hidden', 'true');

    var copy = document.createElement('span');
    copy.className = 'fas-launcher-link-copy';
    var name = document.createElement('strong');
    name.textContent = item[1];
    var description = document.createElement('small');
    description.textContent = item[3];
    copy.append(name, description);

    var arrow = document.createElement('span');
    arrow.className = 'fas-launcher-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '\u2197';

    anchor.replaceChildren(signal, copy, arrow);
    return anchor;
  }

  function makeLauncherGroup(group) {
    var section = document.createElement('section');
    section.className = 'fas-launcher-cluster';
    section.setAttribute('aria-label', group[0]);

    var label = document.createElement('div');
    label.className = 'fas-launcher-section-label';
    label.textContent = group[0];

    var links = document.createElement('div');
    links.className = 'fas-launcher-featured-grid';
    group[1].forEach(function (item) { links.appendChild(makeFeaturedLauncherLink(item)); });
    section.append(label, links);
    return section;
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
    title.innerHTML = '<span>Faceless ecosystem</span><small>Core destinations</small>';
    launcher.replaceChildren(title);

    var featured = document.createElement('div');
    featured.className = 'fas-launcher-featured';
    primaryGroups.forEach(function (group) { featured.appendChild(makeLauncherGroup(group)); });
    launcher.appendChild(featured);

    var more = document.createElement('section');
    more.className = 'fas-launcher-more';
    more.setAttribute('aria-label', 'More from the ecosystem');
    var moreLabel = document.createElement('div');
    moreLabel.className = 'fas-launcher-section-label';
    moreLabel.textContent = 'More from the ecosystem';
    var moreLinks = document.createElement('div');
    moreLinks.className = 'fas-launcher-more-grid';
    utilities.forEach(function (item) { moreLinks.appendChild(makeLink(item, false, false)); });
    more.append(moreLabel, moreLinks);
    launcher.appendChild(more);
    if (auth) launcher.appendChild(auth);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyEcosystemNav);
  else applyEcosystemNav();
}());
