// ═══════════════════════════════════════════════════════════
// score-story.js — Batch AI scoring for research results.
// Extracted from ResearchView.scoreStories().
// ═══════════════════════════════════════════════════════════

export const defaults = {
  maxTokens: 1500,
  model:     "haiku",
};

/**
 * @param {object} params
 * @param {Array<{title:string, angle:string}>} params.stories
 */
export function build({ stories }) {
  return `You are an AI content scorer for "Uncle Carter," an NBA storytelling brand for short-form video.

Score each story on 4 dimensions (each out of 25, total out of 100):
- emotional_depth: Is there real human tension, not just a sports highlight?
- obscurity: How fresh/unknown is this story? (5=very well known, 25=almost nobody knows it)
- visual_potential: Can you find compelling images/footage for this?
- hook_strength: Would someone stop scrolling in the first 3 seconds?

Stories to score:
${stories.map((s, i) => `${i + 1}. "${s.title}" — ${s.angle}`).join("\n")}

Return a JSON array with objects: { index, emotional_depth, obscurity, visual_potential, hook_strength, total }
JSON array ONLY. No markdown.`;
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
