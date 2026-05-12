import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { buildOnboardingAgentStep } from "@/lib/onboardingAgentStep";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const {
    workspace_id: workspaceId,
    brand_profile_id: brandProfileId,
    session_id: sessionId = null,
    intake = {},
    messages = [],
    user_message: userMessage = "",
  } = body || {};
  if (!workspaceId) return err("Missing workspace_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const payload = await buildOnboardingAgentStep({
    svc,
    workspaceId,
    brandProfileId,
    sessionId,
    userId: user.id,
    intake,
    messages,
    userMessage,
  });

  return ok(payload);
}
