// ═══════════════════════════════════════════════════════════
// agent-runner.js — Dispatcher for all production agents.
// v3.11.0 — adds voice-producer + visual-ranker.
// ═══════════════════════════════════════════════════════════

import * as briefAuthor    from "./agents/brief-author";
import * as assetCurator   from "./agents/asset-curator";
import * as voiceProducer  from "./agents/voice-producer";
import * as visualRanker   from "./agents/visual-ranker";
import * as assemblyAuthor from "./agents/assembly-author";

const REGISTRY = {
  [briefAuthor.AGENT_NAME]:    briefAuthor,
  [assetCurator.AGENT_NAME]:   assetCurator,
  [voiceProducer.AGENT_NAME]:  voiceProducer,
  [visualRanker.AGENT_NAME]:   visualRanker,
  [assemblyAuthor.AGENT_NAME]: assemblyAuthor,
};

/**
 * Run an agent by name.
 *
 * @param {object} opts
 * @param {string} opts.agent_name
 * @param {object} opts.params
 * @param {string} [opts.method]  — agent-specific entry point. Defaults to "run".
 *                                  voice-producer supports "runOne", "runAll", "runEnglishOnly"
 * @returns {Promise<object>}
 */
export async function runAgent({ agent_name, params = {}, method = "run" }) {
  const mod = REGISTRY[agent_name];
  if (!mod) throw new Error(`runAgent: unknown agent "${agent_name}"`);
  if (typeof mod[method] !== "function") {
    throw new Error(`runAgent: "${agent_name}" has no ${method}()`);
  }
  return mod[method](params);
}

export async function recordAgentFeedback({ agent_name, ...rest }) {
  const mod = REGISTRY[agent_name];
  if (!mod || typeof mod.recordFeedback !== "function") return null;
  return mod.recordFeedback(rest);
}

// Special exports for agents with multi-method APIs
export const voiceAgent    = voiceProducer;
export const visualAgent   = visualRanker;
export const assemblyAgent = assemblyAuthor;

export const AGENTS = Object.keys(REGISTRY);
