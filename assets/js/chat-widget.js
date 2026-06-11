// Floating Chat Widget for Faceless Animal Studios
// Uses radio-chat.js for backend logic, styled to match site
// Drop <div id="chat-widget"></div> and this script on any page

import { initRadioChat } from './radio-chat.js';
import { requestDMConnection } from './dm.js';

function createChatWidget() {
  // Widget container
  const widget = document.createElement('div');
  widget.id = 'chat-widget-float';
  widget.className = 'chat-widget-float closed';
  widget.innerHTML = `
    <button class="chat-widget-toggle" aria-label="Open chat"><span>💬</span></button>
    <div class="chat-widget-card">
      <div class="chat-widget-header">
        <span class="chat-widget-title">Live Chat</span>
        <select class="chat-widget-room" aria-label="Select room">
          <option value="radio">Radio</option>
          <option value="underground">Underground</option>
          <option value="gaming">Gaming</option>
          <option value="latenight">Late Night</option>
        </select>
        <button class="chat-widget-close" aria-label="Close chat">×</button>
      </div>
      <div class="chat-widget-user-list" id="chat-widget-user-list" aria-label="Users in this room"></div>
      <div class="chat-widget-feed" id="chat-widget-feed" role="log" aria-label="Live chat" aria-live="polite"></div>
      <div class="chat-widget-input-row">
        <input type="text" class="chat-widget-input" id="chat-widget-input" maxlength="300" placeholder="Type a message..." autocomplete="off" />
        <button class="chat-widget-send" id="chat-widget-send" aria-label="Send">→</button>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  // Open/close logic
  const toggleBtn = widget.querySelector('.chat-widget-toggle');
  const closeBtn = widget.querySelector('.chat-widget-close');
  toggleBtn.onclick = () => widget.classList.toggle('closed');
  closeBtn.onclick = () => widget.classList.add('closed');

  // Room switching
  const roomSelect = widget.querySelector('.chat-widget-room');
  let chatApi = null;
  roomSelect.onchange = () => {
    if (chatApi && typeof chatApi.switchRoom === 'function') {
      chatApi.switchRoom(roomSelect.value);
    }
  };

  // Patch auto-scroll for chat feed
  const feedEl = widget.querySelector('#chat-widget-feed');
  const origAppend = feedEl.appendChild.bind(feedEl);
  feedEl.appendChild = function(node) {
    const result = origAppend(node);
    feedEl.scrollTop = feedEl.scrollHeight;
    return result;
  };

  // Init chat logic
  chatApi = initRadioChat({
    feedEl,
    inputEl: widget.querySelector('#chat-widget-input'),
    sendBtnEl: widget.querySelector('#chat-widget-send'),
    tabEls: null,
    userListEl: widget.querySelector('#chat-widget-user-list'),
    onUserClick: async (targetUsername, ctx) => {
      let session = null;
      try { session = JSON.parse(localStorage.getItem('fas_user') || 'null'); } catch(e) {}
      const btn = ctx && ctx.button;
      if (!session || !session.username) {
        window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname.split('/').pop() || 'chat.html');
        return;
      }
      if (!targetUsername || targetUsername.toLowerCase() === session.username.toLowerCase()) return;
      if (btn) {
        btn.disabled = true;
        btn.classList.add('rp-user-pill--pending');
      }
      const { data, error } = await requestDMConnection(session.username, targetUsername);
      if (btn) btn.disabled = false;
      if (error) {
        window.alert(error);
        if (btn) btn.classList.remove('rp-user-pill--pending');
        return;
      }
      if (data && data.state === 'connected') {
        if (window.confirm('@' + targetUsername + ' is already connected. Open Messenger?')) {
          window.location.href = 'messages.html?to=' + encodeURIComponent(targetUsername);
        }
        return;
      }
      if (btn) btn.classList.add('rp-user-pill--requested');
      window.alert('Connection request sent to @' + targetUsername + '. Messenger unlocks after they accept and trade Signal IDs.');
    },
    initialRoom: roomSelect.value,
    getSession: () => JSON.parse(localStorage.getItem('fas_user') || 'null'),
    cssPrefix: 'chat-widget',
  });
}

// Auto-initialize if #chat-widget exists
if (document.getElementById('chat-widget')) {
  createChatWidget();
}

export { createChatWidget };
