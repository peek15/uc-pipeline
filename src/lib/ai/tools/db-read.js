// ═══════════════════════════════════════════════════════════
// tools/db-read.js — Workspace-scoped read-only DB access for agents.
// STUB — Option B. Not yet wired to runAgent.
// ═══════════════════════════════════════════════════════════

/**
 * Read-only scoped DB access tool.
 *
 * @param {object} args
 * @param {string} args.workspace_id
 * @param {string} args.table         — whitelisted: stories, scripts, performance_snapshots
 * @param {object} [args.filter]
 * @returns {Promise<any[]>}
 */
export async function dbRead(/* args */) {
  throw new Error("tools/db-read: not implemented");
}

export const TOOL_SCHEMA = {
  name: "db_read",
  description: "Read rows from whitelisted tables, scoped to current workspace.",
  input_schema: {
    type: "object",
    properties: {
      table:  { type: "string", enum: ["stories", "scripts", "performance_snapshots"] },
      filter: { type: "object" },
    },
    required: ["table"],
  },
};
