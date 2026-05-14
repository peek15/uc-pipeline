import {
  contentAudience,
  contentChannel,
  contentObjective,
  getBrandComplianceSensitivities,
  getBrandContentGoals,
  getBrandContentPillars,
  getBrandIndustry,
  getBrandProgrammes,
  getBrandTargetAudience,
  getBrandTargetPlatforms,
  getContentType,
  getStoryScript,
} from "@/lib/brandConfig";

export function buildAdaptiveScoringProfile(settings = {}) {
  const platforms = getBrandTargetPlatforms(settings).map(v => String(v || "").toLowerCase());
  const industry = getBrandIndustry(settings);
  const audience = getBrandTargetAudience(settings);
  const goals = getBrandContentGoals(settings);
  const compliance = getBrandComplianceSensitivities(settings) || settings?.strategy?.claims_to_use_carefully || "";
  const isB2B = /\b(b2b|enterprise|saas|software|founder|operator|team|business|client|professional)\b/i.test([industry, audience, goals].join(" "));
  const isRegulated = /\b(finance|financial|health|medical|legal|insurance|investment|regulated|compliance)\b/i.test([industry, compliance].join(" "));
  const isEducation = /\b(education|educat|learn|guide|explain|trust|authority)\b/i.test(goals);
  const isSocialFirst = platforms.some(p => /tiktok|instagram|youtube|short|reels/.test(p));
  const isLinkedIn = platforms.some(p => /linkedin/.test(p));

  const weights = {
    idea_quality: isSocialFirst ? 26 : 22,
    brand_fit: isB2B || isLinkedIn ? 26 : 22,
    market_fit: isB2B || isRegulated ? 22 : 20,
    production_readiness: 15,
    compliance_readiness: isRegulated ? 20 : 15,
  };
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const normalizedWeights = Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, value / total]));

  return {
    version: "adaptive_scoring_v1",
    industry,
    audience,
    goals,
    platforms,
    content_pillars: getBrandContentPillars(settings),
    programmes: getBrandProgrammes(settings).filter(p => p.active !== false),
    sensitivities: compliance,
    market_flags: { is_b2b: isB2B, is_regulated: isRegulated, is_education: isEducation, is_social_first: isSocialFirst, is_linkedin: isLinkedIn },
    weights: normalizedWeights,
  };
}

export function getAdaptiveScore(story = {}, settings = {}) {
  const stored = story.metadata?.adaptive_score;
  if (stored?.total != null) return normalizeAdaptiveScore(stored);
  return scoreContentReadiness(story, settings);
}

export function scoreContentReadiness(story = {}, settings = {}) {
  const profile = buildAdaptiveScoringProfile(settings);
  const ideaQuality = scoreIdeaQuality(story);
  const brandFit = scoreBrandFit(story, settings, profile);
  const marketFit = scoreMarketFit(story, settings, profile);
  const productionReadiness = scoreProductionReadiness(story);
  const complianceReadiness = scoreComplianceReadiness(story);
  const components = {
    idea_quality: ideaQuality,
    brand_fit: brandFit,
    market_fit: marketFit,
    production_readiness: productionReadiness,
    compliance_readiness: complianceReadiness,
  };
  const total = Math.round(Object.entries(components).reduce((sum, [key, value]) => sum + value * (profile.weights[key] || 0), 0));
  return normalizeAdaptiveScore({
    version: profile.version,
    total,
    components,
    profile: {
      market_flags: profile.market_flags,
      weights: profile.weights,
      industry: profile.industry || null,
      platforms: profile.platforms || [],
    },
    explanation: explainAdaptiveScore({ components, profile }),
  });
}

export function attachAdaptiveScore(story = {}, settings = {}, aiScore = null) {
  const base = aiScore
    ? normalizeAdaptiveScore({
        total: aiScore.adaptive_total ?? aiScore.total,
        components: aiScore.adaptive_components || {
          idea_quality: aiScore.total ?? story.score_total ?? 50,
          brand_fit: aiScore.brand_fit ?? null,
          market_fit: aiScore.market_fit ?? null,
          production_readiness: null,
          compliance_readiness: null,
        },
        explanation: aiScore.reasoning || aiScore.explanation || "",
      })
    : null;
  const deterministic = scoreContentReadiness({ ...story, ...(aiScore ? { score_total: aiScore.total } : {}) }, settings);
  const merged = base?.total
    ? {
        ...deterministic,
        total: Math.round((base.total * 0.65) + (deterministic.total * 0.35)),
        ai_total: base.total,
        components: { ...deterministic.components, ...dropNull(base.components) },
        explanation: base.explanation || deterministic.explanation,
      }
    : deterministic;
  return {
    ...story,
    metadata: {
      ...(story.metadata || {}),
      adaptive_score: normalizeAdaptiveScore(merged),
    },
  };
}

function scoreIdeaQuality(story) {
  if (story.score_total != null) return clampScore(story.score_total);
  const pieces = [
    story.title ? 18 : 0,
    story.angle ? 22 : 0,
    story.hook ? 18 : 0,
    story.format || story.content_type ? 12 : 0,
    story.reach_score != null ? Math.min(20, Math.round(story.reach_score * 0.2)) : 8,
  ];
  return clampScore(pieces.reduce((sum, value) => sum + value, 0));
}

function scoreBrandFit(story, settings, profile) {
  const text = textBlob(story);
  const pillars = profile.content_pillars || [];
  const programmes = profile.programmes || [];
  let score = 35;
  if (contentAudience(story)) score += 12;
  if (contentObjective(story)) score += 12;
  if (getContentType(story, settings)) score += 8;
  if (pillars.some(p => includesLoose(text, p))) score += 14;
  if (programmes.some(p => includesLoose([story.format, story.programme, story.programme_name, story.angle].join(" "), p.label || p.key))) score += 10;
  if (settings?.brand?.avoid && includesLoose(text, settings.brand.avoid)) score -= 15;
  return clampScore(score);
}

function scoreMarketFit(story, settings, profile) {
  const text = textBlob(story);
  let score = 40;
  if (contentChannel(story)) score += 10;
  if (profile.platforms.some(p => includesLoose(contentChannel(story), p))) score += 14;
  if (profile.industry && includesLoose(text, profile.industry)) score += 10;
  if (profile.audience && includesLoose(text, profile.audience)) score += 12;
  if (profile.market_flags.is_b2b && /\broi|operator|team|workflow|client|revenue|trust|case study|proof|efficiency\b/i.test(text)) score += 10;
  if (profile.market_flags.is_social_first && (story.hook || /\btrend|watch|quick|before|after|mistake|secret\b/i.test(text))) score += 10;
  if (profile.market_flags.is_education && /\bhow|why|guide|learn|explain|framework\b/i.test(text)) score += 8;
  return clampScore(score);
}

function scoreProductionReadiness(story) {
  const checks = [
    Boolean(story.title),
    Boolean(story.angle || story.brief || story.description),
    Boolean(story.hook),
    Boolean(story.format || story.content_type),
    Boolean(getStoryScript(story, "en")),
    Boolean(story.visual_brief || story.visual_refs || story.assets_ready),
  ];
  return clampScore(Math.round((checks.filter(Boolean).length / checks.length) * 100));
}

function scoreComplianceReadiness(story) {
  const blockers = Number(story.quality_gate_blockers || story.quality_gate?.blockerCount || 0);
  const warnings = Number(story.quality_gate_warnings || story.quality_gate?.warningCount || 0);
  if (blockers > 0) return 25;
  if (warnings > 2) return 50;
  if (warnings > 0) return 70;
  if (story.quality_gate_status === "passed" || story.quality_gate) return 92;
  return 68;
}

function explainAdaptiveScore({ components, profile }) {
  const strongest = Object.entries(components).sort((a, b) => b[1] - a[1])[0]?.[0] || "idea_quality";
  const weakest = Object.entries(components).sort((a, b) => a[1] - b[1])[0]?.[0] || "production_readiness";
  const market = profile.market_flags.is_b2b ? "B2B" : profile.market_flags.is_social_first ? "social-first" : profile.industry || "brand";
  return `Adaptive score weighted for ${market} context. Strongest: ${humanize(strongest)}. Needs attention: ${humanize(weakest)}.`;
}

function normalizeAdaptiveScore(score) {
  const components = score.components || {};
  return {
    version: score.version || "adaptive_scoring_v1",
    total: clampScore(score.total ?? 0),
    ai_total: score.ai_total ?? null,
    components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, value == null ? null : clampScore(value)])),
    profile: score.profile || null,
    explanation: score.explanation || "",
  };
}

function textBlob(story) {
  return [
    story.title,
    story.angle,
    story.hook,
    story.objective,
    story.audience,
    story.channel,
    story.content_type,
    story.format,
    story.campaign_name,
    story.deliverable_type,
    ...(story.subject_tags || []),
  ].filter(Boolean).join(" ");
}

function includesLoose(text, needle) {
  const n = String(needle || "").toLowerCase().trim();
  if (!n) return false;
  return String(text || "").toLowerCase().includes(n) || n.split(/\s+/).filter(w => w.length > 4).some(w => String(text || "").toLowerCase().includes(w));
}

function dropNull(object = {}) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value != null));
}

function humanize(value) {
  return String(value || "").replace(/_/g, " ");
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

