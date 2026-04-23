// ═══════════════════════════════════════════════════════════
// rules-suggest.js — Suggest smart scheduling rules.
// Extracted from SettingsModal.suggestRules (around line 505).
// ═══════════════════════════════════════════════════════════

export const defaults = {
  maxTokens: 800,
  model:     "haiku",
};

/**
 * @param {object} params
 * @param {string} params.brand_name
 * @param {string} params.content_type
 * @param {string} params.goal_primary
 * @param {string} params.goal_secondary
 * @param {number} params.weekly_cadence
 * @param {object} params.format_mix
 * @param {number} params.published_count
 * @param {string} [params.top_performers]
 */
export function build({
  brand_name, content_type, goal_primary, goal_secondary,
  weekly_cadence, format_mix, published_count, top_performers,
}) {
  return `You are an AI content strategy advisor for "${brand_name}", a ${content_type} brand.

Goal: ${goal_primary} (secondary: ${goal_secondary})
Weekly cadence: ${weekly_cadence} episodes
Format mix: ${JSON.stringify(format_mix)}
Published stories with data: ${published_count}
${published_count > 0 && top_performers ? `Top performers: ${top_performers}` : "No performance data yet"}

Suggest 3-5 smart scheduling rules for this brand. Be specific and actionable.
Return JSON array: [{ type: "format_day"|"format_freq"|"score_priority"|"format_seq"|"archetype_seq"|"day_restrict", label: "short label", reasoning: "why this rule helps", config: { ...rule fields } }]
JSON only. No markdown.`;
}

export function parse(text) {
  const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  let parsed = null;
  try { parsed = JSON.parse(clean); } catch {}
  if (!parsed) {
    const m = clean.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (m) try { parsed = JSON.parse(m[0]); } catch {}
  }
  return Array.isArray(parsed) ? parsed : [];
}
