/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — PAID INTAKE HANDLER
 *  assets/js/paid-intake.js
 *
 *  WHAT THIS FILE DOES:
 *    Handles the full paid intake form on paid.html.
 *    On submit:
 *      1. Validates required fields
 *      2. Optionally uploads a profile image to Supabase Storage
 *      3. INSERTs a row into profiles (plan_type = selected plan)
 *         — handles duplicate username/email gracefully
 *      4. INSERTs a row into pages (page_status = 'draft')
 *      5. INSERTs a row into submissions
 *         (submission_type = 'paid_intake', status = 'submitted')
 *      6. Shows inline success state with page URL and plan
 *
 *  PAYMENT VERIFICATION HOOK:
 *    The submission row includes:
 *      payment_ref  — user-supplied reference (Cash App, order ID, etc.)
 *      payment_verified — always false on submit; set to true manually
 *        or programmatically when payment is confirmed
 *    When a payment processor is connected, check payment_verified
 *    before building the page. The field is in the submissions table.
 *
 *  STATIC FALLBACK:
 *    If SUPABASE_READY is false (env vars not set), shows a
 *    "We'll reach out" confirmation without saving to DB.
 *
 *  DEPENDENCIES:
 *    - paid.html: form#fas-paid-intake-form, #paid-intake-panel,
 *      #paid-intake-success, #paid-intake-submit, #paid-form-error
 *    - assets/js/supabase-client.js (supabase, SUPABASE_READY)
 *    - assets/js/services/submissions.js (uploadProfileImage)
 *
 *  SCHEMA:
 *    supabase/migrations/001_initial_schema.sql
 *    supabase/migrations/002_free_signup_policies.sql
 *    supabase/migrations/003_schema_patch.sql
 * ============================================================
 */

import { supabase, SUPABASE_READY } from './supabase-client.js'
import { uploadProfileImage }       from './services/submissions.js'


/* ── CONSTANTS ───────────────────────────────────────────────── */

const REQUIRED = ['selected_plan', 'display_name', 'username', 'email', 'category', 'bio']

const PAGE_TYPE_MAP = {
  dj:           'creator',
  artist:       'creator',
  producer:     'creator',
  gamer:        'creator',
  visual_artist:'creator',
  photographer: 'creator',
  writer:       'creator',
  collective:   'creator',
  business:     'business',
  other:        'creator',
}

const PLAN_LABELS = {
  starter: 'Starter Package — $30',
  pro:     'Pro Package — $55',
  premium: 'Premium Package — $105',
}


/* ── CLIENT UUID ─────────────────────────────────────────────── */
function clientUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}


/* ── DELAY ───────────────────────────────────────────────────── */
const delay = ms => new Promise(r => setTimeout(r, ms))


/* ── INIT ────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const form    = document.getElementById('fas-paid-intake-form')
  const btn     = document.getElementById('paid-intake-submit')
  const panel   = document.getElementById('paid-intake-panel')
  const success = document.getElementById('paid-intake-success')

  if (!form || !btn) return

  // Pre-select plan from URL param: paid.html?plan=starter|pro|premium
  preselectPlan(form)

  // Wire image tab switcher
  initImageTabs(form)

  // Enable submit only when required fields are filled
  watchRequired(form, btn)

  // Submit
  form.addEventListener('submit', e => handleSubmit(e, form, btn, panel, success))
})


/* ── PLAN PRESELECT FROM URL ─────────────────────────────────── */
function preselectPlan(form) {
  const params = new URLSearchParams(window.location.search)
  const plan   = (params.get('plan') || '').toLowerCase().trim()
  if (!plan) return

  const radio = form.querySelector(`input[name="selected_plan"][value="${plan}"]`)
  if (radio) {
    radio.checked = true
    radio.dispatchEvent(new Event('change', { bubbles: true }))
  }
}


/* ── IMAGE TAB SWITCHER ──────────────────────────────────────── */
function initImageTabs(form) {
  const tabs = form.querySelectorAll('.img-tab')
  const panels = {
    upload: form.querySelector('#img-panel-upload'),
    url:    form.querySelector('#img-panel-url'),
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab
      tabs.forEach(t => {
        t.classList.toggle('img-tab--active', t === tab)
        t.setAttribute('aria-selected', String(t === tab))
      })
      Object.keys(panels).forEach(k => {
        if (panels[k]) panels[k].style.display = k === target ? '' : 'none'
      })
    })
  })
}


/* ── REQUIRED FIELD WATCHER ──────────────────────────────────── */
function watchRequired(form, btn) {
  const inputs = form.querySelectorAll('input, textarea, select')
  inputs.forEach(input => {
    input.addEventListener('input',  () => checkCompletion(form, btn))
    input.addEventListener('change', () => checkCompletion(form, btn))
  })
  checkCompletion(form, btn)
}

function checkCompletion(form, btn) {
  const allFilled = REQUIRED.every(name => {
    const els = form.querySelectorAll(`[name="${name}"]`)
    if (!els.length) return false
    if (els[0].type === 'radio') return Array.from(els).some(el => el.checked)
    return els[0].value.trim().length > 0
  })
  btn.disabled = !allFilled
  btn.setAttribute('aria-disabled', String(!allFilled))
}


/* ── COLLECT DATA ────────────────────────────────────────────── */
function collectData(form) {
  const fd   = new FormData(form)
  const data = {}
  fd.forEach((v, k) => { data[k] = typeof v === 'string' ? v.trim() : v })

  // Normalize username
  if (data.username) {
    data.username = data.username.toLowerCase().replace(/[^a-z0-9_-]/g, '')
  }

  // Grab file separately (FormData strips File objects with trim)
  const fileInput = form.querySelector('#profile_image_file')
  if (fileInput && fileInput.files && fileInput.files[0]) {
    data.profile_image_file = fileInput.files[0]
  }

  return data
}


/* ── BUILD LINKS JSON ────────────────────────────────────────── */
function buildLinksJson(data) {
  const platforms = ['spotify','youtube','instagram','tiktok','soundcloud','bandcamp','twitch','website','other']
  return platforms
    .filter(p => data[`link_${p}`])
    .map(p => ({ platform: p, label: p.charAt(0).toUpperCase() + p.slice(1), url: data[`link_${p}`] }))
}


/* ── VALIDATION ──────────────────────────────────────────────── */
function validate(data) {
  if (!data.selected_plan) return 'Select the plan you paid for.'
  if (!data.display_name || data.display_name.length < 2) return 'Enter a display name of at least 2 characters.'
  if (!data.username || data.username.length < 2) return 'Enter a page slug — letters, numbers, dashes only.'

  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!data.email || !emailRx.test(data.email)) return 'Enter a valid email address.'

  if (!data.category) return 'Select a creator type.'
  if (!data.bio || data.bio.length < 10) return 'Write at least a short bio — 10 characters minimum.'

  return null
}


/* ── UI HELPERS ──────────────────────────────────────────────── */
function setLoading(btn, loading) {
  btn.disabled = loading
  btn.setAttribute('aria-disabled', String(loading))
  btn.classList.toggle('is-submitting', loading)
  btn.textContent = loading ? 'Submitting…' : 'Submit My Details'
}

function showError(msg) {
  const el = document.getElementById('paid-form-error')
  if (!el) return
  el.textContent = msg
  el.style.display = 'block'
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  setTimeout(() => { el.style.display = 'none' }, 8000)
}

function categoryToRoutePrefix(category) {
  const dj = ['dj', 'producer', 'artist']
  const biz = ['business', 'collective']
  if (dj.includes(category))  return '/artist/'
  if (biz.includes(category)) return '/business/'
  return '/creator/'
}

function showSuccess({ username, display_name, selected_plan, category, isStatic }) {
  const panel   = document.getElementById('paid-intake-panel')
  const success = document.getElementById('paid-intake-success')
  if (panel)   panel.style.display   = 'none'
  if (!success) return
  success.style.display = ''

  const slugEl  = document.getElementById('paid-success-slug')
  const planEl  = document.getElementById('paid-success-plan')
  const emailEl = document.getElementById('paid-success-email')

  if (slugEl)  slugEl.textContent  = 'facelessanimalstudios.com' + categoryToRoutePrefix(category) + username
  if (planEl)  planEl.textContent  = PLAN_LABELS[selected_plan] || selected_plan
  if (emailEl) {
    const form = document.getElementById('fas-paid-intake-form')
    const emailInput = form && form.querySelector('[name="email"]')
    emailEl.textContent = emailInput ? emailInput.value : '—'
  }

  if (isStatic) {
    const staticNote = document.createElement('p')
    staticNote.className = 'success-static-note'
    staticNote.textContent = 'Your details were not saved to our system yet — the backend is not connected in this environment. Email djfacelessanimal@gmail.com with your info and we\'ll set you up manually.'
    success.insertBefore(staticNote, success.querySelector('.paid-success-next'))
  }

  success.scrollIntoView({ behavior: 'smooth', block: 'start' })
}


/* ── MAIN SUBMIT HANDLER ─────────────────────────────────────── */
async function handleSubmit(e, form, btn) {
  e.preventDefault()

  const el = document.getElementById('paid-form-error')
  if (el) el.style.display = 'none'

  const data = collectData(form)
  const err  = validate(data)
  if (err) { showError(err); return }

  setLoading(btn, true)

  /* ── STATIC FALLBACK ──────────────────────────────────────────
   *  No Supabase env vars set — show confirmation without saving.
   */
  if (!SUPABASE_READY) {
    await delay(700)
    showSuccess({
      username:      data.username,
      display_name:  data.display_name,
      selected_plan: data.selected_plan,
      category:      data.category,
      isStatic:      true,
    })
    return
  }

  /* ── LIVE SUPABASE FLOW ───────────────────────────────────────
   *
   *  UUIDs are generated client-side so all 3 INSERTs can run
   *  without a SELECT-after-INSERT. The Supabase anon SELECT RLS
   *  on profiles uses USING(is_active=true) which may not return
   *  freshly inserted rows in the same request cycle.
   */
  try {

    // 1. Optional image upload
    let avatarUrl = data.avatar_url_text || null
    if (data.profile_image_file) {
      const { url, error: uploadErr } = await uploadProfileImage(
        data.username,
        data.profile_image_file
      )
      if (!uploadErr && url) avatarUrl = url
    }

    // 2. INSERT into profiles (client UUID, no SELECT-after-INSERT)
    const profileId = clientUUID()
    const pageId    = clientUUID()

    const profilePayload = {
      id:           profileId,
      username:     data.username,
      display_name: data.display_name,
      email:        data.email,
      bio:          data.bio || null,
      avatar_url:   avatarUrl,
      category:     data.category,
      links_json:   buildLinksJson(data),
      plan_type:    data.selected_plan,
      is_active:    false,   // studio activates after payment is confirmed
      is_featured:  false,
      slug:         data.username,
    }

    const { error: profileInsertErr } = await supabase
      .from('profiles')
      .insert([profilePayload])

    if (profileInsertErr) {
      setLoading(btn, false)
      if (profileInsertErr.code === '23505') {
        if (profileInsertErr.message.includes('username')) {
          showError('That username is already taken. Try a different slug — add your city, a number, or an underscore.')
        } else if (profileInsertErr.message.includes('email')) {
          showError('That email is already registered. If you\'re upgrading an existing account, email djfacelessanimal@gmail.com and we\'ll handle it.')
        } else {
          showError('A duplicate was detected. Check your username and email, then try again.')
        }
      } else {
        console.error('[FAS] paid intake profiles insert error:', profileInsertErr)
        showError('Something went wrong saving your profile. Please try again or email djfacelessanimal@gmail.com.')
      }
      return
    }

    // 3. INSERT into pages (pre-known IDs — no SELECT needed)
    const pagePayload = {
      id:             pageId,
      profile_id:     profileId,
      page_type:      PAGE_TYPE_MAP[data.category] || 'creator',
      template_name:  data.template_name || 'dark-minimal',
      page_status:    'draft',
      page_slug:      data.username,
      title:          data.display_name,
      upgrade_status: 'none',
    }

    const { error: pageInsertErr } = await supabase
      .from('pages')
      .insert([pagePayload])

    if (pageInsertErr) {
      console.error('[FAS] paid intake pages insert error:', pageInsertErr)
      // Non-fatal — profile saved, continue to submission
    }

    // 4. INSERT into submissions
    //
    //    submission_type = 'paid_intake'
    //    status          = 'submitted' (valid in live DB)
    //    payment_verified = false — hook for future payment processor:
    //      when payment is confirmed (manually or via webhook), set
    //      payment_verified = true and begin the build.
    const submissionPayload = {
      profile_id:        profileId,
      page_id:           pageId,
      submission_type:   'paid_intake',
      display_name:      data.display_name,
      username:          data.username,
      bio:               data.bio || null,
      links_json:        buildLinksJson(data),
      image_url:         avatarUrl,
      selected_plan:     data.selected_plan,
      selected_template: data.template_name || null,
      style_notes:       data.style_notes   || null,
      extra_notes:       data.extra_notes   || null,
      custom_domain:     data.custom_domain || null,
      payment_ref:       data.payment_ref   || null,
      payment_verified:  false,
      status:            'submitted',
    }

    const { error: subErr } = await supabase
      .from('submissions')
      .insert([submissionPayload])

    if (subErr) {
      // Non-fatal — profile and page saved, log and continue
      console.warn('[FAS] paid intake submissions insert warning:', subErr)
    }

    // 5. Show success state
    showSuccess({
      username:      data.username,
      display_name:  data.display_name,
      selected_plan: data.selected_plan,
      category:      data.category,
    })

  } catch (caught) {
    console.error('[FAS] Unexpected paid intake error:', caught)
    setLoading(btn, false)
    showError('An unexpected error occurred. Please try again or email djfacelessanimal@gmail.com.')
  }
}
