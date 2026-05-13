export function buildDurableBrandMemory({ previousSettings = {}, nextSettings = {}, draft = {}, sessionId = null, approvedBy = null, approvedAt = null } = {}) {
  const previousMemory = previousSettings.onboarding?.brand_memory || {};
  const nextFacts = {
    brand_name: nextSettings.brand?.name || "",
    priority_offer: nextSettings.brand?.products_services || "",
    audience: nextSettings.brand?.target_audience || "",
    voice: nextSettings.brand?.voice || "",
    avoid: nextSettings.brand?.avoid || "",
    platforms: nextSettings.strategy?.target_platforms || [],
    content_goals: nextSettings.strategy?.content_goals || "",
    claims_to_use_carefully: nextSettings.strategy?.claims_to_use_carefully || "",
  };
  const previousFacts = previousMemory.confirmed_facts || {};
  return {
    ...previousMemory,
    confirmed_facts: {
      ...previousFacts,
      ...dropEmpty(nextFacts),
    },
    source_citations: draft.source_citations || previousMemory.source_citations || [],
    assumptions: draft.assumptions || previousMemory.assumptions || [],
    quality_review: draft.quality_review || previousMemory.quality_review || null,
    last_approved_session_id: sessionId,
    last_approved_by: approvedBy,
    last_approved_at: approvedAt,
    updated_at: approvedAt,
  };
}

export function buildStrategyRefreshDiff(previousSettings = {}, nextSettings = {}) {
  const checks = [
    ["brand_name", previousSettings.brand?.name, nextSettings.brand?.name],
    ["priority_offer", previousSettings.brand?.products_services, nextSettings.brand?.products_services],
    ["audience", previousSettings.brand?.target_audience, nextSettings.brand?.target_audience],
    ["voice", previousSettings.brand?.voice, nextSettings.brand?.voice],
    ["avoid", previousSettings.brand?.avoid, nextSettings.brand?.avoid],
    ["content_goals", previousSettings.strategy?.content_goals, nextSettings.strategy?.content_goals],
    ["platforms", previousSettings.strategy?.target_platforms, nextSettings.strategy?.target_platforms],
    ["programmes", (previousSettings.strategy?.programmes || []).map(p => p.name), (nextSettings.strategy?.programmes || []).map(p => p.name)],
    ["claims_to_use_carefully", previousSettings.strategy?.claims_to_use_carefully, nextSettings.strategy?.claims_to_use_carefully],
  ];

  const changes = checks
    .map(([field, before, after]) => ({ field, before: normalizeValue(before), after: normalizeValue(after) }))
    .filter(item => JSON.stringify(item.before) !== JSON.stringify(item.after));

  return {
    changed: changes.length > 0,
    changes,
    summary: changes.length
      ? `Strategy refresh changed ${changes.length} field${changes.length === 1 ? "" : "s"}.`
      : "No meaningful strategy changes were detected.",
  };
}

export function attachBrandMemoryToSettings({ previousSettings = {}, nextSettings = {}, draft = {}, sessionId = null, approvedBy = null, approvedAt = null } = {}) {
  const memory = buildDurableBrandMemory({ previousSettings, nextSettings, draft, sessionId, approvedBy, approvedAt });
  const refreshDiff = buildStrategyRefreshDiff(previousSettings, nextSettings);
  return {
    ...nextSettings,
    onboarding: {
      ...(nextSettings.onboarding || {}),
      brand_memory: memory,
      last_refresh_diff: refreshDiff,
    },
  };
}

function dropEmpty(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => {
    if (Array.isArray(item)) return item.length > 0;
    return Boolean(item);
  }));
}

function normalizeValue(value) {
  if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean).sort();
  if (value && typeof value === "object") return JSON.parse(JSON.stringify(value));
  return String(value || "").trim();
}
