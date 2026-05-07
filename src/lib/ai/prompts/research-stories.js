// ═══════════════════════════════════════════════════════════
// research-stories.js — Discover new story ideas.
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
 * @param {object} [params.content_template]
 * @param {string} [params.existingTitles]
 * @param {number} [params.batch]
 */
export function build({ topic, count, era, team, archetype, format, content_template = null, existingTitles = "", batch = 1, brand_config = null }) {
  const programmes = brand_config?.programmes || [];
  const programme = programmes.find(p => p.id === format || p.key === format);
  const fmtLabel = programme?.name || FORMAT_MAP[format]?.label || "";
  const fmtDesc  = programme?.desc || FORMAT_MAP[format]?.desc || "";
  const archetypes = brand_config?.archetypes?.length ? brand_config.archetypes : ARCHETYPES;
  const angles = brand_config?.research_angles?.length ? brand_config.research_angles : RESEARCH_ANGLES;
  const angle = angles[Math.floor(Math.random() * angles.length)];
  const brandName = brand_config?.brand_name || "Uncle Carter";
  const contentType = brand_config?.content_type || "narrative";
  const template = content_template || brand_config?.content_templates?.[0] || null;
  const templateBlock = template ? `
Content template:
- id: ${template.id || "(none)"}
- name: ${template.name || "(unnamed)"}
- content_type: ${template.content_type || contentType}
- objective: ${template.objective || "(unspecified)"}
- audience: ${template.audience || "(unspecified)"}
- channels: ${(template.channels || []).join(", ") || "(unspecified)"}
- deliverable_type: ${template.deliverable_type || "(unspecified)"}
- required_fields: ${(template.required_fields || []).join(", ") || "(none)"}
- workflow_steps: ${(template.workflow_steps || []).join(" > ") || "(default)"}` : "";
  const voice = brand_config?.voice ? `\nBrand voice: ${brand_config.voice}.` : "";
  const avoid = brand_config?.avoid ? `\nAvoid: ${brand_config.avoid}.` : "";

  return `You are a content ideation engine for "${brandName}", a ${contentType} content brand. Find ${count} distinct content ideas that fit this brand and the selected template.${voice}${avoid}
${templateBlock}

Return JSON objects with:
- title
- content_template_id
- content_type
- objective
- audience
- channel
- deliverable_type
- archetype (${archetypes.join("/")})
- obscurity (1-5, prefer 3-5 for narrative/editorial ideas)
- players or subjects
- era or context
- angle (2-3 sentences describing the strategic or human angle)
- hook (1 sentence opener)
- format

RULES:
- Respect the selected content template. Do not force every idea into a narrative sports story.
- For ad/product/publicity templates, prioritize objective, audience, offer/proof/CTA logic over obscure trivia.
- For educational templates, prioritize teachable structure and clear audience value.
- For narrative templates, prioritize human story, specific facts, and under-covered angles.
- Each idea must be distinct from existing titles and from the other results.
${era ? `\nEra/context: ${era}.` : ""}${team ? `\nSubject/team/entity: ${team}.` : ""}${archetype ? `\nArchetype: ${archetype}.` : ""}${fmtLabel ? `\nContent programme: ${fmtLabel}${fmtDesc ? ` (${fmtDesc})` : ""}.` : ""}${topic ? `\nFocus: "${topic}"` : ""}${existingTitles ? `\nALREADY COVERED: ${existingTitles}` : ""}.

Angle seed: "${angle}". Batch #${batch}. JSON array ONLY. No markdown.`;
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
