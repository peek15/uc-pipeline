import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { applyClarificationAnswers, buildClarifications, buildDraftStrategy, inferFactsFromIntake, scoreUnderstanding } from "@/lib/onboarding";
import { assertOnboardingBudget, onboardingPrivacyNotice } from "@/lib/onboardingGuardrails";
import { buildOnboardingPlan } from "@/lib/onboardingPlanner";
import { applyCriticToDraft, critiqueOnboardingDraft } from "@/lib/onboardingStrategyCritic";

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
  const budget = await assertOnboardingBudget({ svc, sessionId, workspaceId, operation: "agent_turn" });
  if (!budget.ok) return err(budget.message, 429);

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
  const { data: sourceRows } = await svc
    .from("onboarding_sources")
    .select("id,source_type,url,filename,mime_type,summary,metadata_json,status")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(50);
  const sourceIntake = mergeSavedSourceIntelligence(intake, sourceRows || []);
  const planner = buildOnboardingPlan({ intake: sourceIntake, facts, confidence, clarifications, existingSettings });
  const baseDraft = {
    ...buildDraftStrategy(facts, existingSettings),
    source_citations: buildDraftCitations(planner),
    assumptions: buildDraftAssumptions(planner),
  };
  const critic = critiqueOnboardingDraft({ draft: baseDraft, planner, facts });
  const draft = applyCriticToDraft(baseDraft, critic);
  const now = new Date().toISOString();

  await svc.from("onboarding_extracted_facts").insert(
    Object.entries(facts).map(([field_key, value]) => ({
      session_id: sessionId,
      field_key,
      value,
      confidence: confidence.score >= 75 ? "high" : confidence.score >= 45 ? "medium" : "low",
      source_ids: sourceIdsForField(field_key, sourceRows || [], planner),
      accepted_by_user: false,
      metadata_json: {
        planner_stage: planner.stage,
        evidence: planner.fact_evidence?.[field_key] || [],
        field_state: planner.field_states?.find(field => field.key === field_key) || null,
      },
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
    ["recommendations", { source_citations: draft.source_citations || [], assumptions: draft.assumptions || [], quality_review: draft.quality_review || null }],
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
    agent_plan: planner,
    fact_evidence: planner.fact_evidence,
    draft,
    quality_review: draft.quality_review,
    privacy_notice: onboardingPrivacyNotice({ externalAI: false, webResearch: Boolean(intake.websiteUrl), ocr: false }),
    status: nextStatus,
    limitations: [
      "Website URLs are stored, but Sprint 6 does not run advanced open-web research.",
      "PDF and image files are accepted as source records but not automatically parsed unless text is pasted or uploaded as MD/TXT.",
    ],
  });
}

function mergeSavedSourceIntelligence(intake, sourceRows = []) {
  const notes = [intake.notes || ""];
  const files = [...(intake.files || [])];
  for (const source of sourceRows) {
    const intelligence = source.metadata_json?.source_intelligence;
    if (intelligence?.summary) {
      notes.push(`Saved ${source.source_type} source ${source.url || source.filename || source.id}: ${intelligence.summary}`);
    }
    if (source.filename && intelligence?.summary && !files.some(file => file.name === source.filename)) {
      files.push({
        name: source.filename,
        mime_type: source.mime_type || source.source_type,
        text: source.metadata_json?.text || intelligence.summary || "",
        status: source.status || intelligence.status || "stored",
        note: intelligence.limitation || intelligence.summary,
      });
    }
  }
  return { ...intake, notes: notes.filter(Boolean).join("\n\n"), files };
}

function sourceIdsForField(fieldKey, sourceRows = [], planner = {}) {
  const evidence = planner.fact_evidence?.[fieldKey] || [];
  if (!evidence.length) return sourceRows.slice(0, 4).map(source => source.id);
  const matched = sourceRows.filter(source => {
    const title = source.url || source.filename || source.summary || "";
    return evidence.some(item => item.title === title || item.source_url === source.url || item.title?.includes(source.filename));
  });
  return (matched.length ? matched : sourceRows.slice(0, 4)).map(source => source.id);
}

function buildDraftCitations(planner = {}) {
  const citations = [];
  for (const field of planner.field_states || []) {
    const evidence = field.evidence || planner.fact_evidence?.[field.key] || [];
    if (!evidence.length) continue;
    citations.push({
      field_key: field.key,
      field_label: field.label,
      confidence: field.confidence,
      status: field.status,
      evidence: evidence.slice(0, 3).map(item => ({
        title: item.title,
        source_type: item.source_type,
        source_url: item.source_url || null,
        excerpt: item.excerpt,
        confidence: item.confidence,
      })),
    });
  }
  return citations;
}

function buildDraftAssumptions(planner = {}) {
  return (planner.field_states || [])
    .filter(field => field.status === "missing" || field.confidence === "low" || field.confidence === "missing")
    .map(field => ({
      field_key: field.key,
      label: field.label,
      status: field.status,
      confidence: field.confidence,
      note: field.status === "missing"
        ? `${field.label} was not found in the available sources.`
        : `${field.label} is inferred and should be confirmed before publishing.`,
    }))
    .slice(0, 8);
}

function parseSettings(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}
