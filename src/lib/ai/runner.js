// ═══════════════════════════════════════════════════════════
// runner.js — Single entry point for every AI call in the app.
// No view should call callClaude() directly. All AI logic flows:
//   view → runPrompt() → prompt template → callClaudeRaw() → logAiCall()
//
// v3.7.0 architecture.
// Option B agents will plug into the same pattern via agent-runner.js
// ═══════════════════════════════════════════════════════════

import { callClaudeRaw, callClaudeStreamRaw } from "@/lib/db";
import { logAiCall, logAiCallError } from "./audit";

// ── Prompt registry ──
// Each prompt module exports:
//   build(params) → string
//   parse?(text)  → any (optional — for JSON responses)
//   defaults?: { maxTokens, model, streaming }
import * as scoreStory           from "./prompts/score-story";
import * as generateScript       from "./prompts/generate-script";
import * as translateScript      from "./prompts/translate-script";
import * as researchStories      from "./prompts/research-stories";
import * as reachScore           from "./prompts/reach-score";
import * as programmeDiscuss     from "./prompts/programme-discuss";
import * as rulesSuggest         from "./prompts/rules-suggest";
import * as rulesAudit           from "./prompts/rules-audit";
import * as rulesConflictResolve from "./prompts/rules-conflict-resolve";
import * as alertsSuggest        from "./prompts/alerts-suggest";
import * as summarizeContent     from "./prompts/summarize-content";
import * as strategyAudit        from "./prompts/strategy-audit";
import * as onboardingChat       from "./prompts/onboarding-chat";

const REGISTRY = {
  "score-story":            scoreStory,
  "generate-script":        generateScript,
  "translate-script":       translateScript,
  "research-stories":       researchStories,
  "reach-score":            reachScore,
  "programme-discuss":      programmeDiscuss,
  "rules-suggest":          rulesSuggest,
  "rules-audit":            rulesAudit,
  "rules-conflict-resolve": rulesConflictResolve,
  "alerts-suggest":         alertsSuggest,
  "summarize-content":      summarizeContent,
  "strategy-audit":         strategyAudit,
  "onboarding-chat":        onboardingChat,
};

/**
 * Run a non-streaming AI prompt.
 *
 * @param {object} opts
 * @param {string} opts.type       — registry key (e.g. "score-story")
 * @param {object} opts.params     — passed to the prompt's build()
 * @param {object} [opts.context]  — { story_id, brand_profile_id, workspace_id }
 * @param {number} [opts.maxTokens]— overrides prompt default
 * @param {string} [opts.model]    — "haiku"|"sonnet"|"opus" (overrides default)
 * @param {boolean}[opts.parse]    — if true and prompt has parse(), return parsed; else raw text
 * @returns {Promise<{ text, parsed, usage, model, cost_estimate, ai_call_id }>}
 */
export async function runPrompt({
  type,
  params = {},
  context = {},
  maxTokens,
  model,
  parse = true,
}) {
  const mod = REGISTRY[type];
  if (!mod) throw new Error(`runPrompt: unknown type "${type}"`);
  if (typeof mod.build !== "function") throw new Error(`runPrompt: "${type}" has no build()`);

  const defaults = mod.defaults || {};
  const resolvedMax   = maxTokens ?? defaults.maxTokens ?? 1000;
  const resolvedModel = model     ?? defaults.model     ?? "sonnet";

  const prompt = mod.build(params);
  const t0 = Date.now();

  try {
    const { text, usage, model: modelId } = await callClaudeRaw(prompt, resolvedMax, resolvedModel);
    const duration_ms = Date.now() - t0;

    // Log success — best effort
    const ai_call_id = await logAiCall({
      type,
      provider_name: "anthropic",
      model_version: modelId,
      tokens_input:  usage.input_tokens,
      tokens_output: usage.output_tokens,
      story_id:         context.story_id         || null,
      brand_profile_id: context.brand_profile_id || null,
      workspace_id:     context.workspace_id     || null,
      duration_ms,
    });

    // Optional parsing via prompt's parse()
    let parsed = null;
    if (parse && typeof mod.parse === "function") {
      try { parsed = mod.parse(text); }
      catch (e) {
        // Parse failure: log but don't throw — caller can inspect text
        await logAiCallError({
          type,
          model_version: modelId,
          tokens_input:  usage.input_tokens,
          tokens_output: usage.output_tokens,
          story_id: context.story_id,
          brand_profile_id: context.brand_profile_id,
          workspace_id: context.workspace_id,
          error_type:    "parse",
          error_message: e?.message || String(e),
          duration_ms,
        });
      }
    }

    return { text, parsed, usage, model: modelId, ai_call_id };
  } catch (e) {
    const duration_ms = Date.now() - t0;
    await logAiCallError({
      type,
      model_version: resolvedModel,
      story_id:         context.story_id         || null,
      brand_profile_id: context.brand_profile_id || null,
      workspace_id:     context.workspace_id     || null,
      error_type:    "provider_error",
      error_message: e?.message || String(e),
      duration_ms,
    });
    throw e;
  }
}

/**
 * Streaming variant for script generation. Same signature, plus onChunk.
 *
 * @param {object} opts
 * @param {(text:string)=>void} opts.onChunk
 * @returns {Promise<{ text, usage, model, ai_call_id }>}
 */
export async function runPromptStream({
  type,
  params = {},
  context = {},
  maxTokens,
  model,
  onChunk,
}) {
  const mod = REGISTRY[type];
  if (!mod) throw new Error(`runPromptStream: unknown type "${type}"`);

  const defaults = mod.defaults || {};
  const resolvedMax   = maxTokens ?? defaults.maxTokens ?? 1000;
  const resolvedModel = model     ?? defaults.model     ?? "sonnet";

  const prompt = mod.build(params);
  const t0 = Date.now();

  try {
    const { text, usage, model: modelId } = await callClaudeStreamRaw(
      prompt, resolvedMax, onChunk, resolvedModel
    );
    const duration_ms = Date.now() - t0;

    const ai_call_id = await logAiCall({
      type,
      provider_name: "anthropic",
      model_version: modelId,
      tokens_input:  usage.input_tokens,
      tokens_output: usage.output_tokens,
      story_id:         context.story_id         || null,
      brand_profile_id: context.brand_profile_id || null,
      workspace_id:     context.workspace_id     || null,
      duration_ms,
    });

    return { text, usage, model: modelId, ai_call_id };
  } catch (e) {
    const duration_ms = Date.now() - t0;
    await logAiCallError({
      type,
      model_version: resolvedModel,
      story_id:         context.story_id         || null,
      brand_profile_id: context.brand_profile_id || null,
      workspace_id:     context.workspace_id     || null,
      error_type:    "provider_error",
      error_message: e?.message || String(e),
      duration_ms,
    });
    throw e;
  }
}

// Re-export for convenience
export { logAiCall, logAiCallError, getAiCalls, getStoryCost } from "./audit";
export { estimateCost, formatCost } from "./costs";
