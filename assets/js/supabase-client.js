/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — SUPABASE CLIENT
 *  assets/js/supabase-client.js
 *
 *  The single shared Supabase client for all browser-side JS.
 *  Reads credentials from window.__FAS_CONFIG, which is written
 *  by server.js (dev) or scripts/generate-env.js (Cloudflare Pages)
 *  from SUPABASE_URL and SUPABASE_ANON_KEY environment variables.
 *
 *  USAGE — import in any ES module:
 *    import { supabase, SUPABASE_READY } from '/assets/js/supabase-client.js'
 *
 *    if (SUPABASE_READY) {
 *      const { data, error } = await supabase.from('creator_profiles').select('*')
 *    }
 *
 *  PREREQUISITE — HTML pages must load env.js before any module
 *  that imports this file. Add this block before your <script type="module"> tags:
 *
 *    <script>window.__FAS_CONFIG = window.__FAS_CONFIG || {}</script>
 *    <script src="/assets/js/env.js" onerror="void 0"></script>
 *
 *  The onerror prevents a missing env.js from breaking the page.
 *  If env.js doesn't load, SUPABASE_READY will be false and all
 *  consuming code stays in static preview mode automatically.
 *
 *  STATUS:
 *    - Set SUPABASE_URL and SUPABASE_ANON_KEY env vars
 *    - Restart the server → env.js gets written → client activates
 *    - SUPABASE_READY becomes true → all [SUPABASE CONNECT] hooks fire
 *
 *  NOTE ON THE ANON KEY:
 *    Supabase anon keys are designed to be public. Protection is
 *    enforced by Row Level Security policies on the database, not
 *    by keeping the key secret. See: supabase.com/docs/guides/auth/row-level-security
 * ============================================================
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── READ CREDENTIALS FROM INJECTED CONFIG ────────────────────────────
// window.__FAS_CONFIG is written by server.js (dev) or generate-env.js (CI/CD).
// Falls back to embedded public credentials so the client works from any
// static host or Replit preview URL without a running server.
// The anon key is a Supabase publishable key — safe for browser code.
// Protection is enforced by Row Level Security, not by key secrecy.
const cfg = (typeof window !== 'undefined' && window.__FAS_CONFIG) || {}

const SUPABASE_URL      = cfg.supabaseUrl     || 'https://ghufaozjwondqcrcucjs.supabase.co'
const SUPABASE_ANON_KEY = cfg.supabaseAnonKey || 'sb_publishable_kixI74nB7Drt6mQKooaXHg_nPoE0h_-'

// ── EXPORTS ──────────────────────────────────────────────────────────

/**
 * True when both SUPABASE_URL and SUPABASE_ANON_KEY are present.
 * All consuming code guards with: if (SUPABASE_READY) { ... }
 */
export const SUPABASE_READY = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

/**
 * Shared Supabase client instance.
 * null when SUPABASE_READY is false — always guard before use.
 */
export const supabase = SUPABASE_READY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null


// ── DEV LOGGING ──────────────────────────────────────────────────────
if (!SUPABASE_READY) {
  console.info(
    '[FAS] supabase-client.js: No credentials found in window.__FAS_CONFIG.',
    'Running in static preview mode.',
    '\n  → Set SUPABASE_URL and SUPABASE_ANON_KEY env vars and restart the server.'
  )
}
