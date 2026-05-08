// ═══════════════════════════════════════════════════════════
// tools/audit-read.js — Audit log + ai_calls reader for agents.
// ═══════════════════════════════════════════════════════════

import { supabase } from "@/lib/db";

/**
 * Read recent entries from ai_calls or audit_log, optionally scoped to a
 * story, workspace, brand profile, or date range.
 *
 * @param {object}  args
 * @param {"ai_calls"|"audit_log"} args.source
 * @param {string}  [args.story_id]
 * @param {string}  [args.workspace_id]
 * @param {string}  [args.brand_profile_id]
 * @param {string}  [args.since]           ISO 8601
 * @param {boolean} [args.failures_only]   ai_calls only — filter success=false
 * @param {number}  [args.limit]
 * @returns {Promise<any[]>}
 */
export async function auditRead({
  source = "ai_calls",
  story_id,
  workspace_id,
  brand_profile_id,
  since,
  failures_only = false,
  limit = 50,
} = {}) {
  const cap = Math.min(Number(limit) || 50, 100);

  if (source === "ai_calls") {
    let q = supabase
      .from("ai_calls")
      .select("type,provider,model,success,error_type,error_message,created_at,duration_ms,cost_estimate,story_id")
      .order("created_at", { ascending: false })
      .limit(cap);
    if (failures_only)    q = q.eq("success", false);
    if (story_id)         q = q.eq("story_id", story_id);
    if (workspace_id)     q = q.eq("workspace_id", workspace_id);
    if (brand_profile_id) q = q.eq("brand_profile_id", brand_profile_id);
    if (since)            q = q.gte("created_at", since);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  if (source === "audit_log") {
    let q = supabase
      .from("audit_log")
      .select("action,table_name,record_id,created_at,details")
      .order("created_at", { ascending: false })
      .limit(cap);
    if (story_id) q = q.eq("record_id", story_id);
    if (since)    q = q.gte("created_at", since);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  throw new Error(`auditRead: unknown source "${source}"`);
}

export const TOOL_SCHEMA = {
  name: "audit_read",
  description: "Read recent entries from audit_log or ai_calls for a given story or date range.",
  input_schema: {
    type: "object",
    properties: {
      source:           { type: "string", enum: ["audit_log", "ai_calls"] },
      story_id:         { type: "string" },
      workspace_id:     { type: "string" },
      brand_profile_id: { type: "string" },
      since:            { type: "string", description: "ISO 8601 timestamp" },
      failures_only:    { type: "boolean" },
      limit:            { type: "integer", maximum: 100 },
    },
    required: ["source"],
  },
};
