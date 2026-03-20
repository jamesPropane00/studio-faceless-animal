function initPageSpecific() {
  console.log('SPA page loaded');

  const main = document.querySelector('main');
  if (!main) {
    console.warn('SPA initPageSpecific: <main> not found, skipping page-specific init.');
    return;
  }

  // Add any page-specific initialization inside this block,
  // safe only when <main> exists and content is present.
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPageSpecific);
} else {
  initPageSpecific();
}

document.addEventListener('page:loaded', initPageSpecific);