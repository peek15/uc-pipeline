import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { applyClarificationAnswers, buildClarifications, buildDraftStrategy, inferFactsFromIntake, scoreUnderstanding } from "@/lib/onboarding";

function ok(payload) { return Response.json(payload); }
function err(message, status = 400) { return Response.json({ error: message }, { status }); }

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }
  const { workspace_id: workspaceId, brand_profile_id: brandProfileId, session_id: sessionId, intake = {}, answers = {} } = body || {};
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

  let existingSettings = {};
  if (brandProfileId || session.brand_profile_id) {
    const { data } = await svc
      .from("brand_profiles")
      .select("settings,brief_doc,name")
      .eq("id", brandProfileId || session.brand_profile_id)
      .maybeSingle();
    existingSettings = parseSettings(data?.settings || data?.brief_doc) || {};
    if (data?.name && !existingSettings.brand?.name) existingSettings = { ...existingSettings, brand: { ...(existingSettings.brand || {}), name: data.name } };
  }

  const inferred = inferFactsFromIntake(intake, existingSettings);
  const facts = applyClarificationAnswers(inferred, answers);
  const confidence = scoreUnderstanding(facts);
  const clarifications = buildClarifications(facts);
  const draft = buildDraftStrategy(facts, existingSettings);
  const now = new Date().toISOString();

  await svc.from("onboarding_extracted_facts").insert(
    Object.entries(facts).map(([field_key, value]) => ({
      session_id: sessionId,
      field_key,
      value,
      confidence: confidence.score >= 75 ? "high" : confidence.score >= 45 ? "medium" : "low",
      source_ids: [],
      accepted_by_user: false,
    }))
  );

  if (clarifications.length) {
    await svc.from("onboarding_clarifications").insert(
      clarifications.map(q => ({
        session_id: sessionId,
        question: q.question,
        question_type: q.question_type,
        options: q.options || [],
        status: "pending",
        required: q.required,
      }))
    );
  }

  const draftRows = [
    ["brand_profile", draft.brand_profile],
    ["content_strategy", draft.content_strategy],
    ["programmes", { recommended: draft.programmes, alternatives: draft.alternatives }],
    ["risk_checklist", draft.risk_checklist],
    ["first_content_ideas", draft.first_content_ideas],
  ].map(([draft_type, content_json]) => ({
    session_id: sessionId,
    draft_type,
    content_json,
    status: "draft",
  }));
  await svc.from("onboarding_drafts").insert(draftRows);

  const nextStatus = clarifications.some(q => q.required) ? "needs_clarification" : "draft_ready";
  await svc
    .from("onboarding_sessions")
    .update({ status: nextStatus, updated_at: now })
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId);

  return ok({
    agent_context: {
      workspace_id: workspaceId,
      brand_profile_id: brandProfileId || session.brand_profile_id,
      task_type: "onboarding_draft_strategy",
      source_view: "onboarding",
      source_entity_type: "onboarding_session",
      source_entity_id: sessionId,
      cost_center: "onboarding",
      cost_category: "onboarding_agent",
    },
    facts,
    confidence,
    clarifications,
    draft,
    status: nextStatus,
    limitations: [
      "Website URLs are stored, but Sprint 6 does not run advanced open-web research.",
      "PDF and image files are accepted as source records but not automatically parsed unless text is pasted or uploaded as MD/TXT.",
    ],
  });
}

function parseSettings(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}
