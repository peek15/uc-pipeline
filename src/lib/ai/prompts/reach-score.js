// ═══════════════════════════════════════════════════════════
// reach-score.js — Suggest a reach score (0-100) for a story.
// Extracted from ScriptView.generate() reachPrompt.
// Non-blocking — used post-script-generation as a suggestion only.
// ═══════════════════════════════════════════════════════════

export const defaults = {
  maxTokens: 200,
  model:     "haiku",
};

/**
 * @param {object} params
 * @param {object} params.story
 */
export function build({ story, brand_config = null, workspace_memory_context = "" }) {
  const brandName = brand_config?.brand_name || "this brand";
  const contentType = brand_config?.content_type || "content";
  const market = [brand_config?.industry, brand_config?.target_audience, brand_config?.content_goals].filter(Boolean).join(" | ") || "the brand's market";
  const platforms = brand_config?.target_platforms?.length ? brand_config.target_platforms.join(", ") : "configured channels";
  const memory = workspace_memory_context ? `\nDurable workspace memory:\n${workspace_memory_context}\nUse memory as advisory context for audience fit, platform priorities, and repeated user preferences.` : "";
  return `You are scoring a ${brandName} ${contentType} idea for adaptive reach potential in ${market}.${memory}

Score this story 0-100 on reach potential based on:
- Relevance to the user's audience and buyer/customer context
- Discoverability on the target platforms: ${platforms}
- Timeliness in the user's market
- Shareability/searchability without overclaiming
- Fit with the brand's content goals

Story: "${story.title}"
Subject(s): ${story.players || story.subjects || "Unknown"}
Era/context: ${story.era || "Unknown"}
Angle: ${story.angle || ""}

Return ONLY a JSON object: { "reach_score": number, "reasoning": "1 sentence" }
No markdown.`;
}

export function parse(text) {
  const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  let parsed = null;
  try { parsed = JSON.parse(clean); } catch {}
  if (!parsed) {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) try { parsed = JSON.parse(m[0]); } catch {}
  }
  if (parsed?.reach_score != null) {
    parsed.reach_score = Math.min(100, Math.max(0, Math.round(parsed.reach_score)));
  }
  return parsed;
}
