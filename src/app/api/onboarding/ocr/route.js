import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { getOnboardingOcrProviderStatus, runOnboardingOcr } from "@/lib/onboardingOcrProvider";

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

  return ok({ status: getOnboardingOcrProviderStatus() });
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
    source_id: sourceId = null,
    text = "",
    raw_pdf_text: rawPdfText = "",
    image_base64: imageBase64 = "",
    mime_type: bodyMimeType = "",
    data_class: dataClass,
    privacy_mode: privacyMode,
  } = body || {};
  if (!workspaceId || !sessionId) return err("Missing workspace_id or session_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  let source = null;
  if (sourceId) {
    const { data, error } = await svc
      .from("onboarding_sources")
      .select("*")
      .eq("id", sourceId)
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) return err(error.message, 500);
    source = data;
  }

  const result = await runOnboardingOcr({
    text: text || source?.metadata_json?.text || source?.summary || "",
    rawPdfText,
    imageBase64,
    mimeType: source?.mime_type || bodyMimeType || "",
    sourceType: source?.source_type || "",
    workspaceId,
    brandProfileId: brandProfileId || source?.brand_profile_id || null,
    userId: user.id,
    dataClass: dataClass || source?.data_class,
    privacyMode,
  });

  if (result.status === "analyzed") {
    if (source?.id) {
      await svc
        .from("onboarding_sources")
        .update({
          status: "analyzed",
          summary: result.intelligence.summary,
          metadata_json: {
            ...(source.metadata_json || {}),
            text: result.text.slice(0, 20000),
            source_intelligence: {
              status: "analyzed",
              summary: result.intelligence.summary,
              confidence: result.intelligence.confidence,
              evidence_snippets: result.intelligence.evidence_snippets,
              word_count: result.intelligence.word_count,
              extraction_method: result.extraction_method,
              limitation: null,
            },
            ocr_status: result.extraction_method === "pdf-light" ? "pdf_text_extracted" : "text_reused",
            ocr_gateway: result.gateway || null,
            ocr_provider: result.provider_status,
          },
        })
        .eq("id", source.id)
        .eq("session_id", sessionId);
    }
    return ok({
      status: "analyzed",
      extraction_method: result.extraction_method,
      intelligence: result.intelligence,
      provider_status: result.provider_status,
      gateway: result.gateway || null,
      limitation: null,
    });
  }

  return ok({
    status: result.status,
    extraction_method: result.extraction_method,
    intelligence: null,
    provider_status: result.provider_status,
    limitation: result.limitation,
  });
}
