import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { enqueueIntelligenceJob } from "@/lib/intelligenceJobs";
import { analyzeDocumentText } from "@/lib/onboardingDocumentIntelligence";
import { assertOnboardingBudget } from "@/lib/onboardingGuardrails";
import { runOnboardingOcr } from "@/lib/onboardingOcrProvider";
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
    .select("id,workspace_id,brand_profile_id")
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (sErr) return err(sErr.message, 500);
  if (!session) return err("Onboarding session not found", 404);
  const budget = await assertOnboardingBudget({ svc, sessionId, workspaceId, operation: "source" });
  if (!budget.ok) return err(budget.message, 429);

  const rows = [];
  for (const source of sources || []) {
    const sourceType = SOURCE_TYPES.has(source.source_type) ? source.source_type : "text_note";
    let sourceText = String(source.text || source.summary || "");
    let hasText = sourceText.trim().length > 0;
    let analyzable = sourceType === "text_note" || sourceType === "markdown" || sourceType === "manual_answer" || (sourceType === "pdf" && hasText);
    const dataClass = classifyDocumentSource({ sourceType, text: source.text || source.summary || "", declaredDataClass: source.data_class });

    let ocrResult = null;
    if (!analyzable && (sourceType === "image" || sourceType === "pdf")) {
      ocrResult = await runOnboardingOcr({
        text: sourceText,
        imageBase64: source.image_base64 || "",
        mimeType: source.mime_type || "",
        sourceType,
        workspaceId,
        brandProfileId: session.brand_profile_id || null,
        userId: user.id,
        dataClass,
        privacyMode: source.privacy_mode,
      });
      if (ocrResult.status === "analyzed" && ocrResult.text) {
        sourceText = ocrResult.text;
        hasText = true;
        analyzable = true;
      }
    }

    const chunks = analyzable ? chunkText(sourceText, { maxChunks: 8 }) : [];
    const selectedSnippets = selectSnippetsForAI(chunks.map((chunk_text, chunk_index) => ({ chunk_text, chunk_index, data_class: dataClass })));
    const intelligence = buildSourceIntelligence({ source: { ...source, text: sourceText }, sourceType, analyzable, chunks, selectedSnippets, ocrResult });
    rows.push({
      session_id: sessionId,
      source_type: sourceType,
      url: source.url || null,
      file_ref: source.file_ref || null,
      filename: source.filename || null,
      mime_type: source.mime_type || null,
      status: analyzable ? "analyzed" : ocrResult?.status === "failed" ? "failed" : "pending",
      summary: intelligence.summary,
      data_class: dataClass,
      retention_status: "active",
      retention_delete_at: defaultRetentionDeleteAt({ sourceType: source.filename ? "raw_upload" : "extracted_text" }),
      selected_for_ai: selectedSnippets.length > 0,
      metadata_json: {
        ...(source.metadata_json || {}),
        text: String(sourceText || "").slice(0, 20000),
        chunk_count: chunks.length,
        selected_snippets: selectedSnippets.map(s => ({ chunk_index: s.chunk_index, data_class: s.data_class })),
        source_intelligence: intelligence,
        v1_limit: intelligence.limitation,
        ocr_status: ocrResult?.status === "analyzed"
          ? "ocr_extracted"
          : source.metadata_json?.ocr_status || (sourceType === "pdf" || sourceType === "image" ? "requires_ocr" : "not_required"),
        ocr_provider: ocrResult?.provider_status || null,
        ocr_gateway: ocrResult?.gateway || null,
      },
    });
  }

  if (!rows.length) return ok({ sources: [] });

  const { data, error } = await svc
    .from("onboarding_sources")
    .insert(rows)
    .select("*");
  if (error) return err(error.message, 500);

  const ocrJobs = [];
  for (const source of data || []) {
    const metadata = source.metadata_json || {};
    const needsOcrJob = ["pdf", "image"].includes(source.source_type)
      && source.status !== "analyzed"
      && metadata.ocr_status !== "ocr_extracted";
    if (!needsOcrJob) continue;
    const queued = await enqueueIntelligenceJob({
      svc,
      workspaceId,
      brandProfileId: session.brand_profile_id || null,
      sessionId,
      userId: user.id,
      jobType: "ocr_extraction",
      input: {
        source_id: source.id,
        source_type: source.source_type,
        mime_type: source.mime_type,
      },
      priority: 3,
      metadata: {
        requested_via: "api/onboarding/source",
        reason: "source_requires_ocr",
      },
    });
    if (queued.job?.id) {
      ocrJobs.push({ source_id: source.id, job_id: queued.job.id, status: queued.job.status });
      await svc
        .from("onboarding_sources")
        .update({
          metadata_json: {
            ...metadata,
            ocr_job_id: queued.job.id,
            ocr_job_status: "queued",
          },
        })
        .eq("id", source.id)
        .eq("session_id", sessionId);
    }
  }

  await svc
    .from("onboarding_sessions")
    .update({ status: "analyzing_sources", updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId);

  return ok({ sources: data || [], ocr_jobs: ocrJobs });
}

function summarizeText(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "No analyzable text was provided.";
  return clean.slice(0, 700);
}

function buildSourceIntelligence({ source, sourceType, analyzable, chunks, selectedSnippets, ocrResult = null }) {
  if (!analyzable) {
    const kind = sourceType === "pdf" ? "PDF" : sourceType === "image" ? "image" : "file";
    return {
      status: ocrResult?.status || "pending",
      summary: ocrResult?.limitation || `${kind} accepted for intake. Automated text extraction/OCR is not available in this sprint.`,
      confidence: "low",
      evidence_snippets: [],
      selected_for_ai: false,
      extraction_method: ocrResult?.extraction_method || null,
      limitation: ocrResult?.limitation || `${kind} stored but not parsed automatically. Paste key text or upload MD/TXT for source-aware analysis.`,
    };
  }
  const text = String(source.text || source.summary || "");
  const documentIntel = analyzeDocumentText(text);
  const summary = documentIntel.summary || summarizeText(text);
  const evidence = documentIntel.evidence_snippets?.length ? documentIntel.evidence_snippets : extractEvidenceSnippets(chunks.length ? chunks : [text]);
  return {
    status: "analyzed",
    summary,
    confidence: documentIntel.confidence || (text.length > 1200 ? "high" : text.length > 240 ? "medium" : "low"),
    evidence_snippets: evidence,
    selected_for_ai: selectedSnippets.length > 0,
    selected_snippet_count: selectedSnippets.length,
    word_count: documentIntel.word_count || text.split(/\s+/).filter(Boolean).length,
    extraction_method: source.metadata_json?.extraction_method || null,
    limitation: null,
  };
}

function extractEvidenceSnippets(chunks) {
  const keywords = ["we help", "service", "product", "customer", "client", "audience", "platform", "offer", "mission", "risk", "claim"];
  const snippets = [];
  for (const chunk of chunks || []) {
    const sentences = String(chunk || "").split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (sentence.length > 40 && sentence.length < 260 && keywords.some(keyword => lower.includes(keyword))) {
        snippets.push(sentence);
      }
      if (snippets.length >= 6) return snippets;
    }
  }
  return snippets;
}
