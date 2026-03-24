/**
 * SIGNAL BOARD — live signal stream
 * assets/js/board-feed.js
 */

import { SUPABASE_READY } from './supabase-client.js'
import {
  getNetworkCreators,
  getBoardPosts,
  createBoardPost,
  boostBoardPost,
} from './services/board.js'
import { uploadProfileImage } from './services/submissions.js'

const SIGNAL_TYPES = {
  drop: 'Drop',
  live: 'Live',
  audio: 'Audio',
  thought: 'Thought',
  file: 'File',
  ping: 'Ping',
  build: 'Build',
  page: 'Page',
}

const SIGNAL_DRAFT_KEY = 'signal_draft'
const SIGNAL_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

let signalCache = []
let creatorMap = {}

function esc(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getViewerSession() {
  try {
    const sess = JSON.parse(localStorage.getItem('fas_user') || 'null')
    return sess && sess.username ? sess : null
  } catch (_) {
    return null
  }
}

function formatTime(isoString) {
  if (!isoString) return 'now'
  const ts = new Date(isoString)
  if (isNaN(ts.getTime())) return 'now'

  const diffMs = Date.now() - ts.getTime()
  const mins = Math.floor(diffMs / 60000)
  const hours = Math.floor(diffMs / 3600000)
  const days = Math.floor(diffMs / 86400000)

  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ageMinutes(isoString) {
  if (!isoString) return 99999
  const ts = new Date(isoString)
  if (isNaN(ts.getTime())) return 99999
  return Math.floor((Date.now() - ts.getTime()) / 60000)
}

function signalTagClass(signalType) {
  switch (signalType) {
    case 'live': return 'creator-tag--producer'
    case 'audio': return 'creator-tag--dj'
    case 'build': return 'creator-tag--business'
    case 'thought': return 'creator-tag--writer'
    case 'ping': return 'creator-tag--gamer'
    case 'file': return 'creator-tag--visual'
    case 'page': return 'creator-tag--artist'
    default: return 'creator-tag--open'
  }
}

function initials(name) {
  const raw = String(name || '').trim()
  if (!raw) return '◉'
  const words = raw.split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function profileHrefFor(username) {
  const key = String(username || '').toLowerCase()
  const creator = creatorMap[key]
  if (!creator) return `directory.html`

  const cat = String(creator.category || 'creator').toLowerCase()
  const slug = creator.slug || creator.username || key

  if (cat === 'dj' || cat === 'producer' || cat === 'artist') return `/artist/${slug}`
  if (cat === 'business' || cat === 'collective') return `/business/${slug}`
  return `/creator/${slug}`
}

function roleBadgeHtml(username, session) {
  const key = String(username || '').toLowerCase()
  const creator = creatorMap[key] || null

  if (['jimi', 'renee', 'ariana'].includes(key)) {
    return '<span class="creator-tag creator-tag--business" style="margin-bottom:0;">Founder</span>'
  }

  if (creator && creator.is_founder === true) {
    return '<span class="creator-tag creator-tag--business" style="margin-bottom:0;">Founder</span>'
  }

  const isViewer = session && String(session.username || '').toLowerCase() === key
  const role = String((isViewer ? session.role : (creator && creator.role)) || '').toLowerCase()
  const plan = String((isViewer ? session.plan : (creator && creator.plan_type)) || '').toLowerCase()

  if (role === 'admin' || role === 'super_admin') {
    return '<span class="creator-tag creator-tag--producer" style="margin-bottom:0;">Admin</span>'
  }
  if (plan === 'premium' || plan === 'pro') {
    return '<span class="creator-tag creator-tag--dj" style="margin-bottom:0;">Premium</span>'
  }
  return '<span class="creator-tag creator-tag--open" style="margin-bottom:0;">Member</span>'
}

function presenceLabel(signal) {
  const mins = ageMinutes(signal && signal.created_at)
  if (mins <= 2) return 'Just posted'
  if (mins <= 20) return 'Active now'
  return 'Recently active'
}

function readDraft() {
  try {
    const raw = localStorage.getItem(SIGNAL_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const age = Date.now() - Number(parsed.ts || 0)
    if (age > SIGNAL_DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(SIGNAL_DRAFT_KEY)
      return null
    }
    return {
      text: String(parsed.text || ''),
      type: String(parsed.type || 'drop').toLowerCase(),
      ts: Number(parsed.ts || Date.now()),
    }
  } catch (_) {
    return null
  }
}

function saveDraft(text, type) {
  const payload = {
    text: String(text || ''),
    type: SIGNAL_TYPES[String(type || '').toLowerCase()] ? String(type).toLowerCase() : 'drop',
    ts: Date.now(),
  }
  try {
    localStorage.setItem(SIGNAL_DRAFT_KEY, JSON.stringify(payload))
  } catch (_) {}
}

function clearDraft() {
  try {
    localStorage.removeItem(SIGNAL_DRAFT_KEY)
  } catch (_) {}
}

function copyText(text, onDone) {
  const value = String(text || '').trim()
  if (!value) return
  navigator.clipboard.writeText(value).then(() => {
    if (typeof onDone === 'function') onDone(true)
  }).catch(() => {
    if (typeof onDone === 'function') onDone(false)
  })
}

function deepLinkForSignal(signalId) {
  const url = new URL(window.location.href)
  url.searchParams.set('signal', signalId)
  return url.toString()
}

function escapeSelectorValue(value) {
  const raw = String(value || '')
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(raw)
  return raw.replace(/(["\\])/g, '\\$1')
}

function renderSignalMedia(url) {
  if (!url) return ''
  const safeUrl = esc(url)
  const lower = String(url).toLowerCase()

  if (/\.(png|jpg|jpeg|gif|webp|avif|svg)(\?|$)/.test(lower)) {
    return `<div class="post-card-image-wrap"><img src="${safeUrl}" alt="Signal media" class="post-card-image" loading="lazy" /></div>`
  }

  if (/\.(mp3|wav|ogg|m4a)(\?|$)/.test(lower)) {
    return `<div style="margin-top:0.9rem;"><audio controls preload="none" style="width:100%;"><source src="${safeUrl}" /></audio></div>`
  }

  return `<p style="margin-top:0.8rem;"><a href="${safeUrl}" target="_blank" rel="noopener" class="board-card-link">Open attached file →</a></p>`
}

function renderSignalCard(signal, session) {
  const username = String(signal.username || '').toLowerCase()
  const creator = creatorMap[username] || null
  const displayName = String(signal.display_name || (creator && creator.display_name) || username)
  const signalType = String(signal.signal_type || 'drop').toLowerCase()
  const mins = ageMinutes(signal.created_at)

  const isFresh = mins <= 25
  const isOld = mins >= 720
  const isLive = signalType === 'live' && mins <= 45

  const liveClass = isLive ? ' signal-card--live' : ''
  const freshClass = isFresh ? ' signal-card--fresh' : ''
  const oldClass = isOld ? ' signal-card--old' : ''

  const tagClass = signalTagClass(signalType)
  const label = SIGNAL_TYPES[signalType] || 'Drop'
  const dmHref = `messages.html?to=${encodeURIComponent(username)}`
  const profileHref = profileHrefFor(username)
  const privateAccessLine = '<p style="font-size:0.67rem;color:var(--text-3);margin:0.14rem 0 0;">Direct contact locked · Code required for contact</p>'
  const presence = presenceLabel(signal)
  const avatar = creator && creator.avatar_url
    ? `<img src="${esc(creator.avatar_url)}" alt="${esc(displayName)}" class="board-card-avatar-img" />`
    : esc(initials(displayName))
  const newClass = signal && signal.__new ? ' signal-card--new' : ''

  return `
    <article class="post-card signal-card${liveClass}${freshClass}${oldClass}${newClass}" role="article" aria-label="Signal by @${esc(username)}" data-signal-id="${esc(signal.id)}" id="signal-${esc(signal.id)}">
      <div class="post-card-head">
        <div class="post-card-avatar" aria-hidden="true">${avatar}</div>
        <div class="post-card-meta" style="min-width:0;">
          <p class="post-card-name" style="display:flex;align-items:center;gap:0.5rem;white-space:normal;">
            <span>${esc(displayName)}</span>
            <span class="creator-tag ${tagClass} post-category-tag" style="margin:0;">${esc(label)}</span>
          </p>
          <p class="post-card-handle">@${esc(username)} · <time datetime="${esc(signal.created_at)}">${esc(formatTime(signal.created_at))}</time></p>
          ${privateAccessLine}
          <p style="font-size:0.67rem;color:var(--text-3);margin:0.15rem 0 0;">${esc(presence)}</p>
        </div>
      </div>
      <p class="post-card-text">${esc(signal.content || '')}</p>
      ${renderSignalMedia(signal.media_url)}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:0.65rem;flex-wrap:wrap;margin-top:0.9rem;">
        <div style="display:flex;align-items:center;gap:0.45rem;flex-wrap:wrap;">${roleBadgeHtml(username, session)}</div>
        <div style="display:flex;align-items:center;gap:0.45rem;flex-wrap:wrap;">
          <button type="button" class="btn btn-ghost btn-sm signal-boost-btn" data-signal-id="${esc(signal.id)}" style="font-size:0.7rem;padding:0.45rem 0.85rem;">Boost (${Number(signal.boost_count || 0)})</button>
          <button type="button" class="btn btn-ghost btn-sm signal-share-btn" data-signal-id="${esc(signal.id)}" data-signal-user="${esc(username)}" data-signal-display="${esc(displayName)}" data-signal-content="${esc(signal.content || '')}" style="font-size:0.7rem;padding:0.45rem 0.85rem;">Copy Signal</button>
          <a href="${profileHref}" class="btn btn-ghost btn-sm" style="font-size:0.7rem;padding:0.45rem 0.85rem;">View Profile</a>
          <a href="${dmHref}" class="btn btn-ghost btn-sm" style="font-size:0.7rem;padding:0.45rem 0.85rem;">Message</a>
        </div>
      </div>
    </article>`
}

function renderEmptyState() {
  const session = getViewerSession()
  const msg = session
    ? 'Nothing here yet. Start the signal.'
    : 'Signal stream is quiet. Sign in to drop the first signal.'
  return `
    <div class="post-empty-state" role="status">
      <p class="post-empty-icon" aria-hidden="true">◉</p>
      <p class="post-empty-title">No signals yet.</p>
      <p class="post-empty-sub">${msg}</p>
    </div>`
}

function planLabel(planType) {
  const plan = String(planType || '').toLowerCase()
  if (plan === 'premium') return 'Premium'
  if (plan === 'pro') return 'Pro'
  if (plan === 'starter') return 'Starter'
  return 'Free'
}

function creatorTypeLabel(category) {
  const cat = String(category || '').toLowerCase()
  if (cat === 'dj') return 'DJ'
  if (cat === 'producer') return 'Producer'
  if (cat === 'artist') return 'Artist'
  if (cat === 'business') return 'Business'
  if (cat === 'collective') return 'Collective'
  if (cat === 'visual_artist') return 'Visual Artist'
  if (cat === 'writer') return 'Writer'
  if (cat === 'gamer') return 'Gamer'
  return 'Creator'
}

function creatorTagClass(category) {
  const cat = String(category || '').toLowerCase()
  if (cat === 'dj') return 'creator-tag--dj'
  if (cat === 'producer') return 'creator-tag--producer'
  if (cat === 'business' || cat === 'collective') return 'creator-tag--business'
  if (cat === 'visual_artist') return 'creator-tag--visual'
  if (cat === 'gamer') return 'creator-tag--gamer'
  if (cat === 'writer') return 'creator-tag--writer'
  if (cat === 'artist') return 'creator-tag--artist'
  return 'creator-tag--open'
}

function renderFeaturedCard(member) {
  const username = String(member.username || '').toLowerCase()
  const name = member.display_name || username
  const location = [member.city, member.state].filter(Boolean).join(', ') || 'Faceless Animal Studios'
  const badgeBits = []
  if (member.is_founder === true) badgeBits.push('Founder')
  badgeBits.push(creatorTypeLabel(member.category))
  badgeBits.push(planLabel(member.plan_type))
  const bio = String(member.bio || '').trim() || 'This member has a live page in the network.'
  const href = profileHrefFor(username)

  return `
    <article class="featured-creator" aria-label="Featured creator: ${esc(name)}" data-creator-id="${esc(username)}" data-real="1">
      <div class="featured-creator-avatar" aria-hidden="true">${member.avatar_url ? `<img src="${esc(member.avatar_url)}" alt="${esc(name)}" class="board-card-avatar-img" />` : esc(initials(name))}</div>
      <div>
        <p class="featured-creator-badge">${esc(badgeBits.join(' · '))}</p>
        <p class="featured-creator-name">${esc(name)}</p>
        <p class="featured-creator-handle">@${esc(username)} · ${esc(location)}</p>
        <p class="featured-creator-bio">${esc(bio)}</p>
      </div>
      <a href="${esc(href)}" class="btn btn-primary" style="white-space:nowrap;align-self:center;">View Page →</a>
    </article>`
}

function renderFeaturedCTA() {
  return `
    <article class="featured-creator" aria-label="Create your page" data-creator-id="featured-cta" data-real="0" style="border-style:dashed;">
      <div class="featured-creator-avatar" aria-hidden="true" style="background:rgba(255,255,255,0.03);border-style:dashed;color:var(--text-3);">+</div>
      <div>
        <p class="featured-creator-badge">Open Spot · Signal Network</p>
        <p class="featured-creator-name">Your page could be here</p>
        <p class="featured-creator-handle">Real pages only</p>
        <p class="featured-creator-bio">Create your Signal page and join the featured lane once your public page is live.</p>
      </div>
      <a href="start.html?plan=free" class="btn btn-ghost" style="white-space:nowrap;align-self:center;">Create Signal Page →</a>
    </article>`
}

function renderFeaturedSection(creators) {
  const section = document.getElementById('featured')
  const strip = document.getElementById('featured-creator-strip')
  if (!section || !strip) return

  const real = (creators || []).filter(c => c.page_status === 'live')
  const featured = real
    .filter(c => c.is_founder === true || c.plan_type === 'premium' || c.plan_type === 'pro')
    .slice(0, 4)

  if (!featured.length) {
    section.setAttribute('hidden', '')
    strip.innerHTML = ''
    return
  }

  section.removeAttribute('hidden')
  strip.innerHTML = featured.map(renderFeaturedCard).join('') + renderFeaturedCTA()
}

function renderBoardCard(member) {
  const username = String(member.username || '').toLowerCase()
  const name = member.display_name || username
  const location = [member.city, member.state].filter(Boolean).join(', ') || 'Faceless Animal Studios'
  const bio = String(member.bio || '').trim() || 'Live member page in the network.'
  const category = String(member.category || 'creator').toLowerCase()
  const plan = planLabel(member.plan_type)
  const href = profileHrefFor(username)
  const typeLabel = creatorTypeLabel(category)
  const tagClass = creatorTagClass(category)

  return `
    <article class="board-card" role="listitem" aria-label="Creator: ${esc(name)}" data-creator-id="${esc(username)}" data-real="1">
      <div class="board-card-head">
        <div class="board-card-avatar" aria-hidden="true">${member.avatar_url ? `<img src="${esc(member.avatar_url)}" alt="${esc(name)}" class="board-card-avatar-img" />` : esc(initials(name))}</div>
        <div class="board-card-meta">
          <p class="board-card-handle">@${esc(username)}</p>
          <p class="board-card-location">${esc(location)}</p>
        </div>
      </div>
      <span class="creator-tag ${tagClass}">${esc(typeLabel)}</span>
      <p class="board-card-status">"${esc(bio.slice(0, 180))}"</p>
      <div class="board-card-footer">
        <span class="creator-tag creator-tag--open" style="margin-bottom:0;">${esc(plan)}</span>
        <a href="${esc(href)}" class="board-card-link">View Page →</a>
      </div>
    </article>`
}

function renderBoardCTA() {
  return `
    <article class="board-card board-card--open" role="listitem" aria-label="Open creator spot" data-creator-id="open-slot" data-real="0">
      <div class="board-card-head">
        <div class="board-card-avatar" style="background:rgba(255,255,255,0.02);border-color:var(--border-2);color:var(--text-3);font-size:1.2rem;border-style:dashed;" aria-hidden="true">?</div>
        <div class="board-card-meta">
          <p class="board-card-handle" style="color:var(--text-3);">@yourname</p>
          <p class="board-card-location">Anywhere</p>
        </div>
      </div>
      <span class="creator-tag creator-tag--open">Open Spot</span>
      <p class="board-card-status">"Your page could be featured here once your profile is live."</p>
      <div class="board-card-footer">
        <span class="creator-tag creator-tag--open" style="margin-bottom:0;">Create Free</span>
        <a href="start.html?plan=free" class="board-card-link">Create Signal Page →</a>
      </div>
    </article>`
}

function renderCreatorBoard(creators) {
  const board = document.getElementById('creator-board-container')
  if (!board) return
  const live = (creators || []).filter(c => c.page_status === 'live')
  const cards = live.slice(0, 4).map(renderBoardCard)

  if (!cards.length) {
    board.innerHTML = renderBoardCTA()
    return
  }

  board.innerHTML = cards.join('') + renderBoardCTA()
}

function renderFeed() {
  const container = document.getElementById('board-posts-container')
  if (!container) return

  if (!signalCache.length) {
    container.innerHTML = renderEmptyState()
    return
  }

  const session = getViewerSession()
  container.innerHTML = signalCache.map(s => renderSignalCard(s, session)).join('')
  highlightSignalFromUrl()
}

function highlightSignalFromUrl() {
  const signalId = new URLSearchParams(window.location.search).get('signal')
  if (!signalId) return
  const safeId = escapeSelectorValue(signalId)
  const card = document.querySelector(`[data-signal-id="${safeId}"]`)
  if (!card) return
  card.classList.add('signal-card--deep-link')
  card.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function applyViewerState(session) {
  const stateEl = document.getElementById('network-viewer-state')
  const badgeEl = document.getElementById('network-viewer-badge')
  const heroSub = document.getElementById('network-hero-sub')
  const heroActions = document.getElementById('network-hero-actions')

  if (!stateEl || !badgeEl) return

  if (!session) {
    stateEl.innerHTML = '<strong>Guest mode active.</strong> You can watch the live stream now. Sign in to send your own signals.'
    badgeEl.textContent = 'Guest'
    if (heroSub) heroSub.textContent = 'Anonymous-first stream. Post, message, and connect using your platform identity only.'
    if (heroActions) heroActions.innerHTML = '<a href="login.html?intent=post&redirect=network.html" class="btn btn-primary btn-lg">Enter Signal</a><a href="start.html?intent=post&redirect=network.html" class="btn btn-ghost btn-lg">Create Identity</a>'
    return
  }

  const role = String(session.role || 'user').toLowerCase()
  const plan = String(session.plan || 'free').toLowerCase()
  const parts = []
  parts.push(plan === 'premium' || plan === 'pro' ? 'Premium' : 'Member')
  if (role === 'admin' || role === 'super_admin') parts.push('Admin')

  stateEl.innerHTML = `<strong>Signed in as @${esc(session.username)}.</strong> Stream is live and ready for your signal.`
  badgeEl.textContent = parts.join(' · ')
  if (heroSub) heroSub.textContent = 'You are connected. Drop signal types for movement, live sessions, files, audio, thoughts, and build updates.'
  if (heroActions) heroActions.innerHTML = '<a href="#post-form-section" class="btn btn-primary btn-lg">Drop Signal</a><a href="#posts-feed" class="btn btn-ghost btn-lg">View Stream →</a>'
}

function applyStats(creators) {
  const memberEl = document.getElementById('stat-member-count')
  const liveEl = document.getElementById('stat-live-pages')
  const signalEl = document.getElementById('stat-signal-count')
  const founderEl = document.getElementById('stat-founder-count')
  const liveTextEl = document.getElementById('network-live-text')
  const liveCountEl = document.getElementById('network-live-count')

  const members = creators || []
  const liveCount = members.filter(c => c.page_status === 'live').length
  const founderCount = members.filter(c => c.is_founder === true).length

  if (memberEl) memberEl.textContent = String(members.length)
  if (liveEl) liveEl.textContent = String(liveCount)
  if (signalEl) signalEl.textContent = String(signalCache.length)
  if (founderEl) founderEl.textContent = String(founderCount)

  if (liveTextEl) {
    liveTextEl.innerHTML = `<strong>Signal stream is live</strong> — ${signalCache.length} active signals in motion.`
  }
  if (liveCountEl) liveCountEl.textContent = 'Realtime'
}

async function loadContext() {
  const { data: creators } = await getNetworkCreators(80)
  const rows = creators || []
  creatorMap = {}
  ;rows.forEach(c => {
    creatorMap[String(c.username || '').toLowerCase()] = c
  })
  renderFeaturedSection(rows)
  renderCreatorBoard(rows)
  applyStats(rows)
}

async function initPostsFeed() {
  const container = document.getElementById('board-posts-container')
  if (!container) return

  if (!SUPABASE_READY) {
    signalCache = []
    renderFeed()
    return
  }

  container.innerHTML = '<div class="post-loading" role="status" aria-label="Loading signals"><span></span><span></span><span></span></div>'

  const { data, error } = await getBoardPosts({ limit: 50 })
  if (error) {
    signalCache = []
    renderFeed()
    applyStats(Object.values(creatorMap || {}))
    return
  }

  signalCache = (data && data.length) ? data : []
  renderFeed()
  applyStats(Object.values(creatorMap || {}))
}

function initMemberGating() {
  const session = getViewerSession()
  const formWrap = document.getElementById('board-post-form-wrap')
  const gateBlock = document.getElementById('board-post-gate-block')

  if (!session) {
    if (formWrap) formWrap.removeAttribute('hidden')
    if (gateBlock) gateBlock.removeAttribute('hidden')
  } else {
    if (formWrap) formWrap.removeAttribute('hidden')
    if (gateBlock) gateBlock.setAttribute('hidden', '')
  }

  applyViewerState(session)
}

function showFeedback(type, message) {
  const el = document.getElementById('post-form-feedback')
  if (!el) return
  el.className = `post-form-feedback post-form-feedback--${type}`
  el.innerHTML = message
  el.removeAttribute('hidden')
}

function clearFeedback() {
  const el = document.getElementById('post-form-feedback')
  if (!el) return
  el.setAttribute('hidden', '')
  el.className = 'post-form-feedback'
  el.innerHTML = ''
}

function formatPostErrorDetails(error) {
  if (!error) return ''
  const code = String(error.code || '').trim()
  const message = String(error.message || '').trim()
  if (code && message) return `${code}: ${message}`
  if (message) return message
  if (code) return code
  return 'Unknown error'
}

function bindBoostInteraction() {
  const container = document.getElementById('board-posts-container')
  if (!container) return

  container.addEventListener('click', async (e) => {
    const shareBtn = e.target.closest('.signal-share-btn')
    if (shareBtn) {
      const signalId = shareBtn.getAttribute('data-signal-id') || ''
      const user = shareBtn.getAttribute('data-signal-user') || 'member'
      const display = shareBtn.getAttribute('data-signal-display') || user
      const content = shareBtn.getAttribute('data-signal-content') || ''
      const preview = String(content).slice(0, 120)
      const link = signalId ? deepLinkForSignal(signalId) : window.location.href
      const text = `Signal from ${display} (@${user}) — ${preview}${preview.length >= 120 ? '…' : ''} ${link}`.trim()
      copyText(text, ok => {
        if (!ok) return
        const prev = shareBtn.textContent
        shareBtn.textContent = 'Copied'
        setTimeout(() => { shareBtn.textContent = prev }, 1200)
      })
      return
    }

    const btn = e.target.closest('.signal-boost-btn')
    if (!btn) return

    const signalId = btn.getAttribute('data-signal-id')
    if (!signalId) return

    btn.disabled = true
    const { data, error } = await boostBoardPost(signalId)
    btn.disabled = false

    if (error || !data) return

    const nextCount = Number(data.boost_count || 0)
    btn.textContent = `Boost (${nextCount})`

    const idx = signalCache.findIndex(s => String(s.id) === String(signalId))
    if (idx >= 0) signalCache[idx].boost_count = nextCount
  })
}

function initPostForm() {
  const form = document.getElementById('fas-board-post-form')
  const submitBtn = document.getElementById('post-form-submit')
  const textInput = document.getElementById('post-text-input')
  const typeSelect = document.getElementById('signal-type-select')
  const mediaInput = document.getElementById('signal-media-input')
  const charCount = document.getElementById('post-char-count')

  if (!form || !submitBtn || !textInput || !typeSelect || !mediaInput) return

  const maybeRestoreDraft = () => {
    const draft = readDraft()
    if (!draft) return
    textInput.value = draft.text || ''
    if (draft.type && SIGNAL_TYPES[draft.type]) typeSelect.value = draft.type
    const len = textInput.value.length
    charCount.textContent = `${len} / 800`
    charCount.classList.toggle('post-char--warn', len > 700)
    showFeedback('success', 'Your draft has been restored.')

    const shouldFocus = !!new URLSearchParams(window.location.search).get('intent')
    if (shouldFocus) {
      const wrap = document.getElementById('post-form-section')
      if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' })
      textInput.focus()
    }
  }

  maybeRestoreDraft()

  textInput.addEventListener('input', () => {
    const len = textInput.value.length
    charCount.textContent = `${len} / 800`
    charCount.classList.toggle('post-char--warn', len > 700)
    if (!getViewerSession()) saveDraft(textInput.value, typeSelect.value)
  })

  typeSelect.addEventListener('change', () => {
    if (!getViewerSession()) saveDraft(textInput.value, typeSelect.value)
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    clearFeedback()

    if (!SUPABASE_READY) {
      showFeedback('error', 'Signal service is not configured yet.')
      return
    }

    const session = getViewerSession()
    if (!session || !session.username) {
      saveDraft(textInput.value, typeSelect.value)
      showFeedback('warning', 'Sign in to post. Your draft is saved.')
      setTimeout(() => {
        window.location.href = 'login.html?intent=post&redirect=network.html'
      }, 380)
      return
    }

    const content = textInput.value.trim()
    const signalType = String(typeSelect.value || 'drop').toLowerCase()

    if (!content) {
      showFeedback('error', 'Write your signal first.')
      return
    }
    if (content.length > 800) {
      showFeedback('error', 'Signal is too long. Keep it under 800 characters.')
      return
    }

    submitBtn.disabled = true
    submitBtn.textContent = 'Sending Signal…'

    const optimisticId = `optimistic-${Date.now()}`
    const optimistic = {
      id: optimisticId,
      username: String(session.username).toLowerCase(),
      display_name: session.display || session.username,
      platform_id: session.platform_id || null,
      content,
      media_url: null,
      signal_type: SIGNAL_TYPES[signalType] ? signalType : 'drop',
      created_at: new Date().toISOString(),
      boost_count: 0,
      __new: true,
    }

    signalCache = [optimistic].concat(signalCache)
    renderFeed()
    applyStats(Object.values(creatorMap || {}))

    let mediaUrl = null
    let mediaWarning = ''
    const file = mediaInput.files && mediaInput.files[0] ? mediaInput.files[0] : null
    if (file) {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
      const renamed = new File([file], `signal-${Date.now()}.${ext}`, {
        type: file.type,
        lastModified: file.lastModified,
      })

      const upload = await uploadProfileImage(String(session.username).toLowerCase(), renamed)
      if (upload.error || !upload.url) {
        console.error('[FAS] media upload failed; posting text-only signal:', upload.error && upload.error.message)
        mediaWarning = 'Media upload failed. Sending text-only signal.'
      } else {
        mediaUrl = upload.url
      }
    }

    const { data, error } = await createBoardPost({
      username: String(session.username).toLowerCase(),
      display_name: session.display || session.username,
      platform_id: session.platform_id || null,
      content,
      media_url: mediaUrl,
      signal_type: SIGNAL_TYPES[signalType] ? signalType : 'drop',
    })

    submitBtn.disabled = false
    submitBtn.textContent = 'Send Signal'

    if (error) {
      signalCache = signalCache.filter(s => String(s.id) !== optimisticId)
      renderFeed()
      applyStats(Object.values(creatorMap || {}))
      const details = formatPostErrorDetails(error)
      const suffix = details ? ` [${esc(details)}]` : ''
      showFeedback('error', `Unable to save signal.${suffix}`)
      return
    }

    const row = data || {
      id: `local-${Date.now()}`,
      username: String(session.username).toLowerCase(),
      display_name: session.display || session.username,
      platform_id: session.platform_id || null,
      content,
      media_url: mediaUrl,
      signal_type: SIGNAL_TYPES[signalType] ? signalType : 'drop',
      created_at: new Date().toISOString(),
      boost_count: 0,
      __new: true,
    }

    signalCache = signalCache.filter(s => String(s.id) !== optimisticId)
    signalCache = [row].concat(signalCache)
    renderFeed()
    applyStats(Object.values(creatorMap || {}))

    form.reset()
    charCount.textContent = '0 / 800'
    clearDraft()
    if (mediaWarning) {
      showFeedback('warning', 'Your signal is live. ' + mediaWarning)
    } else {
      showFeedback('success', 'Your signal is live.')
    }
  })
}

document.addEventListener('DOMContentLoaded', async () => {
  initMemberGating()
  bindBoostInteraction()
  await loadContext()
  await initPostsFeed()
  initPostForm()
})
