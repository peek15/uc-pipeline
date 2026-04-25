// ═══════════════════════════════════════════════════════════
// agents/base.js — Shared helpers used by every agent.
//
// Responsibilities:
//   - loadAgentContext(): pulls brand_profile + recent agent_feedback
//   - hybridConfidence(): combines self-reported × heuristic signal
//   - parseAgentResponse(): tolerant JSON extractor
//   - logFeedback(): writes a row to agent_feedback after user decides
//
// Agents read brand identity from brand_profiles.brief_doc — never
// hardcode brand-specific text. This keeps the system multi-tenant
// from day one (constraint #15 in production-process-reference.md).
// ═══════════════════════════════════════════════════════════

import { supabase } from "@/lib/db";

/**
 * Load full agent context: brand identity + recent corrections.
 *
 * @param {object} opts
 * @param {string} opts.brand_profile_id
 * @param {string} opts.agent_name
 * @param {number} [opts.feedback_limit=5]
 * @returns {Promise<{ brand, feedback: Array }>}
 */
export async function loadAgentContext({ brand_profile_id, agent_name, feedback_limit = 5 }) {
  const [brandRes, fbRes] = await Promise.all([
    brand_profile_id
      ? supabase.from("brand_profiles").select("*").eq("id", brand_profile_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("agent_feedback")
      .select("agent_output, user_correction, correction_type, notes, created_at")
      .eq("agent_name", agent_name)
      .eq("brand_profile_id", brand_profile_id || "00000000-0000-0000-0000-000000000000")
      .in("correction_type", ["edit", "reject", "partial"])
      .order("created_at", { ascending: false })
      .limit(feedback_limit),
  ]);

  return {
    brand:    brandRes?.data || null,
    feedback: fbRes?.data    || [],
  };
}

/**
 * Build a "your past corrections" block for inclusion in agent prompts.
 * Returns empty string if no feedback exists — agents should be designed
 * to handle the empty case (Stage 1).
 */
export function formatFeedbackContext(feedback) {
  if (!feedback?.length) return "";
  const items = feedback.map((f, i) => {
    const before = JSON.stringify(f.agent_output).slice(0, 200);
    const after  = f.user_correction ? JSON.stringify(f.user_correction).slice(0, 200) : "(rejected, no replacement)";
    const note   = f.notes ? `\n   Note: ${f.notes}` : "";
    return `${i + 1}. You produced: ${before}\n   User corrected to: ${after}${note}`;
  }).join("\n\n");
  return `\n\n--- RECENT USER CORRECTIONS (learn from these) ---\n${items}\n--- END CORRECTIONS ---\n`;
}

/**
 * Hybrid confidence — self-reported × heuristic multiplier.
 *
 * @param {number} selfReported  — 0..100, what the agent claimed
 * @param {object} signals       — per-agent signal map
 * @returns {number}             — 0..100 final confidence
 *
 * Heuristic signals decrease confidence multiplicatively. Each signal is
 * a number 0..1 where 1 = perfect alignment, 0.5 = neutral, 0 = misalignment.
 * Final = selfReported × geometric_mean(signals).
 */
export function hybridConfidence(selfReported, signals = {}) {
  const self = clamp(Number(selfReported) || 0, 0, 100);
  const sigs = Object.values(signals).filter(v => v != null).map(v => clamp(Number(v) || 0, 0, 1));
  if (sigs.length === 0) return Math.round(self);

  const product = sigs.reduce((a, b) => a * b, 1);
  const geomean = Math.pow(product, 1 / sigs.length);
  const final   = self * geomean;
  return Math.round(clamp(final, 0, 100));
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

/**
 * Tolerant JSON extractor — strips markdown fences, finds first JSON object/array.
 * Returns null on failure (caller decides what to do).
 */
export function extractJson(text) {
  if (!text) return null;
  const clean = String(text).replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(clean); } catch {}

  const objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }

  const arrMatch = clean.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch {} }

  return null;
}

/**
 * Log a feedback row. Best-effort, never throws.
 */
export async function logFeedback({
  agent_name,
  brand_profile_id = null,
  workspace_id     = null,
  story_id         = null,
  ai_call_id       = null,
  correction_type,                     // 'approve' | 'edit' | 'reject' | 'partial'
  agent_output,
  user_correction  = null,
  notes            = null,
  agent_confidence = null,
  was_auto_approved = false,
}) {
  try {
    await supabase.from("agent_feedback").insert({
      agent_name,
      brand_profile_id,
      workspace_id,
      story_id,
      ai_call_id,
      correction_type,
      agent_output,
      user_correction,
      notes,
      agent_confidence,
      was_auto_approved,
    });
  } catch {} // silent
}

/**
 * Brand-identity block builder — every agent prompt should include this
 * verbatim. Pure function of brand_profiles.brief_doc shape.
 */
export function brandIdentityBlock(brand) {
  if (!brand) return "Brand profile: (none configured)";
  const bd = brand.brief_doc || {};
  const id = bd.identity || {};
  const cn = bd.content || {};
  const gl = bd.goals || {};
  const pr = bd.production || {};

  const lines = [
    `Brand: "${brand.name || id.brand_name || "(unnamed)"}"`,
    id.character_voice ? `Voice: ${id.character_voice}` : null,
    id.character_avoid ? `Avoid: ${id.character_avoid}` : null,
    id.locked_elements?.length ? `Locked elements: ${id.locked_elements.join("; ")}` : null,
    cn.content_type ? `Content type: ${cn.content_type}` : null,
    cn.niche ? `Niche: ${cn.niche}` : null,
    gl.goal_primary ? `Primary goal: ${gl.goal_primary}` : null,
    gl.goal_secondary ? `Secondary goal: ${gl.goal_secondary}` : null,
    pr.visual_style ? `Visual style: ${pr.visual_style}` : null,
    pr.color_identity ? `Color identity: ${pr.color_identity}` : null,
    pr.pacing_preference ? `Pacing: ${pr.pacing_preference}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}
