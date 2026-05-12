import { runPrompt, runPromptStream } from "@/lib/ai/runner";
import { buildClarifications, inferFactsFromIntake, scoreUnderstanding } from "@/lib/onboarding";
import { extractCompanyName, researchCompanyFromText } from "@/lib/onboardingWebResearch";

export async function buildOnboardingAgentStep({
  svc,
  workspaceId,
  brandProfileId,
  sessionId = null,
  userId = null,
  intake = {},
  messages = [],
  userMessage = "",
  stream = false,
  onToken,
  onEvent,
}) {
  const existingSettings = await loadExistingSettings(svc, brandProfileId);
  const detectedCompany = extractCompanyName(userMessage) || intake.manual?.brandName || "";

  onEvent?.({ type: "status", label: "Detecting business signal" });
  const researchedSource = intake.websiteUrl ? null : await researchCompanyFromText(userMessage);

  const researchNotes = researchedSource?.summary
    ? `Web lookup found likely official website for ${researchedSource.company}: ${researchedSource.url}\nTitle: ${researchedSource.title || "(none)"}\nSummary: ${researchedSource.summary}`
    : researchedSource?.status === "not_found"
      ? `Web lookup attempted for ${researchedSource.company}, but no reliable official website was found.`
      : "";
  const enrichedIntake = researchNotes
    ? { ...intake, websiteUrl: researchedSource?.url || intake.websiteUrl || "", notes: [intake.notes, researchNotes].filter(Boolean).join("\n\n") }
    : intake;

  const facts = inferFactsFromIntake(enrichedIntake, existingSettings);
  const confidence = scoreUnderstanding(facts);
  const baseClarifications = buildClarifications(facts);
  const enoughSignal = hasEnoughSignal(enrichedIntake);
  const toolCalls = buildToolCalls({
    intake: enrichedIntake,
    userMessage,
    detectedCompany,
    researchedSource,
    facts,
    confidence,
    missing: baseClarifications.map(q => q.question),
    enoughSignal,
  });

  const clarifications = buildDynamicClarifications({ facts, baseClarifications, toolCalls, confidence, enoughSignal });
  const missing = clarifications.slice(0, 3).map(q => q.question);
  const reflection = buildAgentReflection({ intake: enrichedIntake, facts, confidence, missing, researchedSource, enoughSignal });
  const toolSteps = toolCalls.map(call => call.label);
  const sourcesUsed = buildSourcesUsed({ intake: enrichedIntake, researchedSource });
  const nextQuestion = clarifications[0]?.question || null;
  const agentState = buildAgentState({ facts, confidence, missing, researchedSource, detectedCompany, enoughSignal, nextQuestion });
  const nextAction = buildNextAction({ enoughSignal, nextQuestion, researchedSource, detectedCompany, confidence, clarifications });
  const suggestedReplies = buildSuggestedReplies({ clarifications, detectedCompany, researchedSource, enoughSignal });
  const history = buildHistory(messages, userMessage);

  onEvent?.({ type: "tool_calls", tool_calls: toolCalls, agent_state: agentState, next_action: nextAction });

  let reply = "";
  let aiCallId = null;
  let source = "ai";
  let limitation = null;
  try {
    const params = {
      current_brand_json: JSON.stringify(existingSettings.brand || {}, null, 2),
      current_templates_json: JSON.stringify(existingSettings.strategy?.content_templates || [], null, 2),
      brand_memory: buildBrandMemory({ intake: enrichedIntake, facts, confidence, missing, researchedSource }),
      history,
    };
    if (stream) {
      const result = await runPromptStream({
        type: "onboarding-chat",
        params,
        context: { workspace_id: workspaceId, brand_profile_id: brandProfileId || null },
        maxTokens: 700,
        model: "opus",
        onChunk: chunk => onToken?.(chunk),
      });
      reply = result.text || fallbackReply({ intake, facts, clarifications, enoughSignal, userMessage, researchedSource, detectedCompany });
      aiCallId = result.ai_call_id;
    } else {
      const result = await runPrompt({
        type: "onboarding-chat",
        params,
        context: { workspace_id: workspaceId, brand_profile_id: brandProfileId || null },
        maxTokens: 700,
        model: "opus",
        parse: true,
      });
      reply = result.parsed?.clean_response || result.text || fallbackReply({ intake, facts, clarifications, enoughSignal, userMessage, researchedSource, detectedCompany });
      aiCallId = result.ai_call_id;
    }
  } catch {
    source = "fallback";
    limitation = "AI onboarding chat was unavailable, so Creative Engine used a local next-step response.";
    reply = fallbackReply({ intake, facts, clarifications, enoughSignal, userMessage, researchedSource, detectedCompany });
  }

  const payload = {
    assistant_message: sanitizeReply(reply),
    reply: sanitizeReply(reply),
    agent_state: agentState,
    tool_calls: toolCalls,
    can_analyze: enoughSignal,
    confidence,
    missing,
    reflection,
    tool_steps: toolSteps,
    facts_patch: facts,
    sources_used: sourcesUsed,
    next_question: nextQuestion,
    next_action: nextAction,
    suggested_replies: suggestedReplies,
    can_draft: enoughSignal && confidence.score >= 50,
    discovered_source: researchedSource?.url ? researchedSource : null,
    source,
    ai_call_id: aiCallId,
    ...(limitation ? { limitation } : {}),
  };

  if (sessionId) {
    await persistAgentMemory({
      svc,
      sessionId,
      workspaceId,
      brandProfileId,
      userId,
      userMessage,
      payload,
    });
  }

  return payload;
}

export async function persistAgentMemory({ svc, sessionId, workspaceId, brandProfileId, userId, userMessage, payload }) {
  const rows = [
    {
      session_id: sessionId,
      workspace_id: workspaceId,
      brand_profile_id: brandProfileId || null,
      event_type: "user_message",
      role: "user",
      content: userMessage || "",
      payload_json: { message: { role: "user", type: "text", text: userMessage || "" } },
      created_by: userId,
    },
    {
      session_id: sessionId,
      workspace_id: workspaceId,
      brand_profile_id: brandProfileId || null,
      event_type: "assistant_message",
      role: "assistant",
      content: payload.assistant_message || payload.reply || "",
      payload_json: { message: { role: "assistant", type: "text", text: payload.assistant_message || payload.reply || "" } },
      created_by: userId,
    },
    {
      session_id: sessionId,
      workspace_id: workspaceId,
      brand_profile_id: brandProfileId || null,
      event_type: "tool_calls",
      role: "tool",
      content: "",
      payload_json: { tool_calls: payload.tool_calls || [], next_action: payload.next_action || null, sources_used: payload.sources_used || [] },
      created_by: userId,
    },
    {
      session_id: sessionId,
      workspace_id: workspaceId,
      brand_profile_id: brandProfileId || null,
      event_type: "agent_state",
      role: "system",
      content: "",
      payload_json: {
        agent_state: payload.agent_state || null,
        confidence: payload.confidence || null,
        missing: payload.missing || [],
        suggested_replies: payload.suggested_replies || [],
      },
      created_by: userId,
    },
  ];
  const { error } = await svc.from("onboarding_agent_memory").insert(rows);
  if (error) return { persisted: false, error: error.message };
  return { persisted: true };
}

async function loadExistingSettings(svc, brandProfileId) {
  let existingSettings = {};
  if (!brandProfileId) return existingSettings;
  const { data } = await svc
    .from("brand_profiles")
    .select("settings,brief_doc,name")
    .eq("id", brandProfileId)
    .maybeSingle();
  existingSettings = parseSettings(data?.settings || data?.brief_doc) || {};
  if (data?.name && !existingSettings.brand?.name) {
    existingSettings = { ...existingSettings, brand: { ...(existingSettings.brand || {}), name: data.name } };
  }
  return existingSettings;
}

function buildToolCalls({ intake, userMessage, detectedCompany, researchedSource, facts, confidence, missing, enoughSignal }) {
  const calls = [
    {
      id: "detect_business",
      name: "detect_business_from_message",
      label: "Detect business signal",
      status: detectedCompany || facts.company || intake.websiteUrl || intake.notes ? "success" : "needs_input",
      summary: detectedCompany ? `Working brand detected: ${detectedCompany}` : facts.company ? `Working brand: ${facts.company}` : "No stable brand name yet.",
      artifact: {
        company: detectedCompany || facts.company || "",
        evidence: detectedCompany ? "matched from user message" : facts.company ? "inferred from profile or source" : "none",
        input_excerpt: truncate(userMessage, 160),
      },
    },
  ];

  if (!intake.websiteUrl && detectedCompany) {
    calls.push({
      id: "search_official_website",
      name: "search_official_website",
      label: "Find official website",
      status: researchedSource?.url ? "success" : researchedSource?.status === "not_found" ? "partial" : "skipped",
      summary: researchedSource?.url ? `Found likely official source: ${researchedSource.url}` : researchedSource?.status === "not_found" ? "No reliable official website was found automatically." : "Website lookup was not needed.",
      source_url: researchedSource?.url || null,
      artifact: {
        query_company: detectedCompany,
        url: researchedSource?.url || "",
        title: researchedSource?.title || "",
        status: researchedSource?.status || "skipped",
      },
    });
  }

  if (intake.websiteUrl || researchedSource?.url) {
    const sourceUrl = intake.websiteUrl || researchedSource?.url || null;
    calls.push({
      id: "fetch_website_page",
      name: "fetch_website_page",
      label: "Read website source",
      status: researchedSource?.summary || intake.websiteUrl ? "success" : "partial",
      summary: researchedSource?.summary ? "Homepage text was read and summarized for onboarding." : "Website URL is stored; deeper page extraction may be limited.",
      source_url: sourceUrl,
      artifact: {
        url: sourceUrl,
        title: researchedSource?.title || "",
        summary_snippet: truncate(researchedSource?.summary || "", 420),
        extracted_text_chars: researchedSource?.summary?.length || 0,
        limitation: researchedSource?.summary ? "" : "Stored URL only; readable page text was not available.",
      },
    });
  }

  if (intake.notes || (intake.files || []).length || userMessage) {
    const fields = {
      company: facts.company || "",
      priority_offer: facts.priority_offer || "",
      audience: facts.audience || "",
      content_goal: facts.content_goal || "",
      platforms: facts.platforms || [],
      tone_style: facts.tone_style || "",
    };
    calls.push({
      id: "extract_brand_facts",
      name: "extract_brand_facts",
      label: "Extract brand facts",
      status: confidence.score >= 50 ? "success" : confidence.score > 0 ? "partial" : "needs_input",
      summary: `Brand understanding is currently ${confidence.score}%.`,
      artifact: {
        extracted_fields: fields,
        filled_fields: Object.entries(fields).filter(([, value]) => Array.isArray(value) ? value.length : value).map(([key]) => key),
        confidence_score: confidence.score,
      },
    });
  }

  calls.push({
    id: "generate_next_question",
    name: "generate_clarification_questions",
    label: "Choose next clarification",
    status: missing.length ? "partial" : "success",
    summary: missing.length ? missing[0] : "No major clarification is required before the first pass.",
    artifact: { missing_fields: missing, max_questions_now: Math.min(2, missing.length), policy: "Ask only the highest-leverage missing or uncertain items." },
  });

  calls.push({
    id: "draft_readiness",
    name: "draft_strategy_readiness",
    label: "Check strategy readiness",
    status: enoughSignal ? "success" : "needs_input",
    summary: enoughSignal ? "Ready for a first analysis pass before approval." : "Needs one useful source, website, or description before drafting.",
    artifact: { ready: enoughSignal, confidence_score: confidence.score, required_before_draft: enoughSignal ? [] : ["website, notes, or useful business description"] },
  });

  return calls;
}

function buildDynamicClarifications({ facts, baseClarifications, toolCalls, confidence, enoughSignal }) {
  const scored = baseClarifications.map(q => ({
    ...q,
    rationale: clarificationRationale(q.key, facts, toolCalls),
    priority: clarificationPriority(q.key, confidence, enoughSignal),
  }));
  return scored.sort((a, b) => b.priority - a.priority).slice(0, enoughSignal ? 2 : 1);
}

function clarificationPriority(key, confidence, enoughSignal) {
  const base = { priority_offer: 100, audience: 92, content_goal: 78, platforms: 64, asset_rights: enoughSignal ? 56 : 30, tone_avoid: 42 }[key] || 20;
  return base + (confidence.score < 45 ? 10 : 0);
}

function clarificationRationale(key, facts, toolCalls) {
  const sourceCount = toolCalls.filter(call => call.source_url || call.artifact?.extracted_text_chars).length;
  if (key === "priority_offer") return sourceCount ? "Sources did not identify one priority offer strongly enough." : "A priority offer is needed before drafting programmes.";
  if (key === "audience") return facts.priority_offer ? "The offer has some signal, but the buyer/user is still uncertain." : "Audience is needed to choose formats, tone, and platforms.";
  if (key === "content_goal") return "The strategy needs a clear first business outcome.";
  if (key === "platforms") return "Platforms shape the first programmes and content formats.";
  if (key === "asset_rights") return "Creative Engine needs confirmation before using provided materials in final strategy.";
  if (key === "tone_avoid") return "Avoid guidance reduces brand and claims risk.";
  return "This is the next highest-leverage missing setup field.";
}

function buildAgentState({ facts, confidence, missing, researchedSource, detectedCompany, enoughSignal, nextQuestion }) {
  return {
    current_goal: enoughSignal ? "Prepare first source analysis" : "Collect enough signal to start strategy setup",
    business_name: facts.company || detectedCompany || "",
    website: facts.website || researchedSource?.url || "",
    confirmed_facts: {},
    inferred_facts: {
      company: facts.company || detectedCompany || "",
      priority_offer: facts.priority_offer || "",
      audience: facts.audience || "",
      platforms: facts.platforms || [],
      tone_style: facts.tone_style || "",
    },
    uncertain_facts: missing,
    missing_fields: missing,
    confidence,
    next_best_question: nextQuestion,
    ready_to_draft: enoughSignal && confidence.score >= 50,
  };
}

function buildNextAction({ enoughSignal, nextQuestion, researchedSource, detectedCompany, confidence, clarifications }) {
  if (enoughSignal && confidence.score >= 50) return {
    type: "draft_strategy",
    label: "Draft setup pass",
    description: "Prepare Brand Profile, Content Strategy, Programmes, risk guidance, and first ideas for review.",
    requires_confirmation: false,
  };
  if (enoughSignal) return {
    type: "review_understanding",
    label: "Review understanding",
    description: clarifications?.[0]?.rationale || "Review the first inferred facts before drafting.",
    requires_confirmation: true,
  };
  if (detectedCompany && !researchedSource?.url) return {
    type: "ask_for_source",
    label: "Ask for official source",
    description: "Confirm the official website or add a short business description.",
    requires_confirmation: true,
  };
  return {
    type: "ask_clarification",
    label: "Ask next question",
    description: nextQuestion || "Ask for a website, offer, audience, or notes.",
    requires_confirmation: true,
  };
}

function buildSuggestedReplies({ clarifications, detectedCompany, researchedSource, enoughSignal }) {
  if (enoughSignal) return ["Draft the setup pass", "Show what you understood first"];
  const next = clarifications[0];
  if (detectedCompany && !researchedSource?.url) return ["I’ll paste the website", "Use what you can find", "I’ll describe the offer"];
  if (next?.options?.length) return next.options.slice(0, 4);
  return ["I’ll paste the website", "I’ll describe the business", "I’m not sure — guide me"];
}

function buildSourcesUsed({ intake, researchedSource }) {
  const sources = [];
  if (researchedSource?.url) sources.push({ title: researchedSource.url, type: "web_lookup", status: researchedSource.status || "stored" });
  if (intake.websiteUrl && intake.websiteUrl !== researchedSource?.url) sources.push({ title: intake.websiteUrl, type: "website", status: "stored" });
  if (intake.notes) sources.push({ title: "User notes", type: "text_note", status: "parsed" });
  for (const file of intake.files || []) sources.push({ title: file.name, type: file.mime_type || "file", status: file.status || "stored" });
  return sources;
}

function buildHistory(messages, userMessage) {
  const rows = (messages || [])
    .filter(m => ["assistant", "user"].includes(m.role) && (m.text || m.title))
    .slice(-12)
    .map(m => `${m.role === "assistant" ? "Assistant" : "User"}: ${String(m.text || m.title || "").slice(0, 1200)}`);
  if (userMessage) rows.push(`User: ${String(userMessage).slice(0, 1200)}`);
  return rows.join("\n\n");
}

function buildBrandMemory({ intake, facts, confidence, missing, researchedSource }) {
  const files = (intake.files || []).map(f => `${f.name}: ${f.status}. ${f.note || ""}`).join("\n");
  return [
    intake.websiteUrl ? `Website URL: ${intake.websiteUrl}` : "",
    intake.notes ? `User notes:\n${String(intake.notes).slice(-3000)}` : "",
    files ? `Files:\n${files}` : "",
    researchedSource?.url ? `Web research tool result:\n${researchedSource.url}\n${researchedSource.summary || ""}` : "",
    `Inferred facts:\n${JSON.stringify(facts, null, 2)}`,
    `Brand understanding: ${confidence.score}%`,
    missing.length ? `Missing/uncertain:\n- ${missing.join("\n- ")}` : "No major missing fields detected.",
  ].filter(Boolean).join("\n\n");
}

function buildAgentReflection({ intake, facts, confidence, missing, researchedSource, enoughSignal }) {
  const checked = [];
  if (researchedSource?.url) checked.push(`Found likely official website: ${researchedSource.url}`);
  else if (researchedSource?.status === "not_found") checked.push(`Tried web lookup for ${researchedSource.company}; no reliable official site found`);
  if (intake.websiteUrl) checked.push(`Using website source: ${intake.websiteUrl}`);
  if (intake.notes) checked.push("Read user-provided notes");
  if ((intake.files || []).length) checked.push(`Registered ${intake.files.length} uploaded source${intake.files.length === 1 ? "" : "s"}`);
  if (!checked.length) checked.push("Waiting for a usable brand source");

  const inferred = [
    facts.company ? `Working brand: ${facts.company}` : "",
    facts.priority_offer ? `Possible offer: ${truncate(facts.priority_offer, 90)}` : "",
    facts.audience ? `Possible audience: ${truncate(facts.audience, 90)}` : "",
    (facts.platforms || []).length ? `Likely platforms: ${facts.platforms.slice(0, 3).join(", ")}` : "",
  ].filter(Boolean);

  const next = enoughSignal ? "Ready to run the first source analysis and show a confirmable strategy draft path." : missing[0] || "Need a website, description, offer, or audience before drafting.";
  return {
    title: "How I’m orienting the setup",
    checked,
    inferred: inferred.length ? inferred : ["No stable brand facts yet"],
    missing: missing.length ? missing : ["No major missing fields detected yet"],
    next,
    confidence: `${confidence.score}% setup signal`,
  };
}

function hasEnoughSignal(intake = {}) {
  if (intake.websiteUrl) return true;
  if ((intake.files || []).some(f => f.status === "parsed" && String(f.text || "").trim().length > 40)) return true;
  const notes = String(intake.notes || "").replace(/\s+/g, " ").trim();
  if (notes.length > 40 && !/^(test|hello|hi|ok|asdf)$/i.test(notes)) return true;
  const manual = intake.manual || {};
  return Boolean(manual.priorityOffer || manual.audience || manual.goal);
}

function fallbackReply({ intake, facts, clarifications, enoughSignal, userMessage, researchedSource, detectedCompany }) {
  const text = String(userMessage || "").trim();
  const brand = facts.company || detectedCompany;
  if (brand && researchedSource?.url && enoughSignal) return `Good, I’ll use ${brand} as the working brand. I found a likely official source and read what I could from it, so I’m ready to run the first setup pass and show you what needs confirmation.`;
  if (brand && !intake.websiteUrl && !researchedSource?.url) return `Good, I’ll use ${brand} as the working brand. I tried to anchor it to a public source; send me the official website or describe the main offer and audience, and I’ll continue from there.`;
  if (!enoughSignal) {
    if (/^(test|hello|hi|ok|asdf)?$/i.test(text)) return "I’m here. To set this up properly, send me a website, a short description of the business, or a few notes about what you sell and who it is for.";
    return "Good, I’ll use that as the starting point. I’ll try to identify the business from available web sources, then I’ll ask only for what I can’t confirm. If you already have the official website, send it too so I can anchor the setup.";
  }
  const nextQuestion = clarifications[0]?.question;
  if (nextQuestion) return `I have enough to start understanding the business. One thing I’m still missing: ${nextQuestion}`;
  return `I have enough to build the first strategy pass for ${facts.company || "this brand"}. I can analyze the sources now and show you what I understood before anything is saved.`;
}

function sanitizeReply(text) {
  return String(text || "")
    .replace(/<brand_extract>[\s\S]*?<\/brand_extract>/g, "")
    .trim()
    .slice(0, 1200);
}

function truncate(value, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}...`;
}

function parseSettings(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}
