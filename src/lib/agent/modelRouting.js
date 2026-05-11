// ═══════════════════════════════════════════════════════════
// modelRouting.js — Placeholder model routing for task types.
//
// Returns recommended model/capability for a given task_type.
// Currently returns current provider behavior as defaults.
// Future: route compliance/strategy to stronger models,
//         support/classification to cheaper models.
// ═══════════════════════════════════════════════════════════

import { TASK_TYPES, CAPABILITIES } from "./taskTypes";

// Tier labels — not exposed to users
const TIERS = {
  fast:   "fast",    // cheap/fast — classification, extraction, support
  medium: "medium",  // rewrites, summaries
  strong: "strong",  // strategy, compliance-sensitive, script generation
};

// Map capability → recommended model tier
const CAPABILITY_TIER = {
  [CAPABILITIES.support]:           TIERS.fast,
  [CAPABILITIES.billing]:           TIERS.fast,
  [CAPABILITIES.content]:           TIERS.medium,
  [CAPABILITIES.production]:        TIERS.medium,
  [CAPABILITIES.strategy]:          TIERS.strong,
  [CAPABILITIES.compliance]:        TIERS.strong,
  [CAPABILITIES.analytics_future]:  TIERS.medium,
  [CAPABILITIES.onboarding]:        TIERS.medium,
  [CAPABILITIES.onboarding_future]: TIERS.medium,
  [CAPABILITIES.studio_future]:     TIERS.strong,
};

// Map tier → default model ID (used by AgentPanel model picker as suggestion)
// These are SUGGESTIONS only — user model picker takes precedence in the UI.
const TIER_DEFAULT_MODEL = {
  [TIERS.fast]:   "claude-haiku-4-5-20251001",
  [TIERS.medium]: "claude-sonnet-4-6",
  [TIERS.strong]: "claude-sonnet-4-6",
};

export function getDefaultCapabilityForTask(task_type) {
  return TASK_TYPES[task_type]?.capability || CAPABILITIES.support;
}

export function getRecommendedModelForTask(task_type) {
  const capability = getDefaultCapabilityForTask(task_type);
  const tier       = CAPABILITY_TIER[capability] || TIERS.medium;
  return TIER_DEFAULT_MODEL[tier] || "claude-sonnet-4-6";
}

export function getTaskTier(task_type) {
  const capability = getDefaultCapabilityForTask(task_type);
  return CAPABILITY_TIER[capability] || TIERS.medium;
}
