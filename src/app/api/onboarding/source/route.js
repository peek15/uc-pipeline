import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { classifyDocumentSource, chunkText, selectSnippetsForAI } from "@/lib/privacy/documentIntake";
import { defaultRetentionDeleteAt } from "@/lib/privacy/dataLifecycle";

const SOURCE_TYPES = new Set(["website", "pdf", "image", "markdown", "text_note", "social_page", "uploaded_asset", "manual_answer"]);

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const { workspace_id: workspaceId, session_id: sessionId, sources = [] } = body || {};
  if (!workspaceId || !sessionId) return err("Missing workspace_id or session_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  const { data: session, error: sErr } = await svc
    .from("onboarding_sessions")
    .select("id,workspace_id")
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (sErr) return err(sErr.message, 500);
  if (!session) return err("Onboarding session not found", 404);

  const rows = (sources || []).map(source => {
    const sourceType = SOURCE_TYPES.has(source.source_type) ? source.source_type : "text_note";
    const analyzable = sourceType === "text_note" || sourceType === "markdown" || sourceType === "manual_answer";
    const dataClass = classifyDocumentSource({ sourceType, text: source.text || source.summary || "", declaredDataClass: source.data_class });
    const chunks = analyzable ? chunkText(source.text || source.summary || "", { maxChunks: 8 }) : [];
    const selectedSnippets = selectSnippetsForAI(chunks.map((chunk_text, chunk_index) => ({ chunk_text, chunk_index, data_class: dataClass })));
    return {
      session_id: sessionId,
      source_type: sourceType,
      url: source.url || null,
      file_ref: source.file_ref || null,
      filename: source.filename || null,
      mime_type: source.mime_type || null,
      status: analyzable ? "analyzed" : "pending",
      summary: analyzable ? summarizeText(source.text || source.summary || "") : "Accepted for intake. Automated analysis is pending for this source type in V1.",
      data_class: dataClass,
      retention_status: "active",
      retention_delete_at: defaultRetentionDeleteAt({ sourceType: source.filename ? "raw_upload" : "extracted_text" }),
      selected_for_ai: selectedSnippets.length > 0,
      metadata_json: {
        ...(source.metadata_json || {}),
        text: String(source.text || "").slice(0, 20000),
        chunk_count: chunks.length,
        selected_snippets: selectedSnippets.map(s => ({ chunk_index: s.chunk_index, data_class: s.data_class })),
        v1_limit: analyzable ? null : "Stored but not parsed automatically in Sprint 6.",
      },
    };
  });

  if (!rows.length) return ok({ sources: [] });

  const { data, error } = await svc
    .from("onboarding_sources")
    .insert(rows)
    .select("*");
  if (error) return err(error.message, 500);

  await svc
    .from("onboarding_sessions")
    .update({ status: "analyzing_sources", updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId);

  return ok({ sources: data || [] });
}

function summarizeText(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "No analyzable text was provided.";
  return clean.slice(0, 700);
}
