// ═══════════════════════════════════════════════════════════
// audit.js — Logs every AI call to the ai_calls table.
// Best-effort: logging failures never break the caller.
// Only called from runner.js / agent-runner.js.
// ═══════════════════════════════════════════════════════════

import { supabase } from "@/lib/db";
import { estimateCost } from "./costs";

/**
 * Log a successful AI call.
 *
 * @param {object} opts
 * @param {string} opts.type               — e.g. "score-story"
 * @param {string} opts.provider_name      — "anthropic" | "openai" | "stub"
 * @param {string} opts.model_version      — resolved model id
 * @param {number} opts.tokens_input
 * @param {number} opts.tokens_output
 * @param {string} [opts.story_id]
 * @param {string} [opts.brand_profile_id]
 * @param {string} [opts.workspace_id]
 * @param {number} [opts.duration_ms]
 * @param {string} [opts.cost_center]      — e.g. "research" | "script" | "translation" | "onboarding"
 * @param {string} [opts.cost_category]    — e.g. "generation" | "compliance" | "internal_admin"
 * @returns {Promise<string|null>} ai_call row id or null
 */
export async function logAiCall({
  type,
  provider_name = "anthropic",
  model_version,
  tokens_input,
  tokens_output,
  story_id = null,
  brand_profile_id = null,
  workspace_id = null,
  duration_ms = null,
  cost_center = null,
  cost_category = null,
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const cost_estimate = estimateCost(model_version, tokens_input, tokens_output);

    const { data, error } = await supabase.from("ai_calls").insert({
      type,
      provider_name,
      model_version,
      tokens_input,
      tokens_output,
      cost_estimate,
      story_id,
      brand_profile_id,
      workspace_id,
      user_email:  user?.email || null,
      success:     true,
      duration_ms,
      cost_center,
      cost_category,
    }).select("id").single();

    if (error) return null;
    return data?.id || null;
  } catch {
    return null;
  }
}

/**
 * Log a failed AI call. Useful for cost visibility even on parse errors.
 *
 * @param {object} opts
 * @param {string} opts.type
 * @param {string} [opts.provider_name]
 * @param {string} [opts.model_version]
 * @param {number} [opts.tokens_input]    — may be null if call never reached API
 * @param {number} [opts.tokens_output]
 * @param {string} [opts.story_id]
 * @param {string} [opts.brand_profile_id]
 * @param {string} [opts.workspace_id]
 * @param {string} [opts.error_type]      — "timeout" | "parse" | "provider_error" | "auth" | "other"
 * @param {string} [opts.error_message]
 * @param {number} [opts.duration_ms]
 * @param {string} [opts.cost_center]
 * @param {string} [opts.cost_category]
 */
export async function logAiCallError({
  type,
  provider_name = "anthropic",
  model_version = null,
  tokens_input = null,
  tokens_output = null,
  story_id = null,
  brand_profile_id = null,
  workspace_id = null,
  error_type = "other",
  error_message = null,
  duration_ms = null,
  cost_center = null,
  cost_category = null,
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const cost_estimate = estimateCost(model_version, tokens_input, tokens_output);

    await supabase.from("ai_calls").insert({
      type,
      provider_name,
      model_version,
      tokens_input,
      tokens_output,
      cost_estimate,
      story_id,
      brand_profile_id,
      workspace_id,
      user_email:    user?.email || null,
      success:       false,
      duration_ms,
      error_type,
      error_message: error_message ? String(error_message).slice(0, 2000) : null,
      cost_center,
      cost_category,
    });
} catch {} // silent
}

/**
 * Log non-token provider spend, such as voice or visual generation.
 */
export async function logProviderCost({
  type,
  provider_name,
  model_version = null,
  cost_estimate = 0,
  story_id = null,
  brand_profile_id = null,
  workspace_id = null,
  success = true,
  duration_ms = null,
  error_type = null,
  error_message = null,
  cost_center = null,
  cost_category = null,
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("ai_calls").insert({
      type,
      provider_name,
      model_version,
      tokens_input: null,
      tokens_output: null,
      cost_estimate,
      story_id,
      brand_profile_id,
      workspace_id,
      user_email: user?.email || null,
      success,
      duration_ms,
      error_type,
      error_message: error_message ? String(error_message).slice(0, 2000) : null,
      cost_center,
      cost_category,
    });
  } catch {}
}

/**
 * Query recent AI calls for the Analyze tab and cost-per-video reporting.
 */
export async function getAiCalls({ limit = 100, storyId = null, type = null, workspaceId = null, brandProfileId = null } = {}) {
  let q = supabase.from("ai_calls").select("*").order("created_at", { ascending: false }).limit(limit);
  if (storyId) q = q.eq("story_id", storyId);
  if (type)    q = q.eq("type", type);
  // Include untagged calls (workspace_id IS NULL) alongside workspace-scoped ones
  // so calls from runner.js without tenant context are never hidden.
  if (workspaceId) q = q.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
  if (brandProfileId) q = q.or(`brand_profile_id.eq.${brandProfileId},brand_profile_id.is.null`);
  const { data, error } = await q;
  if (error) return [];
  return data || [];
}

/**
 * Aggregate cost for a story — used by AnalyzeView per-story cost column.
 */
export async function getStoryCost(storyId) {
  const { data, error } = await supabase
    .from("ai_calls")
    .select("cost_estimate")
    .eq("story_id", storyId);
  if (error || !data) return 0;
  return data.reduce((a, r) => a + (Number(r.cost_estimate) || 0), 0);
}
