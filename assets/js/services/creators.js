/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — CREATORS SERVICE
 *  assets/js/services/creators.js
 *
 *  Queries the `profiles` and `pages` tables.
 *
 *  STATUS: Stub — SUPABASE_READY must be true for queries to run.
 *  When not configured, all functions return { data: null, error }.
 *
 *  TABLES:
 *    profiles — public creator directory (network board, featured strip)
 *    pages    — page configuration and live status
 *
 *  CONSUMERS:
 *    assets/js/board-feed.js    — getProfiles(), getFeaturedProfiles()
 *    assets/js/page-renderer.js — getProfileBySlug(), getPageBySlug()
 *
 *  SCHEMA: supabase/migrations/001_initial_schema.sql
 * ============================================================
 */

import { supabase, SUPABASE_READY } from '../supabase-client.js'


// ── GUARD ─────────────────────────────────────────────────────
function notReady(fn) {
  return { data: null, error: new Error(`[FAS] ${fn}() called but Supabase is not configured.`) }
}


// ── getProfiles({ featured }) ─────────────────────────────────
/**
 * Fetch all active creator profiles for the network board.
 * Replaces: the static CREATORS array in creator-data.js
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.featured] - if true, only return featured profiles
 * @returns {Promise<{ data: object[]|null, error: Error|null }>}
 *
 * Supabase query:
 *   supabase
 *     .from('profiles')
 *     .select('id, username, display_name, bio, avatar_url, category, city, state, links_json, plan_type, is_featured, slug')
 *     .eq('is_active', true)
 *     .order('created_at', { ascending: false })
 *   + .eq('is_featured', true)  ← when featured is true
 */
export async function getProfiles({ featured = false } = {}) {
  if (!SUPABASE_READY) return notReady('getProfiles')

  let query = supabase
    .from('profiles')
    .select('id, username, display_name, bio, avatar_url, category, city, state, links_json, plan_type, is_featured, slug')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (featured) {
    query = query.eq('is_featured', true)
  }

  const { data, error } = await query
  if (error) console.error('[FAS] getProfiles error:', error.message)
  return { data, error }
}


// ── getFeaturedProfiles() ─────────────────────────────────────
/**
 * Fetch featured profiles for the featured strip on network.html.
 */
export async function getFeaturedProfiles() {
  return getProfiles({ featured: true })
}


// ── getProfileBySlug(slug) ────────────────────────────────────
/**
 * Fetch a single active profile by its slug.
 * Replaces: getCreatorBySlug() from creator-data.js
 *
 * @param {string} slug - profile slug (e.g. 'djfacelessanimal')
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 *
 * Supabase query:
 *   supabase
 *     .from('profiles')
 *     .select('*')
 *     .eq('slug', slug)
 *     .eq('is_active', true)
 *     .single()
 */
export async function getProfileBySlug(slug) {
  if (!SUPABASE_READY) return notReady('getProfileBySlug')
  if (!slug) return { data: null, error: new Error('[FAS] getProfileBySlug: slug is required') }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (error) console.error('[FAS] getProfileBySlug error:', error.message)
  return { data, error }
}


// ── getPageBySlug(slug) ───────────────────────────────────────
/**
 * Fetch the live page config for a given page_slug.
 * Used by page-renderer.js to fill template HTML with page-specific content.
 *
 * @param {string} slug - page_slug value (e.g. 'koldvisual')
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 *
 * Supabase query:
 *   supabase
 *     .from('pages')
 *     .select('*')
 *     .eq('page_slug', slug)
 *     .eq('page_status', 'live')
 *     .single()
 */
export async function getPageBySlug(slug) {
  if (!SUPABASE_READY) return notReady('getPageBySlug')
  if (!slug) return { data: null, error: new Error('[FAS] getPageBySlug: slug is required') }

  const { data, error } = await supabase
    .from('pages')
    .select('*')
    .eq('page_slug', slug)
    .eq('page_status', 'live')
    .single()

  if (error) console.error('[FAS] getPageBySlug error:', error.message)
  return { data, error }
}


// ── getProfileWithPage(slug) ──────────────────────────────────
/**
 * Fetch a profile joined with its live page data in one query.
 * Single call used by page-renderer.js to fully hydrate a template page.
 *
 * @param {string} slug - profile slug
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 *
 * Supabase query:
 *   supabase
 *     .from('profiles')
 *     .select('*, pages(*)')
 *     .eq('slug', slug)
 *     .eq('is_active', true)
 *     .single()
 */
export async function getProfileWithPage(slug) {
  if (!SUPABASE_READY) return notReady('getProfileWithPage')
  if (!slug) return { data: null, error: new Error('[FAS] getProfileWithPage: slug is required') }

  const { data, error } = await supabase
    .from('profiles')
    .select('*, pages(*)')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (error) console.error('[FAS] getProfileWithPage error:', error.message)
  return { data, error }
}
