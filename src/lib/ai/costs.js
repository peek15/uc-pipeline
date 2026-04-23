// ═══════════════════════════════════════════════════════════
// costs.js — Anthropic API pricing, single source of truth
// Verified April 2026
// Prices in USD per 1M tokens
// ═══════════════════════════════════════════════════════════

const PRICING = {
  // Current generation (April 2026)
  "claude-haiku-4-5":            { input: 1.00, output:  5.00 },
  "claude-haiku-4-5-20251001":   { input: 1.00, output:  5.00 },
  "claude-sonnet-4-6":           { input: 3.00, output: 15.00 },
  "claude-opus-4-6":             { input: 5.00, output: 25.00 },
  "claude-opus-4-7":             { input: 5.00, output: 25.00 },

  // Short-name fallbacks (matches MODEL_MAP in /api/claude/route.js)
  haiku:  { input: 1.00, output:  5.00 },
  sonnet: { input: 3.00, output: 15.00 },
  opus:   { input: 5.00, output: 25.00 },
};

const DEFAULT = { input: 3.00, output: 15.00 }; // Sonnet rates — safe fallback

/**
 * Calculate cost in USD for a given model + token usage.
 * Returns 0 if tokens are null/undefined. Returns cost rounded to 6 decimals.
 *
 * @param {string} modelId  — e.g. "claude-haiku-4-5-20251001" or "haiku"
 * @param {number} tokensIn
 * @param {number} tokensOut
 * @returns {number} cost in USD
 */
export function estimateCost(modelId, tokensIn, tokensOut) {
  if (tokensIn == null || tokensOut == null) return 0;
  const rates = PRICING[modelId] || PRICING[String(modelId).toLowerCase()] || DEFAULT;
  const cost = (tokensIn * rates.input + tokensOut * rates.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/**
 * For UI display — returns a human readable cost string.
 * Very small values show as "<$0.001".
 */
export function formatCost(cost) {
  if (!cost || cost < 0.001) return "<$0.001";
  if (cost < 1)    return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export { PRICING };
