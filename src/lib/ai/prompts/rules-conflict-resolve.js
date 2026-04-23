// ═══════════════════════════════════════════════════════════
// rules-conflict-resolve.js — Reorder rules to resolve conflicts.
// Extracted from SettingsModal.resolveConflicts (around line 557).
// ═══════════════════════════════════════════════════════════

export const defaults = {
  maxTokens: 600,
  model:     "haiku",
};

/**
 * @param {object} params
 * @param {string} params.brand_name
 * @param {string} params.rules_ordered       — "1. <desc>\n2. ..."
 * @param {string} params.conflicts_list      — "- <reason>\n- ..."
 * @param {string} [params.user_preference]
 */
export function build({ brand_name, rules_ordered, conflicts_list, user_preference }) {
  return `You are resolving conflicts in a content scheduling ruleset for "${brand_name}".

Current rules (in priority order):
${rules_ordered}

Conflicts detected:
${conflicts_list}

${user_preference ? `User preference: "${user_preference}"` : ""}

Reorder and/or adjust these rules to resolve conflicts while respecting the user's preference.
Return JSON: {
  "new_order": [array of original 0-based indices in new order],
  "changes": ["brief description of each change made"],
  "explanation": "1-2 sentence summary"
}
JSON only.`;
}

export function parse(text) {
  const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  let parsed = null;
  try { parsed = JSON.parse(clean); } catch {}
  if (!parsed) {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) try { parsed = JSON.parse(m[0]); } catch {}
  }
  return parsed;
}
