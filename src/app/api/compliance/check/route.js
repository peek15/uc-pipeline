import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { auditContentCompliance } from "@/lib/compliance";
import { summarizeError } from "@/lib/privacy/safeLogging";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const { workspace_id: workspaceId, brand_profile_id: brandProfileId = null, story_id: storyId, require_asset_rights = false } = body || {};
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
  if (brandProfileId && story.brand_profile_id && story.brand_profile_id !== brandProfileId) {
    return err("Content item does not belong to this brand", 403);
  }

  let settings = {};
  const effectiveBrandId = brandProfileId || story.brand_profile_id;
  if (effectiveBrandId) {
    const { data: brand } = await svc
      .from("brand_profiles")
      .select("name,settings,brief_doc")
      .eq("id", effectiveBrandId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    settings = parseSettings(brand?.settings || brand?.brief_doc);
    if (brand?.name && !settings.brand?.name) settings = { ...settings, brand: { ...(settings.brand || {}), name: brand.name } };
  }

  try {
    const result = auditContentCompliance({ story, settings, requireAssetRights: require_asset_rights });
    const { data: check, error: insertErr } = await svc
      .from("content_compliance_checks")
      .insert({
        workspace_id: workspaceId,
        brand_profile_id: effectiveBrandId,
        story_id: storyId,
        check_type: result.check_type,
        status: result.status,
        risk_score: result.risk_score,
        risk_level: result.risk_level,
        warnings: result.warnings,
        summary: result.summary,
        checked_by: result.checked_by,
        provider: result.provider,
        model: result.model,
        created_by: user.id,
      })
      .select("*")
      .single();
    if (insertErr) return err(insertErr.message, 500);

    await svc.from("content_audit_events").insert({
      workspace_id: workspaceId,
      brand_profile_id: effectiveBrandId,
      story_id: storyId,
      event_type: "compliance_check_created",
      actor_user_id: user.id,
      actor_type: "system",
      metadata_json: {
        check_id: check.id,
        status: check.status,
        risk_level: check.risk_level,
        warning_count: result.warnings.length,
        rule_engine: result.metadata?.rule_engine,
      },
    }).then(() => {});

    return ok({ check, ...result });
  } catch (error) {
    return err(summarizeError(error).error_message || "Compliance check failed", 500);
  }
}

function parseSettings(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}
