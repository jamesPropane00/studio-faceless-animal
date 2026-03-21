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
    if (href.includes('directory.html')) return false;
    return true;
  }

  function loadPage(url, push = true) {
    fetch(url)
      .then(r => r.text())
      .then(html => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const currentApp = document.querySelector("#app-content");

        // Try to find #app-content first
        let sourceContent = doc.querySelector("#app-content");
        
        // Fallback to <main> if #app-content doesn't exist
        if (!sourceContent) {
          sourceContent = doc.querySelector("main");
        }

        // If we found content, inject it
        if (sourceContent && currentApp) {
          currentApp.innerHTML = sourceContent.innerHTML;
        } else if (!sourceContent) {
          console.warn("SPA: Neither #app-content nor <main> found in fetched page:", url);
        } else if (!currentApp) {
          console.warn("SPA: #app-content not found in shell page");
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
    if (a && a.getAttribute('href')) {
      const href = a.getAttribute('href');
      if (isInternalLink(href) && !a.target) {
        e.preventDefault();
        loadPage(href);
      }
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