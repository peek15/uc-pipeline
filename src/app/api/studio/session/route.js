import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { getMockBlocks } from "@/components/studio/studioMockData";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

function formatTc(totalSec) {
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Derive studio blocks from a story's script text.
// Splits by paragraph, assigns labels (Hook / Body / CTA) and estimated timecodes
// at ~2.5 words/second voiceover pace. Returns null if no usable script.
function deriveBlocksFromStory(story) {
  const script =
    (story?.scripts && typeof story.scripts === "object" ? story.scripts["en"] : null) ||
    story?.script ||
    "";
  if (!script?.trim()) return null;

  const paragraphs = script.split(/\n\n+/).map(p => p.trim()).filter(p => p.split(/\s+/).length >= 3);
  if (!paragraphs.length) return null;

  const WPS = 2.5;
  let t = 0;

  return paragraphs.map((para, i) => {
    const words = para.split(/\s+/).length;
    const dur = Math.max(3, Math.round(words / WPS));
    const start_tc = formatTc(t);
    t += dur;
    const end_tc = formatTc(t);

    let label;
    if (paragraphs.length === 1) label = "Script";
    else if (i === 0) label = "Hook";
    else if (i === paragraphs.length - 1) label = "CTA";
    else label = paragraphs.length === 3 ? "Body" : `Body ${i}`;

    return {
      position: i,
      label,
      start_tc,
      end_tc,
      source_type: "text",
      editable: true,
      locked_reason: null,
      status: "ok",
      metadata_json: {
        derived_from: "script",
        text: para.substring(0, 600),
        word_count: words,
      },
    };
  });
}

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
      ? derived.map(b => ({
          story_id: storyId,
          version_id: currentVersion.id,
          workspace_id: workspaceId,
          ...b,
        }))
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

// POST: create a new version (increments version_number)
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

  // Copy blocks from previous version into new version
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
