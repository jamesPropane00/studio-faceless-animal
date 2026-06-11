/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — ACCESS GATE (SYNC BRIDGE)
 *  assets/js/access-gate.js
 *
 *  Synchronous, non-module bridge to the plan-gating logic
 *  defined in assets/js/services/plan-manager.js.
 *
 *  WHY THIS FILE EXISTS:
 *    plan-manager.js is an ES module that imports Supabase, so it
 *    cannot be used directly in classic inline <script> blocks.
 *    This file exposes the same plan hierarchy and canonicalization
 *    logic as window.FAS so that non-module scripts on every gated
 *    page can call a single consistent function rather than
 *    duplicating ACCESS_PLANS arrays locally.
 *
 *  CANONICAL PLAN HIERARCHY (mirrors plan-manager.js PLAN_ORDER):
 *    free  <  starter  <  pro  <  premium
 *    'access' is a legacy alias for 'starter' (same tier).
 *
 *  SESSION SOURCE:
 *    Reads from localStorage key 'fas_user' — the single source of
 *    truth for client-side session state written by auth.js on login.
 *
 *  EXPOSED API (via window.FAS):
 *    FAS.getSession()          — raw session object or null
 *    FAS.planAtLeast(required) — true if session plan >= required
 *    FAS.isPaidMember()        — true if plan >= 'starter'
 *
 *  CONSUMERS:
 *    game-beat.html, games.html, drops.html, apps.html,
 *    dashboard.html, messages.html
 *
 *  KEEP IN SYNC WITH: assets/js/services/plan-manager.js
 *    PLAN_ORDER and PLAN_ALIASES must match between both files.
 * ============================================================
 */
;(function (global) {
  'use strict'

  var STORAGE_KEY  = 'fas_user'
  // Must match PLAN_ORDER in assets/js/services/plan-manager.js
  var PLAN_ORDER   = ['free', 'starter', 'pro', 'premium']
  // Must match PLAN_ALIASES in assets/js/services/plan-manager.js
  var PLAN_ALIASES = { access: 'starter' }

  function canonicalize(plan) {
    var p = (plan || 'free').toLowerCase()
    return PLAN_ALIASES[p] || p
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch (e) { return null }
  }

  function planAtLeast(required) {
    var sess = getSession()
    if (!sess || !sess.username) return false
    var ci = PLAN_ORDER.indexOf(canonicalize(sess.plan))
    var ri = PLAN_ORDER.indexOf(canonicalize(required))
    if (ri < 0) return false
    if (ci < 0) return false
    return ci >= ri
  }

  function isPaidMember() {
    return planAtLeast('starter')
  }

  global.FAS = {
    getSession:   getSession,
    planAtLeast:  planAtLeast,
    isPaidMember: isPaidMember
  }
}(window))
