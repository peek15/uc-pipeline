import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/db";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

// GET: list edit_requests for a story
export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspace_id");
  const storyId = searchParams.get("story_id");
  if (!workspaceId || !storyId) return err("Missing workspace_id or story_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const { data: revisions, error: rErr } = await svc
    .from("edit_requests")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("story_id", storyId)
    .not("status", "eq", "rejected")
    .order("created_at", { ascending: false });
  if (rErr) return err(rErr.message, 500);

  return ok({ revisions: revisions || [] });
}

// POST: create a new edit_request
export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const {
    workspace_id: workspaceId,
    story_id: storyId,
    version_id: versionId,
    block_id: blockId,
    brand_profile_id: brandProfileId,
    timecode_start,
    timecode_end,
    subject,
    user_comment,
    draft_instruction,
    block_label,
  } = body || {};
  if (!workspaceId || !storyId || !user_comment) return err("Missing workspace_id, story_id, or user_comment");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const { data: revision, error: rErr } = await svc
    .from("edit_requests")
    .insert({
      workspace_id: workspaceId,
      story_id: storyId,
      version_id: versionId || null,
      block_id: blockId || null,
      brand_profile_id: brandProfileId || null,
      timecode_start: timecode_start || "00:00",
      timecode_end: timecode_end || "00:04",
      subject: subject || null,
      user_comment,
      draft_instruction: draft_instruction || `Review requested: ${user_comment}`,
      status: "pending",
      block_label: block_label || null,
      created_by: user.id,
    })
    .select("*")
    .single();
  if (rErr) return err(rErr.message, 500);

  return ok({ revision });
}

// PATCH: update status of an edit_request
export async function PATCH(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const { id, workspace_id: workspaceId, status } = body || {};
  if (!id || !workspaceId || !status) return err("Missing id, workspace_id, or status");

  const VALID_STATUSES = ["pending", "interpreted", "ready", "queued", "applied", "rejected"];
  if (!VALID_STATUSES.includes(status)) return err(`Invalid status: ${status}`);

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const { data: revision, error: uErr } = await svc
    .from("edit_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();
  if (uErr) return err(uErr.message, 500);

  return ok({ revision });
}

// DELETE: remove an edit_request
export async function DELETE(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const workspaceId = searchParams.get("workspace_id");
  if (!id || !workspaceId) return err("Missing id or workspace_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const { error: dErr } = await svc
    .from("edit_requests")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (dErr) return err(dErr.message, 500);

  return ok({ deleted: true });
}
