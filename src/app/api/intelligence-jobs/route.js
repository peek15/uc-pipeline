import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { enqueueIntelligenceJob, listIntelligenceJobs, processIntelligenceJobs } from "@/lib/intelligenceJobs";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace_id");
  const brandProfileId = url.searchParams.get("brand_profile_id");
  const sessionId = url.searchParams.get("session_id");
  const status = url.searchParams.get("status");
  const limit = Number(url.searchParams.get("limit") || 25);
  if (!workspaceId) return err("Missing workspace_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  return ok(await listIntelligenceJobs({
    svc,
    workspaceId,
    brandProfileId,
    sessionId,
    status,
    limit,
  }));
}

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const {
    action = "enqueue",
    workspace_id: workspaceId,
    brand_profile_id: brandProfileId = null,
    session_id: sessionId = null,
    job_type: jobType = "generic",
    input_json: input = {},
    priority = 5,
    max_attempts: maxAttempts = 3,
    limit = 3,
  } = body || {};
  if (!workspaceId) return err("Missing workspace_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  if (action === "process") {
    return ok(await processIntelligenceJobs({
      svc,
      workspaceId,
      sessionId,
      workerId: `api:${user.id}`,
      limit,
    }));
  }

  if (action !== "enqueue") return err(`Unknown action: ${action}`);

  return ok(await enqueueIntelligenceJob({
    svc,
    workspaceId,
    brandProfileId,
    sessionId,
    userId: user.id,
    jobType,
    input,
    priority,
    maxAttempts,
    metadata: { requested_via: "api/intelligence-jobs" },
  }));
}

