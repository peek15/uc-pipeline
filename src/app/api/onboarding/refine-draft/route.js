import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { runPrompt } from "@/lib/ai/runner";

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
    session_id: sessionId,
    draft = null,
    facts = {},
    instruction = "",
  } = body || {};
  if (!workspaceId || !sessionId || !draft || !instruction.trim()) return err("Missing workspace_id, session_id, draft, or instruction");

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

  const result = await refineDraftWithAI({
    workspaceId,
    brandProfileId: brandProfileId || session.brand_profile_id,
    draft,
    facts,
    instruction,
  }).catch(() => fallbackRefineDraft({ draft, instruction }));

  await svc
    .from("onboarding_drafts")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .eq("status", "draft");

  const rows = [
    ["brand_profile", result.draft.brand_profile],
    ["content_strategy", result.draft.content_strategy],
    ["programmes", { recommended: result.draft.programmes || [], alternatives: result.draft.alternatives || [] }],
    ["risk_checklist", result.draft.risk_checklist || []],
    ["first_content_ideas", result.draft.first_content_ideas || []],
  ].map(([draft_type, content_json]) => ({
    session_id: sessionId,
    draft_type,
    content_json,
    status: "draft",
  }));
  await svc.from("onboarding_drafts").insert(rows);

  await svc.from("onboarding_agent_memory").insert({
    session_id: sessionId,
    workspace_id: workspaceId,
    brand_profile_id: brandProfileId || session.brand_profile_id || null,
    event_type: "system",
    role: "system",
    content: "Draft refined before approval.",
    payload_json: {
      instruction,
      changes: result.changes || [],
      draft_refinement: true,
    },
    created_by: user.id,
  }).catch(() => null);

  await svc
    .from("onboarding_sessions")
    .update({ status: "draft_ready", updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId);

  return ok({
    draft: result.draft,
    changes: result.changes || [],
    source: result.source || "ai",
  });
}

async function refineDraftWithAI({ workspaceId, brandProfileId, draft, facts, instruction }) {
  const prompt = `You refine a Creative Engine onboarding strategy draft before user approval.

Rules:
- Return ONLY valid JSON.
- Preserve this shape: brand_profile, content_strategy, programmes, alternatives, risk_checklist, first_content_ideas.
- Do not save or approve anything.
- Follow the user's refinement instruction.
- Keep claims safe and mark uncertainty honestly.
- Do not invent source evidence.

User refinement instruction:
${instruction}

Current facts:
${JSON.stringify(facts || {}, null, 2)}

Current draft:
${JSON.stringify(draft || {}, null, 2)}

Return:
{
  "draft": { ...same shape as current draft... },
  "changes": ["short change summary", "..."]
}`;

  const result = await runPrompt({
    type: "agent-call",
    params: { prompt },
    context: {
      workspace_id: workspaceId,
      brand_profile_id: brandProfileId || null,
    },
    maxTokens: 2600,
    model: "opus",
    parse: false,
  });
  const parsed = parseJsonObject(result.text);
  if (!parsed?.draft) throw new Error("Refinement returned invalid JSON");
  return { draft: normalizeDraft(parsed.draft, draft), changes: parsed.changes || [], source: "ai" };
}

function fallbackRefineDraft({ draft, instruction }) {
  const next = normalizeDraft(JSON.parse(JSON.stringify(draft || {})), draft);
  next.content_strategy = {
    ...(next.content_strategy || {}),
    preferred_angles: [next.content_strategy?.preferred_angles, `Refinement requested: ${instruction}`].filter(Boolean).join(" "),
  };
  return {
    draft: next,
    changes: [`Captured refinement request for review: ${instruction}`],
    source: "fallback",
  };
}

function normalizeDraft(next, previous) {
  return {
    brand_profile: next.brand_profile || previous?.brand_profile || {},
    content_strategy: next.content_strategy || previous?.content_strategy || {},
    programmes: Array.isArray(next.programmes) ? next.programmes : previous?.programmes || [],
    alternatives: Array.isArray(next.alternatives) ? next.alternatives : previous?.alternatives || [],
    risk_checklist: Array.isArray(next.risk_checklist) ? next.risk_checklist : previous?.risk_checklist || [],
    first_content_ideas: Array.isArray(next.first_content_ideas) ? next.first_content_ideas : previous?.first_content_ideas || [],
  };
}

function parseJsonObject(text) {
  const clean = String(text || "").replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(clean); } catch {}
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}
