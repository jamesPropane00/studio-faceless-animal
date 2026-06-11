/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — ADMIN DASHBOARD
 *  assets/js/admin.js
 *
 *  Supabase-backed admin module. Uses platform-native member auth.
 *  Loaded as ES module by admin/index.html.
 *
 *  Auth architecture:
 *    All authentication and authorisation logic lives in
 *    admin-auth.js. This file only calls those helpers —
 *    it never uses email-identity auth.
 *
 *    Current access model: platform-native member session
 *    (username/Signal ID + password hash), then role check
 *    in member_accounts.
 *    Access is granted only for role super_admin/admin.
 *
 *    Write operations are annotated with:
 *      // TODO: ROLE CHECK — require ADMIN_ROLES.SUPER_ADMIN
 *    These lines are where per-operation permission checks
 *    should be enforced for sensitive admin mutations.
 * ============================================================
 */

import { supabase, SUPABASE_READY } from './supabase-client.js'
import { signIn as signInMember } from './auth.js'
import { confirmPayment, rejectPayment, recordPayment } from './services/payments.js'
import { applyUpgrade, requestUpgrade, cancelUpgradeRequest, getPlanSummary } from './services/plan-manager.js'
import {
  getAdminSession,
  requireAdminSession,
  onAuthChange,
  setAdminState,
  ADMIN_ROLES,
} from './admin-auth.js'

// ── DOM helpers ────────────────────────────────────────────────
const $ = id => document.getElementById(id)

// ── State ──────────────────────────────────────────────────────
let session = null
let currentTab = 'profiles'

// ── Filter preset map ──────────────────────────────────────────
const FILTER_PRESETS = {
  profiles: {
    all:      {},
    active:   { is_active: true },
    inactive: { is_active: false },
    featured: { is_featured: true },
  },
  pages: {
    all:       {},
    draft:     { page_status: 'draft' },
    submitted: { page_status: 'submitted' },
    live:      { page_status: 'live' },
    paused:    { page_status: 'paused' },
  },
  submissions: {
    all:            {},
    free_signup:    { submission_type: 'free_signup' },
    paid_intake:    { submission_type: 'paid_intake' },
    update_request: { submission_type: 'update_request' },
    pending:        { status: 'pending' },
    in_progress:    { status: 'in_progress' },
    rejected:       { status: 'rejected' },
  },
  board: {
    all:      {},
    pending:  { visibility_status: 'pending' },
    visible:  { visibility_status: 'visible' },
    hidden:   { visibility_status: 'hidden' },
  },
  payments: {
    all:       {},
    pending:   { status: 'pending' },
    confirmed: { status: 'confirmed' },
    failed:    { status: 'failed' },
  },
}

// ── INIT ───────────────────────────────────────────────────────
// AUTH GUARD — entry point for all admin access.
// All session/role logic is delegated to admin-auth.js.
// To add role enforcement: update requireAdminSession() there.
async function init() {
  if (!SUPABASE_READY) {
    showConfigError()
    return
  }

  // Check for an existing session on page load
  const { session: s, isAdmin, role } = await getAdminSession()
  if (s) {
    if (!isAdmin) {
      showNotAuthorized()
      return
    }
    session = s
    setAdminState(isAdmin, role)
    showDashboard()
  } else {
    showLogin()
  }

  // Subscribe to sign-in / sign-out events
  onAuthChange({
    onSignIn(s, role, isAdmin) {
      if (!isAdmin) {
        session = null
        showNotAuthorized()
        return
      }
      session = s
      showDashboard()
    },
    onSignOut() {
      session = null
      showLogin()
    },
  })
}

function showLogin() {
  $('adm-login').style.display = 'flex'
  $('adm-main').style.display = 'none'
}

function showDashboard() {
  $('adm-login').style.display = 'none'
  $('adm-main').style.display = ''
  $('adm-user-identity').textContent = getAdminActorTag()
  activateTab('profiles')
}

function getAdminActorTag() {
  try {
    const local = JSON.parse(localStorage.getItem('fas_user') || 'null')
    if (local && local.username) return '@' + String(local.username).toLowerCase()
    if (local && local.platform_id) return String(local.platform_id)
  } catch {}
  return session?.platform_id || session?.username || 'admin-session'
}

function showNotAuthorized() {
  $('adm-login').style.display = 'flex'
  $('adm-main').style.display = 'none'
  const form = document.querySelector('.adm-login-form')
  if (form) {
    form.innerHTML = [
      '<p style="color:#f87171;text-align:center;font-size:1rem;font-weight:800;margin-bottom:0.75rem;">Not Authorized</p>',
      '<p style="color:#a8a8a8;text-align:center;font-size:0.84rem;line-height:1.6;">This admin page requires role <strong>super_admin</strong> or <strong>admin</strong> in member_accounts for the signed-in admin account.</p>',
      '<p style="text-align:center;margin-top:1.25rem;">',
      '<a href="../index.html" style="color:#c9a96e;font-size:0.8rem;">← Back to site</a>',
      '</p>',
    ].join('')
  }
  // Clear local member session so the user cannot retry with stale access.
  try {
    localStorage.removeItem('fas_user')
    localStorage.removeItem('fas_member')
  } catch {}
}

function showConfigError() {
  $('adm-login').style.display = 'flex'
  $('adm-main').style.display = 'none'
  const form = document.querySelector('.adm-login-form')
  if (form) form.innerHTML = '<p style="color:#ef4444;text-align:center;">Supabase is not configured.<br>Set SUPABASE_URL and SUPABASE_ANON_KEY in your environment.</p>'
}

// ── AUTH ───────────────────────────────────────────────────────
// Sign-in and sign-out use the same member auth flow as the live app.
// All post-auth routing is handled by the onAuthChange callback in init().
async function signIn() {
  const loginKey = $('adm-login-id').value.trim()
  const password = $('adm-password').value
  const btn      = $('adm-signin-btn')
  const err      = $('adm-login-error')

  if (!loginKey || !password) { err.textContent = 'Username/Signal ID and password are required.'; return }

  btn.textContent = 'Signing in…'
  btn.disabled = true
  err.textContent = ''

  const result = await signInMember(loginKey, password)

  btn.textContent = 'Sign In'
  btn.disabled = false

  if (!result || !result.success) {
    err.textContent = result && result.error ? result.error : 'Sign in failed.'
    return
  }

  const auth = await requireAdminSession()
  if (!auth.ok) {
    err.textContent = 'This account does not have admin access.'
    await signOut()
    return
  }

  session = auth.session
  setAdminState(true, auth.role)
  showDashboard()
}

async function signOut() {
  try {
    localStorage.removeItem('fas_user')
    localStorage.removeItem('fas_member')
  } catch {}
}

// ── TABS ───────────────────────────────────────────────────────
function activateTab(tab) {
  currentTab = tab

  document.querySelectorAll('.adm-tab').forEach(el => {
    el.classList.toggle('adm-tab--active', el.dataset.tab === tab)
  })
  document.querySelectorAll('.adm-pane').forEach(el => {
    el.style.display = el.dataset.tab === tab ? '' : 'none'
  })

  // Reset filter active state
  document.querySelectorAll(`.adm-filter-btn[data-group="${tab}"]`).forEach((b, i) => {
    b.classList.toggle('adm-filter-btn--active', i === 0)
  })

  const loaders = {
    profiles:    () => loadProfiles(),
    pages:       () => loadPages(),
    submissions: () => loadSubmissions(),
    board:       () => loadBoardPosts(),
    payments:    () => loadPayments(),
    notes:       () => loadNotes(),
  }

  loaders[tab]?.()
}

// ── RENDER HELPERS ─────────────────────────────────────────────
function setLoading(id, msg = 'Loading…') {
  const el = $(id)
  if (el) el.innerHTML = `<p class="adm-state-msg">${msg}</p>`
}

function setEmpty(id, msg = 'No records found.') {
  const el = $(id)
  if (el) el.innerHTML = `<p class="adm-state-msg adm-state-msg--dim">${msg}</p>`
}

function setErr(id, msg) {
  const el = $(id)
  if (el) el.innerHTML = `<p class="adm-state-msg adm-state-msg--err">Error: ${msg}</p>`
}

function setSetupNote(id, label) {
  const el = $(id)
  if (el) el.innerHTML = `<div class="adm-setup-note">
    <strong>${label} table not set up yet.</strong>
    Run <code>supabase/migrations/007_admin_tables.sql</code> in your Supabase SQL Editor.
  </div>`
}

function fmt(val) {
  if (val == null || val === '') return '<span style="color:var(--text-3);">—</span>'
  return String(val)
}

function fmtDate(ts) {
  if (!ts) return '<span style="color:var(--text-3);">—</span>'
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function pill(text, key) {
  const COLOR = {
    active: '#22c55e',    inactive: '#6b7280',
    live:   '#c9a96e',    draft:    '#6b7280',
    submitted: '#60a5fa', paused:   '#f97316',
    pending:   '#9ca3af', in_progress: '#fbbf24',
    rejected:  '#ef4444', confirmed: '#22c55e',
    failed:    '#ef4444', refunded:  '#a78bfa',
    visible:   '#22c55e', hidden:    '#6b7280',
    yes:    '#22c55e',    no:        '#6b7280',
    free:      '#6b7280', starter:   '#60a5fa',
    pro:    '#c9a96e',    premium:   '#a78bfa',
    release: '#c9a96e',   update:    '#60a5fa',
    collab: '#22c55e',    announcement: '#fbbf24',
    free_signup:    '#6b7280',
    paid_intake:    '#c9a96e',
    update_request: '#60a5fa',
    approved: '#22c55e',  unapproved: '#9ca3af',
    'cash app': '#22c55e', stripe: '#a78bfa', other: '#6b7280',
  }
  const k = (key ?? text ?? '').toString().toLowerCase().replace(/\s+/g, '_')
  const c = COLOR[k] || COLOR[text?.toString().toLowerCase()] || '#6b7280'
  const label = text?.toString().replace(/_/g, ' ') || '—'
  return `<span style="display:inline-block;padding:0.15em 0.55em;border-radius:99px;font-size:0.68rem;font-weight:700;letter-spacing:0.04em;background:${c}1a;color:${c};border:1px solid ${c}33;">${label}</span>`
}

function aBtn(label, call, danger = false) {
  const c = danger ? '#ef4444' : 'var(--gold-dim)'
  return `<button onclick="${call}" class="adm-action-btn${danger ? ' adm-action-btn--danger' : ''}">${label}</button>`
}

function statusSelect(id, choices, fnName) {
  const opts = choices.map(s => `<option value="${s}">→ ${s.replace(/_/g, ' ')}</option>`).join('')
  return `<select onchange="if(this.value)window._adm['${fnName}']('${id}',this.value)" class="adm-status-select">
    <option value="">Set status…</option>${opts}
  </select>`
}

function buildTable(headers, rows) {
  if (!rows.length) return '<p class="adm-state-msg adm-state-msg--dim">No records found.</p>'
  const ths = headers.map(h =>
    `<th>${h}</th>`
  ).join('')
  const trs = rows.map(cells => {
    const tds = cells.map(c => `<td>${c ?? '<span style="color:var(--text-3);">—</span>'}</td>`).join('')
    return `<tr>${tds}</tr>`
  }).join('')
  return `<div style="overflow-x:auto;"><table class="adm-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`
}

// ── PROFILES ───────────────────────────────────────────────────
async function loadProfiles(filter = {}) {
  setLoading('adm-profiles-body', 'Loading profiles…')

  let q = supabase
    .from('profiles')
    .select('id, username, display_name, plan_type, category, is_active, is_featured, slug, created_at')
    .order('created_at', { ascending: false })

  if (filter.is_active != null)   q = q.eq('is_active', filter.is_active)
  if (filter.is_featured === true) q = q.eq('is_featured', true)

  const { data, error } = await q
  if (error) { setErr('adm-profiles-body', error.message); return }
  if (!data?.length) { setEmpty('adm-profiles-body', 'No profiles found.'); return }

  const pageType = cat => {
    if (!cat) return 'creator'
    const c = cat.toLowerCase()
    if (c === 'business') return 'business'
    if (['dj', 'artist', 'producer', 'musician'].includes(c)) return 'artist'
    return 'creator'
  }

  const rows = data.map(r => [
    `<div>
      <strong style="color:var(--text);font-size:0.82rem;">${r.display_name || '—'}</strong><br>
      <span style="font-size:0.72rem;color:var(--text-3);">@${r.username || '—'}</span>
    </div>`,
    pill(r.plan_type || 'free', r.plan_type),
    fmt(r.category),
    pill(r.is_active ? 'Active' : 'Inactive', r.is_active ? 'active' : 'inactive'),
    pill(r.is_featured ? 'Yes' : 'No', r.is_featured ? 'yes' : 'no'),
    fmtDate(r.created_at),
    `<div style="display:flex;gap:0.35rem;flex-wrap:wrap;align-items:center;">
      ${r.slug ? `<a href="/${pageType(r.category)}/${r.slug}" target="_blank" class="adm-link">↗ View</a>` : ''}
      ${aBtn(r.is_active ? 'Deactivate' : 'Activate', `window._adm.toggleActive('${r.id}', ${r.is_active})`)}
      ${aBtn(r.is_featured ? 'Unfeature' : 'Feature', `window._adm.toggleFeatured('${r.id}', ${r.is_featured})`)}
      <select
        title="Upgrade plan"
        class="adm-status-select adm-plan-select"
        onchange="if(this.value)window._adm.adminUpgradePlan('${r.id}',this.value)">
        <option value="">Upgrade plan…</option>
        ${['free','starter','pro','premium']
          .filter(p => p !== r.plan_type)
          .map(p => `<option value="${p}">→ ${p}</option>`)
          .join('')}
      </select>
    </div>`,
  ])

  $('adm-profiles-body').innerHTML = buildTable(
    ['Creator', 'Plan', 'Category', 'Active', 'Featured', 'Joined', 'Actions'],
    rows
  )
}

async function toggleActive(id, current) {
  // TODO: ROLE CHECK — require ADMIN_ROLES.SUPER_ADMIN or ADMIN_ROLES.MODERATOR
  // const auth = await requireAdminSession({ requiredRole: ADMIN_ROLES.SUPER_ADMIN })
  // if (!auth.ok) { alert('Access denied.'); return }
  const { error } = await supabase.from('profiles').update({ is_active: !current }).eq('id', id)
  if (error) { alert('Error: ' + error.message); return }
  loadProfiles()
}

async function toggleFeatured(id, current) {
  // TODO: ROLE CHECK — require ADMIN_ROLES.SUPER_ADMIN
  // const auth = await requireAdminSession({ requiredRole: ADMIN_ROLES.SUPER_ADMIN })
  // if (!auth.ok) { alert('Access denied.'); return }
  const { error } = await supabase.from('profiles').update({ is_featured: !current }).eq('id', id)
  if (error) { alert('Error: ' + error.message); return }
  loadProfiles()
}

// ── PAGES ──────────────────────────────────────────────────────
async function loadPages(filter = {}) {
  setLoading('adm-pages-body', 'Loading pages…')

  let q = supabase
    .from('pages')
    .select('id, page_slug, page_type, page_status, template_name, custom_domain, upgrade_status, created_at, profiles(username, display_name)')
    .order('created_at', { ascending: false })

  if (filter.page_status) q = q.eq('page_status', filter.page_status)

  const { data, error } = await q
  if (error) { setErr('adm-pages-body', error.message); return }
  if (!data?.length) { setEmpty('adm-pages-body', 'No pages found.'); return }

  const rows = data.map(r => [
    `<div>
      <strong style="color:var(--text);font-size:0.82rem;">${r.profiles?.display_name || '—'}</strong><br>
      <span style="font-size:0.72rem;color:var(--text-3);">@${r.profiles?.username || '—'}</span>
    </div>`,
    `<span style="font-family:monospace;font-size:0.75rem;color:var(--text-2);">${r.page_slug || '—'}</span>`,
    fmt(r.page_type),
    pill(r.page_status || 'draft', r.page_status || 'draft'),
    fmt(r.template_name),
    r.custom_domain
      ? `<span style="font-size:0.72rem;color:var(--text-2);">${r.custom_domain}</span>`
      : '<span style="color:var(--text-3);font-size:0.72rem;">—</span>',
    fmt(r.upgrade_status),
    statusSelect(r.id, ['draft', 'submitted', 'live', 'paused'], 'setPageStatus'),
  ])

  $('adm-pages-body').innerHTML = buildTable(
    ['Profile', 'Slug', 'Type', 'Status', 'Template', 'Domain', 'Upgrade', 'Actions'],
    rows
  )
}

async function setPageStatus(id, status) {
  // TODO: ROLE CHECK — require ADMIN_ROLES.SUPER_ADMIN
  // const auth = await requireAdminSession({ requiredRole: ADMIN_ROLES.SUPER_ADMIN })
  // if (!auth.ok) { alert('Access denied.'); return }
  if (!status) return
  const { error } = await supabase.from('pages').update({ page_status: status }).eq('id', id)
  if (error) { alert('Error: ' + error.message); return }
  loadPages()
}

// ── SUBMISSIONS ────────────────────────────────────────────────
async function loadSubmissions(filter = {}) {
  setLoading('adm-submissions-body', 'Loading submissions…')

  let q = supabase
    .from('submissions')
    .select('id, submission_type, display_name, username, selected_plan, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (filter.submission_type) q = q.eq('submission_type', filter.submission_type)
  if (filter.status)          q = q.eq('status', filter.status)

  const { data, error } = await q
  if (error) { setErr('adm-submissions-body', error.message); return }
  if (!data?.length) { setEmpty('adm-submissions-body', 'No submissions found.'); return }

  const rows = data.map(r => [
    `<div>
      <strong style="color:var(--text);font-size:0.82rem;">${r.display_name || '—'}</strong><br>
      <span style="font-size:0.72rem;color:var(--text-3);">@${r.username || '—'}</span>
    </div>`,
    pill(r.submission_type?.replace(/_/g, ' ') || '—', r.submission_type),
    pill(r.selected_plan || 'free', r.selected_plan),
    pill(r.status || 'pending', r.status),
    fmtDate(r.created_at),
    statusSelect(r.id, ['pending', 'in_progress', 'live', 'rejected'], 'setSubmissionStatus'),
  ])

  $('adm-submissions-body').innerHTML = buildTable(
    ['Creator', 'Type', 'Plan', 'Status', 'Submitted', 'Actions'],
    rows
  )
}

async function setSubmissionStatus(id, status) {
  // TODO: ROLE CHECK — require ADMIN_ROLES.SUPER_ADMIN or ADMIN_ROLES.MODERATOR
  // const auth = await requireAdminSession({ requiredRole: ADMIN_ROLES.MODERATOR })
  // if (!auth.ok) { alert('Access denied.'); return }
  if (!status) return
  const { error } = await supabase.from('submissions').update({ status }).eq('id', id)
  if (error) { alert('Error: ' + error.message); return }
  loadSubmissions()
}

// ── BOARD POSTS ────────────────────────────────────────────────
async function loadBoardPosts(filter = {}) {
  setLoading('adm-board-body', 'Loading board posts…')

  let q = supabase
    .from('board_posts')
    .select('id, post_text, username, category, is_approved, is_featured, visibility_status, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (filter.visibility_status) q = q.eq('visibility_status', filter.visibility_status)
  if (filter.is_approved != null) q = q.eq('is_approved', filter.is_approved)

  const { data, error } = await q
  if (error) { setErr('adm-board-body', error.message); return }
  if (!data?.length) { setEmpty('adm-board-body', 'No board posts found.'); return }

  const rows = data.map(r => [
    `<span style="font-size:0.78rem;color:var(--text-2);">@${r.username || '—'}</span>`,
    `<span style="font-size:0.78rem;color:var(--text-2);max-width:30ch;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(r.post_text || '').replace(/"/g, '&quot;')}">${(r.post_text || '').substring(0, 90) || '—'}</span>`,
    fmt(r.category),
    pill(r.visibility_status || 'pending', r.visibility_status),
    pill(r.is_approved ? 'Approved' : 'Pending', r.is_approved ? 'active' : 'pending'),
    pill(r.is_featured ? 'Yes' : 'No', r.is_featured ? 'yes' : 'no'),
    fmtDate(r.created_at),
    `<div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
      ${aBtn(r.is_approved ? 'Unapprove' : 'Approve', `window._adm.togglePostApproval('${r.id}', ${r.is_approved})`)}
      ${aBtn(r.is_featured ? 'Unfeature' : 'Feature', `window._adm.togglePostFeatured('${r.id}', ${r.is_featured})`)}
      ${aBtn(r.visibility_status === 'visible' ? 'Hide' : 'Show', `window._adm.setPostVisibility('${r.id}', '${r.visibility_status}')`)}
    </div>`,
  ])

  $('adm-board-body').innerHTML = buildTable(
    ['Username', 'Post', 'Category', 'Visibility', 'Approval', 'Featured', 'Date', 'Actions'],
    rows
  )
}

async function togglePostApproval(id, current) {
  // TODO: ROLE CHECK — require ADMIN_ROLES.MODERATOR or higher
  // const auth = await requireAdminSession({ requiredRole: ADMIN_ROLES.MODERATOR })
  // if (!auth.ok) { alert('Access denied.'); return }
  const newVal = !current
  const visibility = newVal ? 'visible' : 'pending'
  const { error } = await supabase.from('board_posts')
    .update({ is_approved: newVal, visibility_status: visibility })
    .eq('id', id)
  if (error) { alert('Error: ' + error.message); return }
  loadBoardPosts()
}

async function togglePostFeatured(id, current) {
  // TODO: ROLE CHECK — require ADMIN_ROLES.MODERATOR or higher
  // const auth = await requireAdminSession({ requiredRole: ADMIN_ROLES.MODERATOR })
  // if (!auth.ok) { alert('Access denied.'); return }
  const { error } = await supabase.from('board_posts').update({ is_featured: !current }).eq('id', id)
  if (error) { alert('Error: ' + error.message); return }
  loadBoardPosts()
}

async function setPostVisibility(id, current) {
  // TODO: ROLE CHECK — require ADMIN_ROLES.MODERATOR or higher
  // const auth = await requireAdminSession({ requiredRole: ADMIN_ROLES.MODERATOR })
  // if (!auth.ok) { alert('Access denied.'); return }
  const next = current === 'visible' ? 'hidden' : 'visible'
  const { error } = await supabase.from('board_posts').update({ visibility_status: next }).eq('id', id)
  if (error) { alert('Error: ' + error.message); return }
  loadBoardPosts()
}

// ── PAYMENTS ───────────────────────────────────────────────────
async function loadPayments(filter = {}) {
  setLoading('adm-payments-body', 'Loading payments…')

  let q = supabase
    .from('payments')
    .select('id, provider, payment_type, plan_type, amount, status, payment_reference, notes, confirmed_at, billing_period_end, created_at, profiles(id, username, display_name, plan_type)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (filter.status) q = q.eq('status', filter.status)

  const { data, error } = await q

  if (error?.code === '42P01') {
    setSetupNote('adm-payments-body', 'Payments')
    return
  }
  if (error) { setErr('adm-payments-body', error.message); return }
  if (!data?.length) { setEmpty('adm-payments-body', 'No payments recorded yet.'); return }

  const rows = data.map(r => {
    const isPending   = r.status === 'pending' || r.status === 'processing'
    const isConfirmed = r.status === 'confirmed'

    const actions = `<div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
      ${isPending   ? aBtn('Confirm & Activate', `window._adm.confirmAndActivate('${r.id}')`) : ''}
      ${isPending   ? aBtn('Reject', `window._adm.adminRejectPayment('${r.id}')`, true) : ''}
      ${isConfirmed ? `<span style="font-size:0.68rem;color:#22c55e;">✓ Confirmed</span>` : ''}
    </div>`

    return [
      `<div>
        <strong style="color:var(--text);font-size:0.82rem;">${r.profiles?.display_name || '—'}</strong><br>
        <span style="font-size:0.72rem;color:var(--text-3);">@${r.profiles?.username || '—'}</span>
        ${r.profiles?.plan_type ? `<br><span style="font-size:0.68rem;color:var(--text-3);">Current: ${r.profiles.plan_type}</span>` : ''}
      </div>`,
      fmt(r.provider?.replace('_', ' ')),
      r.amount != null
        ? `<strong style="color:var(--gold);">$${Number(r.amount).toFixed(2)}</strong>`
        : '<span style="color:var(--text-3);">—</span>',
      fmt(r.payment_type),
      pill(r.plan_type || '—', r.plan_type),
      pill(r.status || 'pending', r.status),
      r.payment_reference
        ? `<span style="font-family:monospace;font-size:0.68rem;color:var(--text-3);" title="${r.payment_reference}">${r.payment_reference.substring(0, 14)}…</span>`
        : '<span style="color:var(--text-3);">—</span>',
      r.billing_period_end
        ? `<span style="font-size:0.7rem;color:var(--text-3);">${fmtDate(r.billing_period_end)}</span>`
        : '<span style="color:var(--text-3);">—</span>',
      fmtDate(r.created_at),
      actions,
    ]
  })

  $('adm-payments-body').innerHTML = buildTable(
    ['Profile', 'Provider', 'Amount', 'Type', 'Plan', 'Status', 'Reference', 'Billing End', 'Date', 'Actions'],
    rows
  )
}

async function confirmAndActivate(paymentId) {
  // TODO: ROLE CHECK — require ADMIN_ROLES.SUPER_ADMIN (financial operation)
  // const auth = await requireAdminSession({ requiredRole: ADMIN_ROLES.SUPER_ADMIN })
  // if (!auth.ok) { alert('Access denied.'); return }
  if (!confirm('Confirm this payment and activate the creator\'s page?')) return
  setLoading('adm-payments-body', 'Confirming payment…')
  const { error } = await confirmPayment(paymentId, { confirmedBy: getAdminActorTag() })
  if (error) { alert('Error: ' + error.message); loadPayments(); return }
  loadPayments()
}

async function adminRejectPayment(paymentId) {
  // TODO: ROLE CHECK — require ADMIN_ROLES.SUPER_ADMIN (financial operation)
  // const auth = await requireAdminSession({ requiredRole: ADMIN_ROLES.SUPER_ADMIN })
  // if (!auth.ok) { alert('Access denied.'); return }
  if (!confirm('Reject this payment?')) return
  const { error } = await rejectPayment(paymentId, { rejectedBy: getAdminActorTag() })
  if (error) { alert('Error: ' + error.message); return }
  loadPayments()
}

async function adminUpgradePlan(profileId, planType) {
  // TODO: ROLE CHECK — require ADMIN_ROLES.SUPER_ADMIN (plan lifecycle change)
  // const auth = await requireAdminSession({ requiredRole: ADMIN_ROLES.SUPER_ADMIN })
  // if (!auth.ok) { alert('Access denied.'); return }
  if (!planType || !profileId) return
  if (!confirm(`Change plan to "${planType}"? This updates the profile and all associated pages immediately.`)) return
  const { error } = await applyUpgrade(profileId, planType, { triggeredBy: getAdminActorTag() })
  if (error) { alert('Error: ' + error.message); return }
  loadProfiles()
}

async function adminRequestUpgrade(profileId, planType) {
  // TODO: ROLE CHECK — require ADMIN_ROLES.SUPER_ADMIN
  // const auth = await requireAdminSession({ requiredRole: ADMIN_ROLES.SUPER_ADMIN })
  // if (!auth.ok) { alert('Access denied.'); return }
  if (!planType || !profileId) return
  if (!confirm(`Mark profile as requesting upgrade to "${planType}"?`)) return
  const { error } = await requestUpgrade(profileId, planType)
  if (error) { alert('Error: ' + error.message); return }
  loadProfiles()
  loadPages()
}

async function adminCancelUpgrade(profileId) {
  // TODO: ROLE CHECK — require ADMIN_ROLES.SUPER_ADMIN
  // const auth = await requireAdminSession({ requiredRole: ADMIN_ROLES.SUPER_ADMIN })
  // if (!auth.ok) { alert('Access denied.'); return }
  if (!profileId) return
  if (!confirm('Cancel this upgrade request?')) return
  const { error } = await cancelUpgradeRequest(profileId)
  if (error) { alert('Error: ' + error.message); return }
  loadProfiles()
  loadPages()
}

async function adminRecordPayment() {
  // TODO: ROLE CHECK — require ADMIN_ROLES.SUPER_ADMIN (creates financial records)
  // const auth = await requireAdminSession({ requiredRole: ADMIN_ROLES.SUPER_ADMIN })
  // if (!auth.ok) { alert('Access denied.'); return }
  const username  = $('adm-pay-username').value.trim()
  const provider  = $('adm-pay-provider').value
  const type      = $('adm-pay-type').value
  const plan      = $('adm-pay-plan').value
  const amount    = parseFloat($('adm-pay-amount').value) || null
  const reference = $('adm-pay-reference').value.trim()
  const notes     = $('adm-pay-notes').value.trim()

  if (!username || !provider || !plan) {
    alert('Username, provider, and plan are required.')
    return
  }

  // Look up profile_id by username
  const { data: profile, error: profileErr } = await supabase
    .from('profiles').select('id').eq('username', username).single()

  if (profileErr || !profile) {
    alert(`Profile not found for username: @${username}`)
    return
  }

  const { error } = await recordPayment({
    profile_id:        profile.id,
    provider,
    payment_type:      type,
    plan_type:         plan,
    amount,
    payment_reference: reference || null,
    notes:             notes || null,
  })

  if (error) { alert('Error recording payment: ' + error.message); return }

  // Clear form
  $('adm-pay-username').value  = ''
  $('adm-pay-amount').value    = ''
  $('adm-pay-reference').value = ''
  $('adm-pay-notes').value     = ''

  loadPayments()
}

// ── NOTES ──────────────────────────────────────────────────────
async function loadNotes() {
  setLoading('adm-notes-body', 'Loading notes…')

  const { data, error } = await supabase
    .from('admin_notes')
    .select('id, content, current_status, author, created_at, profiles(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error?.code === '42P01') {
    setSetupNote('adm-notes-body', 'Admin notes')
    return
  }
  if (error) { setErr('adm-notes-body', error.message); return }
  if (!data?.length) { setEmpty('adm-notes-body', 'No notes yet. Add one above.'); return }

  const rows = data.map(r => [
    `<div>
      <strong style="color:var(--text);font-size:0.82rem;">${r.profiles?.display_name || '—'}</strong><br>
      <span style="font-size:0.72rem;color:var(--text-3);">@${r.profiles?.username || '—'}</span>
    </div>`,
    `<span style="font-size:0.78rem;color:var(--text-2);">${r.content || '—'}</span>`,
    fmt(r.current_status),
    `<span style="font-size:0.72rem;color:var(--text-3);">${r.author || '—'}</span>`,
    fmtDate(r.created_at),
    aBtn('Delete', `window._adm.deleteNote('${r.id}')`, true),
  ])

  $('adm-notes-body').innerHTML = buildTable(
    ['Profile', 'Note', 'Status', 'By', 'Date', 'Delete'],
    rows
  )
}

async function addNote() {
  // TODO: ROLE CHECK — require ADMIN_ROLES.SUPER_ADMIN or ADMIN_ROLES.MODERATOR
  // const auth = await requireAdminSession({ requiredRole: ADMIN_ROLES.MODERATOR })
  // if (!auth.ok) { alert('Access denied.'); return }
  const content  = $('adm-note-content').value.trim()
  const status   = $('adm-note-status').value.trim()
  const username = $('adm-note-username').value.trim()

  if (!content) { alert('Note content is required.'); return }

  let profile_id = null
  if (username) {
    const { data: p } = await supabase.from('profiles').select('id').eq('username', username).single()
    profile_id = p?.id || null
  }

  const { error } = await supabase.from('admin_notes').insert([{
    content,
    current_status: status || null,
    author:    getAdminActorTag(),
    profile_id,
  }])

  if (error) { alert('Error: ' + error.message); return }

  $('adm-note-content').value = ''
  $('adm-note-status').value  = ''
  $('adm-note-username').value = ''
  loadNotes()
}

async function deleteNote(id) {
  // TODO: ROLE CHECK — require ADMIN_ROLES.SUPER_ADMIN
  // const auth = await requireAdminSession({ requiredRole: ADMIN_ROLES.SUPER_ADMIN })
  // if (!auth.ok) { alert('Access denied.'); return }
  if (!confirm('Delete this note?')) return
  const { error } = await supabase.from('admin_notes').delete().eq('id', id)
  if (error) { alert('Error: ' + error.message); return }
  loadNotes()
}

// ── Public API (called from inline onclick handlers) ───────────
window._adm = {
  // Profiles
  toggleActive,
  toggleFeatured,
  adminUpgradePlan,
  // Pages
  setPageStatus,
  // Submissions
  setSubmissionStatus,
  // Board posts
  togglePostApproval,
  togglePostFeatured,
  setPostVisibility,
  // Payments — payment service powered
  confirmAndActivate,
  adminRejectPayment,
  adminRecordPayment,
  // Plan upgrades — plan-manager service
  adminUpgradePlan,
  adminRequestUpgrade,
  adminCancelUpgrade,
  // Notes
  addNote,
  deleteNote,
}

// ── Bind tab clicks ────────────────────────────────────────────
document.querySelectorAll('.adm-tab').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab))
})

// ── Bind auth form ─────────────────────────────────────────────
$('adm-signin-btn')?.addEventListener('click', signIn)
$('adm-signout-btn')?.addEventListener('click', signOut)
$('adm-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') signIn() })

// ── Bind filter buttons ────────────────────────────────────────
document.querySelectorAll('.adm-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const group  = btn.dataset.group
    const preset = btn.dataset.preset

    document.querySelectorAll(`.adm-filter-btn[data-group="${group}"]`).forEach(b => {
      b.classList.remove('adm-filter-btn--active')
    })
    btn.classList.add('adm-filter-btn--active')

    const filter = FILTER_PRESETS[group]?.[preset] ?? {}

    if (group === 'profiles')    loadProfiles(filter)
    if (group === 'pages')       loadPages(filter)
    if (group === 'submissions') loadSubmissions(filter)
    if (group === 'board')       loadBoardPosts(filter)
    if (group === 'payments')    loadPayments(filter)
  })
})

// ── Bind add note button ───────────────────────────────────────
$('adm-add-note-btn')?.addEventListener('click', addNote)

// ── Boot ───────────────────────────────────────────────────────
init()
