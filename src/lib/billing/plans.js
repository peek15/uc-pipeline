// ═══════════════════════════════════════════════════════════
// plans.js — Central plan configuration.
//
// PRICING NOTE: Amounts below are internal launch hypotheses only
// and are NOT final public prices. public_price_locked: false on
// all plans. Final prices come from Stripe price IDs set via env
// vars. Do not hardcode billing amounts in product logic.
// ═══════════════════════════════════════════════════════════

export const PLANS = {
  studio_starter: {
    key: "studio_starter",
    label: "Studio Starter",
    short_desc: "For solo creators and small brands getting started.",
    internal_positioning: "Entry-level SaaS plan. One workspace, essential AI workflows.",
    public_price_locked: false,
    suggested_launch_price_note: "~€149/mo — internal hypothesis only, not final",
    stripe_price_env: {
      monthly: "STRIPE_PRICE_STARTER_MONTHLY",
      annual:  "STRIPE_PRICE_STARTER_ANNUAL",
    },
    entitlements: {
      brand_profile_level:   "basic",
      studio_access_level:   "none",
      reporting_level:       "basic",
      paid_ads_mode:         false,
      team_features_level:   "basic",
      priority_processing:   false,
    },
  },

  studio_growth: {
    key: "studio_growth",
    label: "Studio Growth",
    short_desc: "For growing teams publishing consistently across channels.",
    internal_positioning: "Mid-tier plan. Multiple brand profiles, reporting, team seats.",
    public_price_locked: false,
    suggested_launch_price_note: "~€399/mo — internal hypothesis only, not final",
    stripe_price_env: {
      monthly: "STRIPE_PRICE_GROWTH_MONTHLY",
      annual:  "STRIPE_PRICE_GROWTH_ANNUAL",
    },
    entitlements: {
      brand_profile_level:   "standard",
      studio_access_level:   "basic",
      reporting_level:       "standard",
      paid_ads_mode:         "limited",
      team_features_level:   "standard",
      priority_processing:   "standard",
    },
  },

  studio_scale: {
    key: "studio_scale",
    label: "Studio Scale",
    short_desc: "For agencies and high-volume content operations.",
    internal_positioning: "High-volume plan. Advanced reporting, ads mode, priority.",
    public_price_locked: false,
    suggested_launch_price_note: "~€899/mo — internal hypothesis only, not final",
    stripe_price_env: {
      monthly: "STRIPE_PRICE_SCALE_MONTHLY",
      annual:  "STRIPE_PRICE_SCALE_ANNUAL",
    },
    entitlements: {
      brand_profile_level:   "advanced",
      studio_access_level:   "standard",
      reporting_level:       "advanced",
      paid_ads_mode:         "included",
      team_features_level:   "advanced",
      priority_processing:   "priority",
    },
  },

  enterprise: {
    key: "enterprise",
    label: "Enterprise",
    short_desc: "Custom setup, SLA, dedicated support.",
    internal_positioning: "Manual onboarding. Custom pricing. No Stripe checkout.",
    public_price_locked: false,
    suggested_launch_price_note: "Custom — internal hypothesis only",
    stripe_price_env: null, // enterprise is manual, no Stripe price IDs
    entitlements: {
      brand_profile_level:   "custom",
      studio_access_level:   "advanced",
      reporting_level:       "custom",
      paid_ads_mode:         "custom",
      team_features_level:   "custom",
      priority_processing:   "custom",
    },
  },
};

export const PLAN_KEYS = Object.keys(PLANS);

export const ORDERED_PLANS = [
  PLANS.studio_starter,
  PLANS.studio_growth,
  PLANS.studio_scale,
  PLANS.enterprise,
];

export const DEFAULT_PLAN_KEY = "studio_starter";

// Map Stripe subscription status to local subscription_status values
export const STRIPE_STATUS_MAP = {
  active:             "active",
  trialing:           "trialing",
  past_due:           "past_due",
  canceled:           "canceled",
  unpaid:             "unpaid",
  incomplete:         "incomplete",
  incomplete_expired: "expired",
  paused:             "paused",
};
