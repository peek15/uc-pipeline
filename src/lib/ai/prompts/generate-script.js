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
export function build({ story }) {
  return `${SCRIPT_SYSTEM}

---

Write an Uncle Carter episode script about:
Story: ${story.angle || story.title}
Player(s): ${story.players || "Unknown"}
Era: ${story.era || "Unknown"}
Emotional angle: ${story.archetype || "Pressure"}

110-150 words. Pure script only.`;
}

// No parse() — script is raw text
