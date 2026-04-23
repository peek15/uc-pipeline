// ═══════════════════════════════════════════════════════════
// rules-audit.js — Audit existing rules + conflicts.
// Extracted from SettingsModal.runAudit (around line 533).
// ═══════════════════════════════════════════════════════════

export const defaults = {
  maxTokens: 600,
  model:     "haiku",
};

/**
 * @param {object} params
 * @param {string} params.brand_name
 * @param {string} params.goal_primary
 * @param {object} params.format_mix
 * @param {string} params.rules_description  — "1. <desc> (active)\n2. ..."
 * @param {string} params.conflicts_description
 * @param {string} [params.user_context]
 */
export function build({ brand_name, goal_primary, format_mix, rules_description, conflicts_description, user_context }) {
  return `You are auditing the content strategy for "${brand_name}".

Current rules:
${rules_description}

Detected conflicts: ${conflicts_description}

Goal: ${goal_primary}
Format mix: ${JSON.stringify(format_mix)}
${user_context ? `Additional context from user: "${user_context}"` : ""}

Provide a brief audit (3-5 bullet points). Identify: gaps, conflicts, improvements, alignment with goal.
Be direct and specific. Plain text, use • for bullets.`;
}
