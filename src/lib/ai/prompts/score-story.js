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
export function build({ stories, brand_config = null, workspace_memory_context = "" }) {
  const brandName = brand_config?.brand_name || "your brand";
  const contentType = brand_config?.content_type || "content";
  const voice = brand_config?.voice ? `\nBrand voice: ${brand_config.voice}.` : "";
  const audience = brand_config?.target_audience ? `\nTarget audience: ${brand_config.target_audience}.` : "";
  const industry = brand_config?.industry ? `\nMarket/industry: ${brand_config.industry}.` : "";
  const goals = brand_config?.content_goals ? `\nBusiness/content goals: ${brand_config.content_goals}.` : "";
  const platforms = brand_config?.target_platforms?.length ? `\nTarget platforms: ${brand_config.target_platforms.join(", ")}.` : "";
  const sensitivities = brand_config?.compliance_sensitivities || brand_config?.claims_to_use_carefully
    ? `\nClaims/compliance sensitivities: ${[brand_config.compliance_sensitivities, brand_config.claims_to_use_carefully].filter(Boolean).join(" ")}.`
    : "";
  const pillars = brand_config?.content_pillars?.length ? `\nContent pillars: ${brand_config.content_pillars.join(", ")}.` : "";
  const programmes = brand_config?.programmes?.length
    ? `\nProgrammes: ${brand_config.programmes.map(p => `${p.name || p.id}${p.role ? ` (${p.role})` : ""}`).join(", ")}.`
    : "";
  const memory = workspace_memory_context ? `\nDurable workspace memory:\n${workspace_memory_context}\nUse memory only as advisory context for approved positioning, repeated corrections, and known risk patterns.` : "";
  return `You are an adaptive Creative Engine content scorer for "${brandName}", a ${contentType} brand.${voice}${audience}${industry}${goals}${platforms}${pillars}${programmes}${sensitivities}${memory}

Score each content idea for this specific brand, market, audience, content goal, and platform mix.

Return legacy dimensions for compatibility:
- emotional_depth: human tension, insight, or relevance, not only drama
- obscurity: freshness/under-covered angle for this market
- visual_potential: ability to become concrete, inspectable creative
- hook_strength: first-scroll attention for the target platforms

Also return adaptive dimensions out of 100:
- idea_quality: overall strength of the idea
- brand_fit: alignment with brand voice, audience, programmes, and pillars
- market_fit: fit for the user's market, buyer/customer context, and target platforms
- production_readiness: how easy it is to turn into usable content
- compliance_readiness: lower if it leans on sensitive, unsupported, or risky claims
- adaptive_total: weighted overall score for this user's market and content context

Stories to score:
${stories.map((s, i) => `${i + 1}. "${s.title}" — ${s.angle}`).join("\n")}

Return a JSON array with objects:
{ index, emotional_depth, obscurity, visual_potential, hook_strength, total, idea_quality, brand_fit, market_fit, production_readiness, compliance_readiness, adaptive_total, reasoning }
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
  if (!Array.isArray(parsed)) return [];
  return parsed.map(item => ({
    ...item,
    adaptive_components: {
      idea_quality: item.idea_quality,
      brand_fit: item.brand_fit,
      market_fit: item.market_fit,
      production_readiness: item.production_readiness,
      compliance_readiness: item.compliance_readiness,
    },
  }));
}
