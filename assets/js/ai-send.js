(function () {
  'use strict';

  function bind() {
    var button = document.getElementById('sendBtn');
    var input = document.getElementById('input');
    if (!button || !input || button.dataset.aiSendBound === '1') return;
    button.dataset.aiSendBound = '1';
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true,
      }));
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
}());
