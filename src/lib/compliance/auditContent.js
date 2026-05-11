import { getStoryScript, subjectText } from "@/lib/brandConfig";
import { BASE_RULES, assetRightsWarnings, brandSensitivityWarnings } from "./rules";
import { scoreWarnings } from "./riskScoring";
import { COMPLIANCE_DISCLAIMER } from "./complianceCopy";

function contentText(story) {
  return [
    story?.title,
    subjectText(story),
    story?.angle,
    story?.hook,
    story?.caption,
    story?.cta,
    story?.visual_direction,
    getStoryScript(story, "en"),
    getStoryScript(story, "pt"),
  ].filter(Boolean).join("\n\n");
}

function platformHints(story, settings) {
  return [
    story?.platform_target,
    story?.channel,
    ...(Array.isArray(settings?.strategy?.target_platforms) ? settings.strategy.target_platforms : []),
  ].filter(Boolean);
}

export function auditContentCompliance({ story, settings = {}, requireAssetRights = false } = {}) {
  if (!story?.id) {
    return {
      status: "failed",
      risk_score: null,
      risk_level: null,
      warnings: [],
      summary: "Compliance check failed because no content item was provided.",
      checked_by: "system",
    };
  }

  const text = contentText(story);
  const warnings = [];

  for (const rule of BASE_RULES) {
    if (rule.pattern.test(text)) {
      warnings.push({
        code: rule.code,
        label: rule.label,
        risk_level: rule.risk_level,
        message: rule.message,
        suggestion: rule.suggestion,
      });
    }
  }

  warnings.push(...brandSensitivityWarnings(text, settings));
  warnings.push(...assetRightsWarnings({ story, requireAssetRights }));

  const platforms = platformHints(story, settings);
  if (platforms.some(p => /ads|paid|meta|facebook|instagram|tiktok|youtube/i.test(String(p)))) {
    const hasHardClaim = warnings.some(w => ["unverified_performance_claim", "guarantee_promise", "aggressive_paid_ad_claim"].includes(w.code));
    if (hasHardClaim) {
      warnings.push({
        code: "paid_platform_review",
        label: "Paid platform review",
        risk_level: "medium",
        message: "This content may be used in a paid or platform-governed context and should be reviewed against platform policies.",
        suggestion: "Check ad policy, landing page consistency, disclosures, and targeting before export.",
      });
    }
  }

  const scored = scoreWarnings(warnings);
  const summary = warnings.length
    ? `${warnings.length} compliance warning${warnings.length === 1 ? "" : "s"} found. ${COMPLIANCE_DISCLAIMER}`
    : `No meaningful compliance warnings found by the V1 rule-based check. ${COMPLIANCE_DISCLAIMER}`;

  return {
    check_type: "ai_compliance",
    status: scored.status,
    risk_score: scored.risk_score,
    risk_level: scored.risk_level,
    warnings,
    summary,
    checked_by: "system",
    provider: null,
    model: "rule-based-v1",
    metadata: {
      rule_engine: "creative-engine-compliance-v1",
      platforms,
      content_chars_checked: text.length,
    },
  };
}

