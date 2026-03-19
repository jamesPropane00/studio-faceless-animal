(function() {
  'use strict';

  const appContent = document.getElementById('app-content');
  if (!appContent) return; // not on SPA page

  function isInternalLink(href) {
    if (!href) return false;
    if (href.startsWith('http') || href.startsWith('//')) return false;
    if (href.includes('mailto:') || href.includes('tel:')) return false;
    if (href.startsWith('#')) return false;
    if (!href.endsWith('.html')) return false;
    if (href.includes('radio.html')) return false;
    return true;
  }

  function loadPage(url, push = true) {
    fetch(url)
      .then(r => r.text())
      .then(html => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newApp = doc.querySelector("#app-content");
        const currentApp = document.querySelector("#app-content");

        if (newApp && currentApp) {
          currentApp.innerHTML = newApp.innerHTML;
        } else {
          console.warn("SPA: #app-content not found");
        }
        document.dispatchEvent(new Event("page:loaded"));
        if (push) {
          history.pushState({url}, '', url);
        }
        // Re-run any page-specific init if needed (minimal, none for now)
      })
      .catch(err => console.error('Load page error:', err));
  }

  document.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (a && a.href && isInternalLink(a.href) && !a.target) {
      e.preventDefault();
      loadPage(a.href);
    }
  });

  window.addEventListener('popstate', e => {
    if (e.state && e.state.url) {
      loadPage(e.state.url, false);
    }
  });

  // For initial load if not index
  if (location.pathname !== '/' && location.pathname !== '/index.html') {
    loadPage(location.href, false);
  }
})();