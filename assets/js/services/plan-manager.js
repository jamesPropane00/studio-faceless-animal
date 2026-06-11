/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — PLAN MANAGER SERVICE
 *  assets/js/services/plan-manager.js
 *
 *  Clean application logic for plan upgrades, feature gating,
 *  and plan state changes. No billing automation — payment
 *  confirmation is handled separately by services/payments.js.
 *
 *  FLOW:
 *    requestUpgrade()  — creator submits intent; sets upgrade_requested_plan
 *    applyUpgrade()    — admin approves; updates profile + pages + timestamps
 *    cancelUpgradeRequest() — clears the pending upgrade intent
 *
 *  FEATURE GATING:
 *    canAccessFeature() — check if a plan has access to a feature
 *    getPlanFeatures()  — full feature set for a plan + per-profile overrides
 *    getPlanDiff()      — what's gained/lost between two plans
 *
 *  REQUIRES: supabase/migrations/009_upgrade_path.sql
 *
 *  CONSUMERS:
 *    assets/js/services/payments.js  — calls applyUpgrade after confirmPayment
 *    assets/js/admin.js              — adminUpgradePlan() calls applyUpgrade
 *    assets/js/page-renderer.js      — uses PLAN_FEATURES + canAccessFeature
 * ============================================================
 */

import { supabase, SUPABASE_READY } from '../supabase-client.js'


// ── PLAN HIERARCHY ────────────────────────────────────────────
// 'access' is treated as an alias for 'starter' (legacy plan slug).
// Both map to the same tier position (index 1).
export const PLAN_ORDER = ['free', 'starter', 'pro', 'premium']

// Legacy → canonical plan slug mapping
const PLAN_ALIASES = { access: 'starter' }

function canonicalizePlan(plan) {
  const p = (plan || 'free').toLowerCase()
  return PLAN_ALIASES[p] || p
}

/**
 * Returns true if `current` plan is at or above `required` plan in tier.
 * Handles the 'access' legacy alias for 'starter'.
 * @param {string} current  — profile's current plan_type
 * @param {string} required — minimum required plan
 */
export function planAtLeast(current, required) {
  const ci = PLAN_ORDER.indexOf(canonicalizePlan(current))
  const ri = PLAN_ORDER.indexOf(canonicalizePlan(required))
  return ci >= ri
}


// ── PLAN FEATURE DEFINITIONS ──────────────────────────────────
/**
 * The base feature set for each plan.
 *
 * These are the defaults before any per-profile plan_features overrides
 * are applied. The page-renderer and admin dashboard read from this
 * (via getPlanFeatures) to decide what to show.
 *
 * Adding a new feature:
 *   1. Add it here in all four plans
 *   2. Use canAccessFeature(planType, 'your_feature') wherever needed
 *   3. Add data-plan-gate="pro" (or appropriate tier) in the template HTML
 *   4. The CSS in style.css will hide the element on lower-tier plans
 */
export const PLAN_FEATURES = {
  free: {
    // Core page
    bio_page:        true,   // basic bio + social links always shown
    social_links:    true,
    location:        true,

    // Sections — disabled for free
    works_section:   false,  // portfolio / music works
    stats_section:   false,  // stat strip (listeners, projects, etc.)
    quick_info:      false,  // quick info bullet list
    services_section:false,  // business services menu (business pages only)
    hours_section:   true,   // business hours always shown (basic page needs)

    // Personalization
    custom_tags:     false,  // only gets category label tag
    custom_accent:   false,  // uses category-based default accent color
    marquee_custom:  false,  // marquee shows but with default fallback words

    // Branding
    powered_by:      true,   // FAS powered-by bar shown at bottom
    free_badge:      true,   // FAS free plan badge shown in hero
    branding_free:   true,   // alias for powered_by + free_badge

    // Network
    featured:        false,  // not shown in featured section

    // Advanced
    custom_domain:   false,
  },

  starter: {
    bio_page:        true,
    social_links:    true,
    location:        true,

    // Sections — all enabled
    works_section:   true,
    stats_section:   true,
    quick_info:      true,
    services_section:true,
    hours_section:   true,

    // Personalization — custom tags yes; accent still default
    custom_tags:     true,
    custom_accent:   false,  // custom accent is a Pro feature
    marquee_custom:  false,

    // Branding — powered-by bar still shows
    powered_by:      true,
    free_badge:      false,  // no hero badge on starter (bar is enough)
    branding_free:   true,

    // Network
    featured:        false,

    // Advanced
    custom_domain:   false,
  },

  pro: {
    bio_page:        true,
    social_links:    true,
    location:        true,

    works_section:   true,
    stats_section:   true,
    quick_info:      true,
    services_section:true,
    hours_section:   true,

    // Personalization — full
    custom_tags:     true,
    custom_accent:   true,   // admin can set hex accent in metadata_json
    marquee_custom:  true,   // custom marquee words from metadata_json

    // Branding removed entirely
    powered_by:      false,
    free_badge:      false,
    branding_free:   false,

    // Network — featured
    featured:        true,

    // Advanced
    custom_domain:   false,
  },

  premium: {
    bio_page:        true,
    social_links:    true,
    location:        true,

    works_section:   true,
    stats_section:   true,
    quick_info:      true,
    services_section:true,
    hours_section:   true,

    custom_tags:     true,
    custom_accent:   true,
    marquee_custom:  true,

    powered_by:      false,
    free_badge:      false,
    branding_free:   false,

    featured:        true,

    // Advanced — custom domain only in premium
    custom_domain:   true,
  },
}


// ── FEATURE QUERY HELPERS ─────────────────────────────────────

/**
 * getPlanFeatures(planType, overrides) — Full feature set for a profile.
 *
 * Merges the base plan features with any per-profile overrides stored
 * in profiles.plan_features (admin-granted exceptions).
 *
 * @param {string} planType
 * @param {object} [overrides] — profiles.plan_features JSONB from DB
 * @returns {object} merged feature flags
 */
export function getPlanFeatures(planType, overrides = {}) {
  const base = PLAN_FEATURES[planType] ?? PLAN_FEATURES.free
  return { ...base, ...(overrides || {}) }
}


/**
 * canAccessFeature(planType, feature, overrides) — boolean gate.
 *
 * @param {string} planType
 * @param {string} feature — key in PLAN_FEATURES
 * @param {object} [overrides] — profiles.plan_features JSONB
 * @returns {boolean}
 */
export function canAccessFeature(planType, feature, overrides = {}) {
  const features = getPlanFeatures(planType, overrides)
  return Boolean(features[feature])
}


/**
 * getPlanDiff(fromPlan, toPlan) — Features gained and lost in a plan change.
 *
 * Returns arrays of feature keys that are gained (true in new, false in old)
 * and lost (false in new, true in old). Useful for showing the user what
 * they get when upgrading.
 *
 * @param {string} fromPlan
 * @param {string} toPlan
 * @returns {{ gained: string[], lost: string[] }}
 */
export function getPlanDiff(fromPlan, toPlan) {
  const from = PLAN_FEATURES[fromPlan] ?? PLAN_FEATURES.free
  const to   = PLAN_FEATURES[toPlan]   ?? PLAN_FEATURES.free

  const gained = []
  const lost   = []

  for (const key of Object.keys(to)) {
    if (to[key] && !from[key]) gained.push(key)
    if (!to[key] && from[key]) lost.push(key)
  }

  return { gained, lost }
}


/**
 * getUpgradeOptions(currentPlan) — Plans available to upgrade to.
 *
 * Returns only higher-tier plans (no downgrades here — use applyUpgrade
 * directly for admin-initiated downgrades).
 *
 * @param {string} currentPlan
 * @returns {string[]} — array of plan slugs, e.g. ['starter', 'pro', 'premium']
 */
export function getUpgradeOptions(currentPlan) {
  const idx = PLAN_ORDER.indexOf(currentPlan || 'free')
  return PLAN_ORDER.slice(Math.max(0, idx + 1))
}


// ── UPGRADE ACTIONS ───────────────────────────────────────────

/**
 * requestUpgrade(profileId, newPlan) — Record an upgrade intent.
 *
 * Call when a creator has submitted an upgrade request (paid the setup fee
 * but it's not yet confirmed). Sets:
 *   - profiles.upgrade_requested_plan = newPlan
 *   - pages.upgrade_status = 'requested' (for all pages on this profile)
 *
 * Does NOT change plan_type — that only happens in applyUpgrade().
 *
 * @param {string} profileId
 * @param {string} newPlan — 'starter' | 'pro' | 'premium'
 * @returns {Promise<{ data: null, error: Error|null }>}
 */
export async function requestUpgrade(profileId, newPlan) {
  if (!SUPABASE_READY) return notReady('requestUpgrade')
  if (!PLAN_ORDER.includes(newPlan) || newPlan === 'free') {
    return { data: null, error: new Error(`Invalid upgrade target: ${newPlan}`) }
  }

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ upgrade_requested_plan: newPlan })
    .eq('id', profileId)

  if (profileErr) return { data: null, error: profileErr }

  const { error: pagesErr } = await supabase
    .from('pages')
    .update({ upgrade_status: 'requested' })
    .eq('profile_id', profileId)
    .is('upgrade_status', null)   // only set if not already in progress

  if (pagesErr) return { data: null, error: pagesErr }

  log('requestUpgrade', `profile ${profileId} → requested ${newPlan}`)
  return { data: null, error: null }
}


/**
 * applyUpgrade(profileId, newPlan, opts) — Apply a confirmed plan upgrade.
 *
 * The single source of truth for plan changes. Updates:
 *   - profiles.plan_type         → newPlan
 *   - profiles.plan_changed_at   → now()
 *   - profiles.upgrade_requested_plan → null (request fulfilled)
 *   - pages.plan_type            → newPlan (snapshot)
 *   - pages.upgrade_status       → 'complete'
 *
 * Called by:
 *   - admin.js adminUpgradePlan() — direct admin action
 *   - payments.js upgradePlan()  — after payment confirmed
 *
 * @param {string} profileId
 * @param {string} newPlan — 'free' | 'starter' | 'pro' | 'premium'
 * @param {object} [opts]
 * @param {string} [opts.triggeredBy] — admin email or 'system'
 * @returns {Promise<{ data: null, error: Error|null }>}
 */
export async function applyUpgrade(profileId, newPlan, opts = {}) {
  if (!SUPABASE_READY) return notReady('applyUpgrade')
  if (!PLAN_ORDER.includes(newPlan)) {
    return { data: null, error: new Error(`Invalid plan: ${newPlan}`) }
  }

  // 1. Update profile
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      plan_type:               newPlan,
      plan_changed_at:         new Date().toISOString(),
      upgrade_requested_plan:  null,   // request fulfilled
    })
    .eq('id', profileId)

  if (profileErr) {
    console.error('[FAS:plan-manager] applyUpgrade profile error:', profileErr.message)
    return { data: null, error: profileErr }
  }

  // 2. Update all pages for this profile
  const { error: pagesErr } = await supabase
    .from('pages')
    .update({
      plan_type:      newPlan,
      upgrade_status: 'complete',
    })
    .eq('profile_id', profileId)

  if (pagesErr) {
    console.error('[FAS:plan-manager] applyUpgrade pages error:', pagesErr.message)
    return { data: null, error: pagesErr }
  }

  log('applyUpgrade', `profile ${profileId} → ${newPlan} (by ${opts.triggeredBy ?? 'admin'})`)
  return { data: null, error: null }
}


/**
 * cancelUpgradeRequest(profileId) — Cancel a pending upgrade request.
 *
 * Clears upgrade_requested_plan on the profile and resets upgrade_status
 * on pages back to null. Call when:
 *  - Admin rejects the payment
 *  - Creator cancels their request before payment is confirmed
 *
 * @param {string} profileId
 * @returns {Promise<{ data: null, error: Error|null }>}
 */
export async function cancelUpgradeRequest(profileId) {
  if (!SUPABASE_READY) return notReady('cancelUpgradeRequest')

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ upgrade_requested_plan: null })
    .eq('id', profileId)

  if (profileErr) return { data: null, error: profileErr }

  const { error: pagesErr } = await supabase
    .from('pages')
    .update({ upgrade_status: null })
    .eq('profile_id', profileId)
    .eq('upgrade_status', 'requested')  // only cancel if not already in_progress

  if (pagesErr) return { data: null, error: pagesErr }

  log('cancelUpgradeRequest', `cleared for profile ${profileId}`)
  return { data: null, error: null }
}


/**
 * grantFeatureOverride(profileId, featureKey, value) — Admin feature grant.
 *
 * Merges a single feature into profiles.plan_features, overriding the
 * base plan default for this profile only.
 *
 * Example: give a Starter user custom_accent as a promo:
 *   grantFeatureOverride(id, 'custom_accent', true)
 *   grantFeatureOverride(id, 'custom_accent', false)  — revoke it
 *
 * @param {string}  profileId
 * @param {string}  featureKey — key in PLAN_FEATURES
 * @param {boolean} value
 * @returns {Promise<{ data: null, error: Error|null }>}
 */
export async function grantFeatureOverride(profileId, featureKey, value) {
  if (!SUPABASE_READY) return notReady('grantFeatureOverride')

  // Merge using Postgres jsonb || operator via RPC, or read-modify-write
  const { data: profile, error: fetchErr } = await supabase
    .from('profiles')
    .select('plan_features')
    .eq('id', profileId)
    .single()

  if (fetchErr) return { data: null, error: fetchErr }

  const features = { ...(profile.plan_features || {}), [featureKey]: value }

  const { error } = await supabase
    .from('profiles')
    .update({ plan_features: features })
    .eq('id', profileId)

  if (error) return { data: null, error }

  log('grantFeatureOverride', `profile ${profileId}: ${featureKey} = ${value}`)
  return { data: null, error: null }
}


// ── QUERY HELPERS ─────────────────────────────────────────────

/**
 * getPlanSummary(profileId) — Current plan state for a profile.
 *
 * Returns profile plan fields + pages with upgrade_status.
 *
 * @param {string} profileId
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 */
export async function getPlanSummary(profileId) {
  if (!SUPABASE_READY) return notReady('getPlanSummary')

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, username, display_name, plan_type, plan_status, plan_features, plan_changed_at, plan_expires_at, upgrade_requested_plan')
    .eq('id', profileId)
    .single()

  if (profileErr) return { data: null, error: profileErr }

  const { data: pages } = await supabase
    .from('pages')
    .select('id, page_slug, page_type, page_status, plan_type, upgrade_status')
    .eq('profile_id', profileId)

  return {
    data: {
      ...profile,
      features:     getPlanFeatures(profile.plan_type, profile.plan_features),
      upgrade_opts: getUpgradeOptions(profile.plan_type),
      pages:        pages ?? [],
    },
    error: null,
  }
}


/**
 * getProfilesWithPendingUpgrades() — All profiles with upgrade_status = 'requested'.
 *
 * Returns profiles where any page has a pending upgrade request, ordered by request time.
 * Use in admin dashboard to surface upgrade requests that need payment confirmation.
 *
 * @returns {Promise<{ data: object[]|null, error: Error|null }>}
 */
export async function getProfilesWithPendingUpgrades() {
  if (!SUPABASE_READY) return notReady('getProfilesWithPendingUpgrades')

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, plan_type, upgrade_requested_plan, plan_changed_at')
    .not('upgrade_requested_plan', 'is', null)
    .order('plan_changed_at', { ascending: true })

  if (error) console.error('[FAS:plan-manager] getProfilesWithPendingUpgrades error:', error.message)
  return { data, error }
}


// ── INTERNAL ──────────────────────────────────────────────────
function notReady(fn) {
  return { data: null, error: new Error(`[FAS:plan-manager] ${fn}() called but Supabase is not configured.`) }
}

function log(fn, msg) {
  console.log(`[FAS:plan-manager] ${fn} — ${msg}`)
}
