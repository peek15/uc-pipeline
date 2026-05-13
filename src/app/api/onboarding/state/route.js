import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";

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

  const { data, error } = await svc
    .from("onboarding_agent_memory")
    .select("payload_json,created_at")
    .eq("workspace_id", workspaceId)
    .eq("session_id", sessionId)
    .eq("event_type", "system")
    .eq("role", "system")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return ok({ state: null, unavailable: true, error: error.message });
  const row = (data || []).find(item => item.payload_json?.state_snapshot);
  return ok({ state: row?.payload_json?.state_snapshot || null, restored_at: row?.created_at || null });
}

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const { workspace_id: workspaceId, brand_profile_id: brandProfileId = null, session_id: sessionId, state = {} } = body || {};
  if (!workspaceId || !sessionId) return err("Missing workspace_id or session_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const { data: session, error: sErr } = await svc
    .from("onboarding_sessions")
    .select("id,workspace_id,brand_profile_id")
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (sErr) return err(sErr.message, 500);
  if (!session) return err("Onboarding session not found", 404);

  const snapshot = sanitizeStateSnapshot(state);
  const { error } = await svc.from("onboarding_agent_memory").insert({
    session_id: sessionId,
    workspace_id: workspaceId,
    brand_profile_id: brandProfileId || session.brand_profile_id || null,
    event_type: "system",
    role: "system",
    content: "Onboarding state snapshot.",
    payload_json: { state_snapshot: snapshot },
    created_by: user.id,
  });
  if (error) return ok({ persisted: false, error: error.message });
  return ok({ persisted: true, state: snapshot });
}

function sanitizeStateSnapshot(state = {}) {
  return {
    phase: safeString(state.phase, 40),
    intake: truncateJson(state.intake, 50000),
    sources: truncateJson(state.sources || [], 30000),
    facts: truncateJson(state.facts || null, 30000),
    confidence: truncateJson(state.confidence || null, 8000),
    clarifications: truncateJson(state.clarifications || [], 30000),
    answers: truncateJson(state.answers || {}, 20000),
    draft: truncateJson(state.draft || null, 80000),
    limitations: truncateJson(state.limitations || [], 12000),
    setupBrief: truncateJson(state.setupBrief || null, 60000),
    suggestedReplies: truncateJson(state.suggestedReplies || [], 12000),
  };
}

function safeString(value, limit) {
  return String(value || "").slice(0, limit);
}

function truncateJson(value, limit) {
  const text = JSON.stringify(value ?? null);
  if (text.length <= limit) return value;
  return shrinkJsonValue(value, Math.max(1200, Math.floor(limit / 8)));
}

function shrinkJsonValue(value, stringLimit) {
  if (value == null) return value;
  if (typeof value === "string") return value.slice(0, stringLimit);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 24).map(item => shrinkJsonValue(item, stringLimit));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 80).map(([key, item]) => [key, shrinkJsonValue(item, stringLimit)]));
  }
  return null;
}
