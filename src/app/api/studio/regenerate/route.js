import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { runPrompt } from "@/lib/ai/runner";
import { brandConfigForPrompt } from "@/lib/brandConfig";
import { deriveBlocksFromScript } from "@/lib/studio/deriveBlocks";

function ok(payload) { return Response.json(payload); }
function err(msg, status = 400) { return Response.json({ error: msg }, { status }); }

// POST: regenerate script from revision instructions, save to story, replace version blocks.
export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const {
    workspace_id: workspaceId,
    story_id: storyId,
    version_id: versionId,
    revision_ids: revisionIds,
  } = body || {};
  if (!workspaceId || !storyId || !versionId) return err("Missing workspace_id, story_id, or version_id");
  if (!Array.isArray(revisionIds) || !revisionIds.length) return err("revision_ids must be a non-empty array");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  // Load story
  const { data: story } = await svc
    .from("stories")
    .select("script, scripts, brand_profile_id, angle, title, players, era, objective, audience, channel, content_type, deliverable_type, content_template_id")
    .eq("id", storyId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const currentScript =
    (story?.scripts && typeof story.scripts === "object" ? story.scripts["en"] : null) ||
    story?.script || "";
  if (!currentScript) return err("No script found — generate a script in Create first", 400);

  // Load the specified revisions
  const { data: revRows } = await svc
    .from("edit_requests")
    .select("id, draft_instruction, user_comment")
    .in("id", revisionIds)
    .eq("workspace_id", workspaceId);
  const revisions = revRows || [];
  if (!revisions.length) return err("No matching revisions found", 400);

  // Load brand config
  let brandConfig = null;
  if (story?.brand_profile_id) {
    const { data: bp } = await svc
      .from("brand_profiles")
      .select("settings")
      .eq("id", story.brand_profile_id)
      .maybeSingle();
    if (bp?.settings) brandConfig = brandConfigForPrompt(bp.settings);
  }

  // Build combined revision instruction
  const instruction = revisions.length === 1
    ? (revisions[0].draft_instruction || revisions[0].user_comment)
    : revisions.map((r, i) => `${i + 1}. ${r.draft_instruction || r.user_comment}`).join("\n");

  // Call AI to revise the script
  const result = await runPrompt({
    type: "generate-script",
    params: { story, brand_config: brandConfig, instruction, current_script: currentScript },
    context: {
      story_id: storyId,
      workspace_id: workspaceId,
      brand_profile_id: story?.brand_profile_id || null,
      task_type: "rewrite_script",
    },
  }).catch(e => ({ error: e.message }));

  if (result.error) return err(`Regeneration failed: ${result.error}`, 500);
  const newScript = result.text?.trim();
  if (!newScript) return err("AI returned an empty script", 500);

  // Save new script to story
  const existingScripts = (story?.scripts && typeof story.scripts === "object") ? story.scripts : {};
  await svc
    .from("stories")
    .update({ script: newScript, scripts: { ...existingScripts, en: newScript } })
    .eq("id", storyId)
    .eq("workspace_id", workspaceId);

  // Replace blocks for this version with blocks derived from the new script
  await svc.from("studio_blocks").delete().eq("version_id", versionId).eq("workspace_id", workspaceId);

  let newBlocks = [];
  const derived = deriveBlocksFromScript(newScript);
  if (derived?.length) {
    const seedRows = derived.map(b => ({
      story_id: storyId,
      version_id: versionId,
      workspace_id: workspaceId,
      ...b,
    }));
    const { data: seeded } = await svc.from("studio_blocks").insert(seedRows).select("*");
    newBlocks = seeded || seedRows;
  }

  // Mark revisions as applied
  await svc
    .from("edit_requests")
    .update({ status: "applied", updated_at: new Date().toISOString() })
    .in("id", revisionIds)
    .eq("workspace_id", workspaceId);

  return ok({ script: newScript, blocks: newBlocks, version_id: versionId });
}
