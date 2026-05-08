// Server-only — workspace-scoped read-only access for agents.
// Uses service role to bypass RLS; caller must validate workspace/brand scope.

const ALLOWED_TABLES = new Set(["stories", "performance_snapshots", "intelligence_insights"]);

export async function dbRead({ table, filter = {}, limit = 50, workspace_id, brand_profile_id } = {}) {
  if (!ALLOWED_TABLES.has(table)) throw new Error(`Table not allowed: ${table}`);

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const cap = Math.min(Number(limit) || 50, 100);
  let q = client.from(table).select("*").limit(cap).order("created_at", { ascending: false });

  if (workspace_id)     q = q.eq("workspace_id", workspace_id);
  if (brand_profile_id) q = q.eq("brand_profile_id", brand_profile_id);

  for (const [key, val] of Object.entries(filter || {})) {
    if (val && typeof val === "object") {
      if ("$gt"  in val) q = q.gt(key, val.$gt);
      else if ("$lt"  in val) q = q.lt(key, val.$lt);
      else if ("$gte" in val) q = q.gte(key, val.$gte);
      else if ("$lte" in val) q = q.lte(key, val.$lte);
      else if ("$neq" in val) q = q.neq(key, val.$neq);
    } else {
      q = q.eq(key, val);
    }
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export const TOOL_SCHEMA = {
  name: "db_read",
  description: "Query workspace-scoped data from whitelisted tables (stories, performance_snapshots, intelligence_insights). Use to answer questions about content history, performance data, or intelligence findings.",
  input_schema: {
    type: "object",
    properties: {
      table:  { type: "string", enum: ["stories", "performance_snapshots", "intelligence_insights"] },
      filter: { type: "object", description: "Equality filters. Use {\"$gt\": N}, {\"$lt\": N}, {\"$gte\": N} for comparisons." },
      limit:  { type: "integer", maximum: 100 },
    },
    required: ["table"],
  },
};
