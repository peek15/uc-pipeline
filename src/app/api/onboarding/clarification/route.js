import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const { workspace_id: workspaceId, session_id: sessionId, answers = {} } = body || {};
  if (!workspaceId || !sessionId) return err("Missing workspace_id or session_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const { data: rows, error } = await svc
    .from("onboarding_clarifications")
    .select("id,question")
    .eq("session_id", sessionId)
    .eq("status", "pending");
  if (error) return err(error.message, 500);

  for (const row of rows || []) {
    if (!(row.id in answers)) continue;
    await svc
      .from("onboarding_clarifications")
      .update({ answer: answers[row.id], status: "answered", updated_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  const { count } = await svc
    .from("onboarding_clarifications")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("status", "pending")
    .eq("required", true);

  const status = count ? "needs_clarification" : "draft_ready";
  await svc
    .from("onboarding_sessions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId);

  return ok({ status });
}
