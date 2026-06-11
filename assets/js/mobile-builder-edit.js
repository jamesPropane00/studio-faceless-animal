// assets/js/mobile-builder-edit.js
// Adds: Load published page data from Supabase and populate the builder form for editing

import { supabase, SUPABASE_READY } from './supabase-client.js';

/**
 * Loads the current user's published page data from Supabase and populates the builder form.
 * @param {string} username - The username or slug of the user whose page to load.
 */
export async function loadPublishedPageToBuilder(username) {
  if (!SUPABASE_READY) {
    alert('Supabase is not configured. Cannot load published page.');
    return;
  }
  // Fetch profile and all pages
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*, pages(*)')
    .eq('username', username)
    .single();
  if (error || !profile) {
    alert('Could not find your published page.');
    return;
  }
  const pages = profile.pages || [];
  let page = pages.find(p => p.page_status === 'live');
  if (pages.length > 1) {
    // Let user pick which page to edit
    const options = pages.map((p, i) => `${i + 1}: ${p.title || p.subtitle || p.page_type || 'Untitled'} (${p.page_status})`).join('\n');
    const pick = prompt('Multiple pages found. Enter number to edit:\n' + options, '1');
    const idx = parseInt(pick, 10) - 1;
    if (!isNaN(idx) && pages[idx]) page = pages[idx];
  }
  if (!page) {
    alert('No published page found for this user.');
    return;
  }
  // Map Supabase data to builder form fields
  const data = mapSupabaseToBuilderForm(profile, page);
  populateBuilderForm(data);
  // Highlight missing/invalid fields after load
  setTimeout(() => {
    document.querySelectorAll('.mb-form-input[required], .mb-form-textarea[required]').forEach(el => {
      if (!el.value) {
        el.style.borderColor = '#ff4fd8';
        el.style.boxShadow = '0 0 0 2px #ff4fd888';
      } else {
        el.style.borderColor = '';
        el.style.boxShadow = '';
      }
    });
  }, 200);
  // Show edit mode banner
  const banner = document.getElementById('mb-edit-banner');
  if (banner) banner.style.display = '';
}

/**
 * Maps Supabase profile/page data to builder form fields.
 */
function mapSupabaseToBuilderForm(profile, page) {
  // This mapping should be updated as needed to match builder fields
  const meta = (page && page.metadata_json) || {};
  return {
    username: profile.username || '',
    title: page.title || '',
    tagline: page.subtitle || '',
    bio: profile.bio || '',
    profile_img: profile.avatar_url || '',
    banner_img: profile.cover_image_url || '',
    cta1_text: meta.cta1_text || '',
    cta1_link: meta.cta1_link || '',
    cta2_text: meta.cta2_text || '',
    cta2_link: meta.cta2_link || '',
    cta3_text: meta.cta3_text || '',
    cta3_link: meta.cta3_link || '',
    announcement: meta.announcement || '',
    testimonial: meta.testimonial || '',
    footer: meta.footer || '',
    location: profile.city || '',
    event_date: meta.event_date || '',
    pricing: meta.pricing || '',
    links: Array.isArray(meta.links) ? meta.links : [],
    track_title: meta.track_title || '',
    track_link: meta.track_link || '',
    video_title: meta.video_title || '',
    video_link: meta.video_link || '',
    instagram: (profile.links_json && profile.links_json.instagram) || '',
    tiktok: (profile.links_json && profile.links_json.tiktok) || '',
    youtube: (profile.links_json && profile.links_json.youtube) || '',
    spotify: (profile.links_json && profile.links_json.spotify) || '',
    twitter: (profile.links_json && profile.links_json.twitter) || '',
    soundcloud: (profile.links_json && profile.links_json.soundcloud) || '',
    website: (profile.links_json && profile.links_json.website) || '',
    contact: (profile.links_json && profile.links_json.email) || '',
    accent_color: meta.accent_color || '#b48cff',
    card_style: meta.card_style || 'glass',
    font_vibe: meta.font_vibe || 'clean',
    layout: meta.layout || 'centered',
    // Add toggles as needed
    show_banner: meta.show_banner || false,
    show_profile_img: meta.show_profile_img || false,
    show_cta: meta.show_cta || false,
    show_links: meta.show_links || false,
    show_featured_media: meta.show_featured_media || false,
    show_social: meta.show_social || false,
    show_footer: meta.show_footer || false,
    show_announcement: meta.show_announcement || false,
  };
}

/**
 * Populates the builder form with the given data object.
 */
function populateBuilderForm(data) {
  // Auto-select template if present
  if (data.template) {
    document.querySelectorAll('.mb-template-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.template === data.template);
    });
    if (typeof updateTemplateSelection === 'function') updateTemplateSelection(data.template);
  }
  Object.entries(data).forEach(([k, v]) => {
    const el = document.querySelector(`[name="${k}"]`);
    if (el) {
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v;
    }
  });
  // Links
  if (data.links && Array.isArray(data.links)) {
    const ul = document.getElementById('mb-links-list');
    ul.innerHTML = '';
    data.links.forEach(link => {
      const li = document.createElement('li');
      li.className = 'mb-link-row';
      li.innerHTML = `<input type="text" value="${link}" placeholder="Paste link"> <button type="button" class="mb-link-remove">Remove</button>`;
      li.querySelector('.mb-link-remove').onclick = () => li.remove();
      ul.appendChild(li);
    });
  }
  // Toggles
  document.querySelectorAll('.mb-toggle-card').forEach(card => {
    card.classList.toggle('selected', !!data[card.dataset.toggle]);
  });
  // Trigger preview update
  if (typeof renderPreview === 'function') renderPreview();
}

// Add Draft vs Published toggle logic
const draftBtn = document.getElementById('mb-save-draft');
const publishBtn = document.getElementById('mb-publish');
const editBanner = document.getElementById('mb-edit-banner');
if (editBanner) {
  // Add a toggle button to the banner
  if (!document.getElementById('mb-edit-toggle')) {
    const toggle = document.createElement('button');
    toggle.id = 'mb-edit-toggle';
    toggle.textContent = 'Switch to Draft';
    toggle.style = 'margin-left:1.5rem;background:#23233a;color:#b48cff;border:none;border-radius:6px;padding:0.3rem 1rem;cursor:pointer;font-size:0.97rem;';
    editBanner.appendChild(toggle);
    let editingPublished = true;
    toggle.onclick = () => {
      editingPublished = !editingPublished;
      if (editingPublished) {
        toggle.textContent = 'Switch to Draft';
        editBanner.textContent = 'EDITING PUBLISHED PAGE';
        editBanner.appendChild(toggle);
        // Reload published page data
        const uname = localStorage.getItem('fas_mobile_builder_username') || '';
        if (uname) loadPublishedPageToBuilder(uname);
      } else {
        toggle.textContent = 'Switch to Published';
        editBanner.textContent = 'EDITING DRAFT';
        editBanner.appendChild(toggle);
        // Load draft from localStorage
        const draft = localStorage.getItem('fas_mobile_builder_draft');
        if (draft) {
          try {
            populateBuilderForm(JSON.parse(draft));
          } catch {}
        }
      };
    };
  }
}

// Undo/Redo support for form changes
let undoStack = [], redoStack = [];
function saveFormState() {
  const data = {};
  document.querySelectorAll('.mb-form-input, .mb-form-textarea').forEach(el => {
    data[el.name] = el.value;
  });
  undoStack.push(JSON.stringify(data));
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
}
document.getElementById('mb-form').addEventListener('input', saveFormState);
window.addEventListener('DOMContentLoaded', saveFormState);
if (!document.getElementById('mb-undo-btn')) {
  const undoBtn = document.createElement('button');
  undoBtn.id = 'mb-undo-btn';
  undoBtn.textContent = 'Undo';
  undoBtn.className = 'mb-btn secondary';
  undoBtn.style.marginRight = '0.5rem';
  undoBtn.onclick = e => {
    e.preventDefault();
    if (undoStack.length > 1) {
      redoStack.push(undoStack.pop());
      const prev = JSON.parse(undoStack[undoStack.length - 1]);
      Object.entries(prev).forEach(([k, v]) => {
        const el = document.querySelector(`[name="${k}"]`);
        if (el) el.value = v;
      });
      if (typeof renderPreview === 'function') renderPreview();
    }
  };
  document.querySelector('.mb-btn-row').prepend(undoBtn);
}
if (!document.getElementById('mb-redo-btn')) {
  const redoBtn = document.createElement('button');
  redoBtn.id = 'mb-redo-btn';
  redoBtn.textContent = 'Redo';
  redoBtn.className = 'mb-btn secondary';
  redoBtn.onclick = e => {
    e.preventDefault();
    if (redoStack.length) {
      const next = JSON.parse(redoStack.pop());
      undoStack.push(JSON.stringify(next));
      Object.entries(next).forEach(([k, v]) => {
        const el = document.querySelector(`[name="${k}"]`);
        if (el) el.value = v;
      });
      if (typeof renderPreview === 'function') renderPreview();
    }
  };
  document.querySelector('.mb-btn-row').prepend(redoBtn);
}

// Show preview-only mode if offline
if (!SUPABASE_READY) {
  const banner = document.getElementById('mb-edit-banner');
  if (banner) {
    banner.style.display = '';
    banner.textContent = 'OFFLINE PREVIEW MODE — Editing and publishing are disabled.';
    banner.style.background = '#ff4fd8';
    banner.style.color = '#fff';
  }
  // Optionally disable form inputs and buttons
  document.querySelectorAll('.mb-form-input, .mb-form-textarea, .mb-btn').forEach(el => {
    el.disabled = true;
    el.style.opacity = 0.7;
    el.style.cursor = 'not-allowed';
  });
}

// Toast/banner for all actions
function showToast(msg, color = '#b48cff') {
  let toast = document.getElementById('mb-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'mb-toast';
    toast.style = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:' + color + ';color:#181828;padding:1rem 2rem;border-radius:12px;font-weight:bold;z-index:9999;box-shadow:0 4px 16px #0005;font-size:1.1rem;transition:opacity 0.3s;opacity:0;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = color;
  toast.style.opacity = 1;
  setTimeout(() => { toast.style.opacity = 0; }, 2600);
}

// Patch publishToWeb and loadPublishedPageToBuilder to use showToast
const origPublishToWeb = window.publishToWeb;
window.publishToWeb = async function(data, isDraft = false) {
  try {
    await origPublishToWeb(data, isDraft);
    showToast(isDraft ? 'Draft saved to web!' : 'Page published!');
  } catch (e) {
    showToast('Error: ' + (e.message || e), '#ff4fd8');
  }
};
const origLoadPublished = window.loadPublishedPageToBuilder;
window.loadPublishedPageToBuilder = async function(username) {
  try {
    await origLoadPublished(username);
    showToast('Loaded published page for editing!');
  } catch (e) {
    showToast('Error: ' + (e.message || e), '#ff4fd8');
  }
};

// Mobile-first UX: sticky preview, collapsible sections, swipe gestures
window.addEventListener('DOMContentLoaded', () => {
  // Sticky preview
  const previewCard = document.querySelector('.mb-preview-card');
  if (previewCard) {
    previewCard.style.position = 'sticky';
    previewCard.style.top = '0.5rem';
    previewCard.style.zIndex = 10;
  }
  // Collapsible sections
  document.querySelectorAll('.mb-section-title').forEach(title => {
    title.style.cursor = 'pointer';
    const card = title.closest('.mb-card');
    if (card) {
      title.onclick = () => {
        const content = Array.from(card.children).slice(1);
        content.forEach(el => {
          el.style.display = (el.style.display === 'none') ? '' : 'none';
        });
      };
    }
  });
  // Swipe gesture for preview (left/right to collapse/expand)
  let startX = null;
  previewCard && previewCard.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
  });
  previewCard && previewCard.addEventListener('touchend', e => {
    if (startX !== null) {
      const dx = e.changedTouches[0].clientX - startX;
      if (dx < -60) previewCard.style.display = 'none';
      if (dx > 60) previewCard.style.display = '';
      startX = null;
    }
  });
});
