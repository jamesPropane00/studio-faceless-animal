/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — FREE SIGNUP HANDLER
 *  assets/js/free-signup.js
 *
 *  WHAT THIS FILE DOES:
 *    Handles the full free-plan signup form on start.html.
 *    On submit:
 *      1. Validates required fields (incl. password + confirm)
 *      2. Generates PBKDF2 salt + hash for the password
 *      3. Creates member_accounts row via syncMember() (Supabase upsert)
 *      4. Sets password hash via set_member_password RPC
 *         (fails cleanly — no profile rows written yet if this fails)
 *      5. Optionally uploads a profile image to Supabase Storage
 *      6. INSERTs a row into profiles (plan_type = 'free')
 *      7. INSERTs a row into pages (page_status = 'live')
 *      8. INSERTs a row into submissions (submission_type = 'free_signup')
 *      9. Stores member session in localStorage and shows success state
 *
 *    ATOMICITY STRATEGY:
 *      Auth setup (steps 3–4) happens BEFORE profile/page writes.
 *      If password/auth setup fails, no DB rows are created.
 *      If profile/page creation fails after auth is set, the member
 *      still has a usable account and can be helped manually.
 *
 *    STATIC FALLBACK:
 *      If SUPABASE_READY is false (env vars not set), the form
 *      shows a preview-mode confirmation only.
 *
 *  DEPENDENCIES:
 *    - start.html: form#fas-free-signup-form, #fas-signup-panel,
 *      #fas-signup-success, #fas-free-submit, #fs_password, #fs_confirm_password
 *    - assets/js/supabase-client.js (supabase, SUPABASE_READY)
 *    - assets/js/member-db.js (syncMember)
 *    - assets/js/services/submissions.js (uploadProfileImage)
 * ============================================================
 */

import { supabase, SUPABASE_READY } from './supabase-client.js'
import { syncMember }               from './member-db.js'
import { uploadProfileImage }       from './services/submissions.js'
import { generateRecoveryCode, cleanRecoveryCode, hashRecoveryCode } from './auth.js'


/* ── PBKDF2 constants (must match auth.js) ───────────────────── */
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_HASH       = 'SHA-256'
const PBKDF2_BITS       = 256
const SALT_BYTES        = 16
const SIGNAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


/* ── REQUIRED FIELDS ─────────────────────────────────────────── */
const REQUIRED = ['display_name', 'username', 'password', 'confirm_password', 'category', 'bio', 'recovery_ack']


/* ── CATEGORY → PAGE TYPE MAP ────────────────────────────────── */
const PAGE_TYPE_MAP = {
  dj:           'creator',
  artist:       'creator',
  producer:     'creator',
  gamer:        'creator',
  visual_artist:'creator',
  photographer: 'creator',
  writer:       'creator',
  collective:   'business',
  business:     'business',
  other:        'creator',
}


/* ── CRYPTO HELPERS ──────────────────────────────────────────── */

function generateSalt() {
  const bytes = new Uint8Array(SALT_BYTES)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

async function hashPassword(password, saltBase64) {
  const encoder   = new TextEncoder()
  const saltBytes = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0))

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    keyMaterial,
    PBKDF2_BITS
  )

  return btoa(String.fromCharCode(...new Uint8Array(bits)))
}


/* ── GENERATE CLIENT UUID ─────────────────────────────────────
 *  Generated client-side so we can pass IDs to multiple table
 *  inserts without a SELECT-after-INSERT round-trip.
 */
function clientUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function generateSignalCode() {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  let out = 'SIG-'
  for (let i = 0; i < 4; i++) out += SIGNAL_CODE_ALPHABET[bytes[i] % SIGNAL_CODE_ALPHABET.length]
  out += '-'
  for (let i = 4; i < 8; i++) out += SIGNAL_CODE_ALPHABET[bytes[i] % SIGNAL_CODE_ALPHABET.length]
  return out
}


/* ── INIT ──────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const form      = document.getElementById('fas-free-signup-form')
  const submitBtn = document.getElementById('fas-free-submit')

  if (!form || !submitBtn) return

  watchRequiredFields(form, submitBtn)
  watchUsernameField(form)
  watchImageTabs(form)

  form.addEventListener('submit', e => handleSubmit(e, form, submitBtn))
})


/* ── FIELD WATCHER: enable submit when required fields filled ── */
function watchRequiredFields(form, btn) {
  const allInputs = form.querySelectorAll('input, textarea, select')
  allInputs.forEach(el => {
    el.addEventListener('input',  () => updateSubmitState(form, btn))
    el.addEventListener('change', () => updateSubmitState(form, btn))
  })
  updateSubmitState(form, btn)
}

function updateSubmitState(form, btn) {
  const data = collectData(form)
  const hasRequired = REQUIRED.every(key => {
    const val = data[key]
    return val && String(val).trim().length > 0
  })
  btn.disabled = !hasRequired
  btn.setAttribute('aria-disabled', String(!hasRequired))
}


/* ── USERNAME FIELD: lowercase + sanitize live ──────────────── */
function watchUsernameField(form) {
  const input = form.querySelector('[name="username"]')
  if (!input) return
  input.addEventListener('input', () => {
    const clean = input.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')
    if (input.value !== clean) input.value = clean
    const preview = form.querySelector('#username-url-preview')
    if (preview) preview.textContent = clean || 'yourname'
  })
}


/* ── IMAGE TAB TOGGLE ───────────────────────────────────────── */
function watchImageTabs(form) {
  const tabs     = form.querySelectorAll('.img-tab-btn')
  const urlPane  = form.querySelector('#img-pane-url')
  const filePane = form.querySelector('#img-pane-file')
  if (!tabs.length || !urlPane || !filePane) return

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false') })
      tab.classList.add('is-active')
      tab.setAttribute('aria-selected', 'true')
      const target   = tab.dataset.tab
      urlPane.hidden  = target !== 'url'
      filePane.hidden = target !== 'file'
    })
  })
}


/* ── MAIN SUBMIT HANDLER ─────────────────────────────────────── */
async function handleSubmit(e, form, btn) {
  e.preventDefault()
  clearErrors(form)

  const data = collectData(form)
  const err  = validate(data)
  if (err) { showError(form, err); return }

  setLoading(btn, true)

  /* ── STATIC FALLBACK (no Supabase env vars) ─────────────────
   *  Show the confirmation screen in preview mode.
   */
  if (!SUPABASE_READY) {
    await delay(400)
    showSuccess({ username: data.username, display_name: data.display_name, category: data.category, isStatic: true })
    return
  }

  /* ── LIVE SUPABASE FLOW ──────────────────────────────────── */
  try {

    /* ── STEP 1: Hash password (client-side PBKDF2) ────────── */
    let salt, hash
    try {
      salt = generateSalt()
      hash = await hashPassword(data.password, salt)
    } catch (cryptoErr) {
      setLoading(btn, false)
      showError(form, 'Password hashing failed. Your browser may not support Web Crypto. Try a modern browser.')
      return
    }

    let recoveryCode = String(data.recovery_code || '').trim()
    if (!recoveryCode) recoveryCode = generateRecoveryCode()
    const recoveryNormalized = cleanRecoveryCode(recoveryCode)
    if (recoveryNormalized.length < 8) {
      setLoading(btn, false)
      showError(form, 'Recovery code is too short. Use at least 8 characters.')
      return
    }

    let recoveryHash
    try {
      recoveryHash = await hashRecoveryCode(recoveryNormalized)
    } catch (recoveryErr) {
      setLoading(btn, false)
      showError(form, 'Could not process recovery code. Please try again.')
      return
    }

    /* ── STEP 2: Confirm username is not already claimed ─────────
     *  We query member_accounts BEFORE calling syncMember so we
     *  never overwrite an existing account's fields.
     *  Also check profiles to catch legacy pre-auth signups.
     */
    const [memberCheck, profileCheck] = await Promise.all([
      supabase
        .from('member_accounts')
        .select('username')
        .eq('username', data.username)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('username')
        .eq('username', data.username)
        .maybeSingle(),
    ])

    if (memberCheck.data || profileCheck.data) {
      setLoading(btn, false)
      showError(form, 'That username is already taken. Try a different handle — add your city, a number, or an underscore.')
      return
    }

    /* ── STEP 3: Create member_accounts row (INSERT — username confirmed free) ─
     *  syncMember uses upsert but since we've verified the username
     *  doesn't exist, this acts as a clean INSERT.
     *  This happens BEFORE profile/page creation so auth setup
     *  can fail cleanly with no orphaned rows.
     */
    const synced = await syncMember(data.username, data.display_name)
    if (!synced) {
      setLoading(btn, false)
      showError(form, 'Could not create your account. Please try again.')
      return
    }

    let platformId = ''
    let identitySaved = false
    for (let i = 0; i < 5; i++) {
      platformId = generateSignalCode()
      const { error: identityErr } = await supabase
        .from('member_accounts')
        .update({
          platform_id: platformId,
          recovery_code_hash: recoveryHash,
          recovery_code_set_at: new Date().toISOString(),
        })
        .eq('username', data.username)

      if (!identityErr) {
        identitySaved = true
        break
      }

      if (identityErr.code !== '23505') {
        setLoading(btn, false)
        showError(form, 'Anonymous identity columns are missing. Run migration 019 and try again.')
        return
      }
    }

    if (!identitySaved) {
      setLoading(btn, false)
      showError(form, 'Could not allocate a Signal ID. Please try again.')
      return
    }

    const { data: identityRow } = await supabase
      .from('member_accounts')
      .select('platform_id')
      .eq('username', data.username)
      .maybeSingle()

    if (identityRow && identityRow.platform_id) {
      platformId = String(identityRow.platform_id).toUpperCase()
    }

    /* ── STEP 4: Set password hash via RPC ─────────────────── */
    const { data: pwOk, error: pwErr } = await supabase
      .rpc('set_member_password', { p_username: data.username, p_hash: hash, p_salt: salt })

    if (pwErr) {
      setLoading(btn, false)
      console.error('[FAS] set_member_password error:', pwErr)
      showError(form, 'Account was created but password setup failed. Please try again.')
      return
    }

    if (!pwOk) {
      // Password already set — username/account already exists with a password
      setLoading(btn, false)
      showError(form, 'That username already has an account with a password. Try logging in at login.html, or choose a different handle.')
      return
    }

    /* ── STEP 5: Optional image upload ─────────────────────── */
    let avatarUrl = data.avatar_url_text || null
    if (data.profile_image_file) {
      const { url, error: uploadErr } = await uploadProfileImage(
        data.username,
        data.profile_image_file
      )
      if (!uploadErr && url) avatarUrl = url
    }

    /* ── STEP 6: INSERT into profiles ──────────────────────── */
    const profileId = clientUUID()
    const pageId    = clientUUID()

    const profilePayload = {
      id:           profileId,
      username:     data.username,
      display_name: data.display_name,
      bio:          data.bio || null,
      avatar_url:   avatarUrl,
      category:     data.category,
      links_json:   buildLinksJson(data),
      plan_type:    'free',
      is_active:    true,
      is_featured:  false,
      slug:         data.username,
    }

    if (data.city)  profilePayload.city  = data.city
    if (data.state) profilePayload.state = data.state

    const { error: profileInsertErr } = await supabase
      .from('profiles')
      .insert([profilePayload])

    if (profileInsertErr) {
      setLoading(btn, false)
      if (profileInsertErr.code === '23505') {
        if (profileInsertErr.message.includes('username')) {
          // Auth account was created but profile already exists — still a success path
          // Log in the user and show success
          console.warn('[FAS] profile already exists for username, treating as success')
          storeSession({ username: data.username, display_name: data.display_name, hash, platform_id: platformId })
          showSuccess({ username: data.username, display_name: data.display_name, category: data.category, recoveryCode, platformId })
          return
        } else {
          showError(form, 'A duplicate was detected. Check your username, then try again.')
        }
      } else {
        console.error('[FAS] profiles insert error:', profileInsertErr)
        showError(form, 'Your account was created but the profile page could not be saved. Your login is active.')
      }
      return
    }

    /* ── STEP 7: INSERT into pages ─────────────────────────── */
    const pagePayload = {
      id:            pageId,
      profile_id:    profileId,
      page_type:     PAGE_TYPE_MAP[data.category] || 'creator',
      template_name: data.template_name || 'dark-minimal',
      page_status:   'live',
      page_slug:     data.username,
      title:         data.display_name,
      upgrade_status:'none',
    }

    const { error: pageInsertErr } = await supabase
      .from('pages')
      .insert([pagePayload])

    if (pageInsertErr) {
      console.error('[FAS] pages insert error:', pageInsertErr)
      // Non-fatal: profile + auth created. User can log in; admin can create the page.
      storeSession({ username: data.username, display_name: data.display_name, hash, platform_id: platformId })
      showSuccess({ username: data.username, display_name: data.display_name, category: data.category, noPage: true, recoveryCode, platformId })
      return
    }

    /* ── STEP 7b: Sync page linkage to member_accounts ─────────
     *  Dashboard reads page_slug + page_status from member_accounts
     *  to show the "View My Page" button. Update it now so the
     *  dashboard works immediately after signup.
     */
    await supabase
      .from('member_accounts')
      .update({ page_slug: data.username, page_status: 'live' })
      .eq('username', data.username)

    /* ── STEP 8: INSERT into submissions (non-fatal) ────────── */
    const submissionPayload = {
      profile_id:        profileId,
      page_id:           pageId,
      submission_type:   'free_signup',
      display_name:      data.display_name,
      username:          data.username,
      bio:               data.bio || null,
      links_json:        buildLinksJson(data),
      image_url:         avatarUrl,
      selected_plan:     'free',
      selected_template: data.template_name || 'dark-minimal',
      status:            'submitted',
    }

    const { error: subErr } = await supabase
      .from('submissions')
      .insert([submissionPayload])

    if (subErr) {
      console.warn('[FAS] submissions insert warning (non-fatal):', subErr)
    }

    /* ── STEP 9: Store session + show success ──────────────── */
    storeSession({ username: data.username, display_name: data.display_name, hash, platform_id: platformId })
    showSuccess({ username: data.username, display_name: data.display_name, category: data.category, recoveryCode, platformId })

  } catch (caught) {
    console.error('[FAS] Unexpected free signup error:', caught)
    setLoading(btn, false)
    showError(form, 'An unexpected error occurred. Please try again.')
  }
}


/* ── SESSION STORAGE ─────────────────────────────────────────── */
function storeSession({ username, display_name, hash, platform_id }) {
  try {
    localStorage.setItem('fas_member', 'true')
    localStorage.setItem('fas_user', JSON.stringify({
      username,
      display: display_name,
      platform_id: platform_id || '',
      plan:    'free',
      status:  'free',
      ts:      Date.now(),
      ph:      hash || '',
    }))
  } catch (ignore) {}
}


/* ── DATA COLLECTION ─────────────────────────────────────────── */
function collectData(form) {
  const fd   = new FormData(form)
  const data = {}
  fd.forEach((val, key) => {
    if (key === 'profile_image') {
      if (val instanceof File && val.size > 0) data.profile_image_file = val
    } else {
      data[key] = typeof val === 'string' ? val.trim() : val
    }
  })

  if (data.username) {
    data.username = data.username.toLowerCase().replace(/[^a-z0-9_-]/g, '')
  }

  // category from radio
  const categoryEl = form.querySelector('[name="category"]:checked')
  if (categoryEl) data.category = categoryEl.value

  // template from radio
  const templateEl = form.querySelector('[name="template_name"]:checked')
  if (templateEl) data.template_name = templateEl.value

  // avatar URL from text input
  const avatarUrl = form.querySelector('[name="avatar_url_text"]')
  if (avatarUrl) data.avatar_url_text = avatarUrl.value.trim() || null

  // passwords (preserve original value without trim for security)
  const pwEl  = form.querySelector('[name="password"]')
  const cpwEl = form.querySelector('[name="confirm_password"]')
  if (pwEl)  data.password         = pwEl.value
  if (cpwEl) data.confirm_password = cpwEl.value

  return data
}


/* ── LINKS JSON BUILDER ──────────────────────────────────────── */
function buildLinksJson(data) {
  const platforms = [
    { key: 'link_spotify',    platform: 'spotify'    },
    { key: 'link_youtube',    platform: 'youtube'    },
    { key: 'link_instagram',  platform: 'instagram'  },
    { key: 'link_tiktok',     platform: 'tiktok'     },
    { key: 'link_soundcloud', platform: 'soundcloud' },
    { key: 'link_website',    platform: 'website'    },
    { key: 'link_other',      platform: 'other'      },
  ]

  // Return as flat object {platform: url} — consistent with dashboard save format
  const obj = {}
  for (const p of platforms) {
    const url = data[p.key] ? String(data[p.key]).trim() : ''
    if (url) obj[p.platform] = normalizeUrl(url)
  }
  return obj
}

function normalizeUrl(url) {
  if (!url) return url
  if (/^https?:\/\//i.test(url)) return url
  return 'https://' + url
}


/* ── VALIDATION ───────────────────────────────────────────────── */
function validate(data) {
  if (!data.display_name || data.display_name.length < 1) {
    return 'Enter your name or artist handle.'
  }

  if (!data.username || data.username.length < 3) {
    return 'Enter a username — at least 3 characters. Letters, numbers, underscores, and hyphens only.'
  }

  if (data.username.length > 40) {
    return 'Username must be 40 characters or fewer.'
  }

  if (!/^[a-z0-9_-]+$/.test(data.username)) {
    return 'Username can only contain lowercase letters, numbers, hyphens, and underscores.'
  }

  if (!data.password || data.password.length < 8) {
    return 'Password must be at least 8 characters.'
  }

  if (data.password.length > 128) {
    return 'Password is too long (max 128 characters).'
  }

  if (data.password !== data.confirm_password) {
    return 'Passwords do not match. Re-enter your password in both fields.'
  }

  if (!data.recovery_ack) {
    return 'You must confirm the recovery-code warning to continue.'
  }

  if (!data.category) {
    return 'Select a creator type.'
  }

  if (!data.bio || data.bio.length < 10) {
    return 'Write a short bio — at least 10 characters.'
  }

  if (data.bio.length > 500) {
    return 'Bio must be 500 characters or fewer.'
  }

  return null
}


/* ── CATEGORY → ROUTE PREFIX ─────────────────────────────────── */
function categoryToRoutePrefix(category) {
  const dj  = ['dj', 'producer', 'artist']
  const biz = ['business', 'collective']
  if (dj.includes(category))  return '/artist/'
  if (biz.includes(category)) return '/business/'
  return '/creator/'
}


/* ── SUCCESS STATE ───────────────────────────────────────────── */
function showSuccess({ username, display_name, category, isStatic = false, noPage = false, recoveryCode = '', platformId = '' }) {
  const panel   = document.getElementById('fas-signup-panel')
  const success = document.getElementById('fas-signup-success')

  if (!success) return

  const nameEl     = success.querySelector('.success-display-name')
  const handleEl   = success.querySelector('.success-handle')
  const urlEl      = success.querySelector('.success-page-url')
  const noteEl     = success.querySelector('.success-static-note')
  const redirectEl = success.querySelector('.success-redirect-note')
  const recoveryEl = document.getElementById('fs-success-recovery')

  const prefix  = categoryToRoutePrefix(category)
  const pageUrl = prefix + username
  const params = new URLSearchParams(window.location.search)
  const hasDraft = !!readDraftPayload()
  const wantsPostReturn = String(params.get('intent') || '').toLowerCase() === 'post' && hasDraft
  const postReturnUrl = 'network.html?intent=post'

  if (nameEl)   nameEl.textContent = display_name || 'Creator'
  if (handleEl) handleEl.textContent = '@' + username
  if (urlEl)    urlEl.textContent = 'facelessanimalstudios.com' + pageUrl
  if (noteEl)   noteEl.hidden = !isStatic
  if (recoveryEl) {
    if (recoveryCode) {
      const idLine = platformId ? ('Signal ID: ' + platformId + ' · ') : ''
      recoveryEl.textContent = idLine + 'Recovery code: ' + recoveryCode + ' — save this now. It cannot be recovered later.'
      recoveryEl.hidden = false
    } else {
      recoveryEl.hidden = true
      recoveryEl.textContent = ''
    }
  }

  if (panel) panel.hidden = true
  success.hidden = false
  success.setAttribute('tabindex', '-1')
  success.focus()
  success.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // Redirect to the live page after a short delay (skip if noPage or static)
  if (!isStatic && !noPage) {
    let countdown = 2
    if (redirectEl) redirectEl.textContent = `Taking you there in ${countdown}…`

    const tick = setInterval(() => {
      countdown -= 1
      if (redirectEl && countdown > 0) {
        redirectEl.textContent = `Taking you there in ${countdown}…`
      }
      if (countdown <= 0) {
        clearInterval(tick)
        window.location.href = wantsPostReturn ? postReturnUrl : pageUrl
      }
    }, 1000)
  } else if (redirectEl) {
    // noPage: redirect to dashboard instead
    if (noPage && !isStatic) {
      redirectEl.textContent = 'Taking you to your dashboard…'
      setTimeout(() => {
        window.location.href = wantsPostReturn ? postReturnUrl : 'dashboard.html'
      }, 2000)
    } else {
      redirectEl.hidden = true
    }
  }
}

function readDraftPayload() {
  try {
    const raw = localStorage.getItem('signal_draft')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (!String(parsed.text || '').trim()) return null
    return parsed
  } catch (_) {
    return null
  }
}


/* ── UI HELPERS ───────────────────────────────────────────────── */
function setLoading(btn, on) {
  btn.disabled = on
  btn.setAttribute('aria-disabled', String(on))
  btn.classList.toggle('is-submitting', on)
  btn.textContent = on ? 'Setting up your account…' : 'Claim My Free Page →'
}

function showError(form, message) {
  clearErrors(form)

  const err = document.createElement('p')
  err.className = 'js-free-form-error'
  err.setAttribute('role', 'alert')
  err.style.cssText = [
    'color:#e07070',
    'background:rgba(200,60,60,0.08)',
    'border:1px solid rgba(200,60,60,0.22)',
    'border-radius:8px',
    'padding:0.75rem 1rem',
    'margin-top:1.25rem',
    'font-size:0.875rem',
    'line-height:1.6',
  ].join(';')
  err.textContent = message

  const submitBtn = form.querySelector('[type="submit"]')
  if (submitBtn) submitBtn.before(err)
  else form.appendChild(err)

  setTimeout(() => err.remove(), 8000)
}

function clearErrors(form) {
  form.querySelectorAll('.js-free-form-error').forEach(el => el.remove())
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
