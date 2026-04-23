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
export function build({ story }) {
  return `You are scoring an Uncle Carter NBA story for reach potential (discoverability by new viewers).

Score this story 0-100 on reach potential based on:
- Name recognition of the subject (40%) — how famous is the player/moment?
- Recency (25%) — how recently was this in public consciousness?
- Search volume proxy (20%) — how often is this topic searched?
- Trending relevance (15%) — is this connected to current news?

Story: "${story.title}"
Players: ${story.players || "Unknown"}
Era: ${story.era || "Unknown"}
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
