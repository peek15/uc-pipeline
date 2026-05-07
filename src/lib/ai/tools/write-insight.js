// ═══════════════════════════════════════════════════════════
// tools/write-insight.js — Agents write durable findings here, NEVER to
// stories/brand_profiles/scoring_weights. Protects core scoring and strategy.
// ═══════════════════════════════════════════════════════════

import { supabase } from "@/lib/db";
import { normalizeTenant } from "@/lib/brand";

const CATEGORIES = new Set([
  "error",
  "feedback",
  "performance_pattern",
  "reach_signal",
  "quality_pattern",
  "provider_health",
  "strategy_recommendation",
  "debug",
]);
const STATUSES = new Set(["open", "reviewed", "dismissed", "applied"]);

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function cleanText(value, max = 1200) {
  return String(value || "").trim().slice(0, max);
}

function safePayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const json = JSON.stringify(value);
  if (json.length > 12000) return { truncated: true, preview: json.slice(0, 12000) };
  return value;
}

/**
 * Write a durable intelligence insight.
 *
 * This is intentionally narrow: it records a proposed finding/memory
 * candidate and never directly changes scoring, settings, or content rows.
 */
export async function writeInsight(args = {}) {
  const tenant = normalizeTenant({
    workspace_id: args.workspace_id,
    brand_profile_id: args.brand_profile_id,
  });
  const summary = cleanText(args.summary, 1400);
  if (!summary) throw new Error("writeInsight: summary is required");

  const category = CATEGORIES.has(args.category) ? args.category : "debug";
  const status = STATUSES.has(args.status) ? args.status : "open";
  const row = {
    workspace_id: tenant.workspace_id,
    brand_profile_id: tenant.brand_profile_id,
    agent_name: cleanText(args.agent_name || "unknown", 120),
    source: cleanText(args.source || args.agent_name || "agent", 120),
    category,
    entity_type: args.entity_type ? cleanText(args.entity_type, 80) : null,
    entity_id: args.entity_id || args.story_id || null,
    summary,
    payload: safePayload(args.payload),
    confidence: clamp01(args.confidence),
    status,
  };

  const { data, error } = await supabase
    .from("intelligence_insights")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export const TOOL_SCHEMA = {
  name: "write_insight",
  description: "Append a durable intelligence finding. Scoped to workspace and brand profile; never mutates content, strategy, or scoring directly.",
  input_schema: {
    type: "object",
    properties: {
      agent_name:       { type: "string" },
      brand_profile_id: { type: "string" },
      workspace_id:     { type: "string" },
      source:           { type: "string" },
      category:         { type: "string", enum: ["error", "feedback", "performance_pattern", "reach_signal", "quality_pattern", "provider_health", "strategy_recommendation", "debug"] },
      entity_type:      { type: "string" },
      entity_id:        { type: "string" },
      story_id:         { type: "string" },
      summary:          { type: "string" },
      payload:          { type: "object" },
      confidence:       { type: "number", minimum: 0, maximum: 1 },
      status:           { type: "string", enum: ["open", "reviewed", "dismissed", "applied"] },
    },
    required: ["agent_name", "category", "summary"],
  },
};
