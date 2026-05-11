import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember, requireWorkspaceOwnerOrAdmin } from "@/lib/apiAuth";
import { normalizeDataClass, normalizePrivacyMode } from "@/lib/privacy/privacyTypes";
import { providerTransparencyRows } from "@/lib/privacy/subprocessors";

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

  const { data: workspace } = await svc.from("workspaces").select("privacy_mode").eq("id", workspaceId).maybeSingle();
  let brand = null;
  if (brandProfileId) {
    const { data } = await svc
      .from("brand_profiles")
      .select("default_data_class")
      .eq("id", brandProfileId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    brand = data;
  }

  return ok({
    privacy_mode: normalizePrivacyMode(workspace?.privacy_mode),
    default_data_class: normalizeDataClass(brand?.default_data_class),
    can_manage: ["owner", "admin"].includes(member.role),
    providers: providerTransparencyRows(),
  });
}

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);
  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const { workspace_id: workspaceId, brand_profile_id: brandProfileId, privacy_mode, default_data_class } = body || {};
  if (!workspaceId) return err("Missing workspace_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceOwnerOrAdmin(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const normalizedMode = normalizePrivacyMode(privacy_mode);
  const { error: wErr } = await svc
    .from("workspaces")
    .update({ privacy_mode: normalizedMode, updated_at: new Date().toISOString() })
    .eq("id", workspaceId);
  if (wErr) return err(wErr.message, 500);

  const normalizedClass = normalizeDataClass(default_data_class);
  if (brandProfileId) {
    const { error: bErr } = await svc
      .from("brand_profiles")
      .update({ default_data_class: normalizedClass, updated_at: new Date().toISOString() })
      .eq("id", brandProfileId)
      .eq("workspace_id", workspaceId);
    if (bErr) return err(bErr.message, 500);
  }

  return ok({ privacy_mode: normalizedMode, default_data_class: normalizedClass });
}
