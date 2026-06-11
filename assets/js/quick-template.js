// Quick Template flow for Faceless Animal Studios
// Mobile-first, step-based, beginner-friendly
import { openMediaPicker } from './media-picker.js';

const PAGE_TYPES = [
  { key: 'link', label: 'Link Page' },
  { key: 'artist', label: 'Artist Page' },
  { key: 'business', label: 'Business Page' },
  { key: 'promo', label: 'Promo Page' },
  { key: 'profile', label: 'Simple Profile Page' },
];

// Example starter templates per type (expand as needed)
const TEMPLATES = {
  link: [
    { key: 'link-1', name: 'Classic Links', img: 'assets/images/qt-link-1.png', fields: ['title','profileImage','bio','links','accent'] },
    { key: 'link-2', name: 'Minimal Links', img: 'assets/images/qt-link-2.png', fields: ['title','profileImage','links','accent'] },
  ],
  artist: [
    { key: 'artist-1', name: 'Artist Bio', img: 'assets/images/qt-artist-1.png', fields: ['title','profileImage','headerImage','bio','music','gallery','accent'] },
    { key: 'artist-2', name: 'Showcase', img: 'assets/images/qt-artist-2.png', fields: ['title','profileImage','bio','gallery','accent'] },
  ],
  business: [
    { key: 'business-1', name: 'Business Card', img: 'assets/images/qt-business-1.png', fields: ['title','profileImage','bio','contact','accent'] },
    { key: 'business-2', name: 'Promo Card', img: 'assets/images/qt-business-2.png', fields: ['title','profileImage','headerImage','bio','contact','accent'] },
  ],
  promo: [
    { key: 'promo-1', name: 'Promo Flyer', img: 'assets/images/qt-promo-1.png', fields: ['title','headerImage','bio','links','accent'] },
    { key: 'promo-2', name: 'Event Card', img: 'assets/images/qt-promo-2.png', fields: ['title','headerImage','bio','links','accent'] },
  ],
  profile: [
    { key: 'profile-1', name: 'Simple Profile', img: 'assets/images/qt-profile-1.png', fields: ['title','profileImage','bio','accent'] },
    { key: 'profile-2', name: 'Profile Card', img: 'assets/images/qt-profile-2.png', fields: ['title','profileImage','bio','links','accent'] },
  ],
};

// Field renderers
const FIELD_RENDERERS = {
  title: (v, set) => `<div class='qt-form-group'><label class='qt-label'>Page Title</label><input class='qt-input' type='text' value="${v||''}" onchange="this._qtSet(this.value)" /></div>`,
  profileImage: (v, set) => `<div class='qt-form-group'><label class='qt-label'>Profile Image</label><div class='qt-img-picker'><img class='qt-img-thumb' src="${v||''}" alt='' /><button type='button' class='qt-img-btn'>Choose</button></div></div>`,
  headerImage: (v, set) => `<div class='qt-form-group'><label class='qt-label'>Header Image</label><div class='qt-img-picker'><img class='qt-img-thumb' src="${v||''}" alt='' /><button type='button' class='qt-img-btn'>Choose</button></div></div>`,
  bio: (v, set) => `<div class='qt-form-group'><label class='qt-label'>Bio</label><textarea class='qt-textarea' onchange="this._qtSet(this.value)">${v||''}</textarea></div>`,
  links: (v, set) => `<div class='qt-form-group'><label class='qt-label'>Links</label><textarea class='qt-textarea' placeholder='One per line' onchange="this._qtSet(this.value)">${v||''}</textarea></div>`,
  music: (v, set) => `<div class='qt-form-group'><label class='qt-label'>Music/Featured</label><input class='qt-input' type='text' placeholder='Embed URL or code' value="${v||''}" onchange="this._qtSet(this.value)" /></div>`,
  contact: (v, set) => `<div class='qt-form-group'><label class='qt-label'>Contact Info</label><input class='qt-input' type='text' value="${v||''}" onchange="this._qtSet(this.value)" /></div>`,
  gallery: (v, set) => `<div class='qt-form-group'><label class='qt-label'>Gallery Images</label><div class='qt-gallery-picker'><textarea class='qt-textarea' placeholder='Image URLs, one per line' onchange="this._qtSet(this.value)">${v||''}</textarea><button type='button' class='qt-gallery-btn'>Add Image</button></div></div>`,
  accent: (v, set) => `<div class='qt-form-group'><label class='qt-label'>Accent/Theme</label><input class='qt-input' type='color' value="${v||'#c9a96e'}" onchange="this._qtSet(this.value)" /></div>`
};

// State
let state = {
  step: 1,
  pageType: null,
  template: null,
  fields: {},
};

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function renderStep1() {
  $('#qtPageTypeChoices').innerHTML = PAGE_TYPES.map(pt => `<button class='qt-choice-btn${state.pageType===pt.key?' selected':''}' data-key='${pt.key}'>${pt.label}</button>`).join('');
  $$('#qtPageTypeChoices .qt-choice-btn').forEach(btn => btn.onclick = () => {
    state.pageType = btn.dataset.key;
    state.template = null;
    state.fields = {};
    renderStep2();
    showStep(2);
  });
}

function renderStep2() {
  const templates = TEMPLATES[state.pageType] || [];
  $('#qtTemplateChoices').innerHTML = templates.map(t => `
    <button class='qt-choice-btn${state.template===t.key?' selected':''}' data-key='${t.key}'>
      <img src='${t.img}' alt='' style='width:48px;height:48px;border-radius:0.5em;margin-right:0.7em;vertical-align:middle;' />
      ${t.name}
    </button>
  `).join('');
  $$('#qtTemplateChoices .qt-choice-btn').forEach((btn, i) => btn.onclick = () => {
    state.template = templates[i].key;
    // Reset fields to template defaults
    state.fields = {};
    renderStep3();
    showStep(3);
  });
}

function renderStep3() {
  const template = (TEMPLATES[state.pageType]||[]).find(t => t.key===state.template);
  if (!template) return;
  const form = $('#qtEditForm');
  form.innerHTML = '';
  template.fields.forEach(field => {
    let v = state.fields[field] || '';
    let html = FIELD_RENDERERS[field] ? FIELD_RENDERERS[field](v, val => { state.fields[field]=val; renderStep3(); }) : '';
    form.innerHTML += html;
  });
  // Wire up image pickers
  $$('.qt-img-picker').forEach((picker, i) => {
    const btn = picker.querySelector('.qt-img-btn');
    const img = picker.querySelector('.qt-img-thumb');
    const field = template.fields.filter(f=>f.includes('Image'))[i];
    btn.onclick = () => {
      openMediaPicker({ onSelect: media => {
        if (media && media.url) {
          state.fields[field] = media.url;
          renderStep3();
        }
      }});
    };
  });
  // Wire up gallery picker
  $$('.qt-gallery-picker').forEach((picker) => {
    const btn = picker.querySelector('.qt-gallery-btn');
    const textarea = picker.querySelector('textarea');
    btn.onclick = () => {
      openMediaPicker({ onSelect: media => {
        if (media && media.url) {
          // Append to gallery textarea, one per line
          textarea.value = (textarea.value ? textarea.value + '\n' : '') + media.url;
          textarea.dispatchEvent(new Event('change'));
        }
      }});
    };
  });
  // Wire up field value setters
  $$('#qtEditForm input, #qtEditForm textarea').forEach(input => {
    input._qtSet = val => {
      const label = input.closest('.qt-form-group').querySelector('.qt-label').textContent;
      const key = Object.keys(FIELD_RENDERERS).find(k => label.toLowerCase().includes(k));
      if (key) {
        state.fields[key] = val;
        renderStep3();
      }
    };
  });
  showStep(4);
  renderPreview();
  $('#qtActions').style.display = '';
}

function renderPreview() {
  // Simple preview: just show the fields in a mobile card
  const f = state.fields;
  $('#qtPreview').innerHTML = `
    <div style='text-align:center;'>
      ${f.profileImage ? `<img src='${f.profileImage}' alt='' style='width:72px;height:72px;border-radius:50%;margin-bottom:0.7em;' />` : ''}
      <div style='font-size:1.2em;font-weight:900;margin-bottom:0.2em;'>${f.title||'Untitled Page'}</div>
      <div style='color:var(--text-2);margin-bottom:0.7em;'>${f.bio||''}</div>
      ${(f.links||'').split('\n').filter(Boolean).map(l=>`<a href='${l}' style='display:block;color:var(--purple-bright);margin-bottom:0.2em;'>${l}</a>`).join('')}
      ${f.headerImage ? `<img src='${f.headerImage}' alt='' style='width:100%;max-width:320px;border-radius:0.7em;margin:0.7em 0;' />` : ''}
      ${f.music ? `<div style='margin:0.7em 0;'>${f.music}</div>` : ''}
      ${f.contact ? `<div style='margin:0.7em 0;color:var(--gold-bright);'>${f.contact}</div>` : ''}
      ${(f.gallery||'').split('\n').filter(Boolean).map(g=>`<img src='${g}' style='width:60px;height:60px;border-radius:0.5em;margin:0.2em;' />`).join('')}
    </div>
  `;
}

function showStep(n) {
  [1,2,3,4].forEach(i => $(`#qtStep${i}`).style.display = (i===n)?'':'none');
}

// Save/Publish/View actions
$('#qtSaveBtn').onclick = () => {
  savePage(false);
};
$('#qtPublishBtn').onclick = () => {
  savePage(true);
};
$('#qtViewBtn').onclick = () => {
  // Simulate view (in real: open public URL)
  alert('View Live: Not implemented in demo');
};

function savePage(isPublished) {
  const fasUser = JSON.parse(localStorage.getItem('fas_user') || 'null');
  if (!fasUser || !fasUser.account_id) {
    alert('Not signed in');
    return;
  }
  const page = {
    ...state.fields,
    pageType: state.pageType,
    template: state.template,
    is_published: !!isPublished,
    updated_at: new Date().toISOString(),
    account_id: fasUser.account_id,
    signal_id: fasUser.signal_id,
    username: fasUser.username
  };
  // Save to localStorage array 'fas_pages' (real: send to backend)
  let pages = [];
  try { pages = JSON.parse(localStorage.getItem('fas_pages')||'[]'); } catch(e) {}
  pages = pages.filter(p => p.account_id !== page.account_id || p.template !== page.template);
  pages.push(page);
  localStorage.setItem('fas_pages', JSON.stringify(pages));
  alert(isPublished ? 'Page published!' : 'Draft saved!');
}

// Init
renderStep1();
showStep(1);
