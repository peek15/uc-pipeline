import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { listExportableWorkspaceData } from "@/lib/privacy/dataLifecycle";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace_id");
  if (!workspaceId) return err("Missing workspace_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  return ok({
    workspace_id: workspaceId,
    default_rules: {
      raw_uploads: "Default 60 days unless workspace policy changes or legal hold applies.",
      extracted_text_chunks: "Retain while workspace is active unless deleted.",
      generated_deliverables: "Retain while workspace is active unless user deletes.",
      ai_calls: "Metadata only; no raw prompts/responses by default.",
      cost_events: "Retained for billing/legal/accounting needs.",
      audit_log: "Minimum necessary operational trail.",
    },
    exportable_tables: listExportableWorkspaceData(),
  });
}
