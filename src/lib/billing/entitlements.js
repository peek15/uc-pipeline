// ═══════════════════════════════════════════════════════════
// entitlements.js — Qualitative plan feature access helpers.
//
// Does NOT gate core workflows. Use for display and soft hints.
// Hard gating deferred to future sprint when pricing is locked.
// ═══════════════════════════════════════════════════════════

import { PLANS, DEFAULT_PLAN_KEY } from "./plans";

export function getPlanEntitlements(plan_key) {
  const plan = PLANS[plan_key] || PLANS[DEFAULT_PLAN_KEY];
  return plan.entitlements;
}

export function hasFeature(plan_key, feature) {
  const e = getPlanEntitlements(plan_key);
  const v = e[feature];
  if (v === false || v === "none" || v == null) return false;
  return true;
}

export function getWorkspacePlan(workspaceOrBilling) {
  return workspaceOrBilling?.plan_key || DEFAULT_PLAN_KEY;
}

export function getPlanLabel(plan_key) {
  return PLANS[plan_key]?.label || PLANS[DEFAULT_PLAN_KEY].label;
}

export function getPlan(plan_key) {
  return PLANS[plan_key] || PLANS[DEFAULT_PLAN_KEY];
}

// Human-readable label for a qualitative entitlement value
export function entitlementLabel(value) {
  if (value === false || value === "none") return "—";
  if (value === "custom") return "Custom";
  if (value === "basic")    return "Basic";
  if (value === "standard") return "Standard";
  if (value === "advanced") return "Advanced";
  if (value === "limited")  return "Limited";
  if (value === "included") return "Included";
  if (value === "priority") return "Priority";
  if (value === true)       return "Yes";
  return String(value);
}
