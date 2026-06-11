/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — SUPABASE CONFIGURATION
 *  assets/js/supabase-config.js
 *
 *  STATUS: NOT YET ACTIVE — placeholder only.
 *  All Supabase code is commented out. Nothing here runs.
 *
 *  TO ACTIVATE:
 *    1. Create a Supabase project at https://supabase.com
 *    2. Fill in SUPABASE_URL and SUPABASE_ANON_KEY below
 *    3. Create the tables listed in the DATABASE SCHEMA section
 *    4. Uncomment the createClient lines
 *    5. Load this file before intake-form.js in your HTML
 *
 *  ENVIRONMENT SETUP:
 *    For Cloudflare Pages deployment, set these as environment variables:
 *      SUPABASE_URL        → your project URL
 *      SUPABASE_ANON_KEY   → your public anon key (safe for frontend)
 *    Then expose them via a _worker.js or Pages Function if needed,
 *    or hard-code them here since the anon key is safe to expose.
 * ============================================================
 */


/* ── SUPABASE CLIENT ──────────────────────────────────────────
 *  The actual client now lives in supabase-client.js.
 *  This file re-exports { supabase, SUPABASE_READY } from there
 *  so any code importing supabase-config.js still works unchanged.
 *
 *  supabase-client.js reads credentials from window.__FAS_CONFIG,
 *  which is written by server.js (dev) or scripts/generate-env.js
 *  (Cloudflare Pages) from SUPABASE_URL and SUPABASE_ANON_KEY env vars.
 *
 *  To activate: set SUPABASE_URL and SUPABASE_ANON_KEY in Replit Secrets,
 *  then restart the server. The client activates automatically.
 * ─────────────────────────────────────────────────────────── */


/* ── DATABASE SCHEMA REFERENCE ────────────────────────────────
 *
 *  Full migration: supabase/migrations/001_initial_schema.sql
 *  Run that file in the Supabase SQL Editor to create all tables.
 *
 *  TABLE: profiles
 *  → Read by:   network.html (board), creator/business template pages
 *  → Written by: admin after approving a submission
 *  → Purpose:   Central identity record for every creator and business
 *
 *  Key fields: username, display_name, email, bio, avatar_url,
 *              category, city, state, links_json, plan_type,
 *              is_featured, is_active, slug
 *
 *  RLS: SELECT allow anon (is_active=true) · INSERT/UPDATE authenticated
 *
 *
 *  TABLE: pages
 *  → Read by:   templates/creator.html, templates/business.html
 *  → Written by: admin after building the page
 *  → Purpose:   Page-specific configuration and lifecycle status
 *
 *  Key fields: profile_id, page_type, template_name, title, subtitle,
 *              theme_style, page_status, custom_domain, page_slug,
 *              upgrade_status, metadata_json
 *
 *  Status flow: draft → submitted → live → paused
 *  RLS: SELECT allow anon (page_status='live') · INSERT/UPDATE authenticated
 *
 *
 *  TABLE: submissions
 *  → Written by: free.html + start.html forms (anon INSERT)
 *  → Read by:    admin/index.html (authenticated only)
 *  → Purpose:   All intake form data — free signups, paid intake, update requests
 *
 *  Key fields: profile_id, page_id, submission_type, display_name, username,
 *              bio, links_json, image_url, style_notes, selected_template,
 *              selected_plan, status
 *
 *  submission_type: 'free_signup' | 'paid_intake' | 'update_request'
 *  status:          'pending' | 'in_progress' | 'live' | 'rejected'
 *  RLS: INSERT allow anon · SELECT/UPDATE authenticated only
 *
 *
 *  TABLE: board_posts
 *  → Read by:   board-feed.js on network.html
 *  → Written by: admin / future creator dashboard
 *  → Purpose:   Creator network board posts and announcements
 *
 *  Key fields: profile_id, username, post_text, category,
 *              image_url, is_featured, is_approved, visibility_status
 *
 *  category:          'release' | 'update' | 'collab' | 'announcement' | 'question'
 *  visibility_status: 'pending' | 'visible' | 'hidden'
 *  RLS: SELECT allow anon (is_approved=true AND visible) · INSERT/UPDATE authenticated
 *
 *
 *  TABLE: payments
 *  → Written by: admin after confirming payment
 *  → Purpose:   Tracks all payment events (Stripe Payment Links + Cash App manual)
 *
 *  Key fields: profile_id, page_id, provider, payment_type, amount,
 *              currency, status, external_reference, plan_type
 *
 *  provider:     'stripe' | 'cashapp'
 *  payment_type: 'setup' | 'monthly' | 'upgrade'
 *  status:       'pending' | 'confirmed' | 'failed' | 'refunded'
 *  RLS: authenticated only (never public)
 *
 *
 *  TABLE: admin_notes
 *  → Written by: admin
 *  → Purpose:   Internal review notes and workflow status per profile/page
 *
 *  Key fields: profile_id, page_id, note_text, internal_status, updated_by
 *
 *  internal_status: 'pending_review' | 'in_progress' | 'complete' | 'flagged' | 'on_hold'
 *  RLS: authenticated only (never public)
 *
 *
 *  STORAGE BUCKET: profile-images
 *  → Used by:     intake form file upload field (submissions.image_url)
 *  → Path pattern: profile-images/{username}/{filename}
 *  → Access:      Public read, authenticated write
 *  → Create in:   Supabase Storage → New bucket → name: profile-images → Public
 *
 * ─────────────────────────────────────────────────────────── */


/* ── FEATURE ACTIVATION ORDER ─────────────────────────────────
 *
 *  Activate each feature in this sequence. Each phase is independent —
 *  earlier phases don't block later ones. This order minimizes friction.
 *
 *  PHASE 1 — Creator Board Data (network.html)
 *    Tables:  profiles, board_posts
 *    Files:   assets/js/board-feed.js     → import getBoardPosts from services/board.js
 *             assets/js/creator-data.js   → import getProfiles from services/creators.js
 *    Hook:    search [SUPABASE CONNECT] in board-feed.js and creator-data.js
 *    Result:  network board renders from live DB, not static JS array
 *
 *  PHASE 2 — Auto-Generated Page Templates
 *    Tables:  profiles, pages
 *    Files:   assets/js/page-renderer.js  → import getProfileWithPage from services/creators.js
 *    HTML:    templates/creator.html, templates/business.html
 *    Hook:    search [SUPABASE CONNECT] in page-renderer.js
 *    Result:  templates/creator.html?slug=X renders from DB, not static data
 *
 *  PHASE 3 — Free Signup Capture (free.html)
 *    Table:   submissions (submission_type = 'free_signup')
 *    File:    assets/js/free-signup.js → import submitFreeSignup from services/submissions.js
 *    Hook:    search [SUPABASE CONNECT] in free-signup.js
 *    Result:  free.html form saves to DB before redirecting to start.html
 *
 *  PHASE 4 — Paid Intake (start.html)
 *    Tables:  submissions (submission_type = 'paid_intake'), profile-images (storage)
 *    File:    assets/js/intake-form.js → import submitIntake, uploadProfileImage from services/submissions.js
 *    Hook:    search [SUPABASE CONNECT] in intake-form.js
 *    Result:  intake form saves full submission + image upload, redirects with token
 *
 *  PHASE 5 — Thank You Token Lookup (thankyou.html)
 *    Table:   submissions
 *    File:    thankyou.html inline script → import getSubmissionById from services/submissions.js
 *    Hook:    search [SUPABASE CONNECT] in thankyou.html inline script
 *    Result:  confirmation page verifies the submission and shows real details
 *
 *  PHASE 6 — Admin Dashboard (admin/index.html)
 *    Tables:  profiles, pages, submissions, payments, admin_notes
 *    File:    admin/index.html → JS module fetching all tables with authenticated client
 *    Hook:    search [SUPABASE CONNECT] in admin/index.html
 *    Result:  live pipeline counts, full submissions table, action buttons work
 *
 * ─────────────────────────────────────────────────────────── */


/* ── RE-EXPORT FROM supabase-client.js ────────────────────────
 *  All consuming code (intake-form.js, free-signup.js, etc.)
 *  imports from this file. This re-export means they all get
 *  the real client automatically once env vars are configured.
 *
 *  If supabase-client.js cannot be loaded (e.g. env.js missing),
 *  SUPABASE_READY will be false and all consuming code stays in
 *  static preview mode without any errors.
 */
export { supabase, SUPABASE_READY } from './supabase-client.js'
