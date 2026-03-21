/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — DYNAMIC PAGE RENDERER v2
 *  assets/js/page-renderer.js
 *
 *  Powers dynamically-rendered creator and business pages:
 *    /artist/[slug]   → templates/artist.html
 *    /creator/[slug]  → templates/creator.html
 *    /business/[slug] → templates/business.html
 *
 *  FLOW:
 *    1. Parse slug from window.location.pathname
 *    2. Fetch profiles JOIN pages from Supabase by slug
 *    3. Find the live page record
 *    4. Hydrate template via data-f / data-slot / data-section targets
 *    5. Show graceful 404 if slug not found or no live page
 *
 *  TEMPLATE ATTRIBUTE CONVENTIONS:
 *    data-f="fieldName"    — textContent injection
 *    data-slot="slotName"  — innerHTML replaced with generated markup
 *    data-section="name"   — shown/hidden based on data presence
 *
 *  metadata_json keys (stored in pages.metadata_json):
 *    accent_color, tags, marquee_words, stats, quick_info,
 *    works, services, hours, contact
 *
 *  links_json keys (stored in profiles.links_json):
 *    spotify, youtube, instagram, tiktok, soundcloud, twitch,
 *    website, email, phone
 * ============================================================
 */

import { supabase, SUPABASE_READY } from './supabase-client.js'


// ── UTILITIES ─────────────────────────────────────────────────────

function esc(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Fill all [data-f="key"] elements */
function fill(key, value, asHTML) {
  document.querySelectorAll(`[data-f="${key}"]`).forEach(el => {
    if (asHTML) el.innerHTML = value || ''
    else        el.textContent = value || ''
  })
}

/** Replace all [data-slot="name"] innerHTML */
function slot(name, html) {
  document.querySelectorAll(`[data-slot="${name}"]`).forEach(el => {
    el.innerHTML = html || ''
  })
}

/** Show/hide sections by data-section name */
function showSection(name, show) {
  document.querySelectorAll(`[data-section="${name}"]`).forEach(el => {
    el.hidden = !show
  })
}

const CATEGORY_LABELS = {
  dj: 'DJ · Producer', producer: 'Producer', artist: 'Artist',
  visual_artist: 'Visual Artist', photographer: 'Photographer',
  gamer: 'Gamer', game_dev: 'Game Developer', writer: 'Writer',
  podcaster: 'Podcaster', business: 'Business', collective: 'Collective',
}

const CATEGORY_ACCENTS = {
  dj: '#c9a96e', producer: '#a06ae0', artist: '#e09070',
  visual_artist: '#dc6450', photographer: '#dc6450',
  gamer: '#5aabdc', game_dev: '#5aabdc',
  writer: '#6abfa8', podcaster: '#6abfa8',
  business: '#4abfa0', collective: '#8888cc',
}

function categoryLabel(cat)  { return CATEGORY_LABELS[cat]  || 'Creator' }
function categoryAccent(cat) { return CATEGORY_ACCENTS[cat] || '#c9a96e' }


// ── PLAN UTILITIES ────────────────────────────────────────────────

/**
 * Plan tier order — free (lowest) to premium (highest).
 * Keeps the renderer self-contained without importing plan-manager.js.
 */
const PLAN_ORDER_R = ['free', 'starter', 'pro', 'premium']

/**
 * Returns true when the profile's plan meets or exceeds the required tier.
 * Always defaults to 'free' for missing or unknown plan values.
 *
 * @param {string} current  — profile.plan_type
 * @param {string} required — minimum plan slug ('starter', 'pro', 'premium')
 */
function planAtLeast(current, required) {
  const ci = PLAN_ORDER_R.indexOf(current  || 'free')
  const ri = PLAN_ORDER_R.indexOf(required || 'free')
  return ci >= ri
}

function applyAccentColor(hex) {
  const c = hex || '#c9a96e'
  document.documentElement.style.setProperty('--page-accent', c)
  document.documentElement.style.setProperty('--page-accent-dim', c + '80')
}

function initials(name) {
  if (!name) return '?'
  const words = name.trim().split(/\s+/)
  return words.length === 1
    ? words[0].slice(0, 2).toUpperCase()
    : words.slice(0, 3).map(w => w[0]).join('').toUpperCase()
}

function formatLocation(profile) {
  return [profile.city, profile.state].filter(Boolean).join(', ') || ''
}

/** Split name into words with italic last word */
function heroHeadingHTML(name) {
  if (!name) return 'Creator'
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return esc(words[0])
  const last = words.pop()
  return words.map(esc).join('<br />') + '<br /><em>' + esc(last) + '</em>'
}


// ── URL PARSING ───────────────────────────────────────────────────

function getSlugFromURL() {
  // /artist/koldvisual  → { pageType:'artist', slug:'koldvisual' }
  const parts = window.location.pathname.replace(/^\/+/, '').split('/')
  return { pageType: parts[0] || null, slug: parts[1] || null }
}


// ── SUPABASE FETCH ────────────────────────────────────────────────

async function fetchProfile(slug) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, pages(*)')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('[FAS] page-renderer:', error.message)
  }
  return { data, error }
}


// ── PLATFORM LINK RENDERING ───────────────────────────────────────

const PLATFORM_ICONS = {
  spotify:    { label: 'Spotify',     desc: 'Stream on Spotify',      cls: 'platform-icon--spotify',   icon: `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>` },
  soundcloud: { label: 'SoundCloud',  desc: 'Listen on SoundCloud',   cls: '',                         icon: `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M11.56 8.87V17h8.76C21.78 17 23 15.77 23 14.38c0-1.27-.98-2.32-2.24-2.38-.27-3.12-2.86-5.57-6.02-5.57-1.29 0-2.49.39-3.18.44z M0 15.24C0 16.21.77 17 1.72 17h1.23v-4H1.72C.77 13 0 13.79 0 15.24z M4.03 13v4h1.4v-4zm2.44 0v4h1.4v-4zm2.44-.32v4.32h1.41v-4.32c0-1.15-.23-2.08-.7-2.74.43.39.7 1.51.7 2.74z"/></svg>` },
  youtube:    { label: 'YouTube',     desc: 'Watch on YouTube',       cls: 'platform-icon--youtube',   icon: `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>` },
  twitch:     { label: 'Twitch',      desc: 'Watch on Twitch',        cls: '',                         icon: `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>` },
  instagram:  { label: 'Instagram',   desc: 'Follow on Instagram',    cls: 'platform-icon--instagram', icon: `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>` },
  tiktok:     { label: 'TikTok',      desc: 'Follow on TikTok',       cls: 'platform-icon--tiktok',    icon: `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>` },
  website:    { label: 'Website',     desc: 'Visit website',          cls: '',                         icon: `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1 19.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>` },
  email:      { label: 'Email',       desc: 'Send an email',          cls: 'platform-icon--email',     icon: `✉`, text: true },
  phone:      { label: 'Call or Text',desc: 'Call or text',           cls: 'platform-icon--phone',     icon: `✆`, text: true },
}

const LINK_ORDER = ['spotify', 'soundcloud', 'youtube', 'twitch', 'instagram', 'tiktok', 'website', 'email', 'phone']

function renderPlatformRow(key, url) {
  const m = PLATFORM_ICONS[key]
  if (!m || !url) return ''
  const href = key === 'email' ? `mailto:${esc(url)}`
             : key === 'phone' ? `tel:${esc(url)}`
             : esc(url)
  const target = (key === 'email' || key === 'phone') ? '_self' : '_blank'
  const iconEl = m.text
    ? `<div class="platform-icon ${m.cls}" aria-hidden="true">${m.icon}</div>`
    : `<div class="platform-icon ${m.cls}" aria-hidden="true">${m.icon}</div>`
  return `
    <a href="${href}" class="platform-row" role="listitem" target="${target}" rel="noopener" aria-label="${esc(m.label)}">
      ${iconEl}
      <div class="platform-info"><strong>${esc(m.label)}</strong><span>${esc(m.desc)}</span></div>
      <span class="platform-arrow" aria-hidden="true">→</span>
    </a>`
}

/**
 * Normalize links_json to a flat object { platform: url }.
 * Handles both the new object format { spotify:'url' }
 * and the legacy array format [{ platform:'spotify', url:'...' }].
 */
function normalizeLinks(linksJson) {
  if (!linksJson) return {}
  if (Array.isArray(linksJson)) {
    const out = {}
    linksJson.forEach(item => {
      if (item && item.platform && item.url) out[item.platform] = item.url
    })
    return out
  }
  return linksJson
}

function renderLinks(linksJson) {
  const links = normalizeLinks(linksJson)
  return LINK_ORDER.filter(k => links[k]).map(k => renderPlatformRow(k, links[k])).join('')
}

// Social hero mini-buttons
const SOCIAL_ORDER = ['spotify', 'soundcloud', 'youtube', 'twitch', 'instagram', 'tiktok']
const SOCIAL_ICON = {
  spotify:   `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
  soundcloud:`<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M1.175 12.225c-.015 0-.03.002-.044.005A.514.514 0 0 0 .658 12.7v4.6c0 .28.233.5.514.5.281 0 .515-.22.515-.5v-4.6a.506.506 0 0 0-.512-.475zm2.05-.39c-.28 0-.51.22-.515.496v5.15c0 .28.233.5.515.5.28 0 .514-.22.514-.5V12.36a.508.508 0 0 0-.514-.525zM8 9.63c-.278 0-.51.22-.515.496v6.79c0 .278.233.5.515.5.28 0 .513-.222.513-.5V10.14A.507.507 0 0 0 8 9.63zm3.56 8.24c3.313 0 5.99-2.686 5.99-6.003S14.873 5.86 11.56 5.86a5.95 5.95 0 0 0-3.48 1.12v.02H5.22a.514.514 0 0 0-.514.514v8.875c0 .28.23.504.514.504h6.34z"/></svg>`,
  youtube:   `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>`,
  twitch:    `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>`,
  tiktok:    `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
}
const SOCIAL_CLS = { spotify:'social-btn--spotify', youtube:'social-btn--youtube', instagram:'social-btn--instagram', tiktok:'social-btn--tiktok' }

function renderSocialButtons(linksJson) {
  const links = normalizeLinks(linksJson)
  return SOCIAL_ORDER
    .filter(k => links[k] && SOCIAL_ICON[k])
    .slice(0, 5)
    .map(k => `<a href="${esc(links[k])}" target="_blank" rel="noopener" class="social-btn ${SOCIAL_CLS[k] || ''}">${SOCIAL_ICON[k]}${k.charAt(0).toUpperCase() + k.slice(1)}</a>`)
    .join('')
}


// ── CONTENT RENDERERS ─────────────────────────────────────────────

function renderMarquee(words, name) {
  const items = (words && words.length) ? words : [name, 'Faceless Animal Studios']
  return [...items, ...items, ...items, ...items, ...items]
    .map((w, i) => i % 2 === 0 ? `<span>${esc(w)}</span>` : `<span class="marquee-dot">·</span>`)
    .join('')
}

function renderStats(stats) {
  if (!stats || !stats.length) return ''
  return stats.map(s => `
    <div class="stat-item">
      <p class="stat-value" style="color:var(--page-accent,var(--gold))">${esc(s.value)}</p>
      <p class="stat-label">${esc(s.label)}</p>
    </div>`).join('')
}

function renderQuickInfo(items) {
  if (!items || !items.length) return ''
  return items.map(i => `<li>${esc(i)}</li>`).join('')
}

function renderTags(tags) {
  if (!tags || !tags.length) return ''
  return tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')
}

function renderWorks(works) {
  if (!works || !works.length) return ''
  return works.map(w => `
    <article class="sc-work-card" role="listitem">
      <div class="sc-work-img sc-work-img--${esc(w.type || 'photo')}">
        ${w.badge ? `<span class="sc-work-img-badge sc-work-img-badge--${esc(w.type || 'photo')}">${esc(w.badge)}</span>` : ''}
        <span class="sc-work-img-label" aria-hidden="true">${esc(w.num || '')}</span>
        ${w.image_url
          ? `<img src="${esc(w.image_url)}" alt="${esc(w.title)}" class="sc-work-real-img" />`
          : `<span class="sc-work-img-ph">Image placeholder</span>`}
      </div>
      <div class="sc-work-body">
        ${w.series_label ? `<p class="sc-work-series">${esc(w.series_label)}</p>` : ''}
        <p class="sc-work-title">${esc(w.title)}</p>
        ${w.desc ? `<p class="sc-work-desc">${esc(w.desc)}</p>` : ''}
        ${w.link ? `<a href="${esc(w.link)}" class="card-link" target="_blank" rel="noopener">${esc(w.link_label || 'View →')}</a>` : ''}
      </div>
    </article>`).join('')
}

// ── TRACK RENDERER ───────────────────────────────────────────────

const creatorReportedTrackKeys = new Set() // local-only report state
let creatorReportTargetKey = ''

function renderTracks(tracks) {
  if (!tracks || !tracks.length) return ''
  return tracks.map(tr => `
    <div style="background:var(--bg-3,rgba(255,255,255,0.04));border:1px solid var(--border,rgba(255,255,255,0.09));border-radius:12px;padding:1rem 1.1rem;">
      <p style="font-size:0.88rem;font-weight:800;color:var(--text);margin:0 0 0.2rem;">${esc(tr.title)}</p>
      ${tr.description ? `<p style="font-size:0.72rem;color:var(--text-3);margin:0 0 0.6rem;">${esc(tr.description)}</p>` : ''}
      <div style="display:flex;align-items:center;gap:0.55rem;margin:0 0 0.55rem;">
        <button data-track-report-btn data-track-report-key="${esc(tr.path || tr.url || tr.title || '')}" data-track-report-title="${esc(tr.title || 'Track')}" ${creatorReportedTrackKeys.has(tr.path || tr.url || tr.title || '') ? 'disabled' : ''} style="background:none;border:none;padding:0;font-size:0.68rem;color:${creatorReportedTrackKeys.has(tr.path || tr.url || tr.title || '') ? 'var(--text-3)' : 'var(--text-2)'};cursor:${creatorReportedTrackKeys.has(tr.path || tr.url || tr.title || '') ? 'default' : 'pointer'};text-decoration:underline;">${creatorReportedTrackKeys.has(tr.path || tr.url || tr.title || '') ? 'Reported' : 'Report'}</button>
        <span data-track-reported-label style="display:${creatorReportedTrackKeys.has(tr.path || tr.url || tr.title || '') ? '' : 'none'};font-size:0.64rem;color:#f59e0b;letter-spacing:0.04em;text-transform:uppercase;">Reported</span>
      </div>
      <audio controls preload="none" src="${esc(tr.url)}" style="width:100%;height:36px;border-radius:8px;margin-top:${tr.description ? '0' : '0.5rem'};"></audio>
    </div>`).join('')
}

function initCreatorTrackReportUI() {
  if (window.__fasCreatorTrackReportInit) return
  window.__fasCreatorTrackReportInit = true

  const modal = document.getElementById('creator-track-report-modal')
  const reason = document.getElementById('creator-track-report-reason')
  const details = document.getElementById('creator-track-report-details')
  const target = document.getElementById('creator-track-report-target')
  const submit = document.getElementById('creator-track-report-submit')
  const cancel = document.getElementById('creator-track-report-cancel')
  const note = document.getElementById('creator-track-report-note')

  if (!modal || !submit || !cancel) return

  function closeModal() {
    modal.style.display = 'none'
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-track-report-btn]')
    if (!btn || btn.disabled) return
    creatorReportTargetKey = btn.dataset.trackReportKey || ''
    if (target) target.textContent = btn.dataset.trackReportTitle ? `Track: ${btn.dataset.trackReportTitle}` : ''
    if (reason) reason.value = 'Spam'
    if (details) details.value = ''
    modal.style.display = 'flex'
  })

  modal.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'creator-track-report-modal') closeModal()
  })
  cancel.addEventListener('click', closeModal)

  submit.addEventListener('click', () => {
    if (!creatorReportTargetKey) { closeModal(); return }
    creatorReportedTrackKeys.add(creatorReportTargetKey)
    document.querySelectorAll('[data-track-report-btn]').forEach((btn) => {
      if (btn.dataset.trackReportKey === creatorReportTargetKey) {
        btn.disabled = true
        btn.textContent = 'Reported'
        btn.style.color = 'var(--text-3)'
        btn.style.cursor = 'default'
        const label = btn.parentElement?.querySelector('[data-track-reported-label]')
        if (label) label.style.display = ''
      }
    })
    if (note) {
      note.style.display = ''
      note.textContent = 'Report submitted.'
      setTimeout(() => {
        if (note.textContent === 'Report submitted.') {
          note.textContent = ''
          note.style.display = 'none'
        }
      }, 3000)
    }
    closeModal()
  })
}

function renderServices(services) {
  if (!services || !services.length) return ''
  return services.map(s => `
    <div class="menu-row" role="listitem">
      <span class="menu-row-num" aria-hidden="true">${esc(s.num || '')}</span>
      <div class="menu-row-body">
        <h3>${esc(s.name)}</h3>
        ${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
        ${s.addon ? `<span class="menu-row-addon">Add-on</span>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <p class="menu-row-price">${esc(s.price || '')}</p>
      </div>
    </div>`).join('')
}

function renderHours(hours) {
  if (!hours || !hours.length) return ''
  return hours.map(h => `
    <div class="biz-hours-row${h.closed ? ' biz-hours-row--closed' : ''}" role="listitem">
      <span class="biz-hours-day">${esc(h.day)}</span>
      <span class="biz-hours-time">${h.closed ? 'Closed' : esc(h.time || '')}</span>
    </div>`).join('')
}


// ── NOT FOUND ─────────────────────────────────────────────────────

function showNotFound(slug) {
  document.body.dataset.state = 'not-found'
  const nf = document.getElementById('page-not-found')
  if (nf) {
    nf.hidden = false
    const slugEl = nf.querySelector('[data-f="nf-slug"]')
    if (slugEl && slug) slugEl.textContent = slug
  }
  const main = document.querySelector('main')
  if (main) main.hidden = true
  const pb = document.getElementById('powered-by-bar')
  if (pb) pb.hidden = true
  document.title = 'Page Not Found — Faceless Animal Studios'
}


// ── HYDRATION ─────────────────────────────────────────────────────

function hydrateShared(profile, page) {
  const meta  = (page && page.metadata_json)  || {}
  const links = normalizeLinks(profile.links_json)
  const cat   = profile.category || 'creator'
  const loc   = formatLocation(profile)
  const name  = profile.display_name || profile.username || 'Creator'
  const plan  = profile.plan_type   || 'free'
  // Per-profile feature overrides from admin (profiles.plan_features column)
  const pfeat = profile.plan_features || {}

  // Stamp plan tier on body — CSS plan-gate rules depend on this attribute.
  // data-plan-gate="starter" elements are hidden when body[data-plan="free"].
  document.body.dataset.plan = plan

  // Accent color — custom accent requires Pro or per-profile override
  const canCustomAccent = planAtLeast(plan, 'pro') || pfeat.custom_accent === true
  const accent = canCustomAccent ? (meta.accent_color || categoryAccent(cat)) : categoryAccent(cat)
  applyAccentColor(accent)

  // Document meta
  document.title = `${name} — Faceless Animal Studios`
  const metaDesc = document.querySelector('meta[name="description"]')
  if (metaDesc) {
    metaDesc.setAttribute('content',
      `${name} — ${categoryLabel(cat)}${loc ? ` based in ${loc}` : ''}. Part of the Faceless Animal Studios platform.`)
  }

  // Basic text fills
  fill('display_name', name)
  fill('username',     `@${profile.username || profile.slug}`)
  fill('category_label', categoryLabel(cat))
  fill('location',     loc)
  fill('tagline',      page.subtitle || page.title || categoryLabel(cat))

  // Hero heading with italic last word
  document.querySelectorAll('[data-f="hero_heading"]').forEach(el => {
    el.innerHTML = heroHeadingHTML(page.title || name)
  })

  // Bio paragraphs
  const bio = profile.bio || ''
  const paras = bio.split(/\n\n+/).filter(Boolean)
  fill('bio_short', paras[0] || bio)
  slot('bio', paras.map(p => `<p>${esc(p)}</p>`).join('') || `<p>${esc(bio)}</p>`)

  // Avatar / profile image
  if (profile.avatar_url) {
    slot('avatar', `<img src="${esc(profile.avatar_url)}" alt="${esc(name)}" class="creator-avatar-img" />`)
  } else {
    slot('avatar', initials(name))
  }

  // Tags — custom tags require Starter or per-profile override
  const canCustomTags = planAtLeast(plan, 'starter') || pfeat.custom_tags === true
  const tags = canCustomTags ? (meta.tags || [categoryLabel(cat)]) : [categoryLabel(cat)]
  slot('tags', renderTags(tags))

  // Social buttons
  slot('social_btns', renderSocialButtons(links))

  // Marquee words — custom marquee words require Pro or per-profile override
  const canCustomMarquee = planAtLeast(plan, 'pro') || pfeat.marquee_custom === true
  const marqueeWords = canCustomMarquee ? (meta.marquee_words || []) : []
  slot('marquee', renderMarquee(marqueeWords, name))

  // Stats
  const stats = meta.stats || []
  slot('stats', renderStats(stats))
  showSection('stats', stats.length > 0)

  // Quick info
  const qi = meta.quick_info || []
  slot('quick_info', renderQuickInfo(qi))
  showSection('quick_info', qi.length > 0)

  // Links
  const linkHtml = renderLinks(links)
  slot('links', linkHtml)
  showSection('links', linkHtml.length > 0)

  // Powered-by bar — hidden for pro and premium
  const bar = document.getElementById('powered-by-bar')
  if (bar) {
    bar.hidden = planAtLeast(plan, 'pro')
    const slugSpan = bar.querySelector('[data-f="page_slug"]')
    if (slugSpan) slugSpan.textContent = `facelessanimalstudios.com/${profile.slug}`
  }

  // Custom domain badge — premium only (shown in hero if custom_domain is set)
  const domainBadge = document.querySelector('[data-plan-feature="custom_domain"]')
  if (domainBadge) {
    const hasDomain = planAtLeast(plan, 'premium') && page.custom_domain
    domainBadge.hidden = !hasDomain
    if (hasDomain) {
      const domainText = domainBadge.querySelector('[data-f="custom_domain"]')
      if (domainText) domainText.textContent = page.custom_domain
    }
  }

  // Plan-gated section visibility — CSS handles most via body[data-plan],
  // but we also guard JS-driven sections that may render data on gated plans.
  const canShowSections = planAtLeast(plan, 'starter') || pfeat.works_section === true
  if (!canShowSections) {
    // Ensure stats/quick_info don't render on free plans even if data exists
    showSection('stats', false)
    showSection('quick_info', false)
  }
}

function hydrateArtist(profile, page) {
  hydrateShared(profile, page)
  const meta = (page && page.metadata_json) || {}

  const works = meta.works || []
  slot('works', renderWorks(works))
  showSection('works', works.length > 0)
}

function hydrateCreator(profile, page) {
  hydrateShared(profile, page)
  const meta = (page && page.metadata_json) || {}

  const works = meta.works || []
  slot('works', renderWorks(works))
  showSection('works', works.length > 0)
}

function hydrateBusiness(profile, page) {
  hydrateShared(profile, page)
  const meta    = (page && page.metadata_json) || {}
  const contact = meta.contact || {}

  const services = meta.services || []
  slot('services', renderServices(services))
  showSection('services', services.length > 0)

  const hours = meta.hours || []
  slot('hours', renderHours(hours))
  showSection('hours', hours.length > 0)

  fill('contact_phone',   contact.phone   || '')
  fill('contact_email',   contact.email   || '')
  fill('contact_address', contact.address || '')

  const hasContact = Boolean(contact.phone || contact.email || contact.address)
  const hasLinks   = Object.keys(normalizeLinks(profile.links_json)).length > 0
  showSection('contact', hasContact || hasLinks)
}

function hydrate(profile, page) {
  const pageType = document.body.dataset.pageType || (page && page.page_type) || 'creator'
  if      (pageType === 'artist')   hydrateArtist(profile, page)
  else if (pageType === 'business') hydrateBusiness(profile, page)
  else                              hydrateCreator(profile, page)

  document.body.dataset.state = 'loaded'
}


// ── INIT ─────────────────────────────────────────────────────────

async function init() {
  const { slug } = getSlugFromURL()

  if (!slug) { showNotFound(''); return }

  if (!SUPABASE_READY) {
    // Show a dev-mode message — Supabase env vars not available
    document.body.dataset.state = 'no-supabase'
    const info = document.getElementById('page-loading-msg')
    if (info) info.textContent = 'Supabase not configured — page data not available in preview.'
    return
  }

  const { data: profile, error } = await fetchProfile(slug)

  if (error || !profile) { showNotFound(slug); return }

  const pages = profile.pages || []
  const page  = pages.find(p => p.page_status === 'live')

  if (!page) { showNotFound(slug); return }

  hydrate(profile, page)
  initCreatorTrackReportUI()

  // ── Uploaded tracks — fetch public _index.json from creator-media bucket ──
  // Mirror the server's sanitization: username.toLowerCase().replace(/[^a-z0-9_-]/g, '')
  // Section stays hidden if fetch fails, returns 404, or returns no tracks.
  const supaUrl = (window.__FAS_CONFIG || {}).SUPABASE_URL
  if (supaUrl && profile.username) {
    const folderName = (profile.username || '').toLowerCase().replace(/[^a-z0-9_-]/g, '')
    const indexUrl   = `${supaUrl}/storage/v1/object/public/creator-media/${folderName}/tracks/_index.json`
    fetch(indexUrl, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data) && data.length) {
          slot('tracks', renderTracks(data))
          showSection('tracks', true)
        }
      })
      .catch(() => {}) // no tracks or network error — section stays hidden
  }
}

document.addEventListener('DOMContentLoaded', init)
