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

/**
 * @param {object} params
 * @param {object} params.story  — { title, angle, players, era, archetype }
 */
export function build({ story, brand_config = null }) {
  const brandName = brand_config?.brand_name || "Uncle Carter";
  const system = brand_config
    ? `You write scripts for "${brandName}", a ${brand_config.content_type || "narrative"} content brand.

Brand voice: ${brand_config.voice || "clear, specific, emotionally grounded"}.
Avoid: ${brand_config.avoid || "generic phrasing, hype, filler"}.

RULES: 110-150 words. Short sentences. No emojis, hashtags, or filler. Use 1-2 factual anchors. Human tension focus. End with this exact line: "${brand_config.closing_line || "Because the score is never the whole story."}"

STRUCTURE:
(1) HOOK: emotional intrigue
(2) CONTEXT: stakes, time, place, 2-3 sentences
(3) HUMAN TENSION: the heart
(4) THE MOMENT: understated
(5) MEANING: beyond the surface
(6) CLOSING: "${brand_config.closing_line || "Because the score is never the whole story."}"

Pure script text only. No labels.`
    : SCRIPT_SYSTEM;

  return `${system}

---

Write a ${brandName} script about:
Story: ${story.angle || story.title}
Subject(s): ${story.players || story.subjects || "Unknown"}
Era/context: ${story.era || "Unknown"}
Emotional angle: ${story.archetype || "Pressure"}

110-150 words. Pure script only.`;
}

// No parse() — script is raw text
