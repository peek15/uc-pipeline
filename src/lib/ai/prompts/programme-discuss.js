// ═══════════════════════════════════════════════════════════
// programme-discuss.js — Conversational refinement of a programme.
// Extracted from SettingsModal.ProgDiscuss.send().
// ═══════════════════════════════════════════════════════════

export const defaults = {
  maxTokens: 400,
  model:     "haiku",
};

/**
 * @param {object} params
 * @param {object} params.programme — { name, role, weight, angle_suggestions, rationale }
 * @param {string} params.brand_name
 * @param {Array<{role:string, text:string}>} params.history
 */
export function build({ programme, brand_name, history }) {
  return `You are helping refine a content programme called "${programme.name}" for "${brand_name}".
Programme details: role=${programme.role}, weight=${programme.weight}%, angles=${(programme.angle_suggestions || []).join(", ")}.
Rationale: ${programme.rationale || ""}

Conversation:
${history.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`).join("\n")}

Respond helpfully and concisely. Suggest specific adjustments if asked.`;
}
