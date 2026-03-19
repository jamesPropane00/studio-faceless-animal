/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — ADMIN AUTH MODULE
 *  assets/js/admin-auth.js
 *
 *  Purpose: centralise all authentication and authorisation
 *  logic for the admin dashboard so it can be hardened in
 *  one place without touching dashboard code.
 *
 *  Phase 1 — Hardened:
 *    - Supabase email/password session is the primary gate
 *    - Email allowlist (ADMIN_EMAILS) restricts access to
 *      known admin accounts — any other authenticated user
 *      is turned away with a clear "not authorized" reason
 *    - hasRole() returns false for non-admins
 *
 *  Phase 2 (future — when user_roles table exists):
 *    1. Create `user_roles` table in Supabase:
 *         user_roles(user_id uuid references auth.users, role text)
 *         add RLS: only service_role can write; authenticated can read own row
 *    2. Insert rows for each admin: { user_id: <uid>, role: 'super_admin' }
 *    3. Replace the allowlist check below with a DB role lookup
 * ============================================================
 */

import { supabase } from './supabase-client.js'

// ── Admin email allowlist ────────────────────────────────────
// Phase 1: hardcoded list of emails that are allowed admin access.
// Matching is case-insensitive. Add new admins here as needed.
const ADMIN_EMAILS = new Set([
  'djfacelessanimal@gmail.com',
  'jamespropane00@gmail.com',
])

// ── Role constants ──────────────────────────────────────────
export const ADMIN_ROLES = {
  SUPER_ADMIN: 'super_admin',
  MODERATOR:   'moderator',
  VIEWER:      'viewer',
}

// ── isAdminEmail ─────────────────────────────────────────────
/**
 * Returns true if the given email is in the admin allowlist.
 * @param {string|null} email
 * @returns {boolean}
 */
function isAdminEmail(email) {
  if (!email) return false
  return ADMIN_EMAILS.has(email.toLowerCase().trim())
}

// ── getAdminSession ──────────────────────────────────────────
/**
 * Returns the current Supabase session and whether the user
 * is a recognised admin, or null if not signed in.
 */
export async function getAdminSession() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { session: null, role: null, isAdmin: false }

  const email = session.user?.email ?? null
  const isAdmin = isAdminEmail(email)
  const role = isAdmin ? ADMIN_ROLES.SUPER_ADMIN : null

  return { session, role, isAdmin }
}

// ── requireAdminSession ─────────────────────────────────────
/**
 * Guard function — call this at the top of any sensitive admin
 * operation.
 *
 * Returns: { ok: true, session, role } if access is granted
 *          { ok: false, reason: string } if access is denied
 *
 * Reasons:
 *   'not_authenticated'  — no active Supabase session
 *   'not_authorized'     — authenticated but not in admin allowlist
 *   'insufficient_role'  — in allowlist but requiredRole not met
 */
export async function requireAdminSession({ requiredRole = null } = {}) {
  const { session, role, isAdmin } = await getAdminSession()

  if (!session) {
    return { ok: false, reason: 'not_authenticated' }
  }

  if (!isAdmin) {
    return { ok: false, reason: 'not_authorized' }
  }

  if (requiredRole && role !== requiredRole && role !== ADMIN_ROLES.SUPER_ADMIN) {
    return { ok: false, reason: 'insufficient_role', required: requiredRole, actual: role }
  }

  return { ok: true, session, role }
}

// ── hasRole ─────────────────────────────────────────────────
/**
 * Synchronous helper for UI rendering — hides/shows controls
 * based on the user's role.
 *
 * Stores the last-resolved isAdmin state so it can be checked
 * synchronously after getAdminSession() has been called.
 *
 * Usage: call setAdminState() after getAdminSession(), then
 * use hasRole() in rendering logic.
 */
let _isAdmin = false
let _currentRole = null

export function setAdminState(isAdmin, role) {
  _isAdmin = isAdmin
  _currentRole = role
}

export function hasRole(role) {
  if (!_isAdmin) return false
  return _currentRole === ADMIN_ROLES.SUPER_ADMIN || _currentRole === role
}

// ── onAuthChange ────────────────────────────────────────────
/**
 * Subscribe to Supabase auth state changes and call the
 * provided callbacks when the user signs in or out.
 *
 * The onSignIn callback now receives (session, role, isAdmin)
 * so callers can enforce the admin check inline.
 *
 * Returns the subscription object (call .unsubscribe() to clean up).
 */
export function onAuthChange({ onSignIn, onSignOut }) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      const email   = session.user?.email ?? null
      const isAdmin = isAdminEmail(email)
      const role    = isAdmin ? ADMIN_ROLES.SUPER_ADMIN : null
      setAdminState(isAdmin, role)
      onSignIn(session, role, isAdmin)
    } else {
      setAdminState(false, null)
      onSignOut()
    }
  })
  return subscription
}
