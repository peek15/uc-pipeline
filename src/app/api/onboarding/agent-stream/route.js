import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { buildOnboardingAgentStep } from "@/lib/onboardingAgentStep";

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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        send("status", { label: "Starting onboarding agent" });
        const payload = await buildOnboardingAgentStep({
          svc,
          workspaceId,
          brandProfileId,
          sessionId,
          userId: user.id,
          intake,
          messages,
          userMessage,
          stream: true,
          onToken: text => send("token", { text }),
          onEvent: event => send(event.type || "agent_event", event),
        });
        send("final", payload);
      } catch (e) {
        send("error", { error: e?.message || "Onboarding stream failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
