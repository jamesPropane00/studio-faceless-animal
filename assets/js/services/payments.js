/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — PAYMENT SERVICE
 *  assets/js/services/payments.js
 *
 *  Core payment lifecycle: record → confirm → upgrade plan → activate page.
 *  All state changes are written to the payment_events audit log.
 *
 *  MANUAL PROVIDERS (Cash App, Venmo, Zelle):
 *    Studio receives payment externally → admin calls confirmPayment()
 *    → profile plan upgraded + page activated automatically.
 *
 *  AUTOMATED PROVIDERS (Stripe, PayPal) — future:
 *    Webhook hits server endpoint → calls confirmPayment() with provider data.
 *    No code change required here — just add the webhook handler that calls this.
 *
 *  TABLES:
 *    payments        — payment records (one row per transaction)
 *    payment_events  — immutable audit log (one row per state change)
 *    profiles        — plan_type, plan_status, plan_expires_at updated here
 *    pages           — page_status set to 'live' on confirmation
 *
 *  CONSUMERS:
 *    assets/js/admin.js              — Confirm / Reject / Upgrade actions
 *    future: server/webhooks/stripe.js, server/webhooks/paypal.js
 *
 *  REQUIRES: supabase/migrations/008_payment_system.sql
 * ============================================================
 */

import { supabase, SUPABASE_READY } from '../supabase-client.js'
import {
  PAYMENT_STATUS,
  PAYMENT_EVENT,
  PLAN_STATUS,
  PLAN_ORDER,
  getBillingPeriodEnd,
} from '../payments-config.js'


// ── GUARD ─────────────────────────────────────────────────────
function notReady(fn) {
  return { data: null, error: new Error(`[FAS:payments] ${fn}() called but Supabase is not configured.`) }
}

function log(fn, msg, extra = '') {
  console.log(`[FAS:payments] ${fn} — ${msg}`, extra || '')
}


// ══════════════════════════════════════════════════════════════
//  RECORDING
// ══════════════════════════════════════════════════════════════

/**
 * recordPayment(data) — Insert a new payment row.
 *
 * Call this when:
 *  - Admin manually logs a Cash App / Venmo / Zelle payment
 *  - A future checkout form submits (before provider confirmation)
 *  - A Stripe PaymentIntent is created (before webhook confirms)
 *
 * @param {object} data
 * @param {string}        data.profile_id       — required: profiles.id UUID
 * @param {string}        data.provider         — cash_app | venmo | zelle | stripe | paypal
 * @param {string}        data.payment_type     — setup | monthly | annual | upgrade
 * @param {string}        data.plan_type        — free | starter | pro | premium
 * @param {number}        [data.amount]         — dollar amount (e.g. 50.00)
 * @param {string}        [data.payment_reference] — Cash App txn ID, Stripe PaymentIntent ID, etc.
 * @param {string}        [data.notes]          — freeform notes
 * @param {object}        [data.metadata_json]  — provider-specific raw data
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 */
export async function recordPayment(data) {
  if (!SUPABASE_READY) return notReady('recordPayment')

  if (!data.profile_id) return { data: null, error: new Error('profile_id is required') }
  if (!data.provider)   return { data: null, error: new Error('provider is required') }
  if (!data.plan_type)  return { data: null, error: new Error('plan_type is required') }

  const row = {
    profile_id:        data.profile_id,
    provider:          data.provider,
    payment_type:      data.payment_type ?? 'setup',
    plan_type:         data.plan_type,
    amount:            data.amount ?? null,
    status:            PAYMENT_STATUS.PENDING,
    payment_reference: data.payment_reference ?? null,
    notes:             data.notes ?? null,
    metadata_json:     data.metadata_json ?? null,
  }

  const { data: result, error } = await supabase
    .from('payments')
    .insert([row])
    .select('id, profile_id, provider, payment_type, plan_type, amount, status')
    .single()

  if (error) {
    console.error('[FAS:payments] recordPayment error:', error.message)
    return { data: null, error }
  }

  // Write audit event
  await writeEvent(result.id, PAYMENT_EVENT.RECORDED, {
    from_status: null,
    to_status:   PAYMENT_STATUS.PENDING,
    notes:       `Payment recorded via ${data.provider}`,
  })

  log('recordPayment', `created payment ${result.id} — ${data.provider} ${data.payment_type} ${data.plan_type}`)
  return { data: result, error: null }
}


// ══════════════════════════════════════════════════════════════
//  CONFIRMATION (admin action or webhook)
// ══════════════════════════════════════════════════════════════

/**
 * confirmPayment(paymentId, opts) — Confirm a payment and trigger downstream effects.
 *
 * This is the core action that drives the payment-to-page-live pipeline:
 *   1. Marks payment.status = 'confirmed'
 *   2. Sets billing_period_start / billing_period_end on the payment row
 *   3. Calls upgradePlan() → updates profile.plan_type + plan_status + plan_expires_at
 *   4. Calls activateProfilePages() → sets page_status = 'live' for submitted pages
 *   5. Writes audit event for each step
 *
 * @param {string} paymentId — payments.id UUID
 * @param {object} [opts]
 * @param {string} [opts.confirmedBy]  — admin email or 'webhook:stripe' etc.
 * @param {string} [opts.notes]        — optional confirmation notes
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 */
export async function confirmPayment(paymentId, opts = {}) {
  if (!SUPABASE_READY) return notReady('confirmPayment')

  // 1. Fetch the payment row
  const { data: payment, error: fetchErr } = await supabase
    .from('payments')
    .select('id, profile_id, provider, payment_type, plan_type, amount, status')
    .eq('id', paymentId)
    .single()

  if (fetchErr || !payment) {
    console.error('[FAS:payments] confirmPayment: payment not found', fetchErr?.message)
    return { data: null, error: fetchErr ?? new Error('Payment not found') }
  }

  if (payment.status === PAYMENT_STATUS.CONFIRMED) {
    return { data: payment, error: new Error('Payment is already confirmed') }
  }

  // 2. Mark payment confirmed + set billing period
  const billingEnd = payment.payment_type === PAYMENT_STATUS.ANNUAL
    ? getBillingPeriodEnd('annual')
    : getBillingPeriodEnd('monthly')

  const { error: updateErr } = await supabase
    .from('payments')
    .update({
      status:               PAYMENT_STATUS.CONFIRMED,
      confirmed_at:         new Date().toISOString(),
      confirmed_by:         opts.confirmedBy ?? 'admin',
      billing_period_start: new Date().toISOString(),
      billing_period_end:   billingEnd,
    })
    .eq('id', paymentId)

  if (updateErr) {
    console.error('[FAS:payments] confirmPayment: update failed', updateErr.message)
    return { data: null, error: updateErr }
  }

  // Write confirmation event
  await writeEvent(paymentId, PAYMENT_EVENT.CONFIRMED, {
    from_status:  payment.status,
    to_status:    PAYMENT_STATUS.CONFIRMED,
    triggered_by: opts.confirmedBy ?? 'admin',
    notes:        opts.notes ?? null,
  })

  log('confirmPayment', `confirmed ${paymentId} — plan: ${payment.plan_type}`)

  // 3. Upgrade the profile plan
  const { error: planErr } = await upgradePlan(payment.profile_id, payment.plan_type, {
    triggeredBy:   opts.confirmedBy ?? 'admin',
    paymentId,
    billingEnd,
  })

  if (planErr) {
    console.error('[FAS:payments] confirmPayment: upgradePlan failed', planErr.message)
    // Don't abort — payment IS confirmed, plan upgrade is a separate concern
  }

  // 4. Activate any submitted pages for this profile
  const { error: pageErr } = await activateProfilePages(payment.profile_id, {
    triggeredBy: opts.confirmedBy ?? 'admin',
    paymentId,
  })

  if (pageErr) {
    console.error('[FAS:payments] confirmPayment: activateProfilePages failed', pageErr.message)
  }

  return { data: { ...payment, status: PAYMENT_STATUS.CONFIRMED }, error: null }
}


/**
 * rejectPayment(paymentId, opts) — Mark a payment as failed/rejected.
 *
 * Does NOT change the profile plan. Call this when:
 *  - Admin manually rejects a Cash App payment (wrong amount, fake txn)
 *  - Stripe/PayPal webhook reports a declined charge
 *
 * @param {string} paymentId
 * @param {object} [opts]
 * @param {string} [opts.rejectedBy]
 * @param {string} [opts.notes]
 * @returns {Promise<{ data: null, error: Error|null }>}
 */
export async function rejectPayment(paymentId, opts = {}) {
  if (!SUPABASE_READY) return notReady('rejectPayment')

  const { data: payment, error: fetchErr } = await supabase
    .from('payments')
    .select('id, status')
    .eq('id', paymentId)
    .single()

  if (fetchErr || !payment) return { data: null, error: fetchErr ?? new Error('Payment not found') }

  const { error } = await supabase
    .from('payments')
    .update({ status: PAYMENT_STATUS.FAILED })
    .eq('id', paymentId)

  if (error) return { data: null, error }

  await writeEvent(paymentId, PAYMENT_EVENT.FAILED, {
    from_status:  payment.status,
    to_status:    PAYMENT_STATUS.FAILED,
    triggered_by: opts.rejectedBy ?? 'admin',
    notes:        opts.notes ?? 'Rejected',
  })

  log('rejectPayment', `rejected ${paymentId}`)
  return { data: null, error: null }
}


// ══════════════════════════════════════════════════════════════
//  PLAN MANAGEMENT
// ══════════════════════════════════════════════════════════════

/**
 * upgradePlan(profileId, planType, opts) — Set a profile's plan.
 *
 * Updates: profile.plan_type, plan_status, plan_expires_at, setup_fee_paid.
 * Does NOT touch payments table — call after confirmPayment().
 * Can be called directly by admin for manual overrides.
 *
 * @param {string} profileId
 * @param {string} planType — free | starter | pro | premium
 * @param {object} [opts]
 * @param {string} [opts.triggeredBy]
 * @param {string} [opts.paymentId]    — link back to the payment that triggered this
 * @param {string} [opts.billingEnd]   — ISO date string for plan_expires_at
 * @returns {Promise<{ data: null, error: Error|null }>}
 */
export async function upgradePlan(profileId, planType, opts = {}) {
  if (!SUPABASE_READY) return notReady('upgradePlan')
  if (!profileId) return { data: null, error: new Error('profileId is required') }
  if (!PLAN_ORDER.includes(planType)) return { data: null, error: new Error(`Invalid plan: ${planType}`) }

  const isPaid     = planType !== 'free'
  const planStatus = isPaid ? PLAN_STATUS.ACTIVE : PLAN_STATUS.ACTIVE
  const expiresAt  = opts.billingEnd ?? (isPaid ? getBillingPeriodEnd('monthly') : null)

  const updates = {
    plan_type:          planType,
    plan_status:        planStatus,
    plan_expires_at:    expiresAt,
    setup_fee_paid:     isPaid,
    billing_start_date: isPaid ? new Date().toISOString() : null,
  }

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', profileId)

  if (error) {
    console.error('[FAS:payments] upgradePlan error:', error.message)
    return { data: null, error }
  }

  // Write plan event (linked to payment if provided)
  if (opts.paymentId) {
    await writeEvent(opts.paymentId, PAYMENT_EVENT.PLAN_SET, {
      triggered_by: opts.triggeredBy ?? 'admin',
      notes: `plan_type set to ${planType}`,
    })
  }

  log('upgradePlan', `profile ${profileId} → ${planType}`)
  return { data: null, error: null }
}


/**
 * cancelPlan(profileId, opts) — Cancel a profile's plan.
 *
 * Sets plan_status = 'cancelled', pauses all live pages.
 *
 * @param {string} profileId
 * @param {object} [opts]
 * @param {string} [opts.triggeredBy]
 * @param {string} [opts.notes]
 * @returns {Promise<{ data: null, error: Error|null }>}
 */
export async function cancelPlan(profileId, opts = {}) {
  if (!SUPABASE_READY) return notReady('cancelPlan')

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ plan_status: PLAN_STATUS.CANCELLED })
    .eq('id', profileId)

  if (profileErr) return { data: null, error: profileErr }

  // Pause all live pages for this profile
  const { data: pages } = await supabase
    .from('pages')
    .select('id')
    .eq('profile_id', profileId)
    .eq('page_status', 'live')

  if (pages?.length) {
    const ids = pages.map(p => p.id)
    await supabase.from('pages').update({ page_status: 'paused' }).in('id', ids)

    // Log each page pause
    for (const p of pages) {
      await writeEvent(null, PAYMENT_EVENT.PAGE_PAUSED, {
        triggered_by: opts.triggeredBy ?? 'admin',
        notes: `Plan cancelled — page ${p.id} paused`,
      })
    }
  }

  log('cancelPlan', `profile ${profileId} cancelled — ${pages?.length ?? 0} pages paused`)
  return { data: null, error: null }
}


/**
 * markPlanOverdue(profileId) — Set plan_status = 'past_due'.
 *
 * Call when a monthly renewal payment is not received.
 * Does not pause pages immediately — gives a grace period.
 *
 * @param {string} profileId
 * @returns {Promise<{ data: null, error: Error|null }>}
 */
export async function markPlanOverdue(profileId) {
  if (!SUPABASE_READY) return notReady('markPlanOverdue')

  const { error } = await supabase
    .from('profiles')
    .update({ plan_status: PLAN_STATUS.PAST_DUE })
    .eq('id', profileId)

  if (error) return { data: null, error }

  await writeEvent(null, PAYMENT_EVENT.OVERDUE, {
    triggered_by: 'system',
    notes: `Profile ${profileId} plan marked past_due`,
  })

  log('markPlanOverdue', `profile ${profileId} past_due`)
  return { data: null, error: null }
}


// ══════════════════════════════════════════════════════════════
//  PAGE ACTIVATION
// ══════════════════════════════════════════════════════════════

/**
 * activatePage(pageId, opts) — Set a single page to live.
 *
 * @param {string} pageId
 * @param {object} [opts]
 * @param {string} [opts.triggeredBy]
 * @param {string} [opts.paymentId]
 * @returns {Promise<{ data: null, error: Error|null }>}
 */
export async function activatePage(pageId, opts = {}) {
  if (!SUPABASE_READY) return notReady('activatePage')

  const { error } = await supabase
    .from('pages')
    .update({
      page_status:      'live',
      plan_activated_at: new Date().toISOString(),
      activated_by:     opts.triggeredBy ?? 'admin',
    })
    .eq('id', pageId)

  if (error) {
    console.error('[FAS:payments] activatePage error:', error.message)
    return { data: null, error }
  }

  if (opts.paymentId) {
    await writeEvent(opts.paymentId, PAYMENT_EVENT.PAGE_LIVE, {
      triggered_by: opts.triggeredBy ?? 'admin',
      notes: `page ${pageId} set to live`,
    })
  }

  log('activatePage', `page ${pageId} → live`)
  return { data: null, error: null }
}


/**
 * activateProfilePages(profileId, opts) — Activate all submitted pages for a profile.
 *
 * Called automatically by confirmPayment(). Only touches pages with
 * page_status = 'submitted' — does not disturb draft or paused pages.
 *
 * @param {string} profileId
 * @param {object} [opts]
 * @param {string} [opts.triggeredBy]
 * @param {string} [opts.paymentId]
 * @returns {Promise<{ data: { count: number }|null, error: Error|null }>}
 */
export async function activateProfilePages(profileId, opts = {}) {
  if (!SUPABASE_READY) return notReady('activateProfilePages')

  const { data: pages, error: fetchErr } = await supabase
    .from('pages')
    .select('id')
    .eq('profile_id', profileId)
    .eq('page_status', 'submitted')

  if (fetchErr) return { data: null, error: fetchErr }
  if (!pages?.length) {
    log('activateProfilePages', `no submitted pages for profile ${profileId}`)
    return { data: { count: 0 }, error: null }
  }

  for (const page of pages) {
    await activatePage(page.id, opts)
  }

  log('activateProfilePages', `activated ${pages.length} pages for profile ${profileId}`)
  return { data: { count: pages.length }, error: null }
}


// ══════════════════════════════════════════════════════════════
//  QUERIES
// ══════════════════════════════════════════════════════════════

/**
 * getPaymentHistory(profileId) — All payments for a profile, newest first.
 *
 * @param {string} profileId
 * @returns {Promise<{ data: object[]|null, error: Error|null }>}
 */
export async function getPaymentHistory(profileId) {
  if (!SUPABASE_READY) return notReady('getPaymentHistory')

  const { data, error } = await supabase
    .from('payments')
    .select('id, provider, payment_type, plan_type, amount, status, payment_reference, confirmed_at, billing_period_end, notes, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })

  if (error) console.error('[FAS:payments] getPaymentHistory error:', error.message)
  return { data, error }
}


/**
 * getPendingPayments() — All unconfirmed payments. Primary admin view.
 *
 * @returns {Promise<{ data: object[]|null, error: Error|null }>}
 */
export async function getPendingPayments() {
  if (!SUPABASE_READY) return notReady('getPendingPayments')

  const { data, error } = await supabase
    .from('payments')
    .select('id, provider, payment_type, plan_type, amount, status, payment_reference, notes, created_at, profiles(id, username, display_name, plan_type)')
    .eq('status', PAYMENT_STATUS.PENDING)
    .order('created_at', { ascending: true })

  if (error) console.error('[FAS:payments] getPendingPayments error:', error.message)
  return { data, error }
}


/**
 * getProfilePlanStatus(profileId) — Full plan snapshot for a profile.
 *
 * Returns the profile's current plan fields + most recent confirmed payment.
 *
 * @param {string} profileId
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 */
export async function getProfilePlanStatus(profileId) {
  if (!SUPABASE_READY) return notReady('getProfilePlanStatus')

  const [profileRes, paymentRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, plan_type, plan_status, plan_expires_at, setup_fee_paid, billing_start_date')
      .eq('id', profileId)
      .single(),
    supabase
      .from('payments')
      .select('id, provider, payment_type, plan_type, amount, status, confirmed_at, billing_period_end')
      .eq('profile_id', profileId)
      .eq('status', PAYMENT_STATUS.CONFIRMED)
      .order('confirmed_at', { ascending: false })
      .limit(1)
      .single(),
  ])

  if (profileRes.error) return { data: null, error: profileRes.error }

  return {
    data: {
      ...profileRes.data,
      last_confirmed_payment: paymentRes.data ?? null,
    },
    error: null,
  }
}


/**
 * checkOverdueAccounts() — Profiles with active plans past their expiry date.
 *
 * Returns profiles where plan_status = 'active' AND plan_expires_at < now().
 * Call on a schedule (e.g. daily cron) to identify accounts needing renewal.
 *
 * @returns {Promise<{ data: object[]|null, error: Error|null }>}
 */
export async function checkOverdueAccounts() {
  if (!SUPABASE_READY) return notReady('checkOverdueAccounts')

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, plan_type, plan_status, plan_expires_at')
    .eq('plan_status', PLAN_STATUS.ACTIVE)
    .lt('plan_expires_at', new Date().toISOString())

  if (error) console.error('[FAS:payments] checkOverdueAccounts error:', error.message)
  return { data, error }
}


// ══════════════════════════════════════════════════════════════
//  AUDIT LOG (internal)
// ══════════════════════════════════════════════════════════════

/**
 * writeEvent(paymentId, eventType, opts) — Append to payment_events log.
 *
 * Internal. Called automatically by every function above.
 * payment_events rows are never updated or deleted.
 *
 * @param {string|null} paymentId
 * @param {string}      eventType — from PAYMENT_EVENT
 * @param {object}      [opts]
 * @param {string}      [opts.from_status]
 * @param {string}      [opts.to_status]
 * @param {string}      [opts.triggered_by]
 * @param {string}      [opts.notes]
 * @returns {Promise<void>}
 */
async function writeEvent(paymentId, eventType, opts = {}) {
  try {
    await supabase.from('payment_events').insert([{
      payment_id:   paymentId ?? null,
      event_type:   eventType,
      from_status:  opts.from_status ?? null,
      to_status:    opts.to_status ?? null,
      triggered_by: opts.triggered_by ?? 'system',
      notes:        opts.notes ?? null,
    }])
  } catch (e) {
    // Audit log failure should never block primary operations
    console.warn('[FAS:payments] writeEvent failed silently:', e.message)
  }
}
