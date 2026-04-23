// ═══════════════════════════════════════════════════════════
// research-stories.js — Discover new NBA story ideas.
// Extracted from ResearchView.buildPrompt().
// ═══════════════════════════════════════════════════════════

import { ARCHETYPES, RESEARCH_ANGLES, FORMAT_MAP } from "@/lib/constants";

export const defaults = {
  maxTokens: 8000,
  model:     "haiku",
};

/**
 * @param {object} params
 * @param {string} [params.topic]
 * @param {number} params.count
 * @param {string} [params.era]
 * @param {string} [params.team]
 * @param {string} [params.archetype]
 * @param {string} [params.format]
 * @param {string} [params.existingTitles]
 * @param {number} [params.batch]
 */
export function build({ topic, count, era, team, archetype, format, existingTitles = "", batch = 1 }) {
  const fmtLabel = FORMAT_MAP[format]?.label || "";
  const fmtDesc  = format === "classics"             ? "pre-2000s NBA"
                 : format === "performance_special"  ? "historic records/dominant seasons"
                 :                                     "recent NBA 2000s-present";
  const angle = RESEARCH_ANGLES[Math.floor(Math.random() * RESEARCH_ANGLES.length)];

  return `You are a story research engine for "Uncle Carter," an NBA storytelling brand. Find ${count} compelling, lesser-known human stories.\n\nReturn JSON objects with: title, archetype (${ARCHETYPES.join("/")}), obscurity (1-5, prefer 3-5), players, era, angle (2-3 sentences human tension), hook (1 sentence opener).\n\nRULES: Human story > highlights. Specific facts. Obscure > well-known. Each DISTINCT.${era ? `\nEra: ${era}.` : ""}${team ? `\nTeam: ${team}.` : ""}${archetype ? `\nArchetype: ${archetype}.` : ""}${fmtLabel ? `\nContent format: ${fmtLabel} (${fmtDesc}).` : ""}${topic ? `\nFocus: "${topic}"` : ""}${existingTitles ? `\nALREADY COVERED: ${existingTitles}` : ""}.\n\nAngle: "${angle}". Batch #${batch}. JSON array ONLY. No markdown.`;
}

export function parse(text) {
  const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  let parsed = null;
  try { parsed = JSON.parse(clean); } catch {}
  if (!parsed) {
    const m = clean.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (m) try { parsed = JSON.parse(m[0]); } catch {}
  }
  if (!parsed) {
    const fi = clean.indexOf("[");
    const li = clean.lastIndexOf("]");
    if (fi !== -1 && li > fi) try { parsed = JSON.parse(clean.substring(fi, li + 1)); } catch {}
  }
  if (!Array.isArray(parsed)) throw new Error("Research response did not parse to array");
  return parsed.filter(s => s && s.title);
}
