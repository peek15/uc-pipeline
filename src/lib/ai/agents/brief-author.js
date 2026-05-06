// ═══════════════════════════════════════════════════════════
// brief-author agent
//
// Reads:    story metadata, brand_profile.brief_doc, recent feedback
// Outputs:  { scene, mood, references, avoid, confidence, reasoning }
// Triggers: when a story enters Production tab without a visual_brief
//
// Brand-agnostic: every brand-specific value comes from brand_profile.
// ═══════════════════════════════════════════════════════════

import { runPrompt } from "@/lib/ai/runner";
import { loadAgentContext, formatFeedbackContext, brandIdentityBlock,
         extractJson, hybridConfidence, logFeedback } from "./base";

export const AGENT_NAME = "brief-author";

export const defaults = { maxTokens: 800, model: "sonnet" };

/**
 * Run the brief-author agent for one story.
 *
 * @param {object} opts
 * @param {object} opts.story            — story row
 * @param {string} opts.brand_profile_id
 * @param {string} [opts.workspace_id]
 * @returns {Promise<{ brief, confidence, reasoning, ai_call_id, raw }>}
 */
export async function run({ story, brand_profile_id, workspace_id = null }) {
  const { brand, feedback } = await loadAgentContext({
    brand_profile_id,
    agent_name: AGENT_NAME,
    feedback_limit: 5,
  });

  const prompt = buildPrompt({ story, brand, feedback });

  const { text, ai_call_id } = await runPrompt({
    type:    "agent-call",            // generic logging type for agent calls
    params:  { prompt },
    context: { story_id: story.id, brand_profile_id, workspace_id },
    parse:   false,
    maxTokens: defaults.maxTokens,
    model:     defaults.model,
  });

  const parsed = extractJson(text) || {};
  const brief = {
    scene:      String(parsed.scene      || "").slice(0, 1000),
    mood:       String(parsed.mood       || "").slice(0, 500),
    references: Array.isArray(parsed.references) ? parsed.references.slice(0, 8).map(String) : [],
    avoid:      String(parsed.avoid      || "").slice(0, 500),
  };

  // Heuristic signals — used for hybrid confidence
  const signals = {
    has_scene:       brief.scene.length      > 30 ? 1 : brief.scene.length      > 0 ? 0.6 : 0,
    has_mood:        brief.mood.length       > 15 ? 1 : brief.mood.length       > 0 ? 0.6 : 0,
    has_references:  brief.references.length >= 2 ? 1 : brief.references.length >= 1 ? 0.7 : 0.4,
    has_avoid:       brief.avoid.length      > 10 ? 1 : 0.7,
    feedback_recent: feedback.length          > 0 ? 0.95 : 0.85, // slight uncertainty if no learning yet
  };

  const selfReported = clamp(Number(parsed.confidence) || 50, 0, 100);
  const confidence   = hybridConfidence(selfReported, signals);

  return {
    brief,
    confidence,
    reasoning: String(parsed.reasoning || "").slice(0, 500),
    ai_call_id,
    raw: text,
  };
}

/**
 * User accepted, edited, or rejected. Log to agent_feedback so the
 * agent can learn next time.
 *
 * @param {object} opts
 * @param {string} opts.brand_profile_id
 * @param {string} opts.story_id
 * @param {string} opts.ai_call_id
 * @param {object} opts.agent_output    — original brief
 * @param {object} [opts.user_correction] — final brief if edited
 * @param {string} opts.correction_type — 'approve' | 'edit' | 'reject'
 * @param {string} [opts.notes]
 * @param {number} [opts.confidence]    — original confidence
 * @param {boolean}[opts.was_auto_approved]
 */
export async function recordFeedback(opts) {
  return logFeedback({ ...opts, agent_name: AGENT_NAME });
}

// For streaming use in ProductionView — builds the prompt without running Claude.
export async function buildStreamPrompt({ story, brand_profile_id }) {
  const { brand, feedback } = await loadAgentContext({
    brand_profile_id, agent_name: AGENT_NAME, feedback_limit: 5,
  });
  return buildPrompt({ story, brand, feedback });
}

// Parse raw streamed text into structured brief fields.
export function parseOutput(text) {
  const parsed = extractJson(text) || {};
  return {
    brief: {
      scene:      String(parsed.scene      || "").slice(0, 1000),
      mood:       String(parsed.mood       || "").slice(0, 500),
      references: Array.isArray(parsed.references) ? parsed.references.slice(0, 8).map(String) : [],
      avoid:      String(parsed.avoid      || "").slice(0, 500),
    },
    confidence: clamp(Number(parsed.confidence) || 50, 0, 100),
    reasoning:  String(parsed.reasoning || "").slice(0, 500),
  };
}

// ─────────────── prompt construction ───────────────

function buildPrompt({ story, brand, feedback }) {
  const brandBlock    = brandIdentityBlock(brand);
  const feedbackBlock = formatFeedbackContext(feedback);

  return `You are the brief-author agent. Your job is to write a structured visual production brief for a single content piece.

Output EXACTLY this JSON structure (no markdown, no preamble):
{
  "scene":      "1-2 sentences describing the literal visual scene to depict",
  "mood":       "1 sentence on emotional tone, lighting, atmosphere",
  "references": ["3-5 short reference cues — film, photography, era, palette"],
  "avoid":      "1 sentence listing visual cliches, trademarks, or imagery to skip",
  "confidence": 0-100 integer — how sure you are this brief will yield strong visuals,
  "reasoning":  "1 sentence explaining the choices"
}

--- BRAND IDENTITY ---
${brandBlock}

--- STORY ---
Title:        ${story.title || "(untitled)"}
Format:       ${story.format || "(unspecified)"}
Era:          ${story.era || "(unspecified)"}
Archetype:    ${story.archetype || "(unspecified)"}
Players:      ${story.players || "(unspecified)"}
Angle:        ${story.angle || "(unspecified)"}
Hook:         ${story.hook || "(unspecified)"}
Script (EN):
${(story.script || "").slice(0, 1500) || "(no script)"}
${feedbackBlock}

RULES:
- Scene must be specific and depictable, not abstract
- Mood pulls from the brand's voice and the story's archetype
- References should be visual culture (films, photographers, eras, palettes), never another brand's content
- Avoid must reflect the brand's "avoid" guidance plus story-specific cliches
- If the brand has locked_elements, the scene must respect them
- Confidence should reflect: brief specificity, brand-fit, learning from corrections above

JSON only.`;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
