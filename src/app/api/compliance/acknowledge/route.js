import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { ACKNOWLEDGEMENT_TEXT } from "@/lib/compliance";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const {
    workspace_id: workspaceId,
    compliance_check_id: checkId,
    story_id: storyId,
    acknowledgement_text: acknowledgementText = ACKNOWLEDGEMENT_TEXT,
  } = body || {};
  if (!workspaceId || !checkId || !storyId) return err("Missing workspace_id, compliance_check_id, or story_id");
  if (acknowledgementText !== ACKNOWLEDGEMENT_TEXT) return err("Acknowledgement text does not match current requirement");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const { data: check, error: checkErr } = await svc
    .from("content_compliance_checks")
    .select("*")
    .eq("id", checkId)
    .eq("workspace_id", workspaceId)
    .eq("story_id", storyId)
    .maybeSingle();
  if (checkErr) return err(checkErr.message, 500);
  if (!check) return err("Compliance check not found", 404);
  if (check.status === "blocked") return err("Blocked content cannot be acknowledged for approval", 409);

  const now = new Date().toISOString();
  const { data: acknowledgement, error: approvalErr } = await svc
    .from("content_approvals")
    .insert({
      workspace_id: workspaceId,
      brand_profile_id: check.brand_profile_id,
      story_id: storyId,
      approval_status: "pending",
      acknowledgement_text: acknowledgementText,
      warnings_at_approval: check.warnings || [],
      approval_metadata: {
        acknowledged_by: user.id,
        acknowledged_at: now,
        compliance_check_id: checkId,
        acknowledgement_only: true,
      },
    })
    .select("*")
    .single();
  if (approvalErr) return err(approvalErr.message, 500);

  await svc.from("content_audit_events").insert({
    workspace_id: workspaceId,
    brand_profile_id: check.brand_profile_id,
    story_id: storyId,
    event_type: "compliance_warning_acknowledged",
    actor_user_id: user.id,
    actor_type: "user",
    metadata_json: {
      compliance_check_id: checkId,
      acknowledgement_id: acknowledgement.id,
      warning_count: Array.isArray(check.warnings) ? check.warnings.length : 0,
    },
  }).then(() => {});

  return ok({ acknowledgement, acknowledged: true });
}

