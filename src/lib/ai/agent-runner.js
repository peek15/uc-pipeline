// ═══════════════════════════════════════════════════════════
// agent-runner.js — Dispatcher for all production agents.
//
// v3.8.0: real implementation (replaces v3.7 stub).
//
// Each agent file in ./agents/ exports:
//   AGENT_NAME       — string id
//   defaults         — { maxTokens, model }
//   run(opts)        — returns { ...output, confidence, ai_call_id }
//   recordFeedback() — logs user decision back to agent_feedback
//
// runAgent() is a thin dispatcher. It does NOT make decisions about
// confidence gating — that's the view's job (the user-facing logic
// changes per stage, while agents are stable).
// ═══════════════════════════════════════════════════════════

import * as briefAuthor   from "./agents/brief-author";
import * as assetCurator  from "./agents/asset-curator";

const REGISTRY = {
  [briefAuthor.AGENT_NAME]:  briefAuthor,
  [assetCurator.AGENT_NAME]: assetCurator,
  // Future: visual-ranker, voice-producer, assembly-author
};

/**
 * Run an agent by name.
 *
 * @param {object} opts
 * @param {string} opts.agent_name
 * @param {object} opts.params  — agent-specific params
 * @returns {Promise<object>}
 */
export async function runAgent({ agent_name, params = {} }) {
  const mod = REGISTRY[agent_name];
  if (!mod) throw new Error(`runAgent: unknown agent "${agent_name}"`);
  if (typeof mod.run !== "function") throw new Error(`runAgent: "${agent_name}" has no run()`);
  return mod.run(params);
}

/**
 * Record user feedback for an agent.
 */
export async function recordAgentFeedback({ agent_name, ...rest }) {
  const mod = REGISTRY[agent_name];
  if (!mod || typeof mod.recordFeedback !== "function") return null;
  return mod.recordFeedback(rest);
}

/**
 * List of registered agents — useful for Settings UI later.
 */
export const AGENTS = Object.keys(REGISTRY);
