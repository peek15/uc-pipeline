// ═══════════════════════════════════════════════════════════
// agent-runner.js — Option B scaffold. NOT IMPLEMENTED.
//
// Purpose: when intelligence stages activate, specialist agents
// plug in here. Each agent has:
//   - a system prompt
//   - a set of tools it may call (from ./tools/)
//   - a max iteration count
//   - read-only access to data; writes go to `insights` table only
//
// Planned agents:
//   error-analyst         reads audit_log + ai_calls on failures
//   feedback-processor    reads client_feedback → brand weight deltas
//   intelligence-analyst  reads performance_snapshots for Analyze tab (Stage 2+)
//   reach-researcher      web search + trends → reach_score suggestion
//
// Activation triggers in intelligence-layer-reference.md.
// ═══════════════════════════════════════════════════════════

/**
 * Run an agent loop. NOT IMPLEMENTED in v3.7.0.
 *
 * @param {object} opts
 * @param {string} opts.agent_name         — e.g. "error-analyst"
 * @param {string} [opts.brand_profile_id]
 * @param {object} [opts.context]
 * @param {string[]}[opts.tools]           — tool names from ./tools/
 * @param {number}[opts.max_iterations]
 * @throws {Error} always — Option B not activated yet
 */
export async function runAgent(/* opts */) {
  throw new Error(
    "agent-runner not implemented — Option B agents not activated. " +
    "Scaffolded for future intelligence stages. See intelligence-layer-reference.md"
  );
}

// Placeholder registry — will be populated as agents are built.
export const AGENTS = {};
