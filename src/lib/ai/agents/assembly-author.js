// ═══════════════════════════════════════════════════════════
// assembly-author agent
// v3.12.0
//
// Final agent in the Production pipeline.
// Reads:    story scripts (EN/FR/ES/PT), visual_brief, audio_refs,
//           visual_refs (selected assets)
// Outputs:  { scenes, voice_tracks, total_duration_ms, export_notes,
//             markdown_brief, confidence }
// Stored:   story.assembly_brief (JSONB)
//
// The JSON output is the machine-readable CapCut timeline spec.
// markdown_brief is the human-readable editor handoff doc.
// ═══════════════════════════════════════════════════════════

import { runPrompt } from "@/lib/ai/runner";
import { loadAgentContext, formatFeedbackContext, brandIdentityBlock,
         extractJson, hybridConfidence, logFeedback } from "./base";

export const AGENT_NAME = "assembly-author";
export const defaults   = { maxTokens: 2000, model: "sonnet" };

/**
 * @param {object} opts
 * @param {object} opts.story            — full story row
 * @param {string} opts.brand_profile_id
 * @param {string} [opts.workspace_id]
 * @returns {Promise<{ assembly, markdown_brief, confidence, reasoning, ai_call_id }>}
 */
export async function run({ story, brand_profile_id, workspace_id = null }) {
  const { brand, feedback } = await loadAgentContext({
    brand_profile_id,
    agent_name: AGENT_NAME,
    feedback_limit: 3,
  });

  const prompt = buildPrompt({ story, brand, feedback });

  const { text, ai_call_id } = await runPrompt({
    type:    "agent-call",
    params:  { prompt },
    context: { story_id: story.id, brand_profile_id, workspace_id },
    parse:   false,
    maxTokens: defaults.maxTokens,
    model:     defaults.model,
  });

  const parsed = extractJson(text) || {};

  const scenes = Array.isArray(parsed.scenes)
    ? parsed.scenes.slice(0, 20).map(normalizeScene)
    : [];

  const voice_tracks = normalizeVoiceTracks(
    parsed.voice_tracks || {},
    story.audio_refs    || {}
  );

  const total_duration_ms = Number(parsed.total_duration_ms) || estimateDuration(voice_tracks);

  const assembly = {
    title:            story.title,
    format:           story.format,
    languages:        Object.keys(voice_tracks),
    total_duration_ms,
    scenes,
    voice_tracks,
    export_notes: String(parsed.export_notes || "").slice(0, 1000),
  };

  const markdown_brief = parsed.markdown_brief
    ? String(parsed.markdown_brief).slice(0, 8000)
    : buildFallbackMarkdown({ story, assembly });

  const signals = {
    has_scenes:      scenes.length >= 3 ? 1 : scenes.length >= 1 ? 0.7 : 0,
    has_voice_en:    voice_tracks.en    ? 1 : 0.5,
    has_markdown:    markdown_brief.length > 200 ? 1 : 0.6,
    has_visuals:     scenes.some(s => s.visual_url) ? 1 : 0.7,
  };

  const confidence = hybridConfidence(Number(parsed.confidence) || 70, signals);

  return {
    assembly,
    markdown_brief,
    confidence,
    reasoning: String(parsed.reasoning || "").slice(0, 300),
    ai_call_id,
  };
}

export async function recordFeedback(opts) {
  return logFeedback({ ...opts, agent_name: AGENT_NAME });
}

// ─── Prompt ────────────────────────────────────────────────

function buildPrompt({ story, brand, feedback }) {
  const brandBlock    = brandIdentityBlock(brand);
  const feedbackBlock = formatFeedbackContext(feedback);

  const visuals = (story.visual_refs?.selected || []);
  const visualList = visuals.length
    ? visuals.map((v, i) =>
        `  ${i + 1}. id="${v.id}" type=${v.asset_type || "?"} source=${v.source || "?"} url="${v.file_url || ""}"`
      ).join("\n")
    : "  (no visuals selected yet)";

  const audioList = Object.entries(story.audio_refs || {})
    .map(([lang, ref]) =>
      `  ${lang.toUpperCase()}: url="${ref.url || ""}" key="${ref.key || ""}" duration_ms=${ref.duration_estimate_ms || "?"} provider=${ref.provider || "?"}`
    ).join("\n") || "  (no audio generated yet)";

  const scripts = [
    ["EN", story.script],
    ["FR", story.script_fr],
    ["ES", story.script_es],
    ["PT", story.script_pt],
  ].filter(([, s]) => s).map(([lang, s]) => `--- SCRIPT ${lang} ---\n${s.slice(0, 600)}`).join("\n\n");

  const brief = story.visual_brief || {};

  return `You are the assembly-author agent. Your job is to produce a complete video assembly plan for a short-form social video (45–60s), ready for CapCut export.

You receive: the approved scripts in multiple languages, voice track metadata, selected visual assets, and a visual brief.
You output: a JSON scene-by-scene timeline + a markdown editor brief.

Output EXACTLY this JSON (no markdown, no preamble):
{
  "scenes": [
    {
      "index": 1,
      "position": "intro|middle|outro",
      "duration_ms": <estimated milliseconds for this scene>,
      "visual_id": "<asset id or null if no visuals>",
      "visual_url": "<asset url or null>",
      "asset_type": "atmospheric|licensed|null",
      "script_segments": {
        "en": "<the script text that plays during this scene>",
        "fr": "<same segment in French, or null>",
        "es": "<same segment in Spanish, or null>",
        "pt": "<same segment in Portuguese, or null>"
      }
    }
  ],
  "voice_tracks": {
    "en": { "url": "<url>", "key": "<key>", "duration_ms": <number or null> },
    "fr": { "url": "<url>", "key": "<key>", "duration_ms": <number or null> },
    "es": { "url": "<url>", "key": "<key>", "duration_ms": <number or null> },
    "pt": { "url": "<url>", "key": "<key>", "duration_ms": <number or null> }
  },
  "total_duration_ms": <total estimated video duration>,
  "export_notes": "1-2 sentences for the editor: pacing notes, transitions, or anything special",
  "markdown_brief": "<full markdown handoff doc — see format below>",
  "confidence": 0-100,
  "reasoning": "1 sentence"
}

Markdown brief format (write this into the markdown_brief field as a single escaped string):
# Assembly Brief: [story title]
**Format:** [format] | **Archetype:** [archetype] | **Duration:** ~[X]s | **Languages:** [list]

## Scenes
| # | Position | Type | Duration | Asset URL |
|---|----------|------|----------|-----------|
[one row per scene]

## Voice Tracks
| Language | URL | Duration |
|----------|-----|----------|
[one row per language]

## Scene Script Breakdown
[For each scene: heading with scene # and position, then EN/FR/ES/PT script segments]

## Visual Brief
**Scene:** [scene]
**Mood:** [mood]
**References:** [references]
**Avoid:** [avoid]

## Editor Notes
[export_notes]

--- BRAND IDENTITY ---
${brandBlock}

--- STORY ---
Title:     ${story.title || "(untitled)"}
Format:    ${story.format || "(unspecified)"}
Archetype: ${story.archetype || "(unspecified)"}
Players:   ${story.players || "(unspecified)"}

--- VISUAL BRIEF ---
Scene:      ${brief.scene || "(none)"}
Mood:       ${brief.mood || "(none)"}
References: ${(brief.references || []).join(" / ")}
Avoid:      ${brief.avoid || "(none)"}

--- SELECTED VISUAL ASSETS (assign to scenes in order) ---
${visualList}

--- VOICE TRACKS (copy urls/keys exactly as given) ---
${audioList}

--- SCRIPTS ---
${scripts || "(no scripts yet)"}
${feedbackBlock}

RULES:
- Create 1 scene per selected visual asset (if no visuals: create 3 placeholder scenes)
- Assign visuals in selection_order (first = intro, last = outro, middle = middle)
- Split the EN script proportionally across scenes by duration
- Mirror the split for FR/ES/PT (same segment index, corresponding translation)
- voice_tracks: copy urls and keys exactly from the audio list above; fill duration_ms from given values
- total_duration_ms: use EN voice duration if available, else estimate from script word count (≈130 words/min)
- export_notes: practical notes for the editor (e.g. "hard cut at intro, slow fade outro")
- markdown_brief: full human-readable handoff doc using the format above
- If data is missing (no audio, no visuals), still produce a complete plan with nulls/placeholders
- Confidence: 100 only if scripts + audio + visuals are all present and complete

JSON only.`;
}

// ─── Normalizers ───────────────────────────────────────────

function normalizeScene(s) {
  return {
    index:        Number(s.index)       || 0,
    position:     String(s.position     || "middle"),
    duration_ms:  Number(s.duration_ms) || null,
    visual_id:    s.visual_id           || null,
    visual_url:   s.visual_url          || null,
    asset_type:   s.asset_type          || null,
    script_segments: {
      en: s.script_segments?.en || null,
      fr: s.script_segments?.fr || null,
      es: s.script_segments?.es || null,
      pt: s.script_segments?.pt || null,
    },
  };
}

function normalizeVoiceTracks(fromClaude, fromStory) {
  const langs = new Set([
    ...Object.keys(fromClaude),
    ...Object.keys(fromStory),
  ]);
  const out = {};
  for (const lang of langs) {
    const story = fromStory[lang] || {};
    const claude = fromClaude[lang] || {};
    out[lang] = {
      url:         story.url  || claude.url  || null,
      key:         story.key  || claude.key  || null,
      duration_ms: story.duration_estimate_ms || claude.duration_ms || null,
    };
  }
  return out;
}

function estimateDuration(voiceTracks) {
  const en = voiceTracks.en?.duration_ms;
  if (en) return en;
  const first = Object.values(voiceTracks).find(t => t.duration_ms);
  return first?.duration_ms || 50000;
}

function buildFallbackMarkdown({ story, assembly }) {
  const scenes = assembly.scenes.map(s =>
    `| ${s.index} | ${s.position} | ${s.asset_type || "—"} | ${s.duration_ms ? Math.round(s.duration_ms/1000)+"s" : "—"} | ${s.visual_url ? s.visual_url.slice(0,60)+"…" : "(none)"} |`
  ).join("\n");

  const tracks = Object.entries(assembly.voice_tracks).map(([lang, t]) =>
    `| ${lang.toUpperCase()} | ${t.url ? t.url.slice(0,60)+"…" : "(none)"} | ${t.duration_ms ? Math.round(t.duration_ms/1000)+"s" : "—"} |`
  ).join("\n");

  const totalSec = Math.round((assembly.total_duration_ms || 0) / 1000);
  const langs = Object.keys(assembly.voice_tracks).map(l => l.toUpperCase()).join(", ");

  return `# Assembly Brief: ${story.title || "(untitled)"}
**Format:** ${story.format || "—"} | **Archetype:** ${story.archetype || "—"} | **Duration:** ~${totalSec}s | **Languages:** ${langs || "—"}

## Scenes
| # | Position | Type | Duration | Asset URL |
|---|----------|------|----------|-----------|
${scenes || "| — | — | — | — | — |"}

## Voice Tracks
| Language | URL | Duration |
|----------|-----|----------|
${tracks || "| — | — | — |"}

## Editor Notes
${assembly.export_notes || "—"}`;
}
