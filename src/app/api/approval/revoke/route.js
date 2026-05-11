import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const { workspace_id: workspaceId, story_id: storyId, approval_id: approvalId = null } = body || {};
  if (!workspaceId || !storyId) return err("Missing workspace_id or story_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  let query = svc
    .from("content_approvals")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("story_id", storyId)
    .eq("approval_status", "approved")
    .order("approved_at", { ascending: false })
    .limit(1);
  if (approvalId) query = query.eq("id", approvalId);
  const { data: approvals, error: lookupErr } = await query;
  if (lookupErr) return err(lookupErr.message, 500);
  const approval = approvals?.[0];
  if (!approval) return err("Approved content record not found", 404);

  const now = new Date().toISOString();
  const { data: revoked, error: updateErr } = await svc
    .from("content_approvals")
    .update({
      approval_status: "revoked",
      approval_metadata: {
        ...(approval.approval_metadata || {}),
        revoked_by: user.id,
        revoked_by_role: member.role,
        revoked_at: now,
      },
    })
    .eq("id", approval.id)
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();
  if (updateErr) return err(updateErr.message, 500);

  await svc.from("content_audit_events").insert({
    workspace_id: workspaceId,
    brand_profile_id: approval.brand_profile_id,
    story_id: storyId,
    event_type: "content_approval_revoked",
    actor_user_id: user.id,
    actor_type: "user",
    metadata_json: { approval_id: approval.id },
  }).then(() => {});

  return ok({ approval: revoked, approval_status: "revoked" });
}

