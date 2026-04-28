// ═══════════════════════════════════════════════════════════
// visual-ranker agent
// v3.11.0
//
// Pipeline:
//   1. Read brief + story metadata
//   2. Use Claude to translate brief into 6 MJ-style prompts +
//      6 Pexels-style search queries
//   3. Fire all 12 in parallel (atmospheric + licensed)
//   4. Use Claude to rank results, return top N
//   5. Log every generation to visual_assets (selected = false initially)
//
// Past-output context: queries past visual_assets where was_selected=true
// for same brand+format+archetype, includes as few-shot in step 2.
// Empty for first ~10 videos. By design.
//
// Provider selection via selectVisualProvider() — Stage 1 returns brand
// defaults, Stage 2 will use intelligence layer. Single swap point.
// ═══════════════════════════════════════════════════════════

import { runPrompt } from "@/lib/ai/runner";
import { supabase } from "@/lib/db";
import { getAtmosphericProvider, getLicensedProvider, selectVisualProvider } from "@/lib/providers/visual/visual";
import { loadAgentContext, formatFeedbackContext, brandIdentityBlock,
         extractJson, hybridConfidence, logFeedback } from "./base";

export const AGENT_NAME = "visual-ranker";
export const defaults  = { maxTokens: 2000, model: "sonnet" };

const DEFAULT_TOTAL_COUNT = 12; // 6 atmospheric + 6 licensed
const DEFAULT_KEEP_COUNT  = 6;

/**
 * Run the full pipeline.
 *
 * @param {object} opts
 * @param {object} opts.story
 * @param {object} opts.brief             — { scene, mood, references, avoid }
 * @param {string} opts.brand_profile_id
 * @param {string} [opts.workspace_id]
 * @param {number} [opts.total_count]     — total visuals to generate (default 12)
 * @param {number} [opts.keep_count]      — how many to surface as ranked top (default 6)
 *
 * @returns {Promise<{
 *   prompts, queries,
 *   atmospheric_assets, licensed_assets,
 *   ranked_top, ranking_reasoning,
 *   total_cost, confidence, ai_call_ids
 * }>}
 */
export async function run({ story, brief, brand_profile_id, workspace_id = null,
                            total_count = DEFAULT_TOTAL_COUNT,
                            keep_count  = DEFAULT_KEEP_COUNT }) {
  if (!brief) throw new Error("visual-ranker: brief required (run brief-author first)");
  if (!brief.scene && !brief.mood) throw new Error("visual-ranker: brief must have scene or mood");

  const ai_call_ids = [];
  let total_cost = 0;

  // Provider selection — single swap point for future intelligence
  const selection = await selectVisualProvider({
    brand_profile_id,
    format:    story.format,
    archetype: story.archetype,
  });

  // ── Step 1: load brand + past selections (few-shot context) ──
  const { brand, feedback } = await loadAgentContext({
    brand_profile_id,
    agent_name: AGENT_NAME,
    feedback_limit: 5,
  });

  const pastSelections = await loadPastSelections({
    brand_profile_id,
    format:    story.format,
    archetype: story.archetype,
    limit: 6,
  });

  // ── Step 2: Claude translates brief into prompts + queries ──
  const split = halfHalf(total_count);
  const planResult = await runPrompt({
    type:    "agent-call",
    params:  { prompt: buildPlannerPrompt({ story, brief, brand, feedback, pastSelections, split }) },
    context: { story_id: story.id, brand_profile_id, workspace_id },
    parse:   false,
    maxTokens: defaults.maxTokens,
    model:     defaults.model,
  });
  if (planResult.ai_call_id) ai_call_ids.push(planResult.ai_call_id);

  const plan = extractJson(planResult.text) || {};
  const prompts = Array.isArray(plan.atmospheric_prompts) ? plan.atmospheric_prompts.slice(0, split.atmospheric) : [];
  const queries = Array.isArray(plan.licensed_queries)    ? plan.licensed_queries.slice(0, split.licensed)       : [];

  if (prompts.length === 0 && queries.length === 0) {
    throw new Error("visual-ranker: planner returned no prompts or queries");
  }

  // ── Step 3: fire all in parallel ──
  const atmosphericProvider = await getAtmosphericProvider(brand_profile_id);
  const licensedProvider    = await getLicensedProvider(brand_profile_id);

  const aspect = "9:16"; // TikTok/IG Reels/Shorts vertical

  const [atmosphericResults, licensedResults] = await Promise.all([
    Promise.allSettled(prompts.map(p =>
      atmosphericProvider.generate({ prompt: p.prompt, count: 1, aspect })
        .then(r => ({ prompt: p.prompt, position: p.position, position_intent: p.position_intent, ...r }))
    )),
    Promise.allSettled(queries.map(q =>
      licensedProvider.search({ query: q.query, count: 1, orientation: "portrait" })
        .then(r => ({ query: q.query, position: q.position, position_intent: q.position_intent, ...r }))
    )),
  ]);

  // ── Step 4: persist all generated assets to visual_assets ──
  const atmospheric_assets = await persistGenerationResults({
    results: atmosphericResults, story, brand_profile_id, workspace_id,
    asset_type: "atmospheric", brief, format: story.format,
  });
  total_cost += atmospheric_assets.reduce((s, a) => s + (a.provider_cost || 0), 0);

  const licensed_assets = await persistGenerationResults({
    results: licensedResults, story, brand_profile_id, workspace_id,
    asset_type: "licensed", brief, format: story.format,
  });
  total_cost += licensed_assets.reduce((s, a) => s + (a.provider_cost || 0), 0);

  const all_assets = [...atmospheric_assets, ...licensed_assets];

  if (all_assets.length === 0) {
    throw new Error("visual-ranker: all provider calls failed — check console + provider keys");
  }

  // ── Step 5: Claude ranks results vs brief ──
  const rankResult = await runPrompt({
    type:    "agent-call",
    params:  { prompt: buildRankerPrompt({ story, brief, brand, all_assets, keep_count }) },
    context: { story_id: story.id, brand_profile_id, workspace_id },
    parse:   false,
    maxTokens: 1500,
    model:     defaults.model,
  });
  if (rankResult.ai_call_id) ai_call_ids.push(rankResult.ai_call_id);

  const ranking = extractJson(rankResult.text) || {};
  const rank_ids = Array.isArray(ranking.ranked_asset_ids) ? ranking.ranked_asset_ids : [];
  const ranking_reasoning = String(ranking.reasoning || "").slice(0, 500);

  // Persist rank scores back to visual_assets
  if (rank_ids.length > 0) {
    await Promise.all(rank_ids.map((id, i) => {
      if (!id) return Promise.resolve();
      const score = Math.max(0, 100 - (i * 5)); // top = 100, then -5 per rank
      return supabase.from("visual_assets").update({
        rank_score: score,
        rank_reasoning: ranking_reasoning,
      }).eq("id", id);
    }));
  }

  const id_to_asset = new Map(all_assets.map(a => [a.id, a]));
  const ranked_top = rank_ids.slice(0, keep_count).map(id => id_to_asset.get(id)).filter(Boolean);

  // Confidence
  const signals = {
    plan_returned:     prompts.length + queries.length === total_count ? 1 : 0.7,
    assets_generated:  all_assets.length / total_count,
    ranking_returned:  rank_ids.length >= keep_count ? 1 : 0.6,
    not_all_stub:      all_assets.some(a => a.source !== "stub") ? 1 : 0.6,
  };
  const confidence = hybridConfidence(Number(ranking.confidence) || 70, signals);

  return {
    prompts,
    queries,
    atmospheric_assets,
    licensed_assets,
    all_assets,
    ranked_top,
    ranking_reasoning,
    total_cost,
    confidence,
    ai_call_ids,
    selection_meta: selection,
  };
}

export async function recordFeedback(opts) {
  return logFeedback({ ...opts, agent_name: AGENT_NAME });
}

// ─── User selection persistence ─────────────────────────

/**
 * After user picks final visuals, mark them was_selected=true.
 * `selected_ids` should be in display order.
 */
export async function persistUserSelections({ story_id, selected_ids }) {
  if (!Array.isArray(selected_ids)) return;

  // First reset all visuals for this story
  await supabase
    .from("visual_assets")
    .update({ was_selected: false, selection_order: null })
    .eq("story_id", story_id);

  // Then set the picks in order
  await Promise.all(selected_ids.map((id, i) =>
    supabase.from("visual_assets").update({
      was_selected: true,
      selection_order: i,
    }).eq("id", id)
  ));

  // Update story.visual_refs with picks
  const { data: picks } = await supabase
    .from("visual_assets")
    .select("id, file_url, source, asset_type, selection_order")
    .eq("story_id", story_id)
    .eq("was_selected", true)
    .order("selection_order", { ascending: true });

  await supabase.from("stories").update({
    visual_refs: { selected: picks || [] },
  }).eq("id", story_id);
}

// ─── Helpers ────────────────────────────────────────────

function halfHalf(total) {
  const atmospheric = Math.ceil(total / 2);
  const licensed    = total - atmospheric;
  return { atmospheric, licensed };
}

async function loadPastSelections({ brand_profile_id, format, archetype, limit = 6 }) {
  // Past visuals that were selected on similar stories. Empty for first ~10 videos.
  let q = supabase
    .from("visual_assets")
    .select("prompt, asset_type, source, format, brief_snapshot")
    .eq("brand_profile_id", brand_profile_id)
    .eq("was_selected", true)
    .eq("format", format)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data } = await q;
  return data || [];
}

async function persistGenerationResults({ results, story, brand_profile_id, workspace_id,
                                          asset_type, brief, format }) {
  const rows = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { provider_name, prompt, query, position, position_intent } = r.value;
    const images = r.value.images || [];

    for (const img of images) {
      rows.push({
        story_id:         story.id,
        brand_profile_id,
        workspace_id,
        source:           provider_name,
        asset_type,
        file_url:         img.url,
        thumbnail_url:    img.url,
        width:            img.width  || null,
        height:           img.height || null,
        prompt:           prompt || query,
        brief_snapshot:   brief,
        format,
        position_intent:  position_intent || "any",
        was_selected:     false,
        provider_cost:    img.cost_estimate || 0,
        generated_by:     `agent:${AGENT_NAME}`,
      });
    }
  }

  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from("visual_assets")
    .insert(rows)
    .select();
  if (error) {
    console.error("[visual-ranker] persist failed:", error);
    return [];
  }
  return data || [];
}

// ─── Prompt construction ────────────────────────────────

function buildPlannerPrompt({ story, brief, brand, feedback, pastSelections, split }) {
  const brandBlock    = brandIdentityBlock(brand);
  const feedbackBlock = formatFeedbackContext(feedback);
  const pastBlock = pastSelections.length === 0
    ? ""
    : `\n--- PAST SELECTIONS (visuals you've previously chosen for similar ${story.format} ${story.archetype} stories) ---\n${pastSelections.map((p, i) => `${i + 1}. [${p.asset_type}/${p.source}] "${p.prompt}"`).join("\n")}\n`;

  return `You are the visual-ranker agent (planning step). Translate a visual brief into ${split.atmospheric} AI-image prompts and ${split.licensed} licensed-photo search queries.

Output EXACTLY this JSON (no markdown):
{
  "atmospheric_prompts": [
    { "position": "intro|middle|outro|any", "position_intent": "opening|closing|any", "prompt": "fully-formed image generation prompt, English, descriptive, cinematic" }
  ],
  "licensed_queries": [
    { "position": "intro|middle|outro|any", "position_intent": "opening|closing|any", "query": "short Pexels search query, 2-4 words, English" }
  ]
}

--- BRAND IDENTITY ---
${brandBlock}

--- STORY ---
Title:     ${story.title || "(untitled)"}
Format:    ${story.format || "(unspecified)"}
Era:       ${story.era || "(unspecified)"}
Archetype: ${story.archetype || "(unspecified)"}
Players:   ${story.players || "(unspecified)"}

--- VISUAL BRIEF ---
Scene:      ${brief.scene  || ""}
Mood:       ${brief.mood   || ""}
References: ${(brief.references || []).join(" / ")}
Avoid:      ${brief.avoid  || ""}
${pastBlock}${feedbackBlock}

RULES:
- Atmospheric prompts: detailed, cinematic, mention era/lighting/mood/composition
- Licensed queries: short, real-world searchable terms (no fictional concepts)
- ${split.atmospheric} atmospheric prompts AND ${split.licensed} licensed queries — exactly
- Distribute across positions (intro/middle/outro) so we have visuals for the whole video
- Atmospheric prompts must respect brand identity and "avoid" list
- Licensed queries should use generic terms, NOT real player names (rights complications)

JSON only.`;
}

function buildRankerPrompt({ story, brief, brand, all_assets, keep_count }) {
  const brandBlock = brandIdentityBlock(brand);
  const assetList = all_assets.map(a =>
    `id="${a.id}" type=${a.asset_type} source=${a.source} prompt_or_query="${(a.prompt || "").slice(0, 120)}" position=${a.position_intent}`
  ).join("\n");

  return `You are the visual-ranker agent (ranking step). Rank these ${all_assets.length} generated visuals by how well they fit the brief and brand. Return your top ${keep_count} by id.

Output EXACTLY this JSON (no markdown):
{
  "ranked_asset_ids": ["uuid1", "uuid2", ... up to ${keep_count}],
  "reasoning": "1-2 sentences on why these ranked highest",
  "confidence": 0-100
}

--- BRAND IDENTITY ---
${brandBlock}

--- STORY ---
Title:     ${story.title}
Format:    ${story.format}
Archetype: ${story.archetype}

--- BRIEF ---
Scene:      ${brief.scene  || ""}
Mood:       ${brief.mood   || ""}
References: ${(brief.references || []).join(" / ")}
Avoid:      ${brief.avoid  || ""}

--- CANDIDATE ASSETS ---
${assetList}

RULES:
- Pick ${keep_count} ids that BEST match the brief and brand
- Mix atmospheric and licensed if both fit — don't favor one source artificially
- Avoid duplicates of similar shots (variety in composition matters for a 45-55s video)
- Return ids in priority order — first id is the strongest match

JSON only.`;
}
