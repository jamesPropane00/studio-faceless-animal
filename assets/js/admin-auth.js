/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — ADMIN AUTH MODULE
 *  assets/js/admin-auth.js
 *
 *  Purpose: centralise all authentication and authorisation
 *  logic for the admin dashboard so it can be hardened in
 *  one place without touching dashboard code.
 *
 *  Access model:
 *    - Uses the same platform-native member session as the main app
 *      (localStorage key: fas_user)
 *    - Session is verified against member_accounts via username + password_hash
 *    - Authorization is derived from member_accounts.role only
 *    - Only super_admin/admin can access the standalone admin page
 *    - No email lookups or Supabase auth bridge required
 * ============================================================
 */

import { supabase } from './supabase-client.js'

const ADMIN_ACCESS_ROLES = new Set(['super_admin', 'admin'])

// ── Role constants ──────────────────────────────────────────
export const ADMIN_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN:       'admin',
  MODERATOR:   'moderator',
  VIEWER:      'viewer',
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase()
}

function getLocalMemberSession() {
  try {
    return JSON.parse(localStorage.getItem('fas_user') || 'null')
  } catch {
    return null
  }
}

function normalizeUsername(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
}

async function getRoleFromMemberSession(sess) {
  const username = normalizeUsername(sess && sess.username)
  const ph = String(sess && sess.ph || '').trim()
  if (!username || !ph) return null

  const { data, error } = await supabase
    .from('member_accounts')
    .select('role')
    .eq('username', username)
    .eq('password_hash', ph)
    .limit(1)

  if (error) return null

  const row = Array.isArray(data) ? data[0] : null
  return normalizeRole(row && row.role)
}

// ── getAdminSession ──────────────────────────────────────────
/**
 * Returns the current platform member session and whether the user
 * is a recognised admin, or null if not signed in.
 */
export async function getAdminSession() {
  const session = getLocalMemberSession()
  if (!session || !session.username || !session.ph) {
    return { session: null, role: null, isAdmin: false }
  }

  const role = await getRoleFromMemberSession(session)
  const isAdmin = ADMIN_ACCESS_ROLES.has(role)

  return { session, role: role || null, isAdmin }
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
 *   'not_authorized'     — authenticated but role is not admin-eligible
 *   'insufficient_role'  — role exists but requiredRole not met
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
  let lastSessionSig = ''
  let active = true

  const poll = async () => {
    if (!active) return
    const session = getLocalMemberSession()
    const sig = session && session.username && session.ph
      ? `${normalizeUsername(session.username)}:${String(session.ph).slice(0, 12)}`
      : ''

    if (sig === lastSessionSig) return
    lastSessionSig = sig

    if (!session || !session.username || !session.ph) {
      setAdminState(false, null)
      onSignOut()
      return
    }

    const role = await getRoleFromMemberSession(session)
    const isAdmin = ADMIN_ACCESS_ROLES.has(role)
    setAdminState(isAdmin, role)
    onSignIn(session, role, isAdmin)
  }

  const interval = setInterval(poll, 1200)
  window.addEventListener('storage', poll)
  poll()

  return {
    unsubscribe() {
      active = false
      clearInterval(interval)
      window.removeEventListener('storage', poll)
    }
  }
}
