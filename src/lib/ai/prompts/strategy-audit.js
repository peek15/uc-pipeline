// ═══════════════════════════════════════════════════════════
// strategy-audit.js — Audit overall programme/strategy mix.
// Extracted from SettingsModal.runStrategyAudit (around line 420).
// ═══════════════════════════════════════════════════════════

export const defaults = {
  maxTokens: 600,
  model:     "haiku",
};

/**
 * @param {object} params
 * @param {string} params.brand_name
 * @param {string} params.goal_primary
 * @param {string} params.goal_secondary
 * @param {number} params.weekly_cadence
 * @param {Array<{name:string, weight:number}>} params.programmes
 * @param {string} params.perf_summary
 * @param {string} [params.user_context]
 */
export function build({ brand_name, goal_primary, goal_secondary, weekly_cadence, programmes, perf_summary, user_context }) {
  return `You are auditing the content strategy for "${brand_name}".

Brand goal: ${goal_primary} (secondary: ${goal_secondary})
Weekly cadence: ${weekly_cadence} episodes/week
Current programme mix: ${programmes.map(p => `${p.name} ${p.weight}%`).join(", ")}
Performance by programme: ${perf_summary || "No data yet"}
${user_context ? `User context: "${user_context}"` : ""}

Audit the strategy. Cover:
1. Mix alignment with goals
2. Cadence sustainability
3. Programme balance gaps
4. Specific recommendations with numbers

Be direct. Use • bullets. Max 6 points.`;
}
