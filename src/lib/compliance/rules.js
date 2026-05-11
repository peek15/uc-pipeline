function includesAny(text, terms = []) {
  const haystack = (text || "").toLowerCase();
  return terms.filter(term => term && haystack.includes(String(term).toLowerCase()));
}

export const BASE_RULES = [
  {
    code: "unverified_performance_claim",
    label: "Unverified performance claim",
    risk_level: "medium",
    pattern: /\b(best|fastest|#1|number one|leading|proven|guaranteed results|double|triple|10x|increase by \d+%|boost by \d+%)\b/i,
    message: "This appears to make a performance or superiority claim. Keep evidence on hand or soften the wording.",
    suggestion: "Use qualified language and add source/evidence notes before publication.",
  },
  {
    code: "health_medical_claim",
    label: "Health or medical claim",
    risk_level: "high",
    pattern: /\b(cure|treat|diagnose|prevent disease|clinical|medical|doctor recommended|heal|therapy|symptom|patient)\b/i,
    message: "Health or medical language may need specialist review and substantiation.",
    suggestion: "Avoid diagnosis/treatment promises and confirm claims with qualified reviewers.",
  },
  {
    code: "financial_claim",
    label: "Financial or investment claim",
    risk_level: "high",
    pattern: /\b(investment advice|guaranteed return|profit guaranteed|risk-free|beat the market|financial freedom|roi guaranteed)\b/i,
    message: "Financial claims can create regulatory and substantiation risk.",
    suggestion: "Remove guaranteed outcomes and include appropriate review before use.",
  },
  {
    code: "environmental_claim",
    label: "Environmental claim",
    risk_level: "medium",
    pattern: /\b(sustainable|eco-friendly|carbon neutral|net zero|greenest|zero waste|planet positive)\b/i,
    message: "Environmental claims should be specific, current, and substantiated.",
    suggestion: "Use precise claims backed by documentation instead of broad green language.",
  },
  {
    code: "legal_regulatory_claim",
    label: "Legal or regulatory claim",
    risk_level: "high",
    pattern: /\b(compliant with|legally approved|regulator approved|gdpr compliant|hipaa compliant|sec approved|fda approved)\b/i,
    message: "Legal or regulatory claims require verification before publishing.",
    suggestion: "Confirm exact certification/approval scope or remove the claim.",
  },
  {
    code: "competitor_comparison",
    label: "Competitor comparison",
    risk_level: "medium",
    pattern: /\b(better than|cheaper than|unlike|beats|outperforms|versus|vs\.)\b/i,
    message: "Direct comparisons can require evidence and careful wording.",
    suggestion: "Make comparisons factual, current, and source-backed.",
  },
  {
    code: "guarantee_promise",
    label: "Guarantee or promise",
    risk_level: "high",
    pattern: /\b(guarantee|guaranteed|promise|no risk|risk free|will definitely|never fail|always works)\b/i,
    message: "Absolute guarantees can create avoidable claims risk.",
    suggestion: "Use outcome ranges, conditions, or customer-fit language.",
  },
  {
    code: "aggressive_paid_ad_claim",
    label: "Aggressive ad claim",
    risk_level: "medium",
    pattern: /\b(act now or lose|limited spots only|secret trick|hack they don't want you to know|instant results|life-changing)\b/i,
    message: "This CTA or ad language may be too aggressive for paid distribution.",
    suggestion: "Use clearer value and eligibility language.",
  },
];

export function brandSensitivityWarnings(text, settings = {}) {
  const strategy = settings?.strategy || settings?.content_strategy || {};
  const brand = settings?.brand || {};
  const terms = [
    ...(Array.isArray(strategy.compliance_sensitivities) ? strategy.compliance_sensitivities : []),
    ...(Array.isArray(brand.compliance_sensitivities) ? brand.compliance_sensitivities : []),
    ...(Array.isArray(strategy.claims_to_use_carefully) ? strategy.claims_to_use_carefully : []),
    ...(Array.isArray(strategy.avoid_angles) ? strategy.avoid_angles : []),
    ...(Array.isArray(brand.avoid_angles) ? brand.avoid_angles : []),
  ];
  const matches = includesAny(text, terms);
  return matches.map(term => ({
    code: "brand_sensitivity",
    label: "Brand sensitivity",
    risk_level: "medium",
    message: `Brand strategy flags "${term}" as sensitive or to be used carefully.`,
    suggestion: "Confirm this fits the approved brand strategy before export.",
    evidence: term,
  }));
}

export function assetRightsWarnings({ story = {}, requireAssetRights = false }) {
  const rightsConfirmed =
    story.asset_rights_confirmed === true ||
    story.rights_confirmed === true ||
    story.metadata?.asset_rights_confirmed === true ||
    story.metadata?.rights_confirmed === true;
  const hasVisualDirection = Boolean(story.visual_direction || story.image_prompt || story.metadata?.visual_direction);
  if (rightsConfirmed) return [];
  if (!requireAssetRights && !hasVisualDirection) return [];
  return [{
    code: "asset_rights_missing",
    label: "Asset rights not confirmed",
    risk_level: requireAssetRights ? "critical" : "high",
    message: "Asset rights confirmation is missing for this content package.",
    suggestion: "Confirm usage rights for images, clips, music, logos, talent, and source materials before approval/export.",
  }];
}

