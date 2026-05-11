import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { ONBOARDING_MODES } from "@/lib/onboarding";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace_id");
  const brandProfileId = url.searchParams.get("brand_profile_id");
  if (!workspaceId) return err("Missing workspace_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  let query = svc
    .from("onboarding_sessions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (brandProfileId) query = query.eq("brand_profile_id", brandProfileId);

  const { data, error } = await query;
  if (error) return err(error.message, 500);
  return ok({ sessions: data || [] });
}

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const workspaceId = body?.workspace_id;
  const brandProfileId = body?.brand_profile_id || null;
  const mode = ONBOARDING_MODES.includes(body?.mode) ? body.mode : "workspace_setup";
  if (!workspaceId) return err("Missing workspace_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const { data, error } = await svc
    .from("onboarding_sessions")
    .insert({
      workspace_id: workspaceId,
      brand_profile_id: brandProfileId,
      mode,
      status: "collecting_sources",
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error) return err(error.message, 500);
  return ok({ session: data });
}
