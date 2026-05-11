import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { mergeDraftIntoSettings } from "@/lib/onboarding";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const { workspace_id: workspaceId, brand_profile_id: brandProfileId, session_id: sessionId, draft } = body || {};
  if (!workspaceId || !brandProfileId || !sessionId || !draft) return err("Missing approval fields");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const { data: profile, error: pErr } = await svc
    .from("brand_profiles")
    .select("id,workspace_id,name,settings,brief_doc")
    .eq("id", brandProfileId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (pErr) return err(pErr.message, 500);
  if (!profile) return err("Brand profile not found", 404);

  const current = parseSettings(profile.settings || profile.brief_doc);
  const next = mergeDraftIntoSettings(current, draft);
  const name = next.brand?.name || profile.name || "Brand";

  const { data: saved, error: saveErr } = await svc
    .from("brand_profiles")
    .update({
      name,
      settings: next,
      brief_doc: JSON.stringify(next),
      updated_at: new Date().toISOString(),
    })
    .eq("id", brandProfileId)
    .eq("workspace_id", workspaceId)
    .select("id,workspace_id,name,settings,brief_doc,updated_at")
    .single();
  if (saveErr) return err(saveErr.message, 500);

  const now = new Date().toISOString();
  await svc
    .from("onboarding_sessions")
    .update({ status: "approved", approved_at: now, updated_at: now })
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId);

  await svc
    .from("onboarding_drafts")
    .update({ status: "approved", updated_at: now })
    .eq("session_id", sessionId)
    .eq("status", "draft");

  return ok({ profile: saved, settings: next });
}

function parseSettings(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}
