import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { canApprove } from "@/lib/compliance";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const { workspace_id: workspaceId, story_id: storyId, compliance_check_id: checkId = null, internal_only = false } = body || {};
  if (!workspaceId || !storyId) return err("Missing workspace_id or story_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const { data: story, error: storyErr } = await svc
    .from("stories")
    .select("id,workspace_id,brand_profile_id,title")
    .eq("id", storyId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (storyErr) return err(storyErr.message, 500);
  if (!story) return err("Content item not found in this workspace", 404);

  let checkQuery = svc
    .from("content_compliance_checks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("story_id", storyId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (checkId) checkQuery = checkQuery.eq("id", checkId);
  const { data: checks, error: checkErr } = await checkQuery;
  if (checkErr) return err(checkErr.message, 500);
  const check = checks?.[0] || null;

  const { data: acknowledgements } = await svc
    .from("content_approvals")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("story_id", storyId)
    .eq("approval_status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);
  const acknowledgement = (acknowledgements || []).find(row =>
    !check || row.approval_metadata?.compliance_check_id === check.id
  );

  const readiness = canApprove({
    check,
    acknowledged: Boolean(acknowledgement?.approval_metadata?.acknowledged_at),
    internalOnly: internal_only,
  });
  if (!readiness.ok) {
    return err(readiness.reason, readiness.reason === "acknowledgement_required" ? 409 : 400);
  }

  const now = new Date().toISOString();
  const row = {
    workspace_id: workspaceId,
    brand_profile_id: story.brand_profile_id,
    story_id: storyId,
    approval_status: "approved",
    approved_by: user.id,
    approved_at: now,
    acknowledgement_text: acknowledgement?.acknowledgement_text || null,
    warnings_at_approval: check?.warnings || [],
    approval_metadata: {
      ...(acknowledgement?.approval_metadata || {}),
      compliance_check_id: check?.id || null,
      approved_by_role: member.role,
      approved_for: internal_only ? "internal_export" : "export",
    },
  };

  let approval;
  let approvalErr;
  if (acknowledgement?.id) {
    const update = await svc
      .from("content_approvals")
      .update(row)
      .eq("id", acknowledgement.id)
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();
    approval = update.data;
    approvalErr = update.error;
  } else {
    const insert = await svc.from("content_approvals").insert(row).select("*").single();
    approval = insert.data;
    approvalErr = insert.error;
  }
  if (approvalErr) return err(approvalErr.message, 500);

  await svc.from("content_audit_events").insert({
    workspace_id: workspaceId,
    brand_profile_id: story.brand_profile_id,
    story_id: storyId,
    event_type: "content_approved_for_export",
    actor_user_id: user.id,
    actor_type: "user",
    metadata_json: {
      approval_id: approval.id,
      compliance_check_id: check?.id || null,
      risk_level: check?.risk_level || null,
    },
  }).then(() => {});

  return ok({ approval, approval_status: "approved" });
}

