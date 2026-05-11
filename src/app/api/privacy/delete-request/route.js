import { getAuthenticatedUser, makeServiceClient, requireWorkspaceOwnerOrAdmin } from "@/lib/apiAuth";
import { markBrandDataForDeletion, markWorkspaceForDeletion } from "@/lib/privacy/dataLifecycle";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);
  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const { workspace_id: workspaceId, brand_profile_id: brandProfileId = null, scope = "brand" } = body || {};
  if (!workspaceId) return err("Missing workspace_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceOwnerOrAdmin(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const requestType = scope === "workspace" ? "delete_workspace" : "delete_brand";
  const marker = scope === "workspace"
    ? markWorkspaceForDeletion({ workspaceId, requestedBy: user.id })
    : markBrandDataForDeletion({ workspaceId, brandProfileId, requestedBy: user.id });

  await svc.from("privacy_requests").insert({
    workspace_id: workspaceId,
    brand_profile_id: brandProfileId,
    request_type: requestType,
    status: "requested",
    requested_by: user.id,
    metadata_json: { marker, safeguard: "No destructive deletion is performed by this route." },
  }).then(() => {});

  return ok({
    status: "requested",
    marker,
    note: "Deletion is marked/requested only. Actual destructive deletion requires a separate reviewed job.",
  });
}
