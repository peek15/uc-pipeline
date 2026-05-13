import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";

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
    .from("onboarding_agent_memory")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    return ok({ events: [], unavailable: true, error: error.message });
  }

  return ok({
    events: data || [],
    snapshot: buildSnapshot(data || []),
  });
}

function buildSnapshot(events) {
  const messages = [];
  let agentState = null;
  let toolCalls = [];
  let suggestedReplies = [];
  let confidence = null;
  let missing = [];
  let sources = [];
  let nextAction = null;
  let agentPlan = null;
  let factEvidence = {};
  let researchJob = null;

  for (const event of events) {
    const payload = event.payload_json || {};
    if (event.event_type === "user_message" && event.content) {
      messages.push({ role: "user", type: "text", title: "You", text: event.content });
    }
    if (event.event_type === "assistant_message" && event.content) {
      messages.push({ role: "assistant", type: "text", text: event.content });
    }
    if (event.event_type === "tool_calls") {
      toolCalls = payload.tool_calls || toolCalls;
      sources = payload.sources_used || sources;
      nextAction = payload.next_action || nextAction;
      agentPlan = payload.agent_plan || agentPlan;
      researchJob = payload.research_job || researchJob;
    }
    if (event.event_type === "agent_state") {
      agentState = payload.agent_state || agentState;
      agentPlan = payload.agent_plan || agentPlan;
      factEvidence = payload.fact_evidence || factEvidence;
      researchJob = payload.research_job || researchJob;
      confidence = payload.confidence || confidence;
      missing = payload.missing || missing;
      suggestedReplies = payload.suggested_replies || suggestedReplies;
    }
  }

  return { messages, agentState, agentPlan, factEvidence, researchJob, toolCalls, suggestedReplies, confidence, missing, sources, nextAction };
}
