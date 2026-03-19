/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — INTAKE FORM HANDLER
 *  assets/js/intake-form.js
 *
 *  STATUS: Static mode — no Supabase connection yet.
 *
 *  WHAT THIS FILE DOES NOW:
 *    - Tracks required field completion and enables the submit button
 *    - On submit: validates, shows preview-mode notice, scrolls to email
 *    - Clears all plan-section conditional logic ready for Supabase
 *
 *  WHAT CHANGES WHEN SUPABASE IS READY:
 *    Search for comments marked [SUPABASE CONNECT] — those are the
 *    exact lines to replace. Nothing else needs to change.
 *
 *  DEPENDENCIES:
 *    - assets/js/supabase-config.js (import supabase, SUPABASE_READY)
 *    - start.html: form#fas-intake-form, button#intake-submit,
 *      div#intake-thankyou, div#intake-preview-notice
 * ============================================================
 */


/* ── REQUIRED FIELD MAP ───────────────────────────────────────
 *  Maps to: intake_submissions DB columns marked NOT NULL
 *  These must be filled before submit enables.
 */
const REQUIRED_FIELDS = [
  'plan',          // radio group — plan selection
  'display_name',  // text
  'username',      // text — page slug
  'email',         // email
  'creator_type',  // radio group
  'bio',           // textarea
]


/* ── INIT ON DOM READY ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const form       = document.getElementById('fas-intake-form')
  const submitBtn  = document.getElementById('intake-submit')
  const thankYou   = document.getElementById('intake-thankyou')
  const notice     = document.getElementById('intake-preview-notice')

  if (!form || !submitBtn) return

  // Keep button disabled until required fields are satisfied
  submitBtn.disabled   = true
  submitBtn.ariaDis    = 'true'

  // Watch all required field inputs for changes
  watchRequiredFields(form, submitBtn)

  // Handle form submission
  form.addEventListener('submit', handleSubmit.bind(null, {
    form, submitBtn, thankYou, notice
  }))
})


/* ── FIELD WATCHER ────────────────────────────────────────────
 *  Enables the submit button only when all required fields
 *  have a non-empty value. Fires on input, change, and blur.
 */
function watchRequiredFields(form, submitBtn) {
  const inputs = form.querySelectorAll('input, textarea, select')

  inputs.forEach(input => {
    input.addEventListener('input',  () => checkCompletion(form, submitBtn))
    input.addEventListener('change', () => checkCompletion(form, submitBtn))
  })

  checkCompletion(form, submitBtn)
}

function checkCompletion(form, submitBtn) {
  const allFilled = REQUIRED_FIELDS.every(name => {
    const els = form.querySelectorAll(`[name="${name}"]`)
    if (!els.length) return false

    // Radio groups
    if (els[0].type === 'radio') {
      return Array.from(els).some(el => el.checked)
    }

    return els[0].value.trim().length > 0
  })

  submitBtn.disabled        = !allFilled
  submitBtn.setAttribute('aria-disabled', String(!allFilled))
}


/* ── SUBMIT HANDLER ───────────────────────────────────────────
 *  Currently: collects form data, validates, shows preview notice.
 *  [SUPABASE CONNECT]: Replace the "preview mode" block below
 *  with a real Supabase insert.
 */
async function handleSubmit({ form, submitBtn, thankYou, notice }, e) {
  e.preventDefault()

  // Collect all form data
  const data = collectFormData(form)

  // Client-side validation
  const error = validateFormData(data)
  if (error) {
    showFieldError(form, error.field, error.message)
    return
  }

  // Show loading state
  setSubmitting(submitBtn, true)

  /* ── [SUPABASE CONNECT] ─────────────────────────────────────
   *  When Supabase is ready, replace this entire block with:
   *
   *  import { supabase, SUPABASE_READY } from './supabase-config.js'
   *
   *  if (SUPABASE_READY) {
   *    // Handle profile image upload first if one was selected
   *    const imageFile = form.querySelector('#profile_image').files[0]
   *    if (imageFile) {
   *      const { data: imgData, error: imgError } = await supabase
   *        .storage
   *        .from('profile-images')
   *        .upload(`${data.username}/${imageFile.name}`, imageFile)
   *
   *      if (!imgError) {
   *        data.profile_image_url = supabase.storage
   *          .from('profile-images')
   *          .getPublicUrl(imgData.path).data.publicUrl
   *      }
   *    }
   *
   *    // Insert the intake submission
   *    const { error: insertError } = await supabase
   *      .from('intake_submissions')       // table: intake_submissions
   *      .insert([data])
   *
   *    if (insertError) {
   *      setSubmitting(submitBtn, false)
   *      showGlobalError('Something went wrong. Please try again or email us directly.')
   *      console.error('[FAS] Supabase insert error:', insertError)
   *      return
   *    }
   *
   *    // Success: show thank you state
   *    form.style.display = 'none'
   *    if (thankYou) thankYou.style.display = 'block'
   *    thankYou.scrollIntoView({ behavior: 'smooth', block: 'center' })
   *    return
   *  }
   *
   * ── END [SUPABASE CONNECT] ─────────────────────────────── */

  // PREVIEW MODE: no data saved — redirect to thank you page with form data as params
  // The thank you page shows a preview notice explaining the static state.
  //
  // [SUPABASE CONNECT] — When backend is connected, this entire block is
  // replaced by the Supabase insert block above. The redirect will still
  // happen but with a real submission token: thankyou.html?token=...
  // The thank you page will fetch the row and hide the preview notice.

  const params = new URLSearchParams()
  if (data.display_name) params.set('name', data.display_name)
  if (data.plan)         params.set('plan', data.plan)
  if (data.username)     params.set('username', data.username)

  // Small delay so the button loading state is visible briefly (UX feedback)
  setTimeout(function() {
    window.location.href = 'thankyou.html?' + params.toString()
  }, 600)
}


/* ── COLLECT FORM DATA ────────────────────────────────────────
 *  Serializes the entire form into a flat object.
 *  Field names match the intake_submissions table columns exactly.
 */
function collectFormData(form) {
  const fd = new FormData(form)
  const data = {}

  fd.forEach((value, key) => {
    data[key] = value.trim()
  })

  // Normalize username: lowercase, strip special chars
  if (data.username) {
    data.username = data.username.toLowerCase().replace(/[^a-z0-9_-]/g, '')
  }

  return data
}


/* ── VALIDATE FORM DATA ───────────────────────────────────────
 *  Returns { field, message } on error, or null if valid.
 *  [SUPABASE CONNECT]: keep this validation — it runs before insert.
 */
function validateFormData(data) {
  if (!data.plan) {
    return { field: 'plan', message: 'Please select a plan before submitting.' }
  }

  if (!data.display_name || data.display_name.length < 2) {
    return { field: 'display_name', message: 'Enter a display name of at least 2 characters.' }
  }

  if (!data.username || data.username.length < 2) {
    return { field: 'username', message: 'Enter a page username — letters, numbers, dashes only.' }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!data.email || !emailRegex.test(data.email)) {
    return { field: 'email', message: 'Enter a valid email address.' }
  }

  if (!data.creator_type) {
    return { field: 'creator_type', message: 'Select a creator type to continue.' }
  }

  if (!data.bio || data.bio.length < 10) {
    return { field: 'bio', message: 'Write at least a short bio — 10 characters minimum.' }
  }

  return null
}


/* ── UI HELPERS ───────────────────────────────────────────────*/
function setSubmitting(btn, isSubmitting) {
  btn.disabled = isSubmitting
  btn.setAttribute('aria-disabled', String(isSubmitting))
  btn.classList.toggle('is-submitting', isSubmitting)
}

function showFieldError(form, fieldName, message) {
  // Find the field and scroll to it
  const field = form.querySelector(`[name="${fieldName}"]`)
    || form.querySelector(`#${fieldName}`)
  if (field) {
    field.scrollIntoView({ behavior: 'smooth', block: 'center' })
    field.focus()
  }

  // Show a temporary error message (reuse existing form-note pattern)
  const existing = form.querySelector('.js-field-error')
  if (existing) existing.remove()

  const err = document.createElement('p')
  err.className = 'form-note js-field-error'
  err.style.cssText = 'color:#e07070;background:rgba(200,60,60,0.08);border:1px solid rgba(200,60,60,0.2);border-radius:6px;padding:0.65rem 0.9rem;margin-top:1rem;'
  err.textContent = message

  if (field) {
    field.closest('.form-group')?.appendChild(err)
    setTimeout(() => err.remove(), 5000)
  }
}

function showGlobalError(message) {
  const err = document.createElement('div')
  err.style.cssText = 'background:rgba(200,60,60,0.12);border:1px solid rgba(200,60,60,0.3);border-radius:8px;padding:1rem 1.25rem;margin-bottom:1.5rem;color:#e07070;font-size:0.88rem;'
  err.textContent = message

  const form = document.getElementById('fas-intake-form')
  if (form) form.prepend(err)
}
