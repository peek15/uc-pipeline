import { getAuthenticatedUser, makeServiceClient, requireWorkspaceMember } from "@/lib/apiAuth";
import { runPrompt } from "@/lib/ai/runner";
import { buildClarifications, inferFactsFromIntake, scoreUnderstanding } from "@/lib/onboarding";

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
    intake = {},
    messages = [],
    user_message: userMessage = "",
  } = body || {};
  if (!workspaceId) return err("Missing workspace_id");

  const svc = makeServiceClient();
  const member = await requireWorkspaceMember(svc, user, workspaceId);
  if (member.error) return err(member.error, member.status);

  let existingSettings = {};
  if (brandProfileId) {
    const { data } = await svc
      .from("brand_profiles")
      .select("settings,brief_doc,name")
      .eq("id", brandProfileId)
      .maybeSingle();
    existingSettings = parseSettings(data?.settings || data?.brief_doc) || {};
    if (data?.name && !existingSettings.brand?.name) {
      existingSettings = { ...existingSettings, brand: { ...(existingSettings.brand || {}), name: data.name } };
    }
  }

  const facts = inferFactsFromIntake(intake, existingSettings);
  const confidence = scoreUnderstanding(facts);
  const clarifications = buildClarifications(facts);
  const enoughSignal = hasEnoughSignal(intake);
  const history = buildHistory(messages, userMessage);
  const missing = clarifications.slice(0, 3).map(q => q.question);

  try {
    const result = await runPrompt({
      type: "onboarding-chat",
      params: {
        current_brand_json: JSON.stringify(existingSettings.brand || {}, null, 2),
        current_templates_json: JSON.stringify(existingSettings.strategy?.content_templates || [], null, 2),
        brand_memory: buildBrandMemory({ intake, facts, confidence, missing }),
        history,
      },
      context: {
        workspace_id: workspaceId,
        brand_profile_id: brandProfileId || null,
      },
      maxTokens: 700,
      model: "haiku",
      parse: true,
    });
    const reply = result.parsed?.clean_response || result.text || fallbackReply({ intake, facts, clarifications, enoughSignal, userMessage });
    return ok({
      reply: sanitizeReply(reply),
      can_analyze: enoughSignal,
      confidence,
      missing,
      source: "ai",
      ai_call_id: result.ai_call_id,
    });
  } catch (e) {
    return ok({
      reply: fallbackReply({ intake, facts, clarifications, enoughSignal, userMessage }),
      can_analyze: enoughSignal,
      confidence,
      missing,
      source: "fallback",
      limitation: "AI onboarding chat was unavailable, so Creative Engine used a local next-step response.",
    });
  }
}

function buildHistory(messages, userMessage) {
  const rows = (messages || [])
    .filter(m => ["assistant", "user"].includes(m.role) && (m.text || m.title))
    .slice(-12)
    .map(m => `${m.role === "assistant" ? "Assistant" : "User"}: ${String(m.text || m.title || "").slice(0, 1200)}`);
  if (userMessage) rows.push(`User: ${String(userMessage).slice(0, 1200)}`);
  return rows.join("\n\n");
}

function buildBrandMemory({ intake, facts, confidence, missing }) {
  const files = (intake.files || []).map(f => `${f.name}: ${f.status}. ${f.note || ""}`).join("\n");
  return [
    intake.websiteUrl ? `Website URL: ${intake.websiteUrl}` : "",
    intake.notes ? `User notes:\n${String(intake.notes).slice(-3000)}` : "",
    files ? `Files:\n${files}` : "",
    `Inferred facts:\n${JSON.stringify(facts, null, 2)}`,
    `Brand understanding: ${confidence.score}%`,
    missing.length ? `Missing/uncertain:\n- ${missing.join("\n- ")}` : "No major missing fields detected.",
  ].filter(Boolean).join("\n\n");
}

function hasEnoughSignal(intake = {}) {
  if (intake.websiteUrl) return true;
  if ((intake.files || []).some(f => f.status === "parsed" && String(f.text || "").trim().length > 40)) return true;
  const notes = String(intake.notes || "").replace(/\s+/g, " ").trim();
  if (notes.length > 40 && !/^(test|hello|hi|ok|asdf)$/i.test(notes)) return true;
  const manual = intake.manual || {};
  return Boolean(manual.priorityOffer || manual.audience || manual.goal);
}

function fallbackReply({ intake, facts, clarifications, enoughSignal, userMessage }) {
  const text = String(userMessage || "").trim();
  if (!enoughSignal) {
    if (/^(test|hello|hi|ok|asdf)?$/i.test(text)) {
      return "I’m here. To set this up properly, send me a website, a short description of the business, or a few notes about what you sell and who it is for.";
    }
    return "I need a little more context before I can build a useful strategy. What does the business sell, who is it for, and where should the content show up first?";
  }
  const nextQuestion = clarifications[0]?.question;
  if (nextQuestion) {
    return `I have enough to start understanding the business. One thing I’m still missing: ${nextQuestion}`;
  }
  return `I have enough to build the first strategy pass for ${facts.company || "this brand"}. I can analyze the sources now and show you what I understood before anything is saved.`;
}

function sanitizeReply(text) {
  return String(text || "")
    .replace(/<brand_extract>[\s\S]*?<\/brand_extract>/g, "")
    .trim()
    .slice(0, 1200);
}

function parseSettings(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}
