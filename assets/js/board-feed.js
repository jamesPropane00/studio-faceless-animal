/**
 * BOARD FEED — Supabase-connected
 * assets/js/board-feed.js
 * ════════════════════════════════════════════════════════════════════
 *
 * Drives the network board on network.html:
 *   1. Creator grid  — live profiles from `profiles` table
 *   2. Posts feed    — approved posts from `board_posts` + profiles join
 *   3. Post form     — submit a new board post (pending approval)
 *
 * If Supabase is not configured (SUPABASE_READY = false):
 *   - Creator grid: static HTML in network.html stays in place (no-op)
 *   - Posts feed:   shows empty state
 *   - Post form:    shows unavailable message
 *
 * ════════════════════════════════════════════════════════════════════
 */

import { SUPABASE_READY } from './supabase-client.js'
import {
  getNetworkCreators,
  getBoardPosts,
  lookupProfileByUsername,
  createBoardPost,
} from './services/board.js'


// ────────────────────────────────────────────────────────────────────
// UTILITIES
// ────────────────────────────────────────────────────────────────────

/**
 * Map a creator category to its dynamic route prefix.
 * Used to build hrefs like /artist/djfacelessanimal, /creator/koldvisual, etc.
 *
 * Route rules:
 *   /artist/  → music-led categories (dj, producer, artist)
 *   /creator/ → all other individual creators
 *   /business/→ business & collective entities
 */
function categoryToRoute(category, slug) {
  const artistCats   = new Set(['dj', 'producer', 'artist'])
  const businessCats = new Set(['business', 'collective'])

  if (artistCats.has(category))   return `/artist/${slug}`
  if (businessCats.has(category)) return `/business/${slug}`
  return `/creator/${slug}`
}

function esc(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Generate 2–3 uppercase initials from a display name */
function getInitials(name) {
  if (!name) return '?'
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return words.slice(0, 3).map(w => w[0]).join('').toUpperCase()
}

/** Avatar accent color derived from category */
function categoryColor(cat) {
  const map = {
    dj:            { bg: 'rgba(201,169,110,0.18)', border: 'rgba(201,169,110,0.35)', text: 'var(--gold)' },
    producer:      { bg: 'rgba(140,60,200,0.18)',  border: 'rgba(140,60,200,0.35)',  text: '#a06ae0' },
    artist:        { bg: 'rgba(200,100,60,0.18)',  border: 'rgba(200,100,60,0.35)',  text: '#e09070' },
    visual_artist: { bg: 'rgba(200,60,60,0.18)',   border: 'rgba(200,60,60,0.35)',   text: '#e07070' },
    photographer:  { bg: 'rgba(220,80,80,0.18)',   border: 'rgba(220,80,80,0.35)',   text: '#e07070' },
    gamer:         { bg: 'rgba(40,130,200,0.18)',  border: 'rgba(40,130,200,0.35)',  text: '#5aabdc' },
    game_dev:      { bg: 'rgba(40,130,200,0.18)',  border: 'rgba(40,130,200,0.35)',  text: '#5aabdc' },
    writer:        { bg: 'rgba(60,180,120,0.18)',  border: 'rgba(60,180,120,0.35)',  text: '#6abfa8' },
    podcaster:     { bg: 'rgba(60,180,120,0.18)',  border: 'rgba(60,180,120,0.35)',  text: '#6abfa8' },
    business:      { bg: 'rgba(40,160,130,0.18)',  border: 'rgba(40,160,130,0.35)',  text: '#6abfa8' },
    collective:    { bg: 'rgba(100,100,180,0.18)', border: 'rgba(100,100,180,0.35)', text: '#8888cc' },
  }
  return map[cat] || { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.10)', text: 'var(--text-2)' }
}

function avatarStyle(cat) {
  const c = categoryColor(cat)
  return `background:linear-gradient(135deg,${c.bg},rgba(0,0,0,0));border-color:${c.border};color:${c.text};`
}

function categoryLabel(cat) {
  const map = {
    dj:            'DJ · Producer',
    producer:      'Producer',
    artist:        'Artist',
    visual_artist: 'Visual Artist',
    photographer:  'Photographer',
    gamer:         'Gamer',
    game_dev:      'Game Dev',
    writer:        'Writer',
    podcaster:     'Podcaster',
    business:      'Business',
    collective:    'Collective',
    other:         'Creator',
  }
  return map[cat] || 'Creator'
}

function categoryTagClass(cat) {
  const map = {
    dj:            'dj',
    producer:      'producer',
    artist:        'artist',
    visual_artist: 'visual',
    photographer:  'visual',
    gamer:         'gamer',
    game_dev:      'game-dev',
    writer:        'writer',
    podcaster:     'writer',
    business:      'business',
    collective:    'collective',
    other:         'open',
  }
  return `creator-tag--${map[cat] || 'open'}`
}

function planLabel(planType) {
  const map = {
    free:    'Free Tier',
    starter: 'Starter Page',
    pro:     'Pro Page',
    premium: 'Premium',
  }
  return map[planType] || 'Platform Member'
}

function planTagClass(planType) {
  const map = {
    free:    'creator-tag--open',
    starter: 'creator-tag--dj',
    pro:     'creator-tag--producer',
    premium: 'creator-tag--business',
  }
  return map[planType] || 'creator-tag--open'
}

function postCategoryLabel(cat) {
  const map = {
    release:      'Release',
    update:       'Update',
    collab:       'Collab',
    announcement: 'Announcement',
    question:     'Question',
  }
  return map[cat] || 'Post'
}

function relativeTime(isoString) {
  if (!isoString) return ''
  const diff  = Date.now() - new Date(isoString).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 2)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7)   return `${days}d ago`
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}


// ────────────────────────────────────────────────────────────────────
// RENDER: CREATOR BOARD CARD (live profiles row)
// ────────────────────────────────────────────────────────────────────
function renderBoardCard(profile) {
  const initials = getInitials(profile.display_name)
  const style    = avatarStyle(profile.category)
  const catClass = categoryTagClass(profile.category)
  const catLbl   = categoryLabel(profile.category)
  const planLbl  = planLabel(profile.plan_type)
  const planCls  = planTagClass(profile.plan_type)
  const location = [profile.city, profile.state].filter(Boolean).join(', ') || 'Faceless Animal Studios'
  const bio      = profile.bio ? profile.bio.slice(0, 200) : 'Platform member.'

  const avatarInner = profile.avatar_url
    ? `<img src="${esc(profile.avatar_url)}" alt="${esc(profile.display_name)}" class="board-card-avatar-img" />`
    : esc(initials)

  // Build page link — check known live pages first, then page_status, then slug diff
  const KNOWN_PAGES = {
    jamespropane00: 'artists/djfacelessanimal.html',
  }
  const pageStatus  = profile.page_status || 'none'
  const knownPage   = KNOWN_PAGES[profile.username]
  const hasPage     = !!knownPage || pageStatus === 'live' || profile.slug !== profile.username
  const pageHref    = knownPage || (hasPage ? categoryToRoute(profile.category, profile.slug || profile.username) : null)
  const pageLink    = pageHref
    ? `<a href="${esc(pageHref)}" class="board-card-link">View Page →</a>`
    : `<span class="board-card-link board-card-link--dim">Building →</span>`

  return `
    <article
      class="board-card"
      role="listitem"
      aria-label="Creator: ${esc(profile.display_name)}"
      data-creator-id="${esc(profile.username)}"
      data-category="${esc(profile.category) || 'creator'}"
      data-plan="${esc(profile.plan_type)}"
    >
      <div class="board-card-head">
        <div class="board-card-avatar" style="${style}" aria-hidden="true">${avatarInner}</div>
        <div class="board-card-meta">
          <p class="board-card-handle">@${esc(profile.username)}</p>
          <p class="board-card-location">${esc(location)}</p>
        </div>
      </div>
      <span class="creator-tag ${catClass}">${esc(catLbl)}</span>
      <p class="board-card-status">"${esc(bio)}"</p>
      <div class="board-card-footer">
        <span class="creator-tag ${planCls}" style="margin-bottom:0;">${esc(planLbl)}</span>
        ${pageLink}
      </div>
    </article>`
}

function renderOpenSlotCard() {
  return `
    <article
      class="board-card board-card--open"
      role="listitem"
      aria-label="Open creator spot"
      data-creator-id="open-slot"
    >
      <div class="board-card-head">
        <div class="board-card-avatar" style="background:rgba(255,255,255,0.02);border-color:var(--border-2);color:var(--text-3);font-size:1.2rem;border-style:dashed;" aria-hidden="true">?</div>
        <div class="board-card-meta">
          <p class="board-card-handle" style="color:var(--text-3);">@yourname</p>
          <p class="board-card-location">Anywhere</p>
        </div>
      </div>
      <span class="creator-tag creator-tag--open">Your Category</span>
      <p class="board-card-status" style="color:var(--text-3);">"This spot is open. Artists. DJs. Producers. Gamers. Businesses. Collectives. Anyone who creates and wants a real home for it."</p>
      <div class="board-card-footer">
        <span class="creator-tag creator-tag--open" style="margin-bottom:0;">Free to Join</span>
        <a href="start.html" class="board-card-link">Claim Spot →</a>
      </div>
    </article>`
}


// ────────────────────────────────────────────────────────────────────
// RENDER: BOARD POST CARD (board_posts + profiles join)
// ────────────────────────────────────────────────────────────────────
function renderPostCard(post) {
  const profile  = post.profiles || {}
  const name     = profile.display_name || post.username
  const cat      = profile.category || null
  const initials = getInitials(name)
  const style    = avatarStyle(cat)
  const catLbl   = postCategoryLabel(post.category)
  const catClass = categoryTagClass(cat)
  const time     = relativeTime(post.created_at)

  const avatarInner = profile.avatar_url
    ? `<img src="${esc(profile.avatar_url)}" alt="${esc(name)}" class="board-card-avatar-img" />`
    : esc(initials)

  const image = post.image_url
    ? `<div class="post-card-image-wrap"><img src="${esc(post.image_url)}" alt="Post by @${esc(post.username)}" class="post-card-image" loading="lazy" /></div>`
    : ''

  const featuredBadge = post.is_featured
    ? `<span class="post-featured-badge" aria-label="Featured post">★ Featured</span>`
    : ''

  return `
    <article class="post-card${post.is_featured ? ' post-card--featured' : ''}" role="article" aria-label="Post by @${esc(post.username)}">
      ${featuredBadge}
      <div class="post-card-head">
        <div class="post-card-avatar" style="${style}" aria-hidden="true">${avatarInner}</div>
        <div class="post-card-meta">
          <p class="post-card-name">${esc(name)}</p>
          <p class="post-card-handle">@${esc(post.username)}<span class="post-card-dot" aria-hidden="true"> · </span><time datetime="${esc(post.created_at)}">${time}</time></p>
        </div>
        <span class="creator-tag ${catClass} post-category-tag">${esc(catLbl)}</span>
      </div>
      <p class="post-card-text">${esc(post.post_text)}</p>
      ${image}
    </article>`
}

function renderPostsEmpty() {
  return `
    <div class="post-empty-state" role="status">
      <p class="post-empty-icon" aria-hidden="true">📭</p>
      <p class="post-empty-title">No posts yet.</p>
      <p class="post-empty-sub">The board opens up once posts get approved. Check back soon.</p>
    </div>`
}


// ────────────────────────────────────────────────────────────────────
// CREATOR GRID — connect live profiles to #creator-board-container
// ────────────────────────────────────────────────────────────────────
async function initCreatorGrid() {
  const container = document.getElementById('creator-board-container')
  if (!container) return

  if (!SUPABASE_READY) return  // keep static DOM untouched

  const { data: profiles, error } = await getNetworkCreators(24)

  if (error || !profiles || profiles.length === 0) {
    console.warn('[FAS] Creator grid: using static fallback.')
    return  // keep static DOM untouched
  }

  container.innerHTML = profiles.map(renderBoardCard).join('') + renderOpenSlotCard()
  container.removeAttribute('data-static')

  // Update member count stat if present
  const countEl = document.getElementById('stat-member-count')
  if (countEl && profiles.length > 0) {
    countEl.textContent = profiles.length
  }
}


// ────────────────────────────────────────────────────────────────────
// POSTS FEED — populate #board-posts-container
// ────────────────────────────────────────────────────────────────────
async function initPostsFeed() {
  const container = document.getElementById('board-posts-container')
  if (!container) return

  if (!SUPABASE_READY) {
    container.innerHTML = renderPostsEmpty()
    return
  }

  container.innerHTML = `<div class="post-loading" role="status" aria-label="Loading posts"><span></span><span></span><span></span></div>`

  const { data: posts, error } = await getBoardPosts({ limit: 20 })

  if (error || !posts || posts.length === 0) {
    container.innerHTML = renderPostsEmpty()
    return
  }

  container.innerHTML = posts.map(renderPostCard).join('')
}


// ────────────────────────────────────────────────────────────────────
// POST SUBMIT FORM — #fas-board-post-form
// ────────────────────────────────────────────────────────────────────
function initPostForm() {
  const form      = document.getElementById('fas-board-post-form')
  const feedback  = document.getElementById('post-form-feedback')
  const submitBtn = document.getElementById('post-form-submit')
  const charCount = document.getElementById('post-char-count')
  const textarea  = document.getElementById('post-text-input')

  if (!form) return

  // Character counter
  if (textarea && charCount) {
    textarea.addEventListener('input', () => {
      const len = textarea.value.length
      charCount.textContent = `${len} / 500`
      charCount.classList.toggle('post-char--warn', len > 450)
    })
  }

  if (!SUPABASE_READY) {
    showFeedback(feedback, 'warning', 'The post board is not connected yet. Check back soon.')
    if (submitBtn) submitBtn.disabled = true
    return
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    clearFeedback(feedback)

    const usernameInput = form.querySelector('#post-username-input')
    const textInput     = form.querySelector('#post-text-input')
    const catSelect     = form.querySelector('#post-category-select')

    const username = usernameInput?.value?.trim().replace(/^@/, '')
    const postText = textInput?.value?.trim()
    const category = catSelect?.value || null

    if (!username)               return showFeedback(feedback, 'error', 'Enter your @username.')
    if (!postText)               return showFeedback(feedback, 'error', 'Write something before posting.')
    if (postText.length > 500)   return showFeedback(feedback, 'error', 'Too long — keep it under 500 characters.')

    setSubmitting(submitBtn, true)

    // Step 1 — look up profile by username
    const lookupResult = await lookupProfileByUsername(username)
    const profile = lookupResult.data

    if (!profile) {
      setSubmitting(submitBtn, false)
      const isMemberNotInProfiles = lookupResult.error?.message === 'MEMBER_NOT_IN_PROFILES'
      if (isMemberNotInProfiles) {
        return showFeedback(feedback, 'warning',
          `You're on the platform but your board profile isn't linked yet. Email <a href="mailto:djfacelessanimal@gmail.com">djfacelessanimal@gmail.com</a> to get activated on the board.`)
      }
      return showFeedback(feedback, 'error',
        `No active profile found for @${esc(username)}. Check your username or <a href="start.html">join the platform first →</a>`)
    }

    // Step 2 — insert board post
    const { error: insertErr } = await createBoardPost({
      profile_id: profile.id,
      username:   username.toLowerCase(),
      post_text:  postText,
      category:   category || null,
      image_url:  null,
    })

    setSubmitting(submitBtn, false)

    if (insertErr) {
      return showFeedback(feedback, 'error', 'Something went wrong. Try again in a moment.')
    }

    form.reset()
    if (charCount) charCount.textContent = '0 / 500'
    showFeedback(feedback, 'success',
      'Post submitted. The studio will review and publish it to the board shortly.')
  })
}

function showFeedback(el, type, html) {
  if (!el) return
  el.className = `post-form-feedback post-form-feedback--${type}`
  el.innerHTML = html
  el.removeAttribute('hidden')
}

function clearFeedback(el) {
  if (!el) return
  el.setAttribute('hidden', '')
  el.className = 'post-form-feedback'
  el.innerHTML = ''
}

function setSubmitting(btn, loading) {
  if (!btn) return
  btn.disabled = loading
  btn.textContent = loading ? 'Submitting…' : 'Submit Post'
}


// ────────────────────────────────────────────────────────────────────
// MEMBER GATING — guest banner + post form gate
// ────────────────────────────────────────────────────────────────────
function initMemberGating() {
  const isMember = localStorage.getItem('fas_member') === 'true'

  // ── Guest banner ──────────────────────────────────────────────────
  const banner   = document.getElementById('fas-guest-banner')
  const dismiss  = document.getElementById('fas-guest-banner-dismiss')

  if (!isMember && banner) {
    const dismissed = sessionStorage.getItem('fas_guest_banner_dismissed') === '1'
    if (!dismissed) {
      banner.removeAttribute('hidden')
    }
    if (dismiss) {
      dismiss.addEventListener('click', () => {
        banner.setAttribute('hidden', '')
        sessionStorage.setItem('fas_guest_banner_dismissed', '1')
      })
    }
  }

  // ── Post form gate ────────────────────────────────────────────────
  const formWrap  = document.getElementById('board-post-form-wrap')
  const gateBlock = document.getElementById('board-post-gate-block')

  if (!isMember) {
    if (formWrap)  formWrap.setAttribute('hidden', '')
    if (gateBlock) gateBlock.removeAttribute('hidden')
  }
}


// ────────────────────────────────────────────────────────────────────
// INIT
// ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMemberGating()
  initCreatorGrid()
  initPostsFeed()
  initPostForm()
})
