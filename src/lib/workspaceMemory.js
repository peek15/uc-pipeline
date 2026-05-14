const MEMORY_SOURCE = "workspace_memory";
const MEMORY_CATEGORY = "memory";
const DEFAULT_LIMIT = 12;
const CANDIDATE_MULTIPLIER = 4;
const MAX_PROMPT_MEMORIES = 10;
const STATUS_WEIGHT = {
  applied: 1,
  reviewed: 0.92,
  open: 0.72,
};

export function buildStrategyMemoryItems({
  settings = {},
  draft = {},
  sessionId = null,
  approvedBy = null,
  approvedAt = null,
} = {}) {
  const brand = settings.brand || {};
  const strategy = settings.strategy || {};
  const programmes = strategy.programmes || [];
  const base = {
    session_id: sessionId,
    approved_by: approvedBy,
    approved_at: approvedAt,
    source_citations: draft.source_citations || [],
    assumptions: draft.assumptions || [],
  };

  return [
    memoryItem("brand_profile", "Brand profile", summarizeFields({
      name: brand.name,
      offer: brand.products_services,
      audience: brand.target_audience,
      voice: brand.voice,
      avoid: brand.avoid,
    }), { ...base, kind: "brand_profile", fields: ["brand.name", "brand.products_services", "brand.target_audience", "brand.voice", "brand.avoid"] }, 0.86),
    memoryItem("content_strategy", "Content strategy", summarizeFields({
      goals: strategy.content_goals,
      platforms: strategy.target_platforms,
      pillars: strategy.content_pillars,
    }), { ...base, kind: "content_strategy", fields: ["strategy.content_goals", "strategy.target_platforms", "strategy.content_pillars"] }, 0.82),
    memoryItem("programmes", "Programmes", summarizeProgrammes(programmes), { ...base, kind: "programmes", programme_count: programmes.length }, programmes.length ? 0.82 : 0.4),
    memoryItem("risk_guidance", "Risk and claims guidance", summarizeFields({
      claims_to_use_carefully: strategy.claims_to_use_carefully,
      compliance_sensitivities: strategy.compliance_sensitivities,
      avoid_angles: strategy.avoid_angles,
    }), { ...base, kind: "risk_guidance", fields: ["strategy.claims_to_use_carefully", "strategy.compliance_sensitivities", "strategy.avoid_angles"] }, 0.78),
  ].filter(item => item.summary && item.summary !== "No durable memory available yet.");
}

export async function writeWorkspaceMemoryBatch({
  svc,
  workspaceId,
  brandProfileId = null,
  items = [],
  agentName = "workspace-memory",
  entityType = "brand_profile",
  entityId = null,
} = {}) {
  if (!svc || !workspaceId || !items.length) return { written: 0, memories: [], unavailable: !svc };
  const rows = items.map(item => ({
    workspace_id: workspaceId,
    brand_profile_id: brandProfileId || null,
    agent_name: agentName,
    source: MEMORY_SOURCE,
    category: MEMORY_CATEGORY,
    entity_type: item.entity_type || entityType,
    entity_id: item.entity_id || entityId || brandProfileId || null,
    summary: item.summary.slice(0, 1400),
    payload: {
      memory_key: item.key,
      label: item.label,
      kind: item.kind || item.key,
      confidence_reason: item.confidence_reason || "Approved or user-confirmed workspace signal.",
      ...(item.payload || {}),
    },
    confidence: clamp01(item.confidence ?? 0.75),
    status: item.status || "applied",
  }));

  const { data, error } = await svc
    .from("intelligence_insights")
    .insert(rows)
    .select("*");
  if (error) return { written: 0, memories: [], unavailable: true, error: error.message };
  return { written: data?.length || 0, memories: data || [], unavailable: false };
}

export async function retrieveWorkspaceMemory({
  svc,
  workspaceId,
  brandProfileId = null,
  limit = DEFAULT_LIMIT,
  minConfidence = 0.4,
  categories = [MEMORY_CATEGORY, "strategy_recommendation", "quality_pattern", "performance_pattern"],
} = {}) {
  if (!svc || !workspaceId) return { memories: [], unavailable: true, summary: "" };
  const requestedLimit = clampInt(limit, 1, 50, DEFAULT_LIMIT);
  let query = svc
    .from("intelligence_insights")
    .select("id,created_at,brand_profile_id,source,category,entity_type,entity_id,summary,payload,confidence,status")
    .eq("workspace_id", workspaceId)
    .in("category", categories)
    .in("status", ["open", "reviewed", "applied"])
    .gte("confidence", Math.max(0, Number(minConfidence) - 0.15))
    .order("created_at", { ascending: false })
    .limit(clampInt(requestedLimit * CANDIDATE_MULTIPLIER, requestedLimit, 100, requestedLimit * CANDIDATE_MULTIPLIER));
  if (brandProfileId) {
    query = query.or(`brand_profile_id.eq.${brandProfileId},brand_profile_id.is.null`);
  }
  const { data, error } = await query;
  if (error) return { memories: [], unavailable: true, error: error.message, summary: "" };
  const memories = selectRelevantMemories(data || [], { limit: requestedLimit, minConfidence });
  return {
    memories,
    unavailable: false,
    summary: formatWorkspaceMemoryForPrompt(memories),
    source_groups: summarizeMemorySources(memories),
    memory_context: {
      count: memories.length,
      ids: memories.map(memory => memory.id),
      groups: summarizeMemorySources(memories),
      generated_at: new Date().toISOString(),
    },
  };
}

export function formatWorkspaceMemoryForPrompt(memories = []) {
  if (!memories.length) return "";
  return memories
    .slice(0, MAX_PROMPT_MEMORIES)
    .map(memory => {
      const label = memory.payload?.label || memory.payload?.memory_key || memory.category || "Memory";
      const confidence = memory.effective_confidence != null
        ? ` confidence ${Number(memory.effective_confidence).toFixed(2)}`
        : memory.confidence != null
          ? ` confidence ${Number(memory.confidence).toFixed(2)}`
          : "";
      const source = memory.source ? ` source ${memory.source}` : "";
      return `- ${label}:${confidence}${source}. ${memory.summary}`;
    })
    .join("\n");
}

function memoryItem(key, label, summary, payload, confidence) {
  return { key, label, kind: key, summary, payload, confidence };
}

function summarizeFields(fields) {
  const lines = Object.entries(fields || {})
    .map(([key, value]) => {
      const normalized = normalizeValue(value);
      return normalized ? `${humanize(key)}: ${normalized}` : "";
    })
    .filter(Boolean);
  return lines.length ? lines.join(" | ") : "No durable memory available yet.";
}

function summarizeProgrammes(programmes = []) {
  const lines = (programmes || [])
    .slice(0, 6)
    .map(programme => {
      const name = programme.name || programme.label;
      if (!name) return "";
      const goal = programme.goal || programme.description || programme.why_this_works || "";
      const cadence = programme.cadence ? `, cadence: ${programme.cadence}` : "";
      return `${name}${goal ? ` (${String(goal).slice(0, 160)})` : ""}${cadence}`;
    })
    .filter(Boolean);
  return lines.length ? lines.join(" | ") : "No durable memory available yet.";
}

function normalizeValue(value) {
  if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value).slice(0, 500);
  return String(value || "").replace(/\s+/g, " ").trim();
}

function humanize(value) {
  return String(value || "").replace(/_/g, " ");
}

function selectRelevantMemories(rows, { limit, minConfidence }) {
  const byKey = new Map();
  for (const row of rows || []) {
    if (!row?.summary) continue;
    const enriched = enrichMemory(row);
    if (enriched.effective_confidence < minConfidence) continue;
    const key = memoryDedupeKey(enriched);
    const existing = byKey.get(key);
    if (!existing || memorySortValue(enriched) > memorySortValue(existing)) {
      byKey.set(key, enriched);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => memorySortValue(b) - memorySortValue(a))
    .slice(0, limit);
}

function enrichMemory(row) {
  const statusWeight = STATUS_WEIGHT[row.status] ?? 0.6;
  const ageDays = row.created_at ? Math.max(0, (Date.now() - new Date(row.created_at).getTime()) / 86400000) : 365;
  const decay = ageDays <= 30 ? 1 : ageDays <= 90 ? 0.9 : ageDays <= 180 ? 0.78 : 0.65;
  const sourceBoost = row.source === MEMORY_SOURCE ? 1.05 : row.source === "agent_feedback" ? 0.94 : 1;
  const base = clamp01(row.confidence ?? 0.7);
  const effective = clamp01(base * statusWeight * decay * sourceBoost);
  return {
    ...row,
    effective_confidence: effective,
    memory_age_days: Math.round(ageDays),
    memory_source_group: sourceGroup(row),
  };
}

function memorySortValue(memory) {
  const recency = memory.memory_age_days != null ? Math.max(0, 1 - Math.min(memory.memory_age_days, 365) / 365) : 0;
  return (memory.effective_confidence || 0) * 100 + recency * 8 + (memory.status === "applied" ? 4 : 0);
}

function memoryDedupeKey(row) {
  const key = row.payload?.memory_key || row.payload?.kind || row.category || "memory";
  const summary = normalizeMemoryText(row.summary).slice(0, 220);
  return `${key}:${summary}`;
}

function normalizeMemoryText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeMemorySources(memories = []) {
  const groups = {};
  for (const memory of memories) {
    const key = memory.memory_source_group || sourceGroup(memory);
    groups[key] = (groups[key] || 0) + 1;
  }
  return groups;
}

function sourceGroup(row) {
  if (row.source === MEMORY_SOURCE) return "approved_strategy_memory";
  if (row.source === "agent_feedback") return "feedback_memory";
  if (row.category === "quality_pattern") return "quality_memory";
  if (row.category === "performance_pattern") return "performance_memory";
  return row.source || row.category || "workspace_memory";
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
