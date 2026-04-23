// ═══════════════════════════════════════════════════════════
// tools/audit-read.js — Audit log + ai_calls reader for agents.
// STUB — Option B. Used by error-analyst to investigate failures.
// ═══════════════════════════════════════════════════════════

export async function auditRead(/* args */) {
  throw new Error("tools/audit-read: not implemented");
}

export const TOOL_SCHEMA = {
  name: "audit_read",
  description: "Read recent entries from audit_log or ai_calls for a given story or date range.",
  input_schema: {
    type: "object",
    properties: {
      source:    { type: "string", enum: ["audit_log", "ai_calls"] },
      story_id:  { type: "string" },
      since:     { type: "string", description: "ISO 8601 timestamp" },
      limit:     { type: "integer", maximum: 100 },
    },
    required: ["source"],
  },
};
