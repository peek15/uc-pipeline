export const defaults = {
  maxTokens: 900,
  model:     "sonnet",
};

/**
 * @param {object} params
 * @param {string} params.agent_name
 * @param {Array}  params.corrections  — agent_feedback rows
 */
export function build({ agent_name, corrections }) {
  const list = (corrections || []).slice(0, 20).map((c, i) => {
    const note = c.notes || "(no notes)";
    const fix  = c.user_correction
      ? JSON.stringify(c.user_correction).slice(0, 220)
      : "(rejected or cleared without replacement)";
    return `${i + 1}. type:${c.correction_type} | ${note}\n   correction sample: ${fix}`;
  }).join("\n\n");

  return `Analyze ${corrections.length} recent user corrections made to AI output from the "${agent_name}" agent.

Corrections:
${list}

Identify recurring patterns — specific content elements consistently removed or changed, structural preferences the user always applies, or persistent quality gaps the agent keeps missing. Only report patterns that appear 2 or more times.

Return valid JSON only (no markdown code fences):
{
  "patterns": [
    {
      "pattern": "Precise description of what keeps happening (e.g. 'cinematic language removed from hooks', 'product proof always added after main claim')",
      "suggested_action": "Specific calibration hint (e.g. 'Add cinematic to brand voice avoid list', 'Always include one product proof after the main claim in briefs')",
      "recurrence_count": 3,
      "confidence": 0.8
    }
  ],
  "summary": "One-sentence overall assessment of this agent's correction patterns"
}`;
}
