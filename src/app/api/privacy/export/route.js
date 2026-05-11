import { getAuthenticatedUser, makeServiceClient, requireWorkspaceOwnerOrAdmin } from "@/lib/apiAuth";
import { buildWorkspaceExportManifest } from "@/lib/privacy/dataLifecycle";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);
  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const { workspace_id: workspaceId, brand_profile_id: brandProfileId = null } = body || {};
  if (!workspaceId) return err("Missing workspace_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceOwnerOrAdmin(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const manifest = buildWorkspaceExportManifest({
    workspaceId,
    brandProfileId,
    requestedBy: user.id,
  });

  await svc.from("privacy_requests").insert({
    workspace_id: workspaceId,
    brand_profile_id: brandProfileId,
    request_type: "export",
    status: "requested",
    requested_by: user.id,
    metadata_json: { manifest },
  }).then(() => {});

  return ok({
    manifest,
    status: "requested",
    note: "Sprint 7 creates a safe export manifest and request record. Full archive generation is intentionally deferred.",
  });
}
