// --- Multipage Support Logic ---
window.addEventListener('DOMContentLoaded', () => {
    // --- Media Library Integration ---
    const mediaBtn = document.getElementById('mb-open-media-library');
    if (mediaBtn) {
      mediaBtn.addEventListener('click', async () => {
        // Dynamically import the media picker (ESM)
        const { openMediaPicker } = await import('./media-picker.js');
        openMediaPicker({
          onSelect: (media) => {
            // Insert embed code into the first available Featured Track/Video field
            const isImage = media.type && media.type.startsWith('image/');
            const isAudio = media.type && media.type.startsWith('audio/');
            const isVideo = media.type && media.type.startsWith('video/');
            let embed = '';
            if (isImage) embed = media.url ? `<img src=\"${media.url}\" alt=\"${media.name}\">` : '';
            else if (isAudio) embed = media.url ? `<audio controls src=\"${media.url}\"></audio>` : '';
            else if (isVideo) embed = media.url ? `<video controls src=\"${media.url}\"></video>` : '';
            else embed = media.url ? `<a href=\"${media.url}\">Download</a>` : '';
            // Prefer track_link, then video_link
            const trackField = document.querySelector('[name="track_link"]');
            const videoField = document.querySelector('[name="video_link"]');
            if (isAudio && trackField) trackField.value = media.url;
            else if (isVideo && videoField) videoField.value = media.url;
            else if (trackField && !trackField.value) trackField.value = media.url;
            else if (videoField && !videoField.value) videoField.value = media.url;
            // Show toast
            if (window.showToast) window.showToast('Media embedded!');
          }
        });
      });
    }
  const pageSelect = document.getElementById('mb-page-select');
  const newPageBtn = document.getElementById('mb-new-page');
  const deletePageBtn = document.getElementById('mb-delete-page');
  const setHomepageBtn = document.getElementById('mb-set-homepage');
  const pagesStatus = document.getElementById('mb-pages-status');
  let pagesList = [];
  let currentPage = null;

  async function refreshPagesList(selectSlug) {
    const session = getMobileSession();
    pageSelect.innerHTML = '<option>Loading...</option>';
    try {
      const res = await fetch('/api/member/pages/list', {
        method: 'GET',
        headers: { 'x-fas-user': JSON.stringify(session) }
      });
      if (!res.ok) throw new Error('Failed to load pages');
      pagesList = await res.json();
      console.debug('[MobileBuilder] /api/member/pages/list response:', pagesList);
      pageSelect.innerHTML = '';
      if (!Array.isArray(pagesList) || pagesList.length === 0) {
        pageSelect.innerHTML = '<option value="">No pages found</option>';
        pagesStatus.textContent = 'No pages found. Create your first page!';
        currentPage = null;
        return;
      }
      pagesStatus.textContent = '';
      pagesList.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.page_slug;
        opt.textContent = (p.page_title || p.page_slug) + (p.is_homepage ? ' (Home)' : '');
        pageSelect.appendChild(opt);
      });
      // Select current or specified page
      let slug = selectSlug || (currentPage && currentPage.page_slug) || pagesList[0].page_slug;
      pageSelect.value = slug;
      await loadPageBySlug(slug);
    } catch (err) {
      pageSelect.innerHTML = '<option value="">Error loading pages</option>';
      pagesStatus.textContent = 'Could not load pages (API error).';
      console.error('[MobileBuilder] Error loading pages:', err);
    }
  }

  async function loadPageBySlug(slug) {
    if (!slug) return;
    const session = getMobileSession();
    try {
      const res = await fetch(`/api/member/pages/load?slug=${encodeURIComponent(slug)}`, {
        method: 'GET',
        headers: { 'x-fas-user': JSON.stringify(session) }
      });
      if (!res.ok) throw new Error('Failed to load page');
      const page = await res.json();
      currentPage = page;
      // Patch form fields
      Object.entries(page).forEach(([k, v]) => {
        const el = document.querySelector(`[name="${k}"]`);
        if (el) el.value = v;
      });
      setEditModeBanner(page.is_homepage ? 'published' : 'draft');
      renderPreview();
      pagesStatus.textContent = '';
    } catch (err) {
      pagesStatus.textContent = 'Failed to load page.';
    }
  }

  pageSelect.addEventListener('change', e => {
    loadPageBySlug(pageSelect.value);
  });

  newPageBtn.addEventListener('click', async () => {
    const title = prompt('New page title:');
    if (!title) return;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
    const session = getMobileSession();
    try {
      const res = await fetch('/api/member/pages/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-fas-user': JSON.stringify(session)
        },
        body: JSON.stringify({ page_title: title, page_slug: slug })
      });
      if (!res.ok) throw new Error('Failed to create page');
      pagesStatus.textContent = 'Page created!';
      await refreshPagesList(slug);
    } catch (err) {
      pagesStatus.textContent = 'Failed to create page.';
    }
  });

  deletePageBtn.addEventListener('click', async () => {
    if (!currentPage) return;
    if (currentPage.is_homepage) {
      pagesStatus.textContent = 'Cannot delete homepage.';
      return;
    }
    if (!confirm(`Delete page "${currentPage.page_title || currentPage.page_slug}"?`)) return;
    const session = getMobileSession();
    try {
      const res = await fetch('/api/member/pages/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-fas-user': JSON.stringify(session)
        },
        body: JSON.stringify({ page_slug: currentPage.page_slug })
      });
      if (!res.ok) throw new Error('Failed to delete page');
      pagesStatus.textContent = 'Page deleted.';
      await refreshPagesList();
    } catch (err) {
      pagesStatus.textContent = 'Failed to delete page.';
    }
  });

  setHomepageBtn.addEventListener('click', async () => {
    if (!currentPage) return;
    const session = getMobileSession();
    try {
      const res = await fetch('/api/member/pages/set-homepage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-fas-user': JSON.stringify(session)
        },
        body: JSON.stringify({ page_slug: currentPage.page_slug })
      });
      if (!res.ok) throw new Error('Failed to set homepage');
      pagesStatus.textContent = 'Set as homepage!';
      await refreshPagesList(currentPage.page_slug);
    } catch (err) {
      pagesStatus.textContent = 'Failed to set homepage.';
    }
  });

  // On load, fetch pages
  refreshPagesList();
});
// Mobile Builder App JS
// Handles template selection, live preview, and publishing logic

// Template HTML sources (to be loaded via fetch or embedded as strings)
const TEMPLATE_PATHS = {
  artist: 'templates/artist.html',
  business: 'templates/business.html',
  creator: 'templates/creator.html',
  'clean-white': null, // Will use inline renderer
  'clean-black': null, // Will use inline renderer
  minimal: null        // Will use inline renderer
};

const templateCache = {};


// Utility: fetch template HTML if not cached
async function getTemplateHtml(template) {
  if (templateCache[template]) return templateCache[template];
  if (TEMPLATE_PATHS[template]) {
    const resp = await fetch(TEMPLATE_PATHS[template]);
    const html = await resp.text();
    templateCache[template] = html;
    return html;
  }
  return null;
}

// Injects user data into template HTML (artist, business, creator)
function injectDataIntoTemplate(html, data, template) {
  // Create a DOM parser
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Fill [data-f] fields
  Object.entries({
    'display_name': data.title,
    'hero_heading': data.title,
    'tagline': data.tagline,
    'bio': data.bio,
    'location': data.location,
    'page_slug': data.username || '',
    'about_heading': data.title,
    'footer': data.footer,
    'testimonial': data.testimonial,
    'event_date': data.event_date,
    'pricing': data.pricing
  }).forEach(([key, value]) => {
    doc.querySelectorAll(`[data-f="${key}"]`).forEach(el => {
      el.textContent = value || '';
    });
  });

  // Fill [data-slot] fields (bio, links, social_btns, works, services, etc.)
  if (data.bio) {
    doc.querySelectorAll('[data-slot="bio"]').forEach(el => {
      el.innerHTML = `<p>${data.bio}</p>`;
    });
  }
  if (data.links && data.links.length) {
    doc.querySelectorAll('[data-slot="links"]').forEach(el => {
      el.innerHTML = data.links.map(link => `<a href="${link}" target="_blank" rel="noopener">${link}</a>`).join('<br>');
    });
  }
  if (data.instagram || data.tiktok || data.youtube || data.spotify || data.twitter || data.soundcloud || data.website) {
    doc.querySelectorAll('[data-slot="social_btns"]').forEach(el => {
      let socials = '';
      if (data.instagram) socials += `<a href="${data.instagram}" target="_blank">Instagram</a> `;
      if (data.tiktok) socials += `<a href="${data.tiktok}" target="_blank">TikTok</a> `;
      if (data.youtube) socials += `<a href="${data.youtube}" target="_blank">YouTube</a> `;
      if (data.spotify) socials += `<a href="${data.spotify}" target="_blank">Spotify</a> `;
      if (data.twitter) socials += `<a href="${data.twitter}" target="_blank">Twitter</a> `;
      if (data.soundcloud) socials += `<a href="${data.soundcloud}" target="_blank">SoundCloud</a> `;
      if (data.website) socials += `<a href="${data.website}" target="_blank">Website</a> `;
      el.innerHTML = socials;
    });
  }
  // Profile image
  if (data.profile_img) {
    doc.querySelectorAll('[data-slot="avatar"]').forEach(el => {
      el.innerHTML = `<img src="${data.profile_img}" alt="Profile" class="creator-avatar-img" style="width:90px;height:90px;border-radius:50%;object-fit:cover;">`;
    });
  }
  // Banner image
  if (data.banner_img) {
    const hero = doc.querySelector('.ap-hero');
    if (hero) {
      hero.style.backgroundImage = `linear-gradient(180deg, rgba(7,7,10,0.62) 0%, rgba(7,7,10,0.84) 100%), url('${data.banner_img}')`;
      hero.style.backgroundSize = 'cover';
      hero.style.backgroundPosition = 'center';
      hero.style.backgroundRepeat = 'no-repeat';
    }
  }
  // CTA buttons
  if (data.cta1_text && data.cta1_link) {
    doc.querySelectorAll('.ap-hero-actions a.btn-primary').forEach(el => {
      el.textContent = data.cta1_text;
      el.href = data.cta1_link;
    });
  }
  if (data.cta2_text && data.cta2_link) {
    doc.querySelectorAll('.ap-hero-actions a.btn-ghost').forEach(el => {
      el.textContent = data.cta2_text;
      el.href = data.cta2_link;
    });
  }
  // Featured media (track/video)
  if (data.track_title && data.track_link) {
    // Insert a simple audio player
    const works = doc.querySelector('[data-slot="works"]');
    if (works) {
      works.innerHTML += `<div><strong>${data.track_title}</strong><br><audio controls src="${data.track_link}" style="width:100%;margin-top:0.5rem;"></audio></div>`;
    }
  }
  if (data.video_title && data.video_link) {
    const works = doc.querySelector('[data-slot="works"]');
    if (works) {
      works.innerHTML += `<div><strong>${data.video_title}</strong><br><iframe src="${data.video_link}" style="width:100%;height:180px;margin-top:0.5rem;" frameborder="0" allowfullscreen></iframe></div>`;
    }
  }
  // Footer
  if (data.footer) {
    doc.querySelectorAll('.footer-location').forEach(el => {
      el.textContent = data.footer;
    });
  }
  // Pricing/offer
  if (data.pricing) {
    doc.querySelectorAll('[data-f="pricing"]').forEach(el => {
      el.textContent = data.pricing;
    });
  }
  // Announcement
  if (data.announcement) {
    // Insert at top if possible
    const main = doc.querySelector('main');
    if (main) {
      const bar = doc.createElement('div');
      bar.style = 'background:#b48cff;color:#181828;padding:0.5rem 1rem;text-align:center;border-radius:8px;margin-bottom:1rem;';
      bar.textContent = data.announcement;
      main.insertBefore(bar, main.firstChild);
    }
  }
  // Return the main content only (for preview)
  const previewMain = doc.querySelector('main');
  return previewMain ? previewMain.outerHTML : doc.body.innerHTML;
}

// Inline renderers for clean/minimal
function renderCleanWhite(data) {
  return `<div style="background:#fff;color:#181828;padding:2rem;border-radius:18px;text-align:center;">
    <img src="${data.profile_img||''}" alt="Profile" style="width:90px;height:90px;border-radius:50%;margin-bottom:1rem;object-fit:cover;">
    <h1 style="margin:0 0 0.5rem;">${data.title||''}</h1>
    <h2 style="margin:0 0 1rem;font-weight:400;">${data.tagline||''}</h2>
    <p style="margin:0 0 1.2rem;">${data.bio||''}</p>
    <a href="${data.cta1_link||'#'}" style="display:inline-block;background:#b48cff;color:#fff;padding:0.7rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:bold;">${data.cta1_text||'Main CTA'}</a>
  </div>`;
}
function renderCleanBlack(data) {
  return `<div style="background:#181828;color:#fff;padding:2rem;border-radius:18px;text-align:center;">
    <img src="${data.profile_img||''}" alt="Profile" style="width:90px;height:90px;border-radius:50%;margin-bottom:1rem;object-fit:cover;">
    <h1 style="margin:0 0 0.5rem;">${data.title||''}</h1>
    <h2 style="margin:0 0 1rem;font-weight:400;">${data.tagline||''}</h2>
    <p style="margin:0 0 1.2rem;">${data.bio||''}</p>
    <a href="${data.cta1_link||'#'}" style="display:inline-block;background:#b48cff;color:#fff;padding:0.7rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:bold;">${data.cta1_text||'Main CTA'}</a>
  </div>`;
}
function renderMinimal(data) {
  return `<div style="background:none;color:#fff;padding:1.5rem 0;text-align:center;">
    <h1 style="margin:0 0 0.5rem;">${data.title||''}</h1>
    <p style="margin:0 0 1.2rem;">${data.bio||''}</p>
    <a href="${data.cta1_link||'#'}" style="display:inline-block;background:#b48cff;color:#fff;padding:0.7rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:bold;">${data.cta1_text||'Main CTA'}</a>
  </div>`;
}

// Main logic
let selectedTemplate = 'artist';

function updateTemplateSelection(template) {
  selectedTemplate = template;
  document.querySelectorAll('.mb-template-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.template === template);
  });
  renderPreview();
}

function getFormData() {
  const form = document.getElementById('mb-form');
  const data = {};
  new FormData(form).forEach((v, k) => data[k] = v);
  // Links
  data.links = [];
  document.querySelectorAll('.mb-link-row').forEach(row => {
    const url = row.querySelector('input').value.trim();
    if (url) data.links.push(url);
  });
  // Toggles
  document.querySelectorAll('.mb-toggle-card').forEach(card => {
    data[card.dataset.toggle] = card.classList.contains('selected');
  });
  // Template selection
  const selectedBtn = document.querySelector('.mb-template-btn.selected');
  data.template = selectedBtn ? selectedBtn.dataset.template : 'artist';
  return data;
}


async function renderPreview() {
  const data = getFormData();
  let html = '';
  if (selectedTemplate === 'clean-white') html = renderCleanWhite(data);
  else if (selectedTemplate === 'clean-black') html = renderCleanBlack(data);
  else if (selectedTemplate === 'minimal') html = renderMinimal(data);
  else {
    const templateHtml = await getTemplateHtml(selectedTemplate);
    html = injectDataIntoTemplate(templateHtml, data, selectedTemplate);
  }
  document.getElementById('mb-preview').innerHTML = html;
}


// Save draft to localStorage
        // Save draft to backend (is_published: false)
        async function saveDraftToBackend(data) {
          try {
            const session = getMobileSession();
            const payload = { ...data, is_published: false };
            const res = await fetch('/api/member/pages/save', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-fas-user': JSON.stringify(session)
              },
              body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Draft save failed');
            showToast('Draft saved to your account!', { bg: '#23233a', color: '#00ff7f' });
          } catch (err) {
            showToast('Draft save failed', { bg: '#ff4fd8', color: '#181828' });
          }
        }
        
        // Load draft from backend (first non-published page)
        async function loadDraftFromBackend(username) {
          try {
            const session = getMobileSession(username);
            const res = await fetch(`/api/member/pages/list`, {
              method: 'GET',
              headers: { 'x-fas-user': JSON.stringify(session) }
            });
            if (!res.ok) throw new Error('Failed to load pages');
            const pages = await res.json();
            const draft = Array.isArray(pages) ? pages.find(p => !p.is_published) : null;
            if (!draft) throw new Error('No draft found');
            return draft;
          } catch {
            return null;
          }
        }
        
        function getMobileSession(username) {
          // Use username from param or input, add more fields if needed
          username = username || (document.querySelector('[name="username"]')?.value || '').trim();
          return { username };
        }

// Publish to Cloudflare Function
async function publishToWeb(data, isDraft = false) {
  // Compose HTML for publish (full page, not just preview)
  let html = '';
  if (selectedTemplate === 'clean-white') html = renderCleanWhite(data);
  else if (selectedTemplate === 'clean-black') html = renderCleanBlack(data);
  else if (selectedTemplate === 'minimal') html = renderMinimal(data);
  else {
    const templateHtml = await getTemplateHtml(selectedTemplate);
    html = injectDataIntoTemplate(templateHtml, data, selectedTemplate);
  }
  // Compose payload
  const payload = {
    username: data.username || data.title?.toLowerCase().replace(/\s+/g, '-') || 'user',
    title: data.title || '',
    template: data.template || 'artist',
    html,
    css: '', // Optionally add custom CSS
    full_document: null,
    route_hint: `/${data.username || data.title?.toLowerCase().replace(/\s+/g, '-') || 'user'}`,
    is_published: !isDraft,
    // Optionally add more fields (account_id, signal_id, etc.)
  };
  try {
    const resp = await fetch('/functions/api/member/page-builder/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await resp.json();
    if (result.ok) {
      if (isDraft) {
        showToast('Draft saved to web!', { bg: '#23233a', color: '#00ff7f' });
      } else {
        // Show publish modal with link and QR code
        showPublishModal(result.live_url || '');
        showToast('Page published!', { bg: '#23233a', color: '#b48cff' });
      }
    } else {
      showToast('Error: ' + (result.error || 'Failed to save.'), { bg: '#ff4fd8', color: '#181828' });
    }
  } catch (e) {
    showToast('Network error: ' + (e.message || e), { bg: '#ff4fd8', color: '#181828' });
  }
// --- Publish Modal Logic ---
function showPublishModal(liveUrl) {
  const modal = document.getElementById('mb-publish-modal');
  const linkRow = document.getElementById('mb-publish-link-row');
  const qrDiv = document.getElementById('mb-qr-code');
  if (!modal || !linkRow || !qrDiv) return;
  // Set link
  linkRow.innerHTML = `<a href="${liveUrl}" target="_blank" style="color:#b48cff;font-weight:bold;word-break:break-all;">${liveUrl}</a>`;
  // Set QR code (using quick API for now)
  if (liveUrl) {
    qrDiv.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(liveUrl)}" alt="QR Code" style="margin:0.7rem auto 0;display:block;">`;
  } else {
    qrDiv.innerHTML = '';
  }
  modal.style.display = 'flex';
  // Copy link button
  const copyBtn = document.getElementById('mb-copy-link');
  if (copyBtn) {
    copyBtn.onclick = () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(liveUrl);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy Link'; }, 1200);
      }
    };
  }
  // Close modal
  const closeBtn = document.getElementById('mb-publish-modal-close');
  if (closeBtn) {
    closeBtn.onclick = () => { modal.style.display = 'none'; };
  }
  // Dismiss modal on outside click
  modal.onclick = (e) => {
    if (e.target === modal) modal.style.display = 'none';
  };
}
}

// Event listeners
import { loadPublishedPageToBuilder } from './mobile-builder-edit.js';

window.addEventListener('DOMContentLoaded', () => {
            // --- Toast Notification Logic ---
            window.showToast = function(msg, opts = {}) {
              const container = document.getElementById('mb-toast-container');
              if (!container) return;
              const toast = document.createElement('div');
              toast.textContent = msg;
              toast.style = `background:${opts.bg||'#23233a'};color:${opts.color||'#fff'};padding:0.9rem 1.5rem;border-radius:9px;box-shadow:0 2px 12px #0007;font-size:1.08rem;font-weight:500;pointer-events:auto;opacity:0.97;transition:opacity 0.3s;`;
              container.appendChild(toast);
              setTimeout(() => { toast.style.opacity = 0; }, opts.duration||2200);
              setTimeout(() => { toast.remove(); }, (opts.duration||2200)+400);
            };
          // --- Undo/Redo wiring ---
          const undoBtn = document.getElementById('mb-undo');
          const redoBtn = document.getElementById('mb-redo');
          if (undoBtn && redoBtn && window.undoStack && window.redoStack) {
            undoBtn.onclick = () => {
              if (window.undoStack.length > 1) {
                const current = window.undoStack.pop();
                window.redoStack.push(current);
                const prev = window.undoStack[window.undoStack.length - 1];
                if (prev) {
                  try {
                    const data = JSON.parse(prev);
                    Object.entries(data).forEach(([k, v]) => {
                      const el = document.querySelector(`[name="${k}"]`);
                      if (el) el.value = v;
                    });
                    renderPreview();
                  } catch {}
                }
              }
            };
            redoBtn.onclick = () => {
              if (window.redoStack.length > 0) {
                const next = window.redoStack.pop();
                if (next) {
                  window.undoStack.push(next);
                  try {
                    const data = JSON.parse(next);
                    Object.entries(data).forEach(([k, v]) => {
                      const el = document.querySelector(`[name="${k}"]`);
                      if (el) el.value = v;
                    });
                    renderPreview();
                  } catch {}
                }
              }
            };
          }
        // --- Preview-only mode if offline ---
        function setPreviewOnlyMode(isOffline) {
          const form = document.getElementById('mb-form');
          const preview = document.getElementById('mb-preview');
          const banner = document.getElementById('mb-edit-banner');
          if (isOffline) {
            if (banner) {
              banner.style.display = '';
              banner.style.background = '#ff4fd8';
              banner.style.color = '#181828';
              banner.textContent = 'OFFLINE: Preview Only — Editing Disabled';
            }
            if (form) Array.from(form.elements).forEach(el => el.disabled = true);
            if (preview) preview.style.opacity = 0.7;
          } else {
            if (banner) setEditModeBanner('published');
            if (form) Array.from(form.elements).forEach(el => el.disabled = false);
            if (preview) preview.style.opacity = 1;
          }
        }
        window.addEventListener('offline', () => setPreviewOnlyMode(true));
        window.addEventListener('online', () => setPreviewOnlyMode(false));
        if (!navigator.onLine) setPreviewOnlyMode(true);
      // --- Visual Edit Mode Indicator ---
      function setEditModeBanner(mode) {
        const banner = document.getElementById('mb-edit-banner');
        if (!banner) return;
        if (mode === 'published') {
          banner.style.display = '';
          banner.style.background = '#b48cff';
          banner.style.color = '#181828';
          banner.textContent = 'EDITING PUBLISHED PAGE';
        } else if (mode === 'draft') {
          banner.style.display = '';
          banner.style.background = '#23233a';
          banner.style.color = '#b48cff';
          banner.textContent = 'EDITING DRAFT';
        } else {
          banner.style.display = 'none';
        }
      }
      window.setEditModeBanner = setEditModeBanner;
    // --- Domain & Subdomain logic ---
    const subdomainInput = document.getElementById('mb-subdomain-input');
    const claimBtn = document.getElementById('mb-claim-subdomain');
    const subdomainStatus = document.getElementById('mb-subdomain-status');
    if (claimBtn && subdomainInput && subdomainStatus) {
      claimBtn.onclick = async () => {
        const sub = (subdomainInput.value || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (!sub || sub.length < 3) {
          subdomainStatus.textContent = 'Subdomain must be at least 3 characters.';
          subdomainStatus.style.color = '#ff4fd8';
          return;
        }
        subdomainStatus.textContent = 'Checking availability...';
        subdomainStatus.style.color = '#b9aaff';
        // Simulate API call (replace with real endpoint)
        setTimeout(() => {
          if (["admin","test","www"].includes(sub)) {
            subdomainStatus.textContent = 'This subdomain is not available.';
            subdomainStatus.style.color = '#ff4fd8';
          } else {
            subdomainStatus.textContent = `Success! Your site will be at https://${sub}.facelessanimal.com`;
            subdomainStatus.style.color = '#00ff7f';
          }
        }, 900);
      };
    }
    // Custom domain connect logic
    const customDomainInput = document.getElementById('mb-custom-domain-input');
    const connectBtn = document.getElementById('mb-connect-domain');
    const domainStatus = document.getElementById('mb-domain-status');
    const domainInstructions = document.getElementById('mb-domain-instructions');
    if (connectBtn && customDomainInput && domainStatus && domainInstructions) {
      connectBtn.onclick = () => {
        const domain = (customDomainInput.value || '').toLowerCase().trim();
        if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
          domainStatus.textContent = 'Enter a valid domain (e.g. mysite.com)';
          domainStatus.style.color = '#ff4fd8';
          domainInstructions.style.display = 'none';
          return;
        }
        domainStatus.textContent = 'To connect, add this CNAME record:';
        domainStatus.style.color = '#b9aaff';
        domainInstructions.innerHTML = `<b>Type:</b> CNAME<br><b>Name:</b> @<br><b>Value:</b> <span style='color:#b48cff;'>pages.facelessanimal.com</span><br><br>After updating DNS, your domain will point to your site.`;
        domainInstructions.style.display = '';
      };
    }
  // Template picker
  document.querySelectorAll('.mb-template-btn').forEach(btn => {
    btn.addEventListener('click', () => updateTemplateSelection(btn.dataset.template));
  });
  // Form inputs
  document.getElementById('mb-form').addEventListener('input', renderPreview);
  // Add link
  document.getElementById('mb-add-link').addEventListener('click', () => {
    const ul = document.getElementById('mb-links-list');
    const li = document.createElement('li');
    li.className = 'mb-link-row';
    li.innerHTML = `<input type="text" placeholder="Paste link"> <button type="button" class="mb-link-remove">Remove</button>`;
    li.querySelector('.mb-link-remove').onclick = () => li.remove();
    ul.appendChild(li);
    renderPreview();
  });
  // Save Draft (to backend)
  document.getElementById('mb-save-draft').addEventListener('click', async () => {
    const data = getFormData();
    setEditModeBanner('draft');
    await saveDraftToBackend(data);
  });
  // Publish
  document.getElementById('mb-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = getFormData();
    await publishToWeb(data, false);
  });
  // Reset
  document.getElementById('mb-reset').addEventListener('click', () => {
    document.getElementById('mb-form').reset();
    document.getElementById('mb-links-list').innerHTML = '';
    renderPreview();
  });
  // Username auto-fill and display
  let username = localStorage.getItem('fas_mobile_builder_username') || '';
  const usernameInput = document.querySelector('[name="username"]');
  if (usernameInput) {
    if (username) usernameInput.value = username;
    usernameInput.addEventListener('input', e => {
      username = e.target.value.trim();
      localStorage.setItem('fas_mobile_builder_username', username);
      updateUsernameRow(username);
    });
  }
  updateUsernameRow(username);

  // Load draft if exists
  const draft = loadDraftLocally();
  if (draft) {
    Object.entries(draft).forEach(([k, v]) => {
      const el = document.querySelector(`[name="${k}"]`);
      if (el) el.value = v;
    });
    // Links
    if (draft.links && Array.isArray(draft.links)) {
      const ul = document.getElementById('mb-links-list');
      ul.innerHTML = '';
      draft.links.forEach(link => {
        const li = document.createElement('li');
        li.className = 'mb-link-row';
        li.innerHTML = `<input type="text" value="${link}" placeholder="Paste link"> <button type="button" class="mb-link-remove">Remove</button>`;
        li.querySelector('.mb-link-remove').onclick = () => li.remove();
        ul.appendChild(li);
      });
    }
    setEditModeBanner('draft');
    renderPreview();
  } else {
    setEditModeBanner('published');
    renderPreview();
  }

  // Edit Published Page button
  document.getElementById('mb-load-published').addEventListener('click', async () => {
    let uname = username;
    if (!uname) {
      uname = prompt('Enter your username to load your published page:');
    }
    if (!uname) return;
    // Load homepage (is_homepage=true)
    try {
      const session = getMobileSession(uname);
      const res = await fetch(`/api/member/pages/list`, {
        method: 'GET',
        headers: { 'x-fas-user': JSON.stringify(session) }
      });
      if (!res.ok) throw new Error('Failed to load pages');
      const pages = await res.json();
      const homepage = Array.isArray(pages) ? pages.find(p => p.is_homepage) : null;
      if (!homepage) throw new Error('No homepage found');
      // Load homepage content
      const loadRes = await fetch(`/api/member/pages/load?slug=${encodeURIComponent(homepage.page_slug)}`, {
        method: 'GET',
        headers: { 'x-fas-user': JSON.stringify(session) }
      });
      if (!loadRes.ok) throw new Error('Failed to load homepage');
      const page = await loadRes.json();
      // Patch form fields with loaded data
      Object.entries(page).forEach(([k, v]) => {
        const el = document.querySelector(`[name="${k}"]`);
        if (el) el.value = v;
      });
      setEditModeBanner('published');
      document.getElementById('mb-edit-status').textContent = 'Loaded published page for editing!';
      localStorage.setItem('fas_mobile_builder_username', uname);
      updateUsernameRow(uname);
      setTimeout(() => { document.getElementById('mb-edit-status').textContent = ''; }, 3000);
      renderPreview();
    } catch (err) {
      document.getElementById('mb-edit-status').textContent = 'No published homepage found.';
      setTimeout(() => { document.getElementById('mb-edit-status').textContent = ''; }, 3000);
    }
  });

  function updateUsernameRow(uname) {
    const row = document.getElementById('mb-username-row');
    if (row) {
      row.innerHTML = uname ? `<span class="mb-username">@${uname}</span>` : '';
    }
  }
});

// --- Appearance & Options live preview logic ---
window.addEventListener('DOMContentLoaded', () => {
  // Border radius slider live value
  const borderRadiusInput = document.querySelector('[name="border_radius"]');
  const borderRadiusValue = document.getElementById('mb-border-radius-value');
  if (borderRadiusInput && borderRadiusValue) {
    borderRadiusInput.addEventListener('input', e => {
      borderRadiusValue.textContent = e.target.value + 'px';
      renderPreview();
    });
  }
  // Accent color swatch buttons
  document.querySelectorAll('.mb-accent-swatch').forEach(btn => {
    btn.addEventListener('click', e => {
      const color = btn.getAttribute('data-color');
      const colorInput = document.querySelector('[name="accent_color"]');
      if (colorInput) colorInput.value = color;
      const customInput = document.querySelector('[name="accent_color_custom"]');
      if (customInput) customInput.value = '';
      renderPreview();
    });
  });
  // Custom accent color text input
  const accentCustom = document.querySelector('[name="accent_color_custom"]');
  if (accentCustom) {
    accentCustom.addEventListener('input', e => {
      const colorInput = document.querySelector('[name="accent_color"]');
      if (colorInput) colorInput.value = '';
      renderPreview();
    });
  }
  // Custom background color text input
  const bgCustom = document.querySelector('[name="background_color_custom"]');
  if (bgCustom) {
    bgCustom.addEventListener('input', renderPreview);
  }
  // Font family custom
  const fontFamilySelect = document.querySelector('[name="font_family"]');
  const fontFamilyCustom = document.querySelector('[name="font_family_custom"]');
  if (fontFamilySelect && fontFamilyCustom) {
    fontFamilySelect.addEventListener('change', e => {
      if (e.target.value === 'Custom') fontFamilyCustom.style.display = '';
      else fontFamilyCustom.style.display = 'none';
      renderPreview();
    });
    fontFamilyCustom.addEventListener('input', renderPreview);
    if (fontFamilySelect.value !== 'Custom') fontFamilyCustom.style.display = 'none';
  }
  // Background color picker
  const bgColorInput = document.querySelector('[name="background_color"]');
  if (bgColorInput) bgColorInput.addEventListener('input', renderPreview);
  // Box shadow
  const boxShadowInput = document.querySelector('[name="box_shadow"]');
  if (boxShadowInput) boxShadowInput.addEventListener('change', renderPreview);
  // Custom CSS
  const customCssInput = document.querySelector('[name="custom_css"]');
  if (customCssInput) customCssInput.addEventListener('input', renderPreview);
});

// Patch renderPreview to apply appearance settings
const origRenderPreview = renderPreview;
renderPreview = async function() {
  await origRenderPreview();
  const data = getFormData();
  const preview = document.getElementById('mb-preview');
  if (!preview) return;
  // Accent color
  let accent = data.accent_color_custom || data.accent_color || '#b48cff';
  preview.style.setProperty('--accent', accent);
  // Background color
  let bg = data.background_color_custom || data.background_color || '#181828';
  preview.style.background = bg;
  // Font family
  let font = (data.font_family === 'Custom' ? data.font_family_custom : data.font_family) || 'Inter, Arial, sans-serif';
  preview.style.fontFamily = font;
  // Border radius
  preview.style.borderRadius = (data.border_radius || 12) + 'px';
  // Box shadow
  preview.style.boxShadow = data.box_shadow || '0 2px 8px #0002';
  // Custom CSS
  let styleTag = document.getElementById('mb-preview-custom-css');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'mb-preview-custom-css';
    preview.appendChild(styleTag);
  }
  styleTag.textContent = data.custom_css || '';
};
