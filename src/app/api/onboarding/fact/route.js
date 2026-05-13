import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";

const STATUSES = new Set(["inferred", "confirmed", "edited", "rejected", "unsure"]);

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace_id");
  const sessionId = url.searchParams.get("session_id");
  if (!workspaceId || !sessionId) return err("Missing workspace_id or session_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const { data: session, error: sErr } = await svc
    .from("onboarding_sessions")
    .select("id,workspace_id")
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (sErr) return err(sErr.message, 500);
  if (!session) return err("Onboarding session not found", 404);

  const { data, error } = await svc
    .from("onboarding_extracted_facts")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });
  if (error) return ok({ facts: {}, unavailable: true, error: error.message });

  return ok({ facts: latestFactsByKey(data || []) });
}

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const {
    workspace_id: workspaceId,
    session_id: sessionId,
    field_key: fieldKey,
    value = null,
    status = "confirmed",
    source_refs = [],
    note = "",
  } = body || {};
  if (!workspaceId || !sessionId || !fieldKey) return err("Missing workspace_id, session_id, or field_key");
  if (!STATUSES.has(status)) return err("Invalid fact status");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const { data: session, error: sErr } = await svc
    .from("onboarding_sessions")
    .select("id,workspace_id")
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (sErr) return err(sErr.message, 500);
  if (!session) return err("Onboarding session not found", 404);

  const row = {
    session_id: sessionId,
    field_key: fieldKey,
    value,
    confidence: status === "confirmed" || status === "edited" ? "high" : status === "rejected" ? "low" : "medium",
    source_ids: source_refs,
    accepted_by_user: status === "confirmed" || status === "edited",
    status,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    metadata_json: { note, source_refs },
  };

  const { data, error } = await svc
    .from("onboarding_extracted_facts")
    .insert(row)
    .select("*")
    .single();
  if (error) return err(error.message, 500);

  return ok({ fact: data });
}

function latestFactsByKey(rows) {
  const facts = {};
  for (const row of rows) {
    if (!row.field_key || facts[row.field_key]) continue;
    facts[row.field_key] = row;
  }
  return facts;
}
