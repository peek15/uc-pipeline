// ═══════════════════════════════════════════════════════════
// runner.js — Single entry point for every AI call.
// v3.8.0 — adds "agent-call" passthrough type for agents.
//
// Two flavors of call:
//   - Templated:    type matches a prompts/<type>.js file → build() runs
//   - Passthrough:  type === "agent-call" → params.prompt used directly
//                   (agents construct their own prompts using base.js helpers)
// ═══════════════════════════════════════════════════════════

import { callClaudeRaw, callClaudeStreamRaw } from "@/lib/db";
import { prepareGatewayPromptCall } from "./gateway";
import { logAiCall, logAiCallError } from "./audit";

// ── Templated prompt registry ──
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
import * as feedbackPatterns     from "./prompts/feedback-patterns";

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
  "feedback-patterns":      feedbackPatterns,
};

// Passthrough used by agents — they build their own prompt
const PASSTHROUGH_TYPES = new Set(["agent-call"]);

/**
 * Run a prompt by type.
 *
 * @param {object} opts
 * @param {string} opts.type
 * @param {object} opts.params
 * @param {object} [opts.context]   — { story_id, brand_profile_id, workspace_id }
 * @param {number} [opts.maxTokens]
 * @param {string} [opts.model]
 * @param {boolean}[opts.parse]
 * @returns {Promise<{ text, parsed, usage, model, ai_call_id }>}
 */
export async function runPrompt({
  type,
  params = {},
  context = {},
  maxTokens,
  model,
  parse = true,
}) {
  let prompt, mod = null;

  if (PASSTHROUGH_TYPES.has(type)) {
    prompt = params.prompt;
    if (!prompt) throw new Error(`runPrompt: "${type}" requires params.prompt`);
  } else {
    mod = REGISTRY[type];
    if (!mod) throw new Error(`runPrompt: unknown type "${type}"`);
    if (typeof mod.build !== "function") throw new Error(`runPrompt: "${type}" has no build()`);
    prompt = mod.build(params);
  }

  const defaults = mod?.defaults || {};
  const gateway = await prepareGatewayPromptCall({
    type,
    prompt,
    context,
    maxTokens: maxTokens ?? defaults.maxTokens,
    model: model ?? defaults.model,
    stream: false,
  });

  const t0 = Date.now();

  try {
    const { text, usage, model: modelId } = await callClaudeRaw(gateway.prompt, gateway.maxTokens, gateway.model);
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
      ...gateway.logFields,
    });

    let parsed = null;
    if (parse && mod && typeof mod.parse === "function") {
      try { parsed = mod.parse(text); }
      catch (e) {
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
          ...gateway.logFields,
        });
      }
    }

    return { text, parsed, usage, model: modelId, ai_call_id, gateway: gateway.metadata };
  } catch (e) {
    const duration_ms = Date.now() - t0;
    await logAiCallError({
      type,
      model_version: gateway.model,
      story_id:         context.story_id         || null,
      brand_profile_id: context.brand_profile_id || null,
      workspace_id:     context.workspace_id     || null,
      error_type:    "provider_error",
      error_message: e?.message || String(e),
      duration_ms,
      ...gateway.logFields,
    });
    throw e;
  }
}

export async function runPromptStream({
  type,
  params = {},
  context = {},
  maxTokens,
  model,
  onChunk,
}) {
  let prompt, mod = null;

  if (PASSTHROUGH_TYPES.has(type)) {
    prompt = params.prompt;
    if (!prompt) throw new Error(`runPromptStream: "${type}" requires params.prompt`);
  } else {
    mod = REGISTRY[type];
    if (!mod) throw new Error(`runPromptStream: unknown type "${type}"`);
    prompt = mod.build(params);
  }

  const defaults = mod?.defaults || {};
  const gateway = await prepareGatewayPromptCall({
    type,
    prompt,
    context,
    maxTokens: maxTokens ?? defaults.maxTokens,
    model: model ?? defaults.model,
    stream: true,
  });

  const t0 = Date.now();

  try {
    const { text, usage, model: modelId } = await callClaudeStreamRaw(
      gateway.prompt, gateway.maxTokens, onChunk, gateway.model
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
      ...gateway.logFields,
    });

    return { text, usage, model: modelId, ai_call_id, gateway: gateway.metadata };
  } catch (e) {
    const duration_ms = Date.now() - t0;
    await logAiCallError({
      type,
      model_version: gateway.model,
      story_id:         context.story_id         || null,
      brand_profile_id: context.brand_profile_id || null,
      workspace_id:     context.workspace_id     || null,
      error_type:    "provider_error",
      error_message: e?.message || String(e),
      duration_ms,
      ...gateway.logFields,
    });
    throw e;
  }
}

export { logAiCall, logAiCallError, getAiCalls, getStoryCost } from "./audit";
export { estimateCost, formatCost } from "./costs";
