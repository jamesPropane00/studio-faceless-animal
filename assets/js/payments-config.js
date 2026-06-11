/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — PAYMENT SYSTEM CONFIG
 *  assets/js/payments-config.js
 *
 *  PRICING STRUCTURE:
 *    Platform Access  — $5/month   (bundled into all paid plans via Stripe — no separate charge)
 *    Starter Package  — $30 all-in (bundles $25 setup + $5/mo platform access via Stripe)
 *    Pro Package      — $55 all-in (bundles $50 setup + $5/mo platform access via Stripe)
 *    Premium Package  — $105 all-in (bundles $100 setup + $5/mo platform access via Stripe)
 *    Custom Design    — $25 one-time add-on
 *
 *  PAYMENT METHODS (active):
 *    Stripe  — Payment Links only. No API keys in frontend.
 *              Links go in STRIPE_PAYMENT_LINKS below.
 *    Cash App — Manual fallback. Admin confirms in dashboard.
 *
 *  ADDING STRIPE PAYMENT LINKS:
 *    1. Go to your Stripe dashboard → Payment Links → Create link
 *    2. Set the price matching the item below
 *    3. Copy the link (e.g. https://buy.stripe.com/xxxxx)
 *    4. Paste it into STRIPE_PAYMENT_LINKS below
 *    5. No keys, no API — just the URL.
 *
 *  CONSUMERS:
 *    assets/js/services/payments.js  — lifecycle functions
 *    assets/js/admin.js              — admin dashboard actions
 *    paid.html, pricing.html         — payment UI
 * ============================================================
 */


// ── STRIPE PAYMENT LINKS ──────────────────────────────────────
/**
 * Paste real Stripe Payment Link URLs here when ready.
 * These are plain URLs — no API keys, no publishable keys.
 * Keep '#' as placeholder until you have a real link.
 *
 * To generate: stripe.com/dashboard → Payment Links → Create
 */
export const STRIPE_PAYMENT_LINKS = {
  platform_access:  'https://buy.stripe.com/fZu3cv2hh23Q0jufqc3ZK01', // $5/month — recurring platform subscription (LIVE)
  starter_package:  'https://buy.stripe.com/4gM00jbRRfUGfeo7XK3ZK02', // $30 all-in — Starter package + platform access bundled (LIVE)
  pro_package:      'https://buy.stripe.com/6oU3cv8FF0ZM1nyfqc3ZK03', // $55 all-in — Pro package + platform access bundled (LIVE)
  premium_package:  'https://buy.stripe.com/5kQ7sL3ll7oa2rC0vi3ZK04', // $105 all-in — Premium package + platform access bundled (LIVE)
  custom_design:    '#',  // $25 one-time — Custom Design Add-On
}


// ── PLAN DEFINITIONS ──────────────────────────────────────────
/**
 * package_fee   — one-time charge for page build (paid once)
 * platform_fee  — monthly platform access fee ($5 for all paid plans)
 * powered_by    — whether "Powered by FAS" bar shows on the page
 *
 * plan_type values map to profile plan_type column in Supabase.
 */
export const PLANS = {
  free: {
    slug:          'free',
    name:          'Free Presence',
    package_fee:   0,
    platform_fee:  0,
    powered_by:    true,
    features: [
      'Hosted page at facelessanimalstudios.com/yourname',
      'Profile image, bio, and up to 8 links',
      'Creator Network listing',
      'Mobile-first layout',
      '"Powered by Faceless Animal" badge',
    ],
  },

  starter: {
    slug:          'starter',
    name:          'Starter Package',
    package_fee:   30,   // $30 all-in via Stripe (bundles $25 setup + $5/mo platform access)
    platform_fee:  0,    // included in package_fee — no separate charge for Starter
    powered_by:    false,
    stripe_link_key: 'starter_package',
    features: [
      'Everything in Free',
      'Enhanced design — no badge',
      'Unlimited links',
      'Clean, professional layout',
      'Platform access included',
    ],
  },

  pro: {
    slug:          'pro',
    name:          'Pro Package',
    package_fee:   55,   // $55 all-in via Stripe (bundles $50 setup + $5/mo platform access)
    platform_fee:  0,    // included in package_fee — no separate charge for Pro
    powered_by:    false,
    stripe_link_key: 'pro_package',
    features: [
      'Everything in Starter',
      'Custom domain connection',
      'Music player embed',
      'Video section',
      'Press bio section',
      'Contact form',
    ],
  },

  premium: {
    slug:          'premium',
    name:          'Premium Package',
    package_fee:   105,  // $105 all-in via Stripe (bundles $100 setup + $5/mo platform access)
    platform_fee:  0,    // included in package_fee — no separate charge for Premium
    powered_by:    false,
    stripe_link_key: 'premium_package',
    features: [
      'Everything in Pro',
      'Fully custom design build',
      'Multi-section layout',
      'Store / product links',
      'Revisions included',
      'Priority support',
    ],
  },
}

// Plan tier order (lowest to highest) for upgrade comparisons
export const PLAN_ORDER = ['free', 'starter', 'pro', 'premium']


// ── ADD-ONS ────────────────────────────────────────────────────
/**
 * One-time add-ons that can be purchased alongside any plan.
 */
export const ADD_ONS = {
  custom_design: {
    slug:         'custom_design',
    name:         'Custom Design Add-On',
    fee:          25,
    stripe_link_key: 'custom_design',
    description:  'Extra visual / design work on top of your page package.',
  },
}


// ── PLATFORM ACCESS ────────────────────────────────────────────
/**
 * Monthly subscription that keeps paid pages active.
 * Free pages do NOT require this.
 * All paid plan pages (Starter, Pro, Premium) require this to stay live.
 */
export const PLATFORM_ACCESS = {
  slug:            'platform_access',
  name:            'Faceless Platform Access',
  monthly_fee:     5,
  stripe_link_key: 'platform_access',
  description:     'Keeps your page active and listed in the Creator Network.',
}


// ── PAYMENT PROVIDERS ─────────────────────────────────────────
/**
 * Active providers only. Remove a provider here to hide it from UI.
 *
 * manual: true  — studio manually verifies; admin confirms in dashboard
 * manual: false — automated via Stripe Payment Link (no key required)
 *
 * PayPal, Venmo, Zelle are NOT active. Do not add them until ready.
 */
export const PROVIDERS = {
  stripe: {
    slug:               'stripe',
    name:               'Stripe',
    manual:             false,
    supports_recurring: true,
    description:        'Pay securely by card. Powered by Stripe.',
    note:               'You will be redirected to a secure Stripe payment page.',
  },

  cash_app: {
    slug:               'cash_app',
    name:               'Cash App',
    handle:             '$Jamespropane00',
    contact_email:      'djfacelessanimal@gmail.com',
    manual:             true,
    supports_recurring: false,
    description:        'Send payment to $Jamespropane00 on Cash App.',
    note:               'Include your username and which package in the note. We confirm manually — usually within 1 business day.',
  },
}


// ── STATUS CONSTANTS ──────────────────────────────────────────

/**
 * Payment row status flow:
 *
 *  Stripe (automated):
 *    pending → confirmed  (Stripe webhook or admin confirms)
 *
 *  Cash App (manual):
 *    pending → confirmed  (admin clicks "Confirm" in dashboard)
 *          └→ failed      (admin clicks "Reject")
 *
 *  Both:
 *    confirmed → refunded  (reversed after confirmation)
 */
export const PAYMENT_STATUS = {
  PENDING:    'pending',
  PROCESSING: 'processing',
  CONFIRMED:  'confirmed',
  FAILED:     'failed',
  REFUNDED:   'refunded',
}

export const PLAN_STATUS = {
  PENDING:   'pending',
  ACTIVE:    'active',
  PAST_DUE:  'past_due',
  CANCELLED: 'cancelled',
}

export const PAYMENT_TYPE = {
  PACKAGE:  'setup',     // one-time page build fee
  MONTHLY:  'monthly',   // platform access subscription
  ADD_ON:   'upgrade',   // add-on purchase
}

export const PAYMENT_EVENT = {
  RECORDED:    'recorded',
  CONFIRMED:   'confirmed',
  FAILED:      'failed',
  REFUNDED:    'refunded',
  PLAN_SET:    'plan_set',
  PAGE_LIVE:   'page_live',
  PAGE_PAUSED: 'page_paused',
  OVERDUE:     'overdue',
}


// ── HELPER FUNCTIONS ──────────────────────────────────────────

/**
 * Get the one-time package fee for a plan.
 */
export function getPackageFee(planSlug) {
  return PLANS[planSlug]?.package_fee ?? 0
}

/**
 * Get the Stripe Payment Link URL for a given key.
 * Returns '#' if not yet configured.
 */
export function getStripeLink(key) {
  return STRIPE_PAYMENT_LINKS[key] || '#'
}

/**
 * Check if a Stripe Payment Link is configured (not placeholder).
 */
export function isStripeLinkActive(key) {
  const link = STRIPE_PAYMENT_LINKS[key]
  return link && link !== '#'
}

/**
 * Check if toPlan is a higher tier than fromPlan.
 */
export function isUpgrade(fromPlan, toPlan) {
  return PLAN_ORDER.indexOf(toPlan) > PLAN_ORDER.indexOf(fromPlan)
}

/**
 * Calculate the billing period end date.
 * @param {'monthly'|'annual'} type
 * @param {Date} [from]
 * @returns {string} ISO date string
 */
export function getBillingPeriodEnd(type = 'monthly', from = new Date()) {
  const d = new Date(from)
  if (type === 'annual') {
    d.setFullYear(d.getFullYear() + 1)
  } else {
    d.setDate(d.getDate() + 30)
  }
  return d.toISOString()
}
