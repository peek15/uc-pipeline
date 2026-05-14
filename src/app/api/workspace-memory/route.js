import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { retrieveWorkspaceMemory, writeWorkspaceMemoryBatch } from "@/lib/workspaceMemory";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace_id");
  const brandProfileId = url.searchParams.get("brand_profile_id");
  const limit = Number(url.searchParams.get("limit") || 12);
  if (!workspaceId) return err("Missing workspace_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  return ok(await retrieveWorkspaceMemory({
    svc,
    workspaceId,
    brandProfileId,
    limit,
  }));
}

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const {
    workspace_id: workspaceId,
    brand_profile_id: brandProfileId = null,
    items = [],
  } = body || {};
  if (!workspaceId) return err("Missing workspace_id");
  if (!Array.isArray(items) || !items.length) return err("Missing memory items");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  return ok(await writeWorkspaceMemoryBatch({
    svc,
    workspaceId,
    brandProfileId,
    items: items.map(item => ({
      key: item.key || "manual_memory",
      label: item.label || "Manual memory",
      summary: item.summary || "",
      payload: item.payload || {},
      confidence: item.confidence ?? 0.7,
      status: item.status || "reviewed",
      entity_type: item.entity_type || null,
      entity_id: item.entity_id || null,
    })),
    agentName: "workspace-memory-api",
  }));
}

