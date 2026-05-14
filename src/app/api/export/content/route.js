import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { buildExportPackage, canExport } from "@/lib/compliance";
import { logWorkflowOutcomeSnapshot } from "@/lib/performance";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const { workspace_id: workspaceId, story_id: storyId, export_type: exportType = "copy_package" } = body || {};
  if (!workspaceId || !storyId) return err("Missing workspace_id or story_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const { data: story, error: storyErr } = await svc
    .from("stories")
    .select("*")
    .eq("id", storyId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (storyErr) return err(storyErr.message, 500);
  if (!story) return err("Content item not found in this workspace", 404);

  const { data: checks } = await svc
    .from("content_compliance_checks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("story_id", storyId)
    .order("created_at", { ascending: false })
    .limit(1);
  const check = checks?.[0] || null;

  const { data: approvals } = await svc
    .from("content_approvals")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("story_id", storyId)
    .eq("approval_status", "approved")
    .order("approved_at", { ascending: false })
    .limit(1);
  const approval = approvals?.[0] || null;

  const readiness = canExport({ approval, exportType, check });
  if (!readiness.ok) return err(readiness.reason, 409);

  let settings = {};
  if (story.brand_profile_id) {
    const { data: brand } = await svc
      .from("brand_profiles")
      .select("name,settings,brief_doc")
      .eq("id", story.brand_profile_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    settings = parseSettings(brand?.settings || brand?.brief_doc);
    if (brand?.name && !settings.brand?.name) settings = { ...settings, brand: { ...(settings.brand || {}), name: brand.name } };
  }

  const payload = buildExportPackage({ story, settings, complianceCheck: check, approval, exportType });
  const now = new Date().toISOString();
  const { data: exported, error: exportErr } = await svc
    .from("content_exports")
    .insert({
      workspace_id: workspaceId,
      brand_profile_id: story.brand_profile_id,
      story_id: storyId,
      export_type: exportType,
      export_status: "exported",
      exported_by: user.id,
      exported_at: now,
      export_payload: payload,
      compliance_check_id: check?.id || null,
      approval_id: approval?.id || null,
    })
    .select("*")
    .single();
  if (exportErr) return err(exportErr.message, 500);

  await svc.from("content_audit_events").insert({
    workspace_id: workspaceId,
    brand_profile_id: story.brand_profile_id,
    story_id: storyId,
    event_type: "content_exported",
    actor_user_id: user.id,
    actor_type: "user",
    metadata_json: {
      export_id: exported.id,
      export_type: exportType,
      compliance_check_id: check?.id || null,
      approval_id: approval?.id || null,
    },
  }).then(() => {});

  logWorkflowOutcomeSnapshot({ svc, story, tenant: { workspace_id: workspaceId, brand_profile_id: story.brand_profile_id }, stage: "exported", actorId: user.id }).catch(() => {});

  return ok({ export: exported, export_payload: payload });
}

function parseSettings(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

