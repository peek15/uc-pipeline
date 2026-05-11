// ═══════════════════════════════════════════════════════════
// agentContext.js — Shared agent context shape and builders.
//
// All future AI assistant calls should carry a context object
// built with buildAgentContext(). Fields are optional unless
// noted — fill what is available at the call site.
// ═══════════════════════════════════════════════════════════

/**
 * Build a structured agent context object.
 * Pass this as agent_context to openAssistant() or AgentPanel.
 */
export function buildAgentContext({
  // ── Core tenant context ──────────────────────────────────
  workspace_id        = null,
  brand_profile_id    = null,
  user_id             = null,
  plan_key            = null,
  workspace_role      = null,

  // ── UI / source context ──────────────────────────────────
  // source_view examples: dashboard | research | pipeline | script |
  //   production | calendar | analyze | settings | billing |
  //   brand_profile | content_strategy | programmes | compliance
  source_view         = null,
  source_component    = null,
  // source_entity_type examples: story | script | content_item |
  //   programme | brand_profile | audit_result | compliance_check | approval | content_export | provider_config |
  //   billing_plan | workspace
  source_entity_type  = null,
  source_entity_id    = null,
  selected_text       = null,
  selected_range      = null,
  selected_timecode   = null,
  selected_scene_id   = null,
  selected_asset_id   = null,

  // ── Task context ─────────────────────────────────────────
  // task_type: see src/lib/agent/taskTypes.js for the full registry
  task_type           = "general_help",
  task_intent         = null,
  priority            = null,
  risk_level          = null,

  // ── Payload snapshots (keep small — passed in system prompt) ─
  brand_snapshot      = null,
  content_snapshot    = null,
  audit_snapshot      = null,
  programme_snapshot  = null,
  settings_snapshot   = null,
  billing_snapshot    = null,
  provider_snapshot   = null,
  metadata            = null,

  // ── Action context ───────────────────────────────────────
  // suggested_actions: array of { id, label, task_type, description?, payload?, requires_confirmation }
  suggested_actions   = null,
  allowed_actions     = null,
  apply_target        = null,
  requires_user_approval = false,
} = {}) {
  return {
    workspace_id, brand_profile_id, user_id, plan_key, workspace_role,
    source_view, source_component, source_entity_type, source_entity_id,
    selected_text, selected_range, selected_timecode, selected_scene_id, selected_asset_id,
    task_type, task_intent, priority, risk_level,
    brand_snapshot, content_snapshot, audit_snapshot, programme_snapshot,
    settings_snapshot, billing_snapshot, provider_snapshot, metadata,
    suggested_actions, allowed_actions, apply_target, requires_user_approval,
  };
}

// ── View label helpers ───────────────────────────────────────

const VIEW_LABELS = {
  dashboard:        "Dashboard",
  research:         "Ideas",
  pipeline:         "Pipeline",
  script:           "Script",
  production:       "Production",
  calendar:         "Calendar",
  analyze:          "Analyze",
  settings:         "Settings",
  billing:          "Billing",
  brand_profile:    "Brand Profile",
  content_strategy: "Content Strategy",
  programmes:       "Programmes",
  compliance:       "Compliance",
  providers:        "Providers",
  onboarding:       "Onboarding",
};

const ENTITY_LABELS = {
  story:          "Story",
  script:         "Script",
  content_item:   "Content item",
  programme:      "Programme",
  brand_profile:  "Brand profile",
  audit_result:   "Audit result",
  compliance_check: "Compliance check",
  approval:       "Approval",
  content_export: "Content export",
  provider_config:"Provider config",
  billing_plan:   "Billing plan",
  workspace:      "Workspace",
  onboarding_session: "Onboarding session",
};

export function getViewLabel(source_view) {
  return VIEW_LABELS[source_view] || source_view || "";
}

export function getEntityLabel(source_entity_type) {
  return ENTITY_LABELS[source_entity_type] || source_entity_type || "";
}

export function getContextSummary(ctx) {
  if (!ctx) return null;
  const parts = [];
  if (ctx.source_view)         parts.push(getViewLabel(ctx.source_view));
  if (ctx.source_entity_type)  parts.push(getEntityLabel(ctx.source_entity_type));
  return parts.join(" · ") || null;
}

// ── Snapshot builder helpers ─────────────────────────────────

export function buildBillingSnapshot(billing) {
  if (!billing) return null;
  return {
    plan_key:            billing.plan_key,
    subscription_status: billing.subscription_status,
    billing_period:      billing.billing_period,
  };
}

export function buildProviderSnapshot(settings) {
  if (!settings?.providers) return null;
  return Object.entries(settings.providers).reduce((acc, [k, v]) => {
    acc[k] = { provider: v.provider, status: v.status };
    return acc;
  }, {});
}

export function buildBrandSnapshot(settings) {
  if (!settings?.brand) return null;
  return {
    name:         settings.brand.name,
    content_type: settings.brand.content_type,
    voice:        settings.brand.voice?.slice(0, 120) || null,
    avoid:        settings.brand.avoid?.slice(0, 120) || null,
  };
}
