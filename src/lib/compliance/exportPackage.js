import { getBrandName, getStoryScript, subjectText } from "@/lib/brandConfig";
import { COMPLIANCE_DISCLAIMER } from "./complianceCopy";

export function buildExportPackage({ story, settings = {}, complianceCheck = null, approval = null, exportType = "copy_package" } = {}) {
  const exportedAt = new Date().toISOString();
  const payload = {
    export_type: exportType,
    exported_at: exportedAt,
    title: story?.title || "Untitled content",
    story_id: story?.id || null,
    brand: {
      name: getBrandName(settings),
      brand_profile_id: story?.brand_profile_id || null,
    },
    content: {
      subject: subjectText(story),
      angle: story?.angle || null,
      hook: story?.hook || null,
      script: getStoryScript(story, "en") || story?.script || null,
      caption: story?.caption || story?.metadata?.caption || null,
      cta: story?.cta || story?.metadata?.cta || null,
      visual_direction: story?.visual_direction || story?.metadata?.visual_direction || null,
      platform_notes: story?.platform_notes || story?.metadata?.platform_notes || null,
      language: "en",
    },
    compliance: complianceCheck ? {
      status: complianceCheck.status,
      risk_level: complianceCheck.risk_level,
      risk_score: complianceCheck.risk_score,
      summary: complianceCheck.summary,
      warnings: complianceCheck.warnings || [],
      disclaimer: COMPLIANCE_DISCLAIMER,
    } : null,
    approval: approval ? {
      approval_status: approval.approval_status,
      approved_by: approval.approved_by,
      approved_at: approval.approved_at,
      acknowledgement_text: approval.acknowledgement_text || null,
      warnings_acknowledged: approval.warnings_at_approval || [],
    } : null,
  };

  if (exportType === "markdown") {
    payload.markdown = toMarkdown(payload);
  }
  if (exportType === "copy_package") {
    payload.copy_package = [
      payload.title,
      payload.content.hook,
      payload.content.script,
      payload.content.caption,
      payload.content.cta,
    ].filter(Boolean).join("\n\n");
  }
  return payload;
}

function toMarkdown(payload) {
  const warnings = payload.compliance?.warnings || [];
  return [
    `# ${payload.title}`,
    `Brand: ${payload.brand?.name || "Not specified"}`,
    `Exported: ${payload.exported_at}`,
    "",
    "## Content",
    payload.content?.hook ? `**Hook:** ${payload.content.hook}` : null,
    payload.content?.script || null,
    payload.content?.caption ? `**Caption:** ${payload.content.caption}` : null,
    payload.content?.cta ? `**CTA:** ${payload.content.cta}` : null,
    payload.content?.visual_direction ? `**Visual direction:** ${payload.content.visual_direction}` : null,
    "",
    "## Compliance",
    payload.compliance?.summary || "No compliance check attached.",
    ...warnings.map(w => `- ${w.label || w.code}: ${w.message}`),
    "",
    "## Approval",
    payload.approval?.approval_status === "approved"
      ? `Approved at ${payload.approval.approved_at}`
      : "Not approved.",
  ].filter(line => line !== null).join("\n");
}

