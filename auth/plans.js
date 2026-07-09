/**
 * StudioFlow — Plan Definitions & Feature Gate System
 *
 * All plan feature checks go through this file.
 * The main app calls isAllowed(plan, feature) to gate UI.
 */

// ── Plan metadata ────────────────────────────────────────────────────────────

const PLANS = {
  basic: {
    id: 'basic',
    name: 'Basic',
    price: '₹0',
    period: 'forever',
    color: '#6b7280',
    recording_minutes: 60,        // 1 hour per month
    badge: 'BASIC',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: '₹99',
    period: 'month',
    color: '#6366f1',
    recording_minutes: 600,       // 10 hours per month
    badge: 'PRO',
  },
  max: {
    id: 'max',
    name: 'Max',
    price: '₹199',
    period: 'month',
    color: '#10b981',
    recording_minutes: 3000,      // 50 hours per month
    badge: 'MAX',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: 'year',
    color: '#f59e0b',
    recording_minutes: Infinity,  // unlimited
    badge: 'ENTERPRISE',
  },
};

// ── Feature definitions ──────────────────────────────────────────────────────
// Value: minimum plan required ('basic' = everyone, 'pro' = paid+, etc.)

const FEATURE_REQUIREMENTS = {
  // Modes
  teaching_mode:          'basic',
  storytelling_mode:      'pro',

  // Teaching features
  ipad_sync:              'pro',
  workbook_full:          'pro',   // basic = view only
  export_pdf:             'pro',
  screen_source:          'basic',

  // Storytelling features
  loom_float:             'pro',
  teleprompter:           'pro',
  background_music:       'pro',
  doc_import_story:       'pro',

  // Recording & streaming
  recording:              'basic',
  youtube_live:           'max',
  export_1080p:           'pro',
  export_4k:              'enterprise',

  // Team / admin
  team_seats:             'max',
  custom_branding:        'enterprise',
  priority_support:       'max',

  // Misc
  no_watermark:           'pro',
};

// Plan order for comparison
const PLAN_ORDER = ['basic', 'pro', 'max', 'enterprise'];

// ── Utility functions ────────────────────────────────────────────────────────

/**
 * Returns true if the user's plan meets the requirement for a feature.
 * @param {string} userPlan - 'free' | 'educator' | 'school' | 'enterprise'
 * @param {string} feature  - key from FEATURE_REQUIREMENTS
 */
function isAllowed(userPlan, feature) {
  const required = FEATURE_REQUIREMENTS[feature];
  if (!required) return true; // unknown feature = allowed
  const userLevel = PLAN_ORDER.indexOf(userPlan);
  const reqLevel  = PLAN_ORDER.indexOf(required);
  return userLevel >= reqLevel;
}

/**
 * Returns the minimum plan name required for a feature (for upgrade prompts).
 * @param {string} feature
 */
function requiredPlan(feature) {
  return FEATURE_REQUIREMENTS[feature] || 'free';
}

/**
 * Returns the recording limit in minutes for a plan.
 * @param {string} plan
 */
function getMonthlyMinutes(plan) {
  return PLANS[plan]?.recording_minutes ?? 60;
}

/**
 * Returns minutes remaining this month.
 * @param {string} plan
 * @param {number} usedMinutes
 */
function getRemainingMinutes(plan, usedMinutes) {
  const limit = getMonthlyMinutes(plan);
  if (limit === Infinity) return Infinity;
  return Math.max(0, limit - usedMinutes);
}

/**
 * Returns formatted time string for display (e.g. "58m left" or "Unlimited")
 * @param {string} plan
 * @param {number} usedMinutes
 */
function formatRemainingTime(plan, usedMinutes) {
  const rem = getRemainingMinutes(plan, usedMinutes);
  if (rem === Infinity) return 'Unlimited';
  if (rem === 0) return 'No time left';
  if (rem >= 60) {
    const h = Math.floor(rem / 60);
    const m = rem % 60;
    return m > 0 ? `${h}h ${m}m left` : `${h}h left`;
  }
  return `${rem}m left`;
}

/**
 * Returns plan metadata object.
 * @param {string} planId
 */
function getPlanInfo(planId) {
  return PLANS[planId] || PLANS.free;
}

/**
 * Returns all plan objects as array (for pricing UI).
 */
function getAllPlans() {
  return Object.values(PLANS);
}

module.exports = {
  PLANS,
  FEATURE_REQUIREMENTS,
  PLAN_ORDER,
  isAllowed,
  requiredPlan,
  getMonthlyMinutes,
  getRemainingMinutes,
  formatRemainingTime,
  getPlanInfo,
  getAllPlans,
};
