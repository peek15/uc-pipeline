import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { enqueueOnboardingResearchJob, processQueuedOnboardingResearchJobs, runOnboardingResearchJob } from "@/lib/onboardingResearchJobs";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace_id");
  const sessionId = url.searchParams.get("session_id");
  if (!workspaceId || !sessionId) return err("Missing workspace_id or session_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const { data, error } = await svc
    .from("onboarding_research_jobs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) return ok({ jobs: [], unavailable: true, error: error.message });
  return ok({ jobs: data || [] });
}

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const {
    workspace_id: workspaceId,
    brand_profile_id: brandProfileId = null,
    session_id: sessionId,
    mode = "company",
    query = "",
    url = "",
    company = "",
    action = "run",
    limit = 3,
  } = body || {};
  if (!workspaceId || !sessionId) return err("Missing workspace_id or session_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const { data: session, error: sErr } = await svc
    .from("onboarding_sessions")
    .select("id,workspace_id,brand_profile_id")
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (sErr) return err(sErr.message, 500);
  if (!session) return err("Onboarding session not found", 404);

  if (action === "enqueue") {
    const result = await enqueueOnboardingResearchJob({
      svc,
      workspaceId,
      brandProfileId: brandProfileId || session.brand_profile_id,
      sessionId,
      userId: user.id,
      mode: mode === "url" ? "url" : "company",
      query,
      url,
      company,
    });
    return ok(result);
  }

  if (action === "process") {
    return ok(await processQueuedOnboardingResearchJobs({ svc, workspaceId, sessionId, limit }));
  }

  const result = await runOnboardingResearchJob({
    svc,
    workspaceId,
    brandProfileId: brandProfileId || session.brand_profile_id,
    sessionId,
    userId: user.id,
    mode: mode === "url" ? "url" : "company",
    query,
    url,
    company,
  });

  return ok(result);
}
