// ═══════════════════════════════════════════════════════════
// generate-script.js — Script generation from story metadata.
// Extracted from ScriptView.generate() and page.handleProduce().
// SCRIPT_SYSTEM loaded lazily at build-time to keep import simple.
// ═══════════════════════════════════════════════════════════

import { SCRIPT_SYSTEM } from "@/lib/constants";

export const defaults = {
  maxTokens: 600,
  model:     "sonnet",
};

export function build({ story, brand_config = null, content_template = null, instruction = null, current_script = null }) {
  const brandName = brand_config?.brand_name || "your brand";
  const template = content_template || brand_config?.content_templates?.find(t => t.id === story?.content_template_id) || null;
  const templateBlock = template ? `
Selected content template:
- name: ${template.name || "(unnamed)"}
- content_type: ${story.content_type || template.content_type || brand_config?.content_type || "content"}
- objective: ${story.objective || template.objective || "(unspecified)"}
- audience: ${story.audience || template.audience || "(unspecified)"}
- channel: ${story.channel || story.platform_target || template.channels?.[0] || "(unspecified)"}
- deliverable_type: ${story.deliverable_type || template.deliverable_type || "(unspecified)"}
- required_fields: ${(template.required_fields || []).join(", ") || "(none)"}
- workflow_steps: ${(template.workflow_steps || []).join(" > ") || "(default)"}` : "";
  const system = brand_config
    ? `You write production-ready copy for "${brandName}", a ${brand_config.content_type || "narrative"} content brand.

Brand voice: ${brand_config.voice || "clear, specific, emotionally grounded"}.
Avoid: ${brand_config.avoid || "generic phrasing, hype, filler"}.
${templateBlock}

RULES: Match the selected template and deliverable. Short-form video scripts should be 110-150 words. Ads should include offer/proof/CTA logic. Publicity should emphasize newsworthiness and clarity. Educational content should teach one clear idea. No emojis, hashtags, or filler.

STRUCTURE:
(1) OPENING: hook, claim, or context
(2) BODY: template-specific substance
(3) PROOF / TENSION / VALUE: why it matters
(4) CLOSE: CTA, takeaway, or locked closing line when appropriate

Pure copy/script only. No labels unless the template requires a structured handoff.`
    : SCRIPT_SYSTEM;

  if (instruction && current_script) {
    return `${system}

---

Revise the script below.

Revision instruction: ${instruction}

Current script:
${current_script}

Return only the revised script. Pure usable copy only.`;
  }

  return `${system}

---

Write ${story.deliverable_type || template?.deliverable_type || "content copy"} for:
Content: ${story.angle || story.title}
Subject(s): ${story.players || story.subjects || "Unknown"}
Era/context: ${story.era || "Unknown"}
Emotional angle: ${story.archetype || "Pressure"}
Objective: ${story.objective || template?.objective || "Unknown"}
Audience: ${story.audience || template?.audience || "Unknown"}
Channel: ${story.channel || story.platform_target || template?.channels?.[0] || "Unknown"}

Pure usable copy only.`;
}

// No parse() — script is raw text
