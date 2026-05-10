// ═══════════════════════════════════════════════════════════
// taskTypes.js — Task type registry for the assistant.
//
// Capabilities are internal. Users see one assistant.
// Multiple skills/capabilities remain invisible unless needed.
// ═══════════════════════════════════════════════════════════

export const CAPABILITIES = {
  support:            "support",
  strategy:           "strategy",
  content:            "content",
  compliance:         "compliance",
  production:         "production",
  analytics_future:   "analytics_future",
  onboarding_future:  "onboarding_future",
  studio_future:      "studio_future",
  billing:            "billing",
};

export const TASK_TYPES = {
  general_help: {
    key:                  "general_help",
    label:                "General help",
    description:          "Open-ended assistance.",
    capability:           CAPABILITIES.support,
    cost_center:          "support",
    cost_category:        "support_agent",
    risk_level:           "low",
    requires_approval:    false,
  },
  explain_view: {
    key:                  "explain_view",
    label:                "Explain this view",
    description:          "Help the user understand the current screen or section.",
    capability:           CAPABILITIES.support,
    cost_center:          "support",
    cost_category:        "support_agent",
    risk_level:           "low",
    requires_approval:    false,
  },
  support_request: {
    key:                  "support_request",
    label:                "Support request",
    description:          "Troubleshooting, how-to, or general product help.",
    capability:           CAPABILITIES.support,
    cost_center:          "support",
    cost_category:        "support_agent",
    risk_level:           "low",
    requires_approval:    false,
  },
  billing_help: {
    key:                  "billing_help",
    label:                "Billing help",
    description:          "Questions about plans, features, or billing status.",
    capability:           CAPABILITIES.billing,
    cost_center:          "support",
    cost_category:        "support_agent",
    risk_level:           "low",
    requires_approval:    false,
  },
  provider_help: {
    key:                  "provider_help",
    label:                "Provider help",
    description:          "Help with provider configuration, keys, or diagnostics.",
    capability:           CAPABILITIES.support,
    cost_center:          "support",
    cost_category:        "support_agent",
    risk_level:           "low",
    requires_approval:    false,
  },
  improve_brand_profile: {
    key:                  "improve_brand_profile",
    label:                "Improve brand profile",
    description:          "Suggest improvements to brand voice, taxonomy, or settings.",
    capability:           CAPABILITIES.strategy,
    cost_center:          "strategy",
    cost_category:        "advisory_agent",
    risk_level:           "low",
    requires_approval:    true,
  },
  suggest_content_pillars: {
    key:                  "suggest_content_pillars",
    label:                "Suggest content pillars",
    description:          "Propose content pillars based on brand profile.",
    capability:           CAPABILITIES.strategy,
    cost_center:          "strategy",
    cost_category:        "advisory_agent",
    risk_level:           "low",
    requires_approval:    true,
  },
  suggest_programmes: {
    key:                  "suggest_programmes",
    label:                "Suggest programmes",
    description:          "Propose programme structure based on brand and content goals.",
    capability:           CAPABILITIES.strategy,
    cost_center:          "strategy",
    cost_category:        "advisory_agent",
    risk_level:           "low",
    requires_approval:    true,
  },
  suggest_campaign_ideas: {
    key:                  "suggest_campaign_ideas",
    label:                "Suggest campaign ideas",
    description:          "Generate campaign concepts aligned to brand strategy.",
    capability:           CAPABILITIES.content,
    cost_center:          "research",
    cost_category:        "generation",
    risk_level:           "low",
    requires_approval:    false,
  },
  suggest_content_ideas: {
    key:                  "suggest_content_ideas",
    label:                "Suggest content ideas",
    description:          "Generate content ideas for the current brand context.",
    capability:           CAPABILITIES.content,
    cost_center:          "research",
    cost_category:        "generation",
    risk_level:           "low",
    requires_approval:    false,
  },
  explain_score: {
    key:                  "explain_score",
    label:                "Explain score",
    description:          "Explain why a story received its quality or AI score.",
    capability:           CAPABILITIES.content,
    cost_center:          "research",
    cost_category:        "generation",
    risk_level:           "low",
    requires_approval:    false,
  },
  improve_story: {
    key:                  "improve_story",
    label:                "Improve this story",
    description:          "Suggest improvements to story angle, hook, or metadata.",
    capability:           CAPABILITIES.content,
    cost_center:          "research",
    cost_category:        "generation",
    risk_level:           "low",
    requires_approval:    true,
  },
  rewrite_script: {
    key:                  "rewrite_script",
    label:                "Rewrite script",
    description:          "Rewrite or improve a script based on brand voice.",
    capability:           CAPABILITIES.content,
    cost_center:          "script",
    cost_category:        "generation",
    risk_level:           "medium",
    requires_approval:    true,
  },
  explain_compliance_warning: {
    key:                  "explain_compliance_warning",
    label:                "Explain compliance warning",
    description:          "Explain an AI-generated compliance or quality gate warning.",
    capability:           CAPABILITIES.compliance,
    cost_center:          "compliance",
    cost_category:        "audit_assistance",
    risk_level:           "low",
    requires_approval:    false,
  },
  safer_rewrite: {
    key:                  "safer_rewrite",
    label:                "Safer rewrite",
    description:          "Rewrite content to reduce compliance risk.",
    capability:           CAPABILITIES.compliance,
    cost_center:          "compliance",
    cost_category:        "audit_assistance",
    risk_level:           "medium",
    requires_approval:    true,
  },
  studio_edit_future: {
    key:                  "studio_edit_future",
    label:                "Studio edit (future)",
    description:          "Placeholder for Studio-level production edits.",
    capability:           CAPABILITIES.studio_future,
    cost_center:          "studio_future",
    cost_category:        "generation",
    risk_level:           "high",
    requires_approval:    true,
  },
};

export const TASK_TYPE_KEYS = Object.keys(TASK_TYPES);

export function getTaskType(key) {
  return TASK_TYPES[key] || TASK_TYPES.general_help;
}

export function getCostFieldsForTask(task_type) {
  const t = TASK_TYPES[task_type];
  if (!t) return { cost_center: null, cost_category: null };
  return { cost_center: t.cost_center, cost_category: t.cost_category };
}
