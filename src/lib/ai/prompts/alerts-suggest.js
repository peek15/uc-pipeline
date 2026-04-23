// ═══════════════════════════════════════════════════════════
// alerts-suggest.js — Suggest additional content programmes.
// Extracted from SettingsModal.suggestProgrammes (around line 443).
// Note: filename kept as "alerts-suggest" per initial spec, but
// this suggests programmes. The strategy alerts thresholds are
// configured manually in Rules & Alerts section, no AI there yet.
// ═══════════════════════════════════════════════════════════

export const defaults = {
  maxTokens: 600,
  model:     "haiku",
};

/**
 * @param {object} params
 * @param {string} params.brand_name
 * @param {string} params.content_type
 * @param {string} params.goal_primary
 * @param {Array<{name:string}>} params.programmes
 * @param {string} params.voice
 * @param {string} params.avoid
 */
export function build({ brand_name, content_type, goal_primary, programmes, voice, avoid }) {
  return `You are suggesting content programmes for "${brand_name}", a ${content_type} brand.

Goal: ${goal_primary}
Current programmes: ${programmes.map(p => p.name).join(", ") || "None"}
Voice: ${voice}
Avoid: ${avoid}

Suggest 2-3 additional programmes that would complement the existing ones.
Return JSON array: [{ name, role ("reach"|"community"|"balanced"|"special"), weight (0-100 integer), color (hex), angle_suggestions: [array of 3-4 content angle strings], rationale }]
JSON only.`;
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
