// ═══════════════════════════════════════════════════════════
// tools/write-insight.js — Agents write findings here, NEVER to
// stories/brand_profiles/scoring_weights. Protects core scoring.
// STUB — Option B. `insights` table to be created when first agent ships.
// ═══════════════════════════════════════════════════════════

export async function writeInsight(/* args */) {
  throw new Error("tools/write-insight: not implemented");
}

export const TOOL_SCHEMA = {
  name: "write_insight",
  description: "Append a finding to the insights table. Scoped to workspace and brand profile.",
  input_schema: {
    type: "object",
    properties: {
      agent_name:       { type: "string" },
      brand_profile_id: { type: "string" },
      workspace_id:     { type: "string" },
      category:         { type: "string", enum: ["error", "feedback", "performance_pattern", "reach_signal"] },
      summary:          { type: "string" },
      payload:          { type: "object" },
      confidence:       { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["agent_name", "category", "summary"],
  },
};
