/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — PASSWORD AUTH MODULE
 *  assets/js/auth.js
 *
 *  Browser-side PBKDF2 password hashing + Supabase RPC auth.
 *  Passwords are NEVER transmitted in plaintext.
 *  Hash comparison always happens server-side via RPC.
 *
 *  USAGE (ES module):
 *    import {
 *      generateSalt, hashPassword, validatePassword,
 *      signIn, createAccount, setInitialPassword,
 *      isUsernameAvailable
 *    } from './auth.js'
 * ============================================================
 */

import { supabase, SUPABASE_READY } from './supabase-client.js'
import { syncMember } from './member-db.js'

const PBKDF2_ITERATIONS = 100_000
const PBKDF2_HASH       = 'SHA-256'
const PBKDF2_BITS       = 256
const SALT_BYTES        = 16
const SESSION_KEY       = 'fas_user'
const MEMBER_KEY        = 'fas_member'
const ACCOUNTS_KEY      = 'fas_accounts'   // legacy localStorage list
const SIGNAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const SIGNAL_CODE_REGEX = /^SIG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/i
const LEGACY_PLATFORM_ID_REGEX = /^sig_[a-z0-9]{10,20}$/

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function normalizeVeilState(raw) {
  const v = String(raw || '').toLowerCase().trim()
  if (v === 'veiled') return 'veiled'
  if (v === 'deep') return 'deep'
  return 'unveiled'
}

// ── Crypto helpers ────────────────────────────────────────────

/**
 * Generate a cryptographically random base64 salt.
 */
export function generateSalt() {
  const bytes = new Uint8Array(SALT_BYTES)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

/**
 * Derive a PBKDF2 hash from a plaintext password + base64 salt.
 * Returns base64 string of the derived key.
 */
export async function hashPassword(password, saltBase64) {
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

/**
 * Validate password strength.
 * Returns null if valid, or an error string if invalid.
 */
export function validatePassword(password) {
  if (!password)              return 'Password is required.'
  if (password.length < 8)   return 'Password must be at least 8 characters.'
  if (password.length > 128) return 'Password is too long.'
  return null
}

// ── Username helpers ──────────────────────────────────────────

/**
 * Clean and validate a username string.
 * Returns the cleaned username, or null if invalid.
 *
 * Canonical rules (must match free-signup.js validate()):
 *   - Lowercase letters, digits, underscores, hyphens: [a-z0-9_-]
 *   - Min 3 chars, max 40 chars
 *   - Stripping is minimal (just @ prefix and leading/trailing whitespace)
 *     so that hyphens in the raw input are preserved, not silently removed.
 */
export function cleanUsername(raw) {
  const cleaned = String(raw).trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)
  return /^[a-z0-9_-]{3,40}$/.test(cleaned) ? cleaned : null
}

export function cleanPlatformId(raw) {
  const signalCode = String(raw || '').trim().toUpperCase()
  if (SIGNAL_CODE_REGEX.test(signalCode)) return signalCode

  const legacy = String(raw || '').trim().toLowerCase()
  return LEGACY_PLATFORM_ID_REGEX.test(legacy) ? legacy : null
}

export function cleanRecoveryCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function generateRecoveryCode() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const chars = []
  for (let i = 0; i < bytes.length; i++) {
    chars.push(RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length])
  }
  const joined = chars.join('')
  return joined.slice(0, 4) + '-' + joined.slice(4, 8) + '-' + joined.slice(8, 12) + '-' + joined.slice(12, 16)
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

export async function hashRecoveryCode(recoveryCode) {
  const encoder = new TextEncoder()
  const normalized = cleanRecoveryCode(recoveryCode)
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(normalized))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
}

async function resolveUsernameFromLoginId(loginId) {
  const raw = String(loginId || '').trim().toLowerCase()
  const asUsername = cleanUsername(raw)
  if (asUsername) return { username: asUsername, source: 'username' }

  const asPlatformId = cleanPlatformId(raw)
  if (!asPlatformId) return { username: null, source: null }

  const { data, error } = await supabase
    .from('member_accounts')
    .select('username')
    .ilike('platform_id', asPlatformId)
    .maybeSingle()

  if (error || !data || !data.username) {
    return { username: null, source: 'platform_id' }
  }

  return { username: String(data.username).toLowerCase(), source: 'platform_id' }
}

/**
 * Check if a username is available in member_accounts.
 * Returns { available: bool, error: string|null }
 */
export async function isUsernameAvailable(username) {
  if (!SUPABASE_READY || !supabase) return { available: false, error: 'offline' }
  const { data, error } = await supabase.rpc('check_username_available', { p_username: username.toLowerCase() })
  if (error) return { available: false, error: error.message }
  return { available: !!data, error: null }
}

// ── Auth flows ────────────────────────────────────────────────

/**
 * Sign in an existing member with username + password.
 *
 * @returns {object} { success, error, errorCode, session }
 *   errorCode: 'offline' | 'username_not_found' | 'no_password' | 'wrong_password' | 'rpc_error'
 */
export async function signIn(loginId, password) {
  if (!SUPABASE_READY || !supabase) return { success: false, error: 'Cannot connect. Try again.', errorCode: 'offline' }

  const resolved = await resolveUsernameFromLoginId(loginId)
  const u = resolved.username
  if (!u) {
    if (resolved.source === 'platform_id') {
      return { success: false, error: 'Signal ID not found. Check the ID or create a new account.', errorCode: 'id_not_found' }
    }
    return { success: false, error: 'Username or Signal ID is invalid.', errorCode: 'invalid_login_id' }
  }

  // Step 1: Get salt for this user
  const { data: salt, error: saltError } = await supabase
    .rpc('get_member_salt', { p_username: u })

  if (saltError) {
    console.error('[FAS] get_member_salt error:', saltError.message)
    return { success: false, error: 'Server error. Try again.', errorCode: 'rpc_error' }
  }

  if (!salt) {
    // Username doesn't exist OR has no password set yet
    // Try checking if the username exists in member_accounts at all
    const { data: exists } = await supabase
      .from('member_accounts')
      .select('username')
      .eq('username', u)
      .single()

    if (!exists) {
      return { success: false, error: 'Username not found. Check your handle or create a new account.', errorCode: 'username_not_found' }
    }
    // Username exists but no password
    return { success: false, error: 'no_password', errorCode: 'no_password' }
  }

  // Step 2: Hash the entered password with the stored salt
  let hash
  try {
    hash = await hashPassword(password, salt)
  } catch (e) {
    return { success: false, error: 'Hashing failed. Browser may not support Web Crypto.', errorCode: 'crypto_error' }
  }

  // Step 3: Server-side comparison (hash never sent back to browser)
  const { data: valid, error: verifyError } = await supabase
    .rpc('verify_member_password', { p_username: u, p_hash: hash })

  if (verifyError) {
    console.error('[FAS] verify_member_password error:', verifyError.message)
    return { success: false, error: 'Verification failed. Try again.', errorCode: 'rpc_error' }
  }

  if (!valid) {
    return { success: false, error: 'Incorrect password. Try again.', errorCode: 'wrong_password' }
  }

  // Step 4: Load member info for session
  const { data: member } = await supabase
    .from('member_accounts')
    .select('*')
    .eq('username', u)
    .single()

  const session = {
    username: u,
    display:  member?.display_name || u,
    platform_id: member?.platform_id || '',
    account_id: member?.account_id || member?.id || '',
    signal_id: member?.signal_id || '',
    plan:     member?.plan_type || 'free',
    status:   member?.member_status || 'free',
    role:     member?.role || 'user',
    veil_state: normalizeVeilState(member?.veil_state),
    ts:       Date.now(),
    ph:       hash,
  }

  storeSession(session)
  return { success: true, session }
}

/**
 * Create a new member account with a password.
 *
 * @returns {object} { success, error, errorCode, session }
 *   errorCode: 'offline' | 'taken' | 'weak_password' | 'sync_failed' | 'password_failed'
 */
export async function createAccount(username, password, displayName, recoveryCodeInput) {
  if (!SUPABASE_READY || !supabase) return { success: false, error: 'Cannot connect. Try again.', errorCode: 'offline' }

  // Validate
  const pwErr = validatePassword(password)
  if (pwErr) return { success: false, error: pwErr, errorCode: 'weak_password' }

  const u       = username.toLowerCase()
  const display = (displayName || '').trim() || u
  const candidateRecovery = String(recoveryCodeInput || '').trim()
  const recoveryCode = candidateRecovery ? candidateRecovery : generateRecoveryCode()
  const recoveryNormalized = cleanRecoveryCode(recoveryCode)
  if (recoveryNormalized.length < 8) {
    return { success: false, error: 'Recovery code is too short. Use at least 8 characters.', errorCode: 'weak_recovery_code' }
  }

  // Check availability
  const { available, error: availErr } = await isUsernameAvailable(u)
  if (availErr && availErr !== 'offline') {
    console.warn('[FAS] availability check error:', availErr)
  }
  if (!available) {
    return { success: false, error: 'That username is already taken. Choose a different handle.', errorCode: 'taken' }
  }

  // Generate salt + hash password
  let salt, hash
  try {
    salt = generateSalt()
    hash = await hashPassword(password, salt)
  } catch(e) {
    return { success: false, error: 'Hashing failed. Browser may not support Web Crypto.', errorCode: 'crypto_error' }
  }

  let recoveryHash
  try {
    recoveryHash = await hashRecoveryCode(recoveryNormalized)
  } catch (e) {
    return { success: false, error: 'Could not process recovery code. Try again.', errorCode: 'recovery_hash_failed' }
  }

  // Create member_accounts row
  const synced = await syncMember(u, display)
  // syncMember returns the data or null — non-null means success
  // Even if null (e.g. row already exists), proceed to try set_member_password

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
      .eq('username', u)

    if (!identityErr) {
      identitySaved = true
      break
    }

    if (identityErr.code !== '23505') {
      return {
        success: false,
        error: 'Account setup is missing anonymous identity support. Run migration 019 and try again.',
        errorCode: 'identity_schema_missing',
      }
    }
  }

  if (!identitySaved) {
    return { success: false, error: 'Could not allocate a Signal ID. Please try again.', errorCode: 'platform_id_collision' }
  }

  const { data: identityRow } = await supabase
    .from('member_accounts')
    .select('platform_id')
    .eq('username', u)
    .maybeSingle()

  if (identityRow && identityRow.platform_id) {
    platformId = String(identityRow.platform_id).toUpperCase()
  }

  // Set password (only works if password_hash IS NULL)
  const { data: ok, error: setErr } = await supabase
    .rpc('set_member_password', { p_username: u, p_hash: hash, p_salt: salt })

  if (setErr) {
    console.error('[FAS] set_member_password error:', setErr.message)
    return { success: false, error: 'Account created but could not set password. Contact support.', errorCode: 'password_failed' }
  }

  if (!ok) {
    // This means a password was already set — username was claimed
    return { success: false, error: 'That username is already taken with a password. Try a different handle.', errorCode: 'taken' }
  }

  // Store in legacy localStorage accounts list (for offline radio chat gate)
  try {
    const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}')
    accounts[u] = { username: u, display, platform_id: platformId, created: Date.now() }
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
  } catch(e) {}

  const session = {
    username: u,
    display,
    platform_id: platformId,
    plan: 'free',
    status: 'free',
    role: 'user',
    veil_state: 'unveiled',
    ts: Date.now(),
    ph: hash,
  }
  storeSession(session)
  return { success: true, session, recoveryCode, platformId }
}

/**
 * Set a password for an account that doesn't have one yet.
 * Used by existing members who pre-date the password system.
 *
 * @returns {object} { success, error }
 */
export async function setInitialPassword(username, password) {
  if (!SUPABASE_READY || !supabase) return { success: false, error: 'Cannot connect. Try again.' }

  const pwErr = validatePassword(password)
  if (pwErr) return { success: false, error: pwErr }

  const u = username.toLowerCase()

  let salt, hash
  try {
    salt = generateSalt()
    hash = await hashPassword(password, salt)
  } catch(e) {
    return { success: false, error: 'Hashing failed. Browser may not support Web Crypto.' }
  }

  const { data: ok, error } = await supabase
    .rpc('set_member_password', { p_username: u, p_hash: hash, p_salt: salt })

  if (error) return { success: false, error: 'Server error. Try again.' }
  if (!ok)   return { success: false, error: 'Could not set password — it may already be set. Contact support if this keeps happening.' }

  return { success: true }
}

// ── Session helpers ───────────────────────────────────────────

function storeSession(session) {
  try {
    const normalized = {
      ...(session || {}),
      veil_state: normalizeVeilState(session && session.veil_state),
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(normalized))
    localStorage.setItem(MEMBER_KEY, 'true')
  } catch(e) {}
}

export function getStoredSession() {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
    if (!raw) return null
    raw.veil_state = normalizeVeilState(raw.veil_state)
    return raw
  } catch(e) {
    return null
  }
}

export function clearStoredSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(MEMBER_KEY)
  } catch(e) {}
}
