import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { getMockBlocks } from "@/components/studio/studioMockData";
import { deriveBlocksFromStory } from "@/lib/studio/deriveBlocks";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

// GET: load or create studio session (current version + blocks + version history)
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

  // Fetch story upfront — needed for brand_profile_id and script derivation
  const { data: story } = await svc
    .from("stories")
    .select("brand_profile_id, script, scripts, metadata, status, title, angle")
    .eq("id", storyId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  // Load all versions (descending)
  const { data: allVersions, error: vErr } = await svc
    .from("content_versions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("story_id", storyId)
    .order("version_number", { ascending: false });
  if (vErr) return err(vErr.message, 500);

  let currentVersion = allVersions?.[0] || null;

  if (!currentVersion) {
    const { data: created, error: cErr } = await svc
      .from("content_versions")
      .insert({
        story_id: storyId,
        workspace_id: workspaceId,
        brand_profile_id: story?.brand_profile_id || null,
        version_number: 1,
        label: "V1",
        status: "review",
        note: "Created from initial generation",
        generation_source: "initial",
        created_by: user.id,
      })
      .select("*")
      .single();
    if (cErr) return err(cErr.message, 500);
    currentVersion = created;
    allVersions?.unshift(currentVersion);
  }

  // Load blocks for current version
  const { data: existingBlocks, error: bErr } = await svc
    .from("studio_blocks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("story_id", storyId)
    .eq("version_id", currentVersion.id)
    .order("position", { ascending: true });
  if (bErr) return err(bErr.message, 500);

  let blocks = existingBlocks || [];
  if (!blocks.length) {
    // Try to derive blocks from the story's script; fall back to mock blocks
    const derived = deriveBlocksFromStory(story);
    const seedRows = derived
      ? derived.map(b => ({ story_id: storyId, version_id: currentVersion.id, workspace_id: workspaceId, ...b }))
      : getMockBlocks().map((b, i) => ({
          story_id: storyId,
          version_id: currentVersion.id,
          workspace_id: workspaceId,
          position: i,
          label: b.label,
          start_tc: b.start,
          end_tc: b.end,
          source_type: b.sourceType,
          editable: b.editable,
          locked_reason: b.lockedReason,
          status: b.status || "ok",
          metadata_json: { derived_from: "mock" },
        }));

    const { data: seeded } = await svc.from("studio_blocks").insert(seedRows).select("*");
    blocks = seeded || seedRows;
  }

  return ok({
    version: currentVersion,
    blocks,
    all_versions: allVersions || [currentVersion],
  });
}

// POST: create a new version (increments version_number, copies blocks as placeholder)
export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const { workspace_id: workspaceId, story_id: storyId, note } = body || {};
  if (!workspaceId || !storyId) return err("Missing workspace_id or story_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  // Get highest version number
  const { data: latest } = await svc
    .from("content_versions")
    .select("version_number,id")
    .eq("workspace_id", workspaceId)
    .eq("story_id", storyId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextNum = (latest?.version_number || 0) + 1;

  // Mark previous version superseded
  if (latest?.id) {
    await svc
      .from("content_versions")
      .update({ status: "superseded", updated_at: new Date().toISOString() })
      .eq("id", latest.id)
      .eq("workspace_id", workspaceId);
  }

  const { data: story } = await svc
    .from("stories")
    .select("brand_profile_id")
    .eq("id", storyId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const { data: newVersion, error: nErr } = await svc
    .from("content_versions")
    .insert({
      story_id: storyId,
      workspace_id: workspaceId,
      brand_profile_id: story?.brand_profile_id || null,
      version_number: nextNum,
      label: `V${nextNum}`,
      status: "review",
      note: note || `Version ${nextNum}`,
      generation_source: "regenerated",
      created_by: user.id,
    })
    .select("*")
    .single();
  if (nErr) return err(nErr.message, 500);

  // Copy blocks from previous version as placeholder (regenerate will replace them)
  if (latest?.id) {
    const { data: prevBlocks } = await svc
      .from("studio_blocks")
      .select("*")
      .eq("version_id", latest.id)
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: true });

    if (prevBlocks?.length) {
      await svc.from("studio_blocks").insert(
        prevBlocks.map(b => ({
          story_id: b.story_id,
          version_id: newVersion.id,
          workspace_id: workspaceId,
          position: b.position,
          label: b.label,
          start_tc: b.start_tc,
          end_tc: b.end_tc,
          source_type: b.source_type,
          editable: b.editable,
          locked_reason: b.locked_reason,
          status: b.status,
          metadata_json: b.metadata_json || {},
        }))
      );
    }
  }

  return ok({ version: newVersion });
}
