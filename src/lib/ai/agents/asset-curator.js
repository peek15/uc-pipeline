// ═══════════════════════════════════════════════════════════
// asset-curator agent
//
// Reads:    visual_brief, story metadata, brand_profile, asset_library
// Outputs:  { matches: [...], gaps: [...], confidence }
// Triggers: after brief-author succeeds, before any visual generation
//
// matches[] = library assets to reuse for free
// gaps[]    = positions/types still requiring generation
//
// Conservative by design: DO NOT match an asset unless the brief and
// metadata genuinely line up. False positives cost brand consistency.
// ═══════════════════════════════════════════════════════════

import { runPrompt } from "@/lib/ai/runner";
import { supabase } from "@/lib/db";
import { loadAgentContext, formatFeedbackContext, brandIdentityBlock,
         extractJson, hybridConfidence, logFeedback } from "./base";
import { subjectText } from "@/lib/brandConfig";

export const AGENT_NAME = "asset-curator";
export const defaults  = { maxTokens: 1200, model: "haiku" };

/**
 * Standard production needs (Phase 1 spec).
 * The agent is told these positions exist — it can mark each as
 * matched (library) or gap (generate).
 */
const PRODUCTION_POSITIONS = [
  { key: "intro",        type: "intro",      position_intent: "opening", count: 1 },
  { key: "outro",        type: "outro",      position_intent: "closing", count: 1 },
  { key: "transition",   type: "transition", position_intent: "any",     count: 2 },
  { key: "atmospheric",  type: "broll",      position_intent: "any",     count: 6 },
  { key: "licensed",     type: "broll",      position_intent: "any",     count: 6 },
  { key: "voice_locked", type: "voice_locked", position_intent: "closing", count: 1 },
];

/**
 * Run asset-curator for one story.
 */
export async function run({ story, brief, brand_profile_id, workspace_id = null }) {
  const { brand, feedback } = await loadAgentContext({
    brand_profile_id,
    agent_name: AGENT_NAME,
    feedback_limit: 5,
  });

  // Pull all active library assets for this brand. The agent then
  // reasons over them — we don't pre-filter on tags here because the
  // brief language and library tags don't always overlap exactly.
  const { data: library } = await supabase
    .from("asset_library")
    .select("id, type, name, language, format_scope, era_scope, tags, position_intent, duration_ms, file_url")
    .eq("brand_profile_id", brand_profile_id || "00000000-0000-0000-0000-000000000000")
    .eq("active", true)
    .limit(200);

  const candidates = library || [];

  const prompt = buildPrompt({ story, brief, brand, feedback, candidates });

  const { text, ai_call_id } = await runPrompt({
    type:    "agent-call",
    params:  { prompt },
    context: { story_id: story.id, brand_profile_id, workspace_id },
    parse:   false,
    maxTokens: defaults.maxTokens,
    model:     defaults.model,
  });

  const parsed = extractJson(text) || {};
  const matches = Array.isArray(parsed.matches) ? parsed.matches : [];
  const gaps    = Array.isArray(parsed.gaps)    ? parsed.gaps    : PRODUCTION_POSITIONS;

  // Validate matches actually exist in the library
  const libraryIds = new Set(candidates.map(c => c.id));
  const validMatches = matches.filter(m => m && m.asset_id && libraryIds.has(m.asset_id));

  // Heuristic signals
  const signals = {
    library_has_assets:   candidates.length > 0 ? 1 : 0.5,
    matches_validated:    matches.length === validMatches.length ? 1 : 0.5,
    gaps_reasonable:      gaps.length >= 1 && gaps.length <= 12 ? 1 : 0.5,
    feedback_recent:      feedback.length > 0 ? 0.95 : 0.85,
  };

  const selfReported = clamp(Number(parsed.confidence) || 50, 0, 100);
  const confidence   = hybridConfidence(selfReported, signals);

  return {
    matches: validMatches,
    gaps,
    confidence,
    reasoning: String(parsed.reasoning || "").slice(0, 500),
    ai_call_id,
    raw: text,
  };
}

export async function recordFeedback(opts) {
  return logFeedback({ ...opts, agent_name: AGENT_NAME });
}

// ─────────────── prompt construction ───────────────

function buildPrompt({ story, brief, brand, feedback, candidates }) {
  const brandBlock    = brandIdentityBlock(brand);
  const feedbackBlock = formatFeedbackContext(feedback);

  const candidatesBlock = candidates.length === 0
    ? "(library is empty — all positions are gaps)"
    : candidates.map(c => {
        const tags = (c.tags || []).join(",");
        const fmts = (c.format_scope || []).join(",");
        return `id=${c.id} type=${c.type} name="${c.name}" lang=${c.language || "any"} fmts=[${fmts}] tags=[${tags}] pos=[${(c.position_intent||[]).join(",")}]`;
      }).join("\n");

  const positionsBlock = PRODUCTION_POSITIONS
    .map(p => `- ${p.key}: type=${p.type}, position=${p.position_intent}, count=${p.count}`)
    .join("\n");

  return `You are the asset-curator agent. Your job is to find existing library assets that fit this story's needs, and report which positions still need new generation.

Output EXACTLY this JSON structure (no markdown):
{
  "matches": [
    { "asset_id": "uuid", "position_key": "intro|outro|transition|atmospheric|licensed|voice_locked", "reasoning": "1 short sentence" }
  ],
  "gaps": [
    { "position_key": "...", "type": "...", "count": 1, "reasoning": "1 short sentence" }
  ],
  "confidence": 0-100 integer,
  "reasoning": "1 sentence overall"
}

--- BRAND IDENTITY ---
${brandBlock}

--- STORY ---
Title:     ${story.title || "(untitled)"}
Format:    ${story.format || "(unspecified)"}
Era:       ${story.era || "(unspecified)"}
Archetype: ${story.archetype || "(unspecified)"}
Subjects:  ${subjectText(story) || "(unspecified)"}

--- VISUAL BRIEF (just authored) ---
Scene:      ${brief.scene  || ""}
Mood:       ${brief.mood   || ""}
References: ${(brief.references || []).join(" / ")}
Avoid:      ${brief.avoid  || ""}

--- PRODUCTION POSITIONS NEEDED ---
${positionsBlock}

--- AVAILABLE LIBRARY ASSETS ---
${candidatesBlock}
${feedbackBlock}

RULES:
- ONLY match an asset if its tags/format_scope/era_scope/position_intent genuinely fit the story + brief
- Brand consistency matters more than reuse — when in doubt, mark as gap
- Each gap entry should describe ONE position; if 6 atmospheric shots are needed, gap entry has count=6
- All position_keys MUST be one of: intro, outro, transition, atmospheric, licensed, voice_locked
- voice_locked matches require language match — if story is multilingual, match per language
- Sum of (matched + gap counts) per position must equal the position's required count

JSON only.`;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
