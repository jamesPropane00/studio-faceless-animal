/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — SUBMISSIONS SERVICE
 *  assets/js/services/submissions.js
 *
 *  Database writes for the `submissions` table.
 *  Storage uploads to the `profile-images` bucket.
 *
 *  STATUS: Stub — SUPABASE_READY must be true for any function to run.
 *
 *  TABLE:
 *    submissions — consolidated intake table for all form types
 *      submission_type: 'free_signup' | 'paid_intake' | 'update_request'
 *
 *  STORAGE:
 *    profile-images — uploaded via the intake form, stored per username
 *    Path pattern:  profile-images/{username}/{filename}
 *    Bucket must be PUBLIC for avatar_url to work as a direct image link.
 *
 *  CONSUMERS:
 *    assets/js/intake-form.js  — submitIntake(), uploadProfileImage()
 *    assets/js/free-signup.js  — submitFreeSignup()
 *    thankyou.html inline script — getSubmissionById()
 *
 *  SCHEMA: supabase/migrations/001_initial_schema.sql
 * ============================================================
 */

import { supabase, SUPABASE_READY } from '../supabase-client.js'


// ── GUARD ─────────────────────────────────────────────────────
function notReady(fn) {
  return { data: null, error: new Error(`[FAS] ${fn}() called but Supabase is not configured.`) }
}


// ── submitFreeSignup(data) ────────────────────────────────────
/**
 * Save a free page early-interest signup to the submissions table.
 * Called by free-signup.js after form validation.
 * submission_type is automatically set to 'free_signup'.
 *
 * @param {object} data
 * @param {string} data.display_name  - artist/creator display name
 * @param {string} data.username      - desired page handle
 * @param {string} data.email         - contact email (stored in profile later)
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 *
 * Supabase query:
 *   supabase
 *     .from('submissions')
 *     .insert([{
 *       submission_type: 'free_signup',
 *       display_name:    data.display_name,
 *       username:        data.username,
 *       selected_plan:   'free',
 *       links_json:      {},
 *     }])
 *     .select('id')
 *     .single()
 *
 * RLS: INSERT allowed for anon (public)
 * After success: redirect to start.html?plan=free&name=...&email=...
 */
export async function submitFreeSignup(data) {
  if (!SUPABASE_READY) return notReady('submitFreeSignup')

  const row = {
    submission_type: 'free_signup',
    display_name:    data.display_name || data.name || '',
    username:        data.username || '',
    selected_plan:   'free',
    links_json:      {},
  }

  const { data: result, error } = await supabase
    .from('submissions')
    .insert([row])
    .select('id')
    .single()

  if (error) console.error('[FAS] submitFreeSignup error:', error.message)
  return { data: result, error }
}


// ── submitIntake(data) ────────────────────────────────────────
/**
 * Save a full intake form submission (free or paid plan).
 * Called by intake-form.js after validation and image upload.
 * submission_type is set based on the selected plan.
 *
 * @param {object} data - all fields from the intake form
 * @param {string} data.display_name
 * @param {string} data.username
 * @param {string} data.bio
 * @param {object} data.links_json        - { spotify, youtube, instagram, tiktok, soundcloud, website }
 * @param {string} [data.image_url]       - set after uploadProfileImage() succeeds
 * @param {string} [data.style_notes]
 * @param {string} [data.selected_template]
 * @param {string} data.selected_plan     - 'free' | 'starter' | 'pro' | 'premium'
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 *
 * Supabase query:
 *   supabase
 *     .from('submissions')
 *     .insert([{
 *       submission_type:   data.selected_plan === 'free' ? 'free_signup' : 'paid_intake',
 *       display_name:      data.display_name,
 *       username:          data.username,
 *       bio:               data.bio,
 *       links_json:        data.links_json,
 *       image_url:         data.image_url || null,
 *       style_notes:       data.style_notes || null,
 *       selected_template: data.selected_template || null,
 *       selected_plan:     data.selected_plan,
 *     }])
 *     .select('id')
 *     .single()
 *
 * Returns { id: UUID } — pass as ?token= to thankyou.html
 * RLS: INSERT allowed for anon (public)
 */
export async function submitIntake(data) {
  if (!SUPABASE_READY) return notReady('submitIntake')

  const row = {
    submission_type:   data.selected_plan === 'free' ? 'free_signup' : 'paid_intake',
    display_name:      data.display_name,
    username:          data.username,
    bio:               data.bio               || null,
    links_json:        data.links_json        || {},
    image_url:         data.image_url         || null,
    style_notes:       data.style_notes       || null,
    selected_template: data.selected_template || null,
    selected_plan:     data.selected_plan,
  }

  const { data: result, error } = await supabase
    .from('submissions')
    .insert([row])
    .select('id')
    .single()

  if (error) console.error('[FAS] submitIntake error:', error.message)
  return { data: result, error }
}


// ── uploadProfileImage(username, file) ────────────────────────
/**
 * Upload a profile image to the profile-images storage bucket.
 * Call this BEFORE submitIntake() — pass the returned URL as data.image_url.
 *
 * @param {string} username - creator slug (e.g. 'koldvisual')
 * @param {File}   file     - the File object from <input type="file">
 * @returns {Promise<{ url: string|null, error: Error|null }>}
 *
 * Storage path: profile-images/{username}/{filename}
 *
 * Supabase storage:
 *   supabase.storage
 *     .from('profile-images')
 *     .upload(`${username}/${file.name}`, file, { upsert: true })
 *
 * Then get public URL:
 *   supabase.storage
 *     .from('profile-images')
 *     .getPublicUrl(`${username}/${file.name}`)
 *
 * PREREQUISITE: The 'profile-images' bucket must be created in Supabase Storage
 *   and set to Public so the URL is directly usable as an <img> src.
 */
export async function uploadProfileImage(username, file) {
  if (!SUPABASE_READY) return { url: null, error: new Error('[FAS] uploadProfileImage: Supabase not configured') }
  if (!username || !file) return { url: null, error: new Error('[FAS] uploadProfileImage: username and file are required') }

  const storagePath = `${username}/${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('profile-images')
    .upload(storagePath, file, { upsert: true })

  if (uploadError) {
    console.error('[FAS] uploadProfileImage upload error:', uploadError.message)
    return { url: null, error: uploadError }
  }

  const { data: { publicUrl } } = supabase.storage
    .from('profile-images')
    .getPublicUrl(storagePath)

  return { url: publicUrl, error: null }
}


// ── getSubmissionById(id) ─────────────────────────────────────
/**
 * Fetch a single submission by UUID.
 * Used by thankyou.html to verify a real submission and show confirmation details.
 *
 * @param {string} id - UUID from submissions.id
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 *
 * Supabase query:
 *   supabase
 *     .from('submissions')
 *     .select('id, display_name, username, selected_plan, status, created_at')
 *     .eq('id', id)
 *     .single()
 *
 * NOTE: RLS restricts SELECT to authenticated users.
 * For thankyou.html to read this without auth, create a Supabase Function
 * or a database view with anon SELECT on the minimal confirmation fields only.
 */
export async function getSubmissionById(id) {
  if (!SUPABASE_READY) return notReady('getSubmissionById')
  if (!id) return { data: null, error: new Error('[FAS] getSubmissionById: id is required') }

  const { data, error } = await supabase
    .from('submissions')
    .select('id, display_name, username, selected_plan, status, created_at')
    .eq('id', id)
    .single()

  if (error) console.error('[FAS] getSubmissionById error:', error.message)
  return { data, error }
}
