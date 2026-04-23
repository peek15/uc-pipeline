// ═══════════════════════════════════════════════════════════
// tools/web-search.js — Web search for reach-researcher agent.
// STUB — Option B. Will back reach_score with real trend data.
// ═══════════════════════════════════════════════════════════

export async function webSearch(/* args */) {
  throw new Error("tools/web-search: not implemented");
}

export const TOOL_SCHEMA = {
  name: "web_search",
  description: "Search the web for current news, trending topics, and name-recognition signals.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      max_results: { type: "integer", maximum: 10 },
    },
    required: ["query"],
  },
};
