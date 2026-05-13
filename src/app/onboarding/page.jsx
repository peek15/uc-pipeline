"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, Globe2, HelpCircle, Paperclip, Pencil, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { supabase, getBrandProfiles, getWorkspaces, createBrandProfile } from "@/lib/db";
import { defaultTenant, normalizeTenant, tenantStorageKey } from "@/lib/brand";
import { applyClarificationAnswers, blankOnboardingIntake, buildClarifications } from "@/lib/onboarding";
import { extractFileTextForOnboarding } from "@/lib/onboardingDocumentIntelligence";
import { EmptyState, Panel, Pill, SectionHeader, SkeletonCard, SourceReviewButton, buttonStyle } from "@/components/OperationalUI";

const UNSURE = "I'm not sure — suggest for me";

const WORK_STEPS = {
  intake: ["Saving sources", "Reading text notes", "Preparing source records"],
  agent: ["Reading your message", "Checking available sources", "Updating setup brief", "Choosing the next move"],
  analyze: ["Extracting business facts", "Identifying products/services", "Identifying likely audiences", "Checking unclear claims", "Preparing clarification questions"],
  draft: ["Drafting Brand Profile", "Drafting Content Strategy", "Drafting Programmes", "Preparing first content ideas"],
  approve: ["Saving approved strategy", "Activating programmes", "Preparing next actions"],
};

const EMPTY_SETUP_BRIEF = {
  facts: {},
  confidence: null,
  missing: [],
  sources: [],
  next: "",
  toolSteps: [],
};

const INITIAL_MESSAGES = [
  {
    id: "welcome",
    role: "assistant",
    type: "text",
    text: "Tell me what business or brand we are setting up. You can paste a website, upload a file, or describe it in your own words.",
  },
  {
    id: "privacy",
    role: "system",
    type: "privacy",
    text: "Only upload materials you are allowed to use. Privacy and data controls are available in Settings.",
  },
];

function transcriptReducer(messages, action) {
  if (action.type === "append") return [...messages, action.message];
  if (action.type === "append_many") return [...messages, ...action.messages];
  if (action.type === "replace") return action.messages || messages;
  if (action.type === "update") {
    return messages.map(message => message.id === action.id ? { ...message, ...action.patch } : message);
  }
  if (action.type === "update_artifact") {
    return messages.map(message => message.id === action.id ? { ...message, artifact: { ...(message.artifact || {}), ...(action.patch || {}) } } : message);
  }
  return messages;
}

function makeMessage(fields) {
  return {
    id: fields.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...fields,
  };
}

export default function OnboardingPage() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tenant, setTenant] = useState(null);
  const [phase, setPhase] = useState("intake");
  const [messages, dispatchMessages] = useReducer(transcriptReducer, INITIAL_MESSAGES);
  const [intake, setIntake] = useState(blankOnboardingIntake());
  const [session, setSession] = useState(null);
  const [sources, setSources] = useState([]);
  const [facts, setFacts] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [clarifications, setClarifications] = useState([]);
  const [answers, setAnswers] = useState({});
  const [draft, setDraft] = useState(null);
  const [limitations, setLimitations] = useState([]);
  const [loadingTask, setLoadingTask] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("workspace_setup");
  const [composerMode, setComposerMode] = useState("message");
  const [composerText, setComposerText] = useState("");
  const [assistantTyping, setAssistantTyping] = useState(false);
  const [setupBrief, setSetupBrief] = useState(EMPTY_SETUP_BRIEF);
  const [suggestedReplies, setSuggestedReplies] = useState([]);
  const [factReviews, setFactReviews] = useState({});
  const transcriptEndRef = useRef(null);
  const replyTimerRef = useRef(null);
  const restoredMemoryRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: authSession } }) => {
      setUser(authSession?.user || null);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const requestedTenant = normalizeTenant({
      workspace_id: params.get("workspace_id") || defaultTenant().workspace_id,
      brand_profile_id: params.get("brand_profile_id") || params.get("workspace_id") || defaultTenant().brand_profile_id,
    });
    const requestedMode = params.get("mode");
    if (["workspace_setup", "brand_setup", "strategy_refresh"].includes(requestedMode)) setMode(requestedMode);

    (async () => {
      try {
        const workspaces = await getWorkspaces();
        const workspace = workspaces.find(w => w.id === requestedTenant.workspace_id) || workspaces[0];
        if (!workspace) throw new Error("No workspace access found.");
        const workspaceTenant = { workspace_id: workspace.id, brand_profile_id: requestedTenant.brand_profile_id || workspace.id };
        let profiles = await getBrandProfiles(workspaceTenant);
        let profile = profiles.find(p => p.id === requestedTenant.brand_profile_id) || profiles[0];
        if (!profile) {
          profile = await createBrandProfile({ name: workspace.name || "New brand", settings: { brand: { name: workspace.name || "New brand" } } }, workspaceTenant);
          profiles = [profile];
        }
        setTenant({ workspace_id: workspace.id, brand_profile_id: profile.id });
        setIntake(prev => ({
          ...prev,
          manual: { ...prev.manual, brandName: profile.settings?.brand?.name || profile.name || "" },
        }));
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [user]);

  const sourceTrace = useMemo(() => buildSourceTrace(intake, sources), [intake, sources]);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior:"smooth", block:"end" });
  }, [messages, assistantTyping, loadingTask, phase, error]);

  useEffect(() => () => {
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
  }, []);

  const getToken = async () => {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    return authSession?.access_token;
  };

  const api = async (path, body) => {
    const token = await getToken();
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `API ${res.status}`);
    return json;
  };

  const apiGet = async (path) => {
    const token = await getToken();
    const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `API ${res.status}`);
    return json;
  };

  const ensureSession = useCallback(async () => {
    if (session) return session;
    if (!tenant) return null;
    const sessionJson = await api("/api/onboarding/session", {
      workspace_id: tenant.workspace_id,
      brand_profile_id: tenant.brand_profile_id,
      mode,
    });
    setSession(sessionJson.session);
    return sessionJson.session;
  }, [session, tenant, mode]);

  const persistOnboardingState = useCallback(async (sessionId, snapshot) => {
    if (!tenant || !sessionId) return;
    await api("/api/onboarding/state", {
      workspace_id: tenant.workspace_id,
      brand_profile_id: tenant.brand_profile_id,
      session_id: sessionId,
      state: snapshot,
    }).catch(() => null);
  }, [tenant]);

  useEffect(() => {
    if (!tenant || restoredMemoryRef.current) return;
    restoredMemoryRef.current = true;
    (async () => {
      try {
        const qs = new URLSearchParams({
          workspace_id: tenant.workspace_id,
          brand_profile_id: tenant.brand_profile_id,
        });
        const json = await apiGet(`/api/onboarding/session?${qs.toString()}`);
        const active = (json.sessions || []).find(s => !["approved", "skipped", "archived"].includes(s.status));
        if (!active) return;
        const memoryQs = new URLSearchParams({ workspace_id: tenant.workspace_id, session_id: active.id });
        const stateJson = await apiGet(`/api/onboarding/state?${memoryQs.toString()}`).catch(() => ({}));
        const memory = await apiGet(`/api/onboarding/memory?${memoryQs.toString()}`);
        const snapshot = memory.snapshot || {};
        setSession(active);
        if (snapshot.messages?.length) {
          dispatchMessages({ type:"replace", messages:[
            ...INITIAL_MESSAGES,
            ...snapshot.messages.map(message => makeMessage(message)),
          ]});
        }
        if (stateJson.state) {
          restoreOnboardingState(stateJson.state, {
            setPhase,
            setIntake,
            setSources,
            setFacts,
            setConfidence,
            setClarifications,
            setAnswers,
            setDraft,
            setLimitations,
            setSetupBrief,
            setSuggestedReplies,
          });
        } else if (snapshot.messages?.length) {
          setSetupBrief({
            facts: snapshot.agentState?.inferred_facts || {},
            confidence: snapshot.confidence || snapshot.agentState?.confidence || null,
            missing: snapshot.missing || snapshot.agentState?.missing_fields || [],
            sources: snapshot.sources || [],
            next: snapshot.nextAction?.description || snapshot.agentState?.next_best_question || "",
            toolSteps: (snapshot.toolCalls || []).map(call => call.label),
            agentState: snapshot.agentState || null,
            agentPlan: snapshot.agentPlan || null,
            factEvidence: snapshot.factEvidence || {},
            researchJob: snapshot.researchJob || null,
            toolCalls: snapshot.toolCalls || [],
            nextAction: snapshot.nextAction || null,
          });
          setSuggestedReplies(snapshot.suggestedReplies || []);
        }
        await loadFactReviews(active.id);
      } catch {}
    })();
  }, [tenant]);

  const loadFactReviews = useCallback(async (sessionId) => {
    if (!tenant || !sessionId) return {};
    const qs = new URLSearchParams({ workspace_id: tenant.workspace_id, session_id: sessionId });
    const json = await apiGet(`/api/onboarding/fact?${qs.toString()}`);
    setFactReviews(json.facts || {});
    return json.facts || {};
  }, [tenant]);

  const reviewFact = useCallback(async ({ fieldKey, value, status, note = "" }) => {
    if (!tenant || !fieldKey) return;
    const activeSession = await ensureSession();
    if (!activeSession) return;
    const json = await api("/api/onboarding/fact", {
      workspace_id: tenant.workspace_id,
      session_id: activeSession.id,
      field_key: fieldKey,
      value,
      status,
      note,
      source_refs: setupBrief.sources || [],
    });
    setFactReviews(prev => ({ ...prev, [fieldKey]: json.fact }));
    if (status === "confirmed" || status === "edited") {
      setSetupBrief(prev => ({ ...prev, facts: { ...(prev.facts || {}), [fieldKey]: value } }));
      setFacts(prev => prev ? { ...prev, [fieldKey]: value } : prev);
    }
    if (status === "rejected" || status === "unsure") {
      const emptyValue = Array.isArray(value) ? [] : "";
      setSetupBrief(prev => ({ ...prev, facts: { ...(prev.facts || {}), [fieldKey]: emptyValue } }));
      setFacts(prev => prev ? { ...prev, [fieldKey]: emptyValue } : prev);
    }
  }, [tenant, ensureSession, setupBrief.sources]);

  const runAnalysis = useCallback(async () => {
    if (!tenant) return;
    dispatchMessages({ type:"append_many", messages:[
      makeMessage({ role:"assistant", type:"text", text:"I’m going to read what you gave me now. I’ll keep this to a first pass and mark anything that needs confirmation." }),
      makeMessage({ role:"assistant", type:"work_trace", artifact:{ task:"analyze", steps:WORK_STEPS.analyze } }),
    ]});
    setLoadingTask("analyze");
    setError(null);
    try {
      const nextSession = await ensureSession();
      if (!nextSession) return;
      setSession(nextSession);

      const sourcePayload = buildSourcePayload(intake);
      if (sourcePayload.length) {
        const sourceJson = await api("/api/onboarding/source", {
          workspace_id: tenant.workspace_id,
          session_id: nextSession.id,
          sources: sourcePayload,
        });
        sourcePayload.splice(0, sourcePayload.length, ...(sourceJson.sources || sourcePayload));
        setSources(sourcePayload);
      }

      const analyzed = await api("/api/onboarding/analyze", {
        workspace_id: tenant.workspace_id,
        brand_profile_id: tenant.brand_profile_id,
        session_id: nextSession.id,
        intake,
      });
      setFacts(analyzed.facts);
      setConfidence(analyzed.confidence);
      setClarifications(analyzed.clarifications || []);
      setDraft(analyzed.draft);
      setLimitations(analyzed.limitations || []);
      setPhase("understood");
      await persistOnboardingState(nextSession.id, {
        phase:"understood",
        intake,
        sources: sourcePayload,
        facts: analyzed.facts,
        confidence: analyzed.confidence,
        clarifications: analyzed.clarifications || [],
        answers,
        draft: analyzed.draft,
        limitations: analyzed.limitations || [],
        setupBrief,
        suggestedReplies,
      });
      dispatchMessages({ type:"append_many", messages:[
        makeMessage({ role:"assistant", type:"text", text:"I found a first picture of the brand. Review this with me before I draft the strategy." }),
        makeMessage({ role:"assistant", type:"understanding_card", artifact:{
          facts:analyzed.facts,
          confidence:analyzed.confidence,
          limitations:analyzed.limitations || [],
          sourceTrace:buildSourceTrace(intake, sourcePayload, analyzed.fact_evidence),
        }}),
      ]});
    } catch (e) {
      const message = friendlyOnboardingError(e.message);
      setError(message);
      dispatchMessages({ type:"append", message:makeMessage({ role:"assistant", type:"error", text:message }) });
    } finally {
      setLoadingTask(null);
    }
  }, [tenant, intake, ensureSession, answers, setupBrief, suggestedReplies, persistOnboardingState]);

  const generateDraftWithAnswers = useCallback(async () => {
    if (!tenant || !session) return;
    dispatchMessages({ type:"append_many", messages:[
      makeMessage({ role:"user", type:"text", title:"Clarifications", text:summarizeAnswers(answers, clarifications) || "Use conservative defaults where unsure." }),
      makeMessage({ role:"assistant", type:"text", text:"Thanks. I’ll fold those answers into a draft strategy and use conservative defaults where anything is still uncertain." }),
      makeMessage({ role:"assistant", type:"work_trace", artifact:{ task:"draft", steps:WORK_STEPS.draft } }),
    ]});
    setLoadingTask("draft");
    setError(null);
    try {
      await api("/api/onboarding/clarification", {
        workspace_id: tenant.workspace_id,
        session_id: session.id,
        answers,
      });
      const keyedAnswers = {};
      clarifications.forEach(q => {
        const value = answers[q.id || q.key];
        if (value !== undefined) keyedAnswers[q.key || questionKey(q.question)] = value;
      });
      const analyzed = await api("/api/onboarding/analyze", {
        workspace_id: tenant.workspace_id,
        brand_profile_id: tenant.brand_profile_id,
        session_id: session.id,
        intake,
        answers: keyedAnswers,
      });
      const nextFacts = applyClarificationAnswers(analyzed.facts || facts || {}, keyedAnswers);
      setFacts(nextFacts);
      setConfidence(analyzed.confidence);
      setClarifications(analyzed.clarifications || []);
      setDraft(analyzed.draft);
      setPhase("draft");
      await persistOnboardingState(session.id, {
        phase:"draft",
        intake,
        sources,
        facts: nextFacts,
        confidence: analyzed.confidence,
        clarifications: analyzed.clarifications || [],
        answers,
        draft: analyzed.draft,
        limitations,
        setupBrief,
        suggestedReplies,
      });
      dispatchMessages({ type:"append_many", messages:[
        makeMessage({ role:"assistant", type:"text", text:"Here’s the draft. Nothing is saved yet; review it first, then approve when it feels right." }),
        makeMessage({ role:"assistant", type:"draft_card", artifact:{ draft:analyzed.draft, sourceTrace: buildSourceTrace(intake, sources, analyzed.fact_evidence) } }),
      ]});
    } catch (e) {
      const message = friendlyOnboardingError(e.message);
      setError(message);
      dispatchMessages({ type:"append", message:makeMessage({ role:"assistant", type:"error", text:message }) });
    } finally {
      setLoadingTask(null);
    }
  }, [tenant, session, answers, clarifications, intake, facts, sources, limitations, setupBrief, suggestedReplies, persistOnboardingState, sourceTrace]);

  const approve = useCallback(async () => {
    if (!tenant || !session || !draft) return;
    dispatchMessages({ type:"append_many", messages:[
      makeMessage({ role:"assistant", type:"text", text:"I’ll save the approved strategy now and prepare the handoff into the workspace." }),
      makeMessage({ role:"assistant", type:"work_trace", artifact:{ task:"approve", steps:WORK_STEPS.approve } }),
    ]});
    setLoadingTask("approve");
    setError(null);
    try {
      const json = await api("/api/onboarding/approve", {
        workspace_id: tenant.workspace_id,
        brand_profile_id: tenant.brand_profile_id,
        session_id: session.id,
        draft,
      });
      try {
        localStorage.setItem(tenantStorageKey("settings", tenant), JSON.stringify(json.settings));
        localStorage.setItem("active_tenant", JSON.stringify(tenant));
      } catch {}
      setPhase("approved");
      await persistOnboardingState(session.id, {
        phase:"approved",
        intake,
        sources,
        facts,
        confidence,
        clarifications,
        answers,
        draft,
        limitations,
        setupBrief,
        suggestedReplies,
      });
      dispatchMessages({ type:"append_many", messages:[
        makeMessage({ role:"assistant", type:"text", text:"Done. Strategy, programmes, and first ideas are ready to use." }),
        makeMessage({ role:"assistant", type:"completion_card" }),
      ]});
    } catch (e) {
      const message = friendlyOnboardingError(e.message);
      setError(message);
      dispatchMessages({ type:"append", message:makeMessage({ role:"assistant", type:"error", text:message }) });
    } finally {
      setLoadingTask(null);
    }
  }, [tenant, session, draft, intake, sources, facts, confidence, clarifications, answers, limitations, setupBrief, suggestedReplies, persistOnboardingState]);

  const refineDraft = useCallback(async (instruction) => {
    if (!tenant || !session || !draft || !instruction.trim()) return;
    dispatchMessages({ type:"append_many", messages:[
      makeMessage({ role:"user", type:"text", title:"Refinement", text:instruction }),
      makeMessage({ role:"assistant", type:"text", text:"I’ll revise the draft before anything is saved. I’ll keep the previous version superseded and show what changed." }),
      makeMessage({ role:"assistant", type:"work_trace", artifact:{ task:"draft", steps:["Reading refinement request", "Revising draft strategy", "Superseding previous draft", "Preparing change summary"] } }),
    ]});
    setLoadingTask("refine");
    setError(null);
    try {
      const json = await api("/api/onboarding/refine-draft", {
        workspace_id: tenant.workspace_id,
        brand_profile_id: tenant.brand_profile_id,
        session_id: session.id,
        draft,
        facts: facts || setupBrief.facts || {},
        instruction,
      });
      setDraft(json.draft);
      setPhase("draft");
      await persistOnboardingState(session.id, {
        phase:"draft",
        intake,
        sources,
        facts: facts || setupBrief.facts || {},
        confidence,
        clarifications,
        answers,
        draft: json.draft,
        limitations,
        setupBrief,
        suggestedReplies,
      });
      dispatchMessages({ type:"append_many", messages:[
        makeMessage({ role:"assistant", type:"text", text:formatRefinementChanges(json.changes || []) }),
        makeMessage({ role:"assistant", type:"draft_card", artifact:{ draft:json.draft, sourceTrace, changes:json.changes || [] } }),
      ]});
    } catch (e) {
      const message = friendlyOnboardingError(e.message);
      setError(message);
      dispatchMessages({ type:"append", message:makeMessage({ role:"assistant", type:"error", text:message }) });
    } finally {
      setLoadingTask(null);
    }
  }, [tenant, session, draft, facts, setupBrief, sourceTrace, intake, sources, confidence, clarifications, answers, limitations, suggestedReplies, persistOnboardingState]);

  const queueAssistantReply = useCallback((text, options = {}) => {
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    setAssistantTyping(true);
    replyTimerRef.current = setTimeout(() => {
      const next = [makeMessage({ role:"assistant", type:"text", text })];
      if (options.nextAction === "analyze") {
        next.push(makeMessage({ role:"assistant", type:"action", text:"I have enough to start a first pass. If a source cannot be read, I’ll say so and offer a manual path instead of pretending it was analyzed.", artifact:{ action:"analyze" } }));
      }
      dispatchMessages({ type:"append_many", messages:next });
      setAssistantTyping(false);
    }, options.delay ?? 620);
  }, []);

  const askOnboardingAgent = useCallback(async ({ userMessage = "", nextIntake, sourceHint = "" }) => {
    if (!tenant) {
      queueAssistantReply("I’m still loading the workspace. Try again in a moment.");
      return;
    }
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    setAssistantTyping(true);
    dispatchMessages({ type:"append", message:makeMessage({ role:"assistant", type:"work_trace", artifact:{ task:"agent", steps:WORK_STEPS.agent } }) });
    try {
      const activeSession = await ensureSession();
      const streamMessageId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      let streamedText = "";
      let sawToken = false;
      dispatchMessages({ type:"append", message:makeMessage({ id:streamMessageId, role:"assistant", type:"text", text:"" }) });
      const json = await streamOnboardingAgent({
        token: await getToken(),
        workspace_id: tenant.workspace_id,
        brand_profile_id: tenant.brand_profile_id,
        session_id: activeSession?.id || null,
        intake: nextIntake || intake,
        messages,
        user_message: sourceHint || userMessage,
        onToken: text => {
          sawToken = true;
          streamedText += text;
          dispatchMessages({ type:"update", id:streamMessageId, patch:{ text:sanitizeStreamedAssistantText(streamedText) } });
        },
        onToolCalls: event => {
          if (event.tool_calls?.length) {
            setSetupBrief(prev => ({
              ...prev,
              toolCalls: event.tool_calls,
              toolSteps: event.tool_calls.map(call => call.label),
              nextAction: event.next_action || prev.nextAction,
            }));
          }
        },
      });
      let nextIntakeForState = nextIntake || intake;
      if (json.discovered_source?.url) {
        nextIntakeForState = {
          ...nextIntakeForState,
          websiteUrl: nextIntakeForState.websiteUrl || json.discovered_source.url,
          notes: [nextIntakeForState.notes, `Source intelligence summary for ${json.discovered_source.company || "the brand"}:
URL: ${json.discovered_source.url}
Confidence: ${json.discovered_source.confidence || "unknown"}
Pages read:
${(json.discovered_source.source_pages || []).map(page => `- ${page.title || page.url}: ${page.url}`).join("\n") || "- Homepage only"}
Evidence:
${(json.discovered_source.evidence_snippets || []).slice(0, 5).map(item => `- ${item.text}`).join("\n") || "- No concise evidence snippets extracted"}
Summary:
${json.discovered_source.summary || ""}`].filter(Boolean).join("\n\n"),
        };
        setIntake(nextIntakeForState);
      }
      const nextSetupBrief = {
        facts: json.agent_state?.inferred_facts || json.facts_patch || {},
        confidence: json.confidence || null,
        missing: json.missing || [],
        sources: json.sources_used || [],
        next: json.next_action?.description || json.next_question || json.reflection?.next || "",
        toolSteps: json.tool_steps || [],
        agentState: json.agent_state || null,
        agentPlan: json.agent_plan || null,
        factEvidence: json.fact_evidence || {},
        researchJob: json.research_job || null,
        toolCalls: json.tool_calls || [],
        nextAction: json.next_action || null,
      };
      const nextSuggestedReplies = json.suggested_replies || [];
      setSetupBrief(nextSetupBrief);
      setSuggestedReplies(nextSuggestedReplies);
      const researchSteps = (json.research_job?.attempts || []).map(attempt => `Research attempt ${attempt.attempt}: ${attempt.status}${attempt.confidence ? ` (${attempt.confidence})` : ""}`);
      await persistOnboardingState(activeSession?.id, {
        phase,
        intake: nextIntakeForState,
        sources,
        facts,
        confidence,
        clarifications,
        answers,
        draft,
        limitations,
        setupBrief: nextSetupBrief,
        suggestedReplies: nextSuggestedReplies,
      });
      setAssistantTyping(false);
      if (!sawToken) {
        dispatchMessages({ type:"update", id:streamMessageId, patch:{ text:json.assistant_message || json.reply || "I need a little more context before I can guide the setup." } });
      }
      dispatchMessages({ type:"append_many", messages:[
        ...(json.tool_calls?.length ? [makeMessage({ role:"assistant", type:"tool_calls", artifact:{ calls:json.tool_calls, nextAction:json.next_action } })] : []),
        ...(json.reflection ? [makeMessage({ role:"assistant", type:"reflection_card", artifact:json.reflection })] : []),
        ...(researchSteps.length ? [makeMessage({ role:"assistant", type:"work_trace", artifact:{ task:"research", steps:researchSteps } })] : []),
        ...(json.discovered_source?.url ? [makeMessage({ role:"assistant", type:"source", sourceKind:"website", title:"Found likely website", text:json.discovered_source.url, status:json.discovered_source.status || "stored" })] : []),
        ...(json.can_analyze || json.can_draft ? [makeMessage({ role:"assistant", type:"action", text:json.next_action?.description || "I’m ready to run the first setup pass. I’ll extract the brand profile, strategy, programmes, and uncertainties before anything is saved.", artifact:{ action:"analyze", nextAction:json.next_action } })] : []),
      ]});
    } catch (e) {
      setAssistantTyping(false);
      setSuggestedReplies(["I’ll paste the website", "I’ll describe the business", "I’m not sure — guide me"]);
      dispatchMessages({ type:"append", message:makeMessage({ role:"assistant", type:"text", text:"I’m having trouble responding dynamically right now. Tell me what the business sells, who it serves, and which platform matters first, and I’ll keep going." }) });
    }
  }, [tenant, intake, messages, queueAssistantReply, ensureSession, persistOnboardingState, phase, sources, facts, confidence, clarifications, answers, draft, limitations]);

  const onFiles = async (files) => {
    const rows = [];
    for (const file of Array.from(files || [])) {
      const intelligence = await extractFileTextForOnboarding(file);
      rows.push({
        name: file.name,
        mime_type: file.type || "application/octet-stream",
        size: file.size,
        text: intelligence.text || "",
        image_base64: intelligence.image_base64 || "",
        status: intelligence.status,
        note: intelligence.note,
        extraction_method: intelligence.extraction_method,
        ocr_status: intelligence.ocr_status,
        confidence: intelligence.confidence,
      });
    }
    const nextIntake = { ...intake, files: [...intake.files, ...rows] };
    setIntake(nextIntake);
    if (rows.length) {
      dispatchMessages({ type:"append_many", messages:rows.map(file => makeMessage({ role:"user", type:"source", sourceKind:"file", title:file.name, text:file.note, status:file.status })) });
      askOnboardingAgent({
        nextIntake,
        sourceHint: rows.map(file => `${file.name}: ${file.status}. ${file.note}`).join("\n"),
      });
    }
  };

  const submitComposer = () => {
    const text = composerText.trim();
    if (!text) return;
    setSuggestedReplies([]);
    const looksLikeUrl = /^https?:\/\/\S+$/i.test(text) || /^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(text);
    if (composerMode === "website" || looksLikeUrl) {
      const url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
      const nextIntake = { ...intake, websiteUrl: url };
      setIntake(nextIntake);
      dispatchMessages({ type:"append", message:makeMessage({ role:"user", type:"source", sourceKind:"website", title:"Website", text:url }) });
      askOnboardingAgent({ userMessage:text, nextIntake, sourceHint:`Website URL: ${url}` });
    } else {
      const nextIntake = { ...intake, notes: [intake.notes, text].filter(Boolean).join("\n\n") };
      setIntake(nextIntake);
      dispatchMessages({ type:"append", message:makeMessage({ role:"user", type:"text", sourceKind:"notes", title: composerMode === "notes" ? "Notes" : "Description", text }) });
      askOnboardingAgent({ userMessage:text, nextIntake });
    }
    setComposerText("");
    setComposerMode("message");
  };

  const addGuideRequest = () => {
    const nextIntake = {
      ...intake,
      notes: [intake.notes, "User asked Creative Engine to guide setup and suggest conservative defaults where the sources are incomplete."].filter(Boolean).join("\n\n"),
    };
    setIntake(nextIntake);
    dispatchMessages({ type:"append", message:makeMessage({ role:"user", type:"text", sourceKind:"guide", title:"Guide me", text:"I’m not sure — guide me." }) });
    askOnboardingAgent({ userMessage:"I'm not sure — guide me.", nextIntake });
  };

  const submitSuggestedReply = useCallback((text) => {
    if (text === "Run the first setup pass" || text === "Draft the setup pass" || text === "Show what you understood first") {
      setSuggestedReplies([]);
      runAnalysis();
      return;
    }
    const nextIntake = { ...intake, notes: [intake.notes, text].filter(Boolean).join("\n\n") };
    setIntake(nextIntake);
    setSuggestedReplies([]);
    dispatchMessages({ type:"append", message:makeMessage({ role:"user", type:"text", sourceKind:"guide", title:"Reply", text }) });
    askOnboardingAgent({ userMessage:text, nextIntake });
  }, [askOnboardingAgent, intake, runAnalysis]);

  const continueFromUnderstanding = useCallback(() => {
    const qs = buildClarifications(facts || {});
    setClarifications(qs);
    if (qs.length) {
      setPhase("clarify");
      persistOnboardingState(session?.id, {
        phase:"clarify",
        intake,
        sources,
        facts,
        confidence,
        clarifications: qs,
        answers,
        draft,
        limitations,
        setupBrief,
        suggestedReplies,
      });
      dispatchMessages({ type:"append_many", messages:[
        makeMessage({ role:"assistant", type:"text", text:qs.length === 1 ? "I’m missing one thing before I draft this." : "I’m missing one or two things before I draft this." }),
        makeMessage({ role:"assistant", type:"clarification_card", artifact:{ clarifications:qs, answers:{}, hiddenCount:Math.max(0, qs.length - 2) } }),
      ]});
      return;
    }
    setPhase("draft");
    dispatchMessages({ type:"append", message:makeMessage({ role:"assistant", type:"text", text:"I have enough to draft a first strategy." }) });
    generateDraftWithAnswers();
  }, [facts, generateDraftWithAnswers, session, intake, sources, confidence, answers, draft, limitations, setupBrief, suggestedReplies, persistOnboardingState]);

  if (authLoading) return <OnboardingShell><SkeletonCard lines={4} style={{ maxWidth:720, margin:"18vh auto" }} /></OnboardingShell>;
  if (!user) return (
    <OnboardingShell>
      <ConversationFrame>
        <AssistantMessage title="Sign in to run onboarding">Creative Engine onboarding is workspace-scoped and requires an authenticated workspace member.</AssistantMessage>
      </ConversationFrame>
    </OnboardingShell>
  );

  return (
    <OnboardingShell>
      <header style={{ height:58, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, padding:"0 28px", borderBottom:"1px solid var(--border)", background:"var(--nav)", backdropFilter:"blur(18px)" }}>
        <div>
          <div style={{ fontSize:12, color:"var(--t3)", fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase" }}>Creative Engine onboarding</div>
        </div>
        <button onClick={() => window.location.href = "/?tab=home"} style={buttonStyle("ghost")}><ArrowLeft size={14}/>Back to app</button>
      </header>

      <ConversationFrame>
        <div className="ce-onboarding-workspace">
          <div style={{ minWidth:0 }}>
            <OnboardingTranscript
              messages={messages}
              runtime={{ facts, confidence, limitations, sourceTrace, clarifications, answers, draft, factReviews }}
              actions={{
                runAnalysis,
                continueFromUnderstanding,
                generateDraftWithAnswers,
                refineDraft,
                approve,
                setFacts,
                setAnswers,
                reviewFact,
                updateMessageArtifact:(id, patch) => dispatchMessages({ type:"update_artifact", id, patch }),
              }}
            />
            {assistantTyping && <TypingIndicator />}
          </div>
          <SetupBriefRail brief={setupBrief} intake={intake} phase={phase} factReviews={factReviews} onReviewFact={reviewFact} />
        </div>

        {phase !== "approved" && (
          <OnboardingComposer
            mode={composerMode}
            value={composerText}
            setMode={setComposerMode}
            setValue={setComposerText}
            onSubmit={submitComposer}
            onFiles={onFiles}
            onGuide={addGuideRequest}
            disabled={Boolean(loadingTask)}
            suggestions={suggestedReplies}
            onSuggestion={submitSuggestedReply}
          />
        )}
        <div ref={transcriptEndRef} />
      </ConversationFrame>
    </OnboardingShell>
  );
}

function OnboardingShell({ children }) {
  return <div style={{ minHeight:"100vh", background:"var(--bg)", color:"var(--t1)" }}>{children}</div>;
}

function ConversationFrame({ children }) {
  return <main style={{ width:"100%", maxWidth:1160, margin:"0 auto", padding:"34px 32px 210px", display:"flex", flexDirection:"column", gap:14 }}>{children}</main>;
}

function AssistantMessage({ title, children }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"32px minmax(0,1fr)", gap:12, alignItems:"start" }} className="anim-fade">
      <div className="ce-agent-avatar">CE</div>
      <Panel className="ce-chat-bubble ce-chat-bubble-assistant" style={{ background:"var(--sheet)", padding:"12px 14px", width:"100%" }}>
        {title && <div style={{ fontSize:15, fontWeight:700, color:"var(--t1)", marginBottom:5 }}>{title}</div>}
        <div style={{ fontSize:13, color:"var(--t2)", lineHeight:1.6 }}>{children}</div>
      </Panel>
    </div>
  );
}

function AssistantActionRow({ children }) {
  return <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", marginTop:14 }}>{children}</div>;
}

function AssistantCardMessage({ children }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"32px minmax(0,1fr)", gap:12, alignItems:"start" }} className="anim-fade">
      <div className="ce-agent-avatar">CE</div>
      {children}
    </div>
  );
}

function PrivacyNotice() {
  return (
    <div style={{ marginLeft:46, padding:"8px 10px", fontSize:11, color:"var(--t3)", lineHeight:1.45 }}>
      Only upload materials you are allowed to use. Privacy and data controls are available in Settings.
    </div>
  );
}

function OnboardingTranscript({ messages, runtime, actions }) {
  return (
    <div style={{ display:"grid", gap:10 }}>
      {messages.map(message => (
        <TranscriptMessage key={message.id} message={message} runtime={runtime} actions={actions} />
      ))}
    </div>
  );
}

function SetupBriefRail({ brief, intake, phase, factReviews = {}, onReviewFact }) {
  const facts = brief.facts || {};
  const sources = brief.sources?.length ? brief.sources : buildInlineSources(intake);
  const missing = (brief.missing || []).slice(0, 4);
  const toolSteps = (brief.toolSteps || []).slice(-5);
  const factsRows = [
    ["Brand", "company", facts.company || facts.brandName || intake.manual?.brandName],
    ["Offer", "priority_offer", facts.priority_offer],
    ["Audience", "audience", facts.audience],
    ["Platforms", "platforms", Array.isArray(facts.platforms) ? facts.platforms.join(", ") : facts.platforms],
  ].filter(([, , value]) => value);

  return (
    <aside className="ce-onboarding-rail">
      <Panel className="ce-setup-brief-card ce-interactive-card" style={{ padding:14, background:"var(--sheet)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:12 }}>
          <div>
            <div style={{ fontSize:12, fontWeight:800, color:"var(--t1)" }}>Setup brief</div>
            <div style={{ fontSize:11, color:"var(--t3)", marginTop:2 }}>Live context Creative Engine is using.</div>
          </div>
          <Pill tone="neutral">{phase}</Pill>
        </div>
        <div style={{ padding:"10px 11px", border:"1px solid var(--border)", background:"var(--fill)", borderRadius:"var(--ce-radius)", marginBottom:12 }}>
          <div style={{ fontSize:11, color:"var(--t3)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em" }}>Signal</div>
          <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:12, marginTop:5 }}>
            <span style={{ fontSize:13, color:"var(--t2)" }}>Brand understanding</span>
            <span style={{ fontSize:18, fontFamily:"var(--font-mono)", color:"var(--t1)", fontWeight:750 }}>{brief.confidence?.score ?? 0}%</span>
          </div>
        </div>

        <RailSection title="Known">
          {factsRows.length ? factsRows.map(([label, key, value]) => (
            <div key={label} className="ce-rail-row">
              <span>{label}</span>
              <strong>{String(value).slice(0, 110)}</strong>
              <FactReviewMini status={factReviews[key]?.status} fieldKey={key} value={value} onReviewFact={onReviewFact} />
            </div>
          )) : <RailEmpty>Waiting for a website, notes, or a description.</RailEmpty>}
        </RailSection>

        <RailSection title="Sources">
          {sources.length ? sources.slice(0, 5).map(source => (
            <div key={`${source.type}_${source.title}`} className="ce-source-mini">
              <span>{source.typeLabel || source.type}</span>
              <strong>{source.title}</strong>
              {source.status && <em>{source.status}</em>}
            </div>
          )) : <RailEmpty>No sources attached yet.</RailEmpty>}
        </RailSection>

        <RailSection title="Working on">
          {toolSteps.length ? toolSteps.map(step => (
            <div key={step} className="ce-work-mini"><span className="ce-work-step-dot" />{step}</div>
          )) : <RailEmpty>I’ll show high-level work here as we talk.</RailEmpty>}
        </RailSection>

        <RailSection title="Still needed">
          {missing.length ? missing.map(item => <div key={item} className="ce-missing-mini">{item}</div>) : <RailEmpty>No major missing field yet.</RailEmpty>}
        </RailSection>

        {brief.next && (
          <div style={{ marginTop:12, padding:"10px 11px", borderRadius:"var(--ce-radius)", background:"var(--fill2)", border:"1px solid var(--border)", fontSize:12, color:"var(--t2)", lineHeight:1.45 }}>
            <strong style={{ color:"var(--t1)" }}>Next:</strong> {brief.next}
          </div>
        )}
      </Panel>
    </aside>
  );
}

function RailSection({ title, children }) {
  return (
    <div style={{ marginTop:12 }}>
      <div style={{ fontSize:11, color:"var(--t3)", fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:7 }}>{title}</div>
      <div style={{ display:"grid", gap:7 }}>{children}</div>
    </div>
  );
}

function RailEmpty({ children }) {
  return <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.45 }}>{children}</div>;
}

function FactReviewMini({ fieldKey, value, status, onReviewFact }) {
  const label = status === "confirmed" || status === "edited" ? "confirmed" : status === "rejected" ? "rejected" : status === "unsure" ? "unsure" : "inferred";
  return (
    <div className="ce-fact-review-mini">
      <em>{label}</em>
      {onReviewFact && status !== "confirmed" && status !== "edited" && (
        <button type="button" onClick={() => onReviewFact({ fieldKey, value, status:"confirmed" })}>Confirm</button>
      )}
      {onReviewFact && status !== "unsure" && (
        <button type="button" onClick={() => onReviewFact({ fieldKey, value, status:"unsure", note:"User marked this fact as unsure." })}>Unsure</button>
      )}
      {onReviewFact && status !== "rejected" && (
        <button type="button" onClick={() => onReviewFact({ fieldKey, value, status:"rejected", note:"User rejected this inferred fact." })}>Reject</button>
      )}
    </div>
  );
}

function TranscriptMessage({ message, runtime, actions }) {
  if (message.type === "privacy") return <PrivacyNotice />;
  if (message.role === "user") {
    return <UserMessage title={message.title || "You"} icon={iconForEvent(message.sourceKind || message.type)} status={message.status}>{message.text}</UserMessage>;
  }
  if (message.type === "source") {
    return (
      <AssistantMessage title={message.title || "Source found"}>
        <span style={{ display:"inline-flex", alignItems:"center", gap:7 }}>
          {iconForEvent(message.sourceKind || "website")}
          <span>{message.text}</span>
          {message.status && <Pill tone={message.status === "read" ? "success" : "neutral"}>{message.status}</Pill>}
        </span>
      </AssistantMessage>
    );
  }
  if (message.type === "text") return <AssistantMessage>{message.text}</AssistantMessage>;
  if (message.type === "tool_calls") return <ToolCallCard calls={message.artifact?.calls || []} nextAction={message.artifact?.nextAction} />;
  if (message.type === "reflection_card") return <ReflectionCard reflection={message.artifact} />;
  if (message.type === "action" && message.artifact?.action === "analyze") {
    return <NextActionPrompt onAnalyze={actions.runAnalysis} sourceTrace={runtime.sourceTrace} text={message.text} nextAction={message.artifact?.nextAction} />;
  }
  if (message.type === "work_trace") return <WorkTraceMessage task={message.artifact?.task} steps={message.artifact?.steps || []} />;
  if (message.type === "understanding_card") {
    return (
      <UnderstandingCard
        facts={runtime.facts || message.artifact?.facts || {}}
        setFacts={actions.setFacts}
        confidence={runtime.confidence || message.artifact?.confidence}
        limitations={runtime.limitations || message.artifact?.limitations || []}
        sourceTrace={runtime.sourceTrace || message.artifact?.sourceTrace}
        factReviews={runtime.factReviews || {}}
        onReviewFact={actions.reviewFact}
        onContinue={actions.continueFromUnderstanding}
      />
    );
  }
  if (message.type === "clarification_card") {
    return (
      <ClarificationCards
        clarifications={message.artifact?.clarifications || runtime.clarifications || []}
        answers={runtime.answers || {}}
        setAnswers={actions.setAnswers}
        onSubmit={actions.generateDraftWithAnswers}
        loading={false}
      />
    );
  }
  if (message.type === "draft_card") {
    return <DraftCards draft={message.artifact?.draft || runtime.draft} sourceTrace={message.artifact?.sourceTrace || runtime.sourceTrace} changes={message.artifact?.changes || []} onRefine={actions.refineDraft} onApprove={actions.approve} loading={false} />;
  }
  if (message.type === "completion_card") return <ApprovedState />;
  if (message.type === "error") return <ErrorCard message={message.text} onRetry={actions.runAnalysis} />;
  return null;
}

function ToolCallCard({ calls = [], nextAction }) {
  if (!calls.length) return null;
  return (
    <AssistantCardMessage>
      <Panel className="ce-agent-tool-card ce-generated-card" style={{ width:"100%", background:"var(--sheet)", padding:"12px 14px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:10 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:"var(--t1)" }}>Agent work</div>
            <div style={{ fontSize:11, color:"var(--t3)", marginTop:2 }}>High-level tool trace, not hidden reasoning.</div>
          </div>
          {nextAction?.label && <Pill tone="neutral">{nextAction.label}</Pill>}
        </div>
        <div style={{ display:"grid", gap:8 }}>
          {calls.map(call => <ToolCallRow key={call.id || call.name} call={call} />)}
        </div>
      </Panel>
    </AssistantCardMessage>
  );
}

function ToolCallRow({ call }) {
  const tone = call.status === "success" ? "success" : call.status === "partial" ? "warning" : call.status === "needs_input" ? "warning" : "neutral";
  const artifactRows = summarizeToolArtifact(call.artifact);
  return (
    <div className="ce-tool-call-row">
      <span className={`ce-tool-status ce-tool-status-${call.status || "neutral"}`} />
      <div style={{ minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <strong>{call.label || call.name}</strong>
          <Pill tone={tone}>{call.status || "ready"}</Pill>
        </div>
        <p>{call.summary || "Completed."}</p>
        {call.source_url && <a href={call.source_url} target="_blank" rel="noreferrer">{call.source_url}</a>}
        {artifactRows.length > 0 && (
          <div className="ce-tool-artifacts">
            {artifactRows.map(row => <span key={row}>{row}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

function summarizeToolArtifact(artifact = {}) {
  if (!artifact || typeof artifact !== "object") return [];
  const rows = [];
  if (artifact.company) rows.push(`Brand: ${artifact.company}`);
  if (artifact.filled_fields?.length) rows.push(`Fields: ${artifact.filled_fields.join(", ")}`);
  if (artifact.source_confidence) rows.push(`Source confidence: ${artifact.source_confidence}`);
  if (artifact.source_pages?.length) rows.push(`Pages read: ${artifact.source_pages.length}`);
  if (artifact.evidence_snippets?.length) rows.push(`Evidence snippets: ${artifact.evidence_snippets.length}`);
  if (artifact.confidence_score != null) rows.push(`Signal: ${artifact.confidence_score}%`);
  if (artifact.extracted_text_chars) rows.push(`Text read: ${artifact.extracted_text_chars} chars`);
  if (artifact.missing_fields?.length) rows.push(`Missing: ${artifact.missing_fields.slice(0, 2).join(" · ")}`);
  if (artifact.limitation) rows.push(artifact.limitation);
  return rows.slice(0, 4);
}

function ReflectionCard({ reflection }) {
  if (!reflection) return null;
  return (
    <AssistantCardMessage>
      <Panel className="ce-generated-card" style={{ width:"100%", background:"var(--fill)", padding:"12px 14px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"center", marginBottom:10 }}>
          <div style={{ fontSize:13, fontWeight:750, color:"var(--t1)" }}>{reflection.title || "What I’m checking"}</div>
          {reflection.confidence && <Pill tone="neutral">{reflection.confidence}</Pill>}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:10 }}>
          <ReflectionList title="Checked" items={reflection.checked} />
          <ReflectionList title="Inferred" items={reflection.inferred} />
          <ReflectionList title="Still missing" items={reflection.missing} />
        </div>
        {reflection.next && <div style={{ marginTop:10, fontSize:12, color:"var(--t2)", lineHeight:1.5 }}><b>Next move:</b> {reflection.next}</div>}
      </Panel>
    </AssistantCardMessage>
  );
}

function ReflectionList({ title, items = [] }) {
  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>{title}</div>
      <div style={{ display:"grid", gap:4 }}>
        {(items.length ? items : ["No signal yet"]).slice(0, 4).map(item => (
          <div key={item} style={{ fontSize:12, color:"var(--t2)", lineHeight:1.45 }}>• {item}</div>
        ))}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"32px minmax(0,1fr)", gap:12, alignItems:"start" }} className="anim-fade">
      <div className="ce-agent-avatar is-thinking">CE</div>
      <Panel className="ce-chat-bubble ce-chat-bubble-assistant ce-thinking-panel" style={{ background:"var(--sheet)", padding:"10px 12px", width:"fit-content" }} aria-label="Creative Engine is responding">
        <div style={{ display:"flex", alignItems:"center", gap:9 }}>
          <span style={{ fontSize:12, color:"var(--t3)", fontWeight:650 }}>Creative Engine is working</span>
          <div className="ce-typing-indicator">
            <span />
            <span />
            <span />
          </div>
        </div>
      </Panel>
    </div>
  );
}

function NextActionPrompt({ onAnalyze, sourceTrace, text, nextAction }) {
  return (
    <AssistantMessage>
      {text || "I have enough to start a first pass. If a source cannot be read, I’ll say so and offer a manual path instead of pretending it was analyzed."}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:12 }}>
        <button onClick={onAnalyze} style={buttonStyle("primary")}>
          <ArrowRight size={14}/>{nextAction?.type === "draft_strategy" ? "Draft setup pass" : "Understand this business"}
        </button>
        <SourceReviewButton sources={sourceTrace.sources} work={sourceTrace.work} confidence={sourceTrace.confidence} />
      </div>
    </AssistantMessage>
  );
}

function UserMessage({ title, icon, status, children }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) 32px", gap:12, alignItems:"start" }} className="anim-fade">
      <Panel className="ce-chat-bubble ce-chat-bubble-user" style={{ justifySelf:"end", width:"100%", background:"var(--fill)", borderColor:"var(--border)", padding:"11px 13px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, fontSize:12, fontWeight:700, color:"var(--t1)", marginBottom:5 }}>
          <span style={{ display:"inline-flex", alignItems:"center", gap:7 }}>
          {icon}
          <span>{title}</span>
          </span>
          {status && <Pill tone={status === "parsed" ? "success" : status === "pending analysis" ? "warning" : "neutral"}>{status}</Pill>}
        </div>
        <div style={{ fontSize:12, color:"var(--t2)", lineHeight:1.55, wordBreak:"break-word" }}>{children}</div>
      </Panel>
      <div style={{ width:32, height:32, borderRadius:9, background:"var(--fill2)", border:"1px solid var(--border)", color:"var(--t2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800 }}>You</div>
    </div>
  );
}

function iconForEvent(kind) {
  if (kind === "website") return <Globe2 size={14}/>;
  if (kind === "file") return <FileText size={14}/>;
  if (kind === "guide") return <HelpCircle size={14}/>;
  return <Pencil size={14}/>;
}

function OnboardingComposer({ mode, value, setMode, setValue, onSubmit, onFiles, onGuide, disabled, suggestions = [], onSuggestion }) {
  const placeholder = mode === "website"
    ? "Paste the website URL..."
    : mode === "notes"
      ? "Paste notes, FAQs, positioning, or claims to handle carefully..."
      : "Describe the business, paste a website, or add notes...";
  return (
    <Panel className="ce-chat-composer" style={{ position:"fixed", left:"50%", bottom:18, transform:"translateX(-50%)", width:"min(760px, calc(100vw - 64px))", zIndex:50, background:"var(--sheet)", boxShadow:"var(--shadow-lg)", padding:10 }}>
      {suggestions.length > 0 && (
        <div className="ce-suggested-replies" aria-label="Suggested replies">
          {suggestions.slice(0, 4).map(suggestion => (
            <button key={suggestion} type="button" onClick={() => onSuggestion?.(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      )}
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={3}
        disabled={disabled}
        placeholder={placeholder}
        style={{ ...inputStyle, minHeight:76, padding:"12px 13px", resize:"none", background:"transparent", border:"1px solid transparent", fontSize:14 }}
      />
      <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center", marginTop:10, flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
          <button type="button" className="ce-action-chip" onClick={() => setMode("website")} style={buttonStyle(mode === "website" ? "secondary" : "ghost")}><Globe2 size={13}/>Add website</button>
          <label className="ce-action-chip" style={buttonStyle("ghost")}>
            <Paperclip size={13}/>Upload file
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.md,.txt,text/plain,text/markdown,application/pdf,image/png,image/jpeg" onChange={e => onFiles(e.target.files)} style={{ display:"none" }} />
          </label>
          <button type="button" className="ce-action-chip" onClick={() => setMode("notes")} style={buttonStyle(mode === "notes" ? "secondary" : "ghost")}><Pencil size={13}/>Paste notes</button>
          <button type="button" className="ce-action-chip" onClick={onGuide} style={buttonStyle("ghost")}><HelpCircle size={13}/>I'm not sure — guide me</button>
        </div>
        <button type="button" className="ce-send-button" onClick={onSubmit} disabled={disabled || !value.trim()} style={buttonStyle("primary", { width:36, height:32, padding:0, borderRadius:8 })} title="Send">
          <Send size={14}/>
        </button>
      </div>
    </Panel>
  );
}

function WorkTraceMessage({ task, steps }) {
  const title = task === "approve" ? "Saving the approved strategy." : task === "draft" ? "Preparing the strategy draft." : task === "research" ? "Reading available sources." : task === "agent" ? "Planning the next setup move." : "Understanding the business.";
  return (
    <AssistantCardMessage>
      <Panel className="ce-thinking-panel ce-generated-card" style={{ background:"var(--sheet)", padding:"13px 14px", width:"100%" }}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"center", marginBottom:10 }}>
          <div style={{ fontSize:14, color:"var(--t1)", fontWeight:750 }}>{title}</div>
          <div className="ce-typing-indicator" aria-hidden="true"><span/><span/><span/></div>
        </div>
        <div style={{ display:"grid", gap:7 }}>
          {steps.map((step, index) => (
            <div key={step} className="ce-work-step-row" style={{ display:"flex", alignItems:"center", gap:8, animationDelay:`${index * 55}ms`, fontSize:12, color:"var(--t2)" }}>
              <span className="ce-work-step-dot" style={{ animationDelay:`${index * 90}ms` }} />
              <span>{step}</span>
            </div>
          ))}
        </div>
      </Panel>
    </AssistantCardMessage>
  );
}

function UnderstandingCard({ facts, setFacts, confidence, limitations, sourceTrace, factReviews = {}, onReviewFact, onContinue }) {
  const sections = [
    ["Company", "company", "I could not identify the company name with enough confidence."],
    ["Products/services", "priority_offer", "I could not identify the priority product line from the uploaded sources."],
    ["Audience", "audience", "I'm not confident enough to use the audience without confirmation."],
    ["Tone/style", "tone_style", "Tone was not clear from the sources."],
    ["Content opportunities", "platforms", "Target platforms still need confirmation."],
    ["Risks/claims", "sensitive_claims", "Claims and sensitive topics need confirmation before publishing."],
  ];
  return (
    <AssistantCardMessage>
      <Panel className="ce-generated-card" style={{ width:"100%" }}>
        <SectionHeader title="What Creative Engine understood" action={<SourceReviewButton sources={sourceTrace.sources} work={[...sourceTrace.work, "Extracted brand facts", "Scored setup completeness"]} confidence={confidence?.score != null ? `Brand understanding ${confidence.score}%` : null} />} />
        <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.55, marginTop:-4, marginBottom:12 }}>Confirm or correct the important pieces before I draft the strategy.</div>
        <BrandUnderstanding score={confidence?.score || 0} signals={confidence?.signals || []} />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(230px, 1fr))", gap:10, marginTop:14 }}>
          {sections.map(([title, key, fallback]) => (
            <EditableFact
              key={key}
              fieldKey={key}
              title={title}
              value={Array.isArray(facts[key]) ? facts[key].join(", ") : facts[key]}
              reviewStatus={factReviews[key]?.status}
              fallback={fallback}
              onReviewFact={onReviewFact}
              onSave={value => {
                const nextValue = key === "platforms" ? value.split(",").map(s => s.trim()).filter(Boolean) : value;
                setFacts(prev => ({ ...prev, [key]: nextValue }));
                onReviewFact?.({ fieldKey:key, value:nextValue, status:"edited", note:"User edited this fact in the understanding card." });
              }}
            />
          ))}
          <FactBlock title="Unclear / needs confirmation" value={limitations.length ? limitations.join(" ") : "No detailed limitation trace was recorded."} muted />
        </div>
        <AssistantActionRow>
          <button onClick={onContinue} style={buttonStyle("primary")}><ArrowRight size={14}/>Continue to clarifications</button>
        </AssistantActionRow>
      </Panel>
    </AssistantCardMessage>
  );
}

function BrandUnderstanding({ score, signals }) {
  return (
    <div style={{ padding:"10px 12px", borderRadius:"var(--ce-radius)", background:"var(--fill2)", border:"1px solid var(--border)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"center", marginBottom:8 }}>
        <div style={{ fontSize:13, fontWeight:700 }}>Brand understanding</div>
        <div style={{ fontSize:18, fontWeight:700, fontFamily:"var(--font-mono)" }}>{score}%</div>
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        {signals.map(signal => <Pill key={signal.label} tone={signal.ok ? "success" : "warning"}>{signal.label}</Pill>)}
      </div>
    </div>
  );
}

function ClarificationCards({ clarifications, answers, setAnswers, onBack, onSubmit, loading }) {
  if (!clarifications.length) {
    return (
      <AssistantCardMessage>
        <Panel style={{ width:"100%" }}>
          <EmptyState title="No clarifications needed" description="The available sources gave enough structure for a first draft." action={onSubmit} actionLabel="Generate draft strategy" />
        </Panel>
      </AssistantCardMessage>
    );
  }
  const visibleQuestions = clarifications.slice(0, 2);
  const hiddenCount = Math.max(0, clarifications.length - visibleQuestions.length);
  return (
    <AssistantCardMessage>
      <Panel className="ce-generated-card" style={{ width:"100%" }}>
        <SectionHeader title={visibleQuestions.length === 1 ? "I’m missing one thing before I draft this" : "I’m missing two things before I draft this"} />
        <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.55, marginTop:-4, marginBottom:12 }}>
          Answer these now, or let Creative Engine suggest conservative defaults. {hiddenCount ? `${hiddenCount} lower-priority question${hiddenCount === 1 ? "" : "s"} will be handled as uncertain in the draft.` : ""}
        </div>
      <div style={{ display:"grid", gap:10 }}>
        {visibleQuestions.map((q, index) => <QuestionCard key={q.id || q.key || index} question={q} value={answers[q.id || q.key]} onChange={value => setAnswers(prev => ({ ...prev, [q.id || q.key]: value }))} />)}
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:14 }}>
        {onBack && <button onClick={onBack} style={buttonStyle("ghost")}>Back</button>}
        <button onClick={onSubmit} disabled={loading} style={buttonStyle("primary")}><ArrowRight size={14}/>Generate draft strategy</button>
      </div>
      </Panel>
    </AssistantCardMessage>
  );
}

function DraftCards({ draft, sourceTrace, changes = [], onBack, onRefine, onApprove, loading }) {
  const [instruction, setInstruction] = useState("");
  return (
    <AssistantCardMessage>
      <Panel className="ce-generated-card" style={{ width:"100%" }}>
        <SectionHeader title="Draft strategy" action={<SourceReviewButton sources={sourceTrace.sources} work={[...sourceTrace.work, "Drafted Brand Profile", "Drafted Content Strategy", "Drafted Programmes", "Prepared first content ideas"]} />} />
        <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.55, marginTop:-4, marginBottom:12 }}>Review before saving. Nothing is written to final settings until approval.</div>
        {changes.length > 0 && (
          <div style={{ padding:"10px 12px", border:"1px solid var(--border)", background:"var(--fill2)", borderRadius:"var(--ce-radius)", marginBottom:12 }}>
            <div style={{ fontSize:12, fontWeight:750, color:"var(--t1)", marginBottom:6 }}>What changed</div>
            <div style={{ display:"grid", gap:5 }}>
              {changes.slice(0, 5).map(change => <div key={change} style={{ fontSize:12, color:"var(--t2)", lineHeight:1.45 }}>• {change}</div>)}
            </div>
          </div>
        )}
        <div style={{ display:"grid", gap:12 }}>
          <JsonCard title="Brand Profile draft" data={draft.brand_profile} />
          <JsonCard title="Content Strategy draft" data={draft.content_strategy} />
          {draft.quality_review && <QualityReviewCard review={draft.quality_review} />}
          <ProgrammeDraftCard programmes={draft.programmes || []} />
          {(draft.source_citations || draft.assumptions) && <EvidenceAssumptionsCard citations={draft.source_citations || []} assumptions={draft.assumptions || []} />}
          <ListCard title="Risk / claims checklist" items={draft.risk_checklist || []} />
          <IdeasCard ideas={draft.first_content_ideas || []} />
      </div>
      {onRefine && (
        <div style={{ marginTop:14, padding:12, border:"1px solid var(--border)", background:"var(--fill)", borderRadius:"var(--ce-radius)" }}>
          <div style={{ fontSize:13, fontWeight:750, color:"var(--t1)", marginBottom:7 }}>Refine before approval</div>
          <textarea
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            rows={2}
            placeholder="Example: make this more B2B, focus on LinkedIn, reduce sales language..."
            style={{ ...inputStyle, minHeight:62, resize:"vertical", padding:"9px 10px" }}
          />
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
            <button
              onClick={() => {
                const text = instruction.trim();
                if (!text) return;
                setInstruction("");
                onRefine(text);
              }}
              disabled={loading || !instruction.trim()}
              style={buttonStyle("secondary")}
            >
              Refine draft
            </button>
          </div>
        </div>
      )}
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:14 }}>
        {onBack && <button onClick={onBack} style={buttonStyle("ghost")}>Review understanding</button>}
        <button onClick={onApprove} disabled={loading} style={buttonStyle("primary")}><Check size={14}/>Approve and save strategy</button>
      </div>
      </Panel>
    </AssistantCardMessage>
  );
}

function ApprovedState() {
  return (
    <AssistantCardMessage>
      <Panel style={{ textAlign:"center", padding:"28px", width:"100%" }}>
        <div style={{ width:44, height:44, borderRadius:99, background:"var(--success-bg)", color:"var(--success)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}><Check size={22}/></div>
        <div style={{ fontSize:22, fontWeight:800, color:"var(--t1)", marginBottom:6 }}>Your content engine is ready.</div>
        <div style={{ fontSize:13, color:"var(--t3)", lineHeight:1.55, maxWidth:560, margin:"0 auto" }}>Strategy saved, programmes active, first ideas prepared, and risk guidance captured for future compliance checks.</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center", marginTop:18 }}>
          <button onClick={() => window.location.href = "/?tab=strategy"} style={buttonStyle("primary")}>Review in Strategy</button>
          <button onClick={() => window.location.href = "/?tab=research"} style={buttonStyle("secondary")}>Open Ideas</button>
          <button onClick={() => window.location.href = "/?tab=create"} style={buttonStyle("secondary")}>Create first content</button>
          <button onClick={() => window.location.href = "/?tab=home"} style={buttonStyle("ghost")}>Go to Home</button>
        </div>
      </Panel>
    </AssistantCardMessage>
  );
}

function ChipGroup({ values, selected = [], onToggle }) {
  return <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>{values.map(value => <button key={value} onClick={() => onToggle(value)} style={chipStyle(selected.includes(value))}>{value}</button>)}</div>;
}

function EditableFact({ fieldKey, title, value, fallback, reviewStatus, onReviewFact, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const uncertain = !value;
  return (
    <div style={factStyle}>
      <div style={{ display:"flex", justifyContent:"space-between", gap:8, marginBottom:7 }}>
        <div style={{ fontSize:13, fontWeight:700 }}>{title}</div>
        <button onClick={() => setEditing(true)} style={smallIconButton}><Pencil size={12}/></button>
      </div>
      {editing ? (
        <div style={{ display:"grid", gap:7 }}>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} style={{ ...inputStyle, minHeight:78, resize:"vertical" }} />
          <button onClick={() => { onSave(draft); setEditing(false); }} style={buttonStyle("primary")}>Confirm</button>
        </div>
      ) : (
        <div style={{ fontSize:12, lineHeight:1.55, color:uncertain ? "var(--warning)" : "var(--t2)" }}>
          {uncertain && <ShieldAlert size={13} style={{ verticalAlign:"-2px", marginRight:5 }} />}
          {value || fallback}
        </div>
      )}
      {!editing && value && (
        <FactReviewMini fieldKey={fieldKey} value={value} status={reviewStatus} onReviewFact={onReviewFact} />
      )}
    </div>
  );
}

function FactBlock({ title, value, muted }) {
  return <div style={factStyle}><div style={{ fontSize:13, fontWeight:700, marginBottom:7 }}>{title}</div><div style={{ fontSize:12, lineHeight:1.55, color:muted ? "var(--t3)" : "var(--t2)" }}>{value}</div></div>;
}

function QuestionCard({ question, value, onChange }) {
  const options = question.options || [];
  const key = question.id || question.key;
  if (question.question_type === "free_text") {
    return <div style={factStyle}><QuestionTitle question={question}/><textarea value={value || ""} onChange={e => onChange(e.target.value)} rows={3} style={{ ...inputStyle, minHeight:82, resize:"vertical" }} /><button onClick={() => onChange(UNSURE)} style={buttonStyle("ghost")}>{UNSURE}</button></div>;
  }
  if (question.question_type === "multi_choice") {
    const selected = Array.isArray(value) ? value : [];
    return <div style={factStyle}><QuestionTitle question={question}/><ChipGroup values={options} selected={selected} onToggle={option => onChange(selected.includes(option) ? selected.filter(v => v !== option) : [...selected, option])} /></div>;
  }
  return (
    <div style={factStyle}>
      <QuestionTitle question={question}/>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        {options.map(option => <button key={`${key}-${option}`} onClick={() => onChange(option)} style={chipStyle(value === option)}>{option}</button>)}
      </div>
      {question.question_type === "choice_plus_other" && <input value={typeof value === "string" && !options.includes(value) ? value : ""} onChange={e => onChange(e.target.value)} placeholder="Other..." style={{ ...inputStyle, marginTop:8 }} />}
    </div>
  );
}

function QuestionTitle({ question }) {
  return <div style={{ fontSize:13, fontWeight:700, color:"var(--t1)", marginBottom:8 }}>{question.question}{question.required && <span style={{ color:"var(--warning)" }}> *</span>}</div>;
}

function JsonCard({ title, data }) {
  const entries = Object.entries(data || {}).filter(([, value]) => value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length));
  return (
    <div style={factStyle} className="ce-generated-card">
      <div style={{ fontSize:14, fontWeight:750, marginBottom:8 }}>{title}</div>
      {entries.length ? (
        <div style={{ display:"grid", gap:8 }}>
          {entries.slice(0, 8).map(([key, value]) => (
            <div key={key} style={{ display:"grid", gridTemplateColumns:"minmax(110px, 0.36fr) minmax(0, 1fr)", gap:10, alignItems:"start" }}>
              <div style={{ fontSize:11, color:"var(--t3)", textTransform:"capitalize" }}>{key.replace(/_/g, " ")}</div>
              <div style={{ fontSize:12, color:"var(--t2)", lineHeight:1.5 }}>{formatDraftValue(value)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize:12, color:"var(--t3)" }}>No draft details were returned for this section.</div>
      )}
    </div>
  );
}

function EvidenceAssumptionsCard({ citations = [], assumptions = [] }) {
  return (
    <div style={factStyle}>
      <div style={{ fontSize:14, fontWeight:750, marginBottom:8 }}>Evidence and assumptions</div>
      <div style={{ display:"grid", gap:8 }}>
        {citations.slice(0, 4).map(citation => (
          <div key={citation.field_key} style={{ padding:"8px 0", borderTop:"1px solid var(--border2)" }}>
            <div style={{ fontSize:12, color:"var(--t1)", fontWeight:700 }}>{citation.field_label} · {citation.confidence}</div>
            {(citation.evidence || []).slice(0, 2).map(item => (
              <div key={`${citation.field_key}-${item.excerpt}`} style={{ fontSize:12, color:"var(--t3)", lineHeight:1.45, marginTop:4 }}>
                {item.excerpt}
              </div>
            ))}
          </div>
        ))}
        {assumptions.slice(0, 4).map(assumption => (
          <div key={assumption.field_key} style={{ fontSize:12, color:"var(--t3)", lineHeight:1.45 }}>
            <b>{assumption.label}:</b> {assumption.note}
          </div>
        ))}
        {!citations.length && !assumptions.length && <div style={smallText}>No detailed source trace is available for this draft.</div>}
      </div>
    </div>
  );
}

function QualityReviewCard({ review }) {
  return (
    <div style={factStyle}>
      <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center", marginBottom:8 }}>
        <div style={{ fontSize:14, fontWeight:750 }}>Strategy quality review</div>
        <Pill tone={review.status === "clear" ? "success" : "warning"}>{review.score}% · {review.status}</Pill>
      </div>
      <div style={{ display:"grid", gap:7 }}>
        {(review.issues || []).slice(0, 5).map(item => (
          <div key={`${item.category}-${item.message}`} style={{ fontSize:12, color:"var(--t2)", lineHeight:1.45 }}>
            <b>{item.severity}:</b> {item.message}
          </div>
        ))}
        {!(review.issues || []).length && <div style={smallText}>No major quality issues detected in this deterministic review.</div>}
      </div>
    </div>
  );
}

function ProgrammeDraftCard({ programmes }) {
  return (
    <div style={factStyle}>
      <div style={{ fontSize:14, fontWeight:750, marginBottom:10 }}>Recommended Programmes</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:10 }}>
        {programmes.map(programme => (
          <div key={programme.id || programme.name} style={{ padding:12, borderRadius:"var(--ce-radius)", border:"1px solid var(--border)", background:"var(--sheet)" }}>
            <div style={{ fontSize:13, fontWeight:700 }}>{programme.name}</div>
            <div style={smallText}>{programme.description}</div>
            <div style={smallText}><b>Cadence:</b> {programme.cadence}</div>
            <div style={smallText}><b>Why:</b> {programme.why_this_works}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListCard({ title, items }) {
  return <div style={factStyle}><div style={{ fontSize:14, fontWeight:750, marginBottom:8 }}>{title}</div><div style={{ display:"grid", gap:7 }}>{items.map(item => <div key={item} style={{ fontSize:12, color:"var(--t2)", lineHeight:1.45 }}>• {item}</div>)}</div></div>;
}

function IdeasCard({ ideas }) {
  return (
    <div style={factStyle}>
      <div style={{ fontSize:14, fontWeight:750, marginBottom:8 }}>First 10 content ideas</div>
      <div style={{ display:"grid", gap:7 }}>
        {ideas.map(idea => <div key={idea.id || idea.title} style={{ display:"flex", justifyContent:"space-between", gap:12, padding:"8px 0", borderTop:"1px solid var(--border2)" }}><span style={{ fontSize:12, color:"var(--t1)", fontWeight:600 }}>{idea.title}</span><span style={{ fontSize:11, color:"var(--t3)" }}>{idea.platform} · {idea.format}</span></div>)}
      </div>
    </div>
  );
}

function formatDraftValue(value) {
  if (Array.isArray(value)) return value.map(item => typeof item === "object" ? item.title || item.name || JSON.stringify(item) : item).join(", ");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key.replace(/_/g, " ")}: ${Array.isArray(item) ? item.join(", ") : item}`).join(" · ");
  return String(value);
}

function ErrorCard({ message, onRetry }) {
  return (
    <AssistantCardMessage>
      <Panel style={{ borderColor:"var(--error-border)", background:"var(--error-bg)", width:"100%" }}>
        <SectionHeader title="I couldn't complete that step" description={message} />
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {onRetry && <button onClick={onRetry} style={buttonStyle("secondary")}><RefreshCw size={13}/>Retry</button>}
          <button onClick={() => window.location.href = "/?tab=strategy"} style={buttonStyle("ghost")}>Continue manually</button>
        </div>
      </Panel>
    </AssistantCardMessage>
  );
}

function buildSourceTrace(intake, savedSources, factEvidence = null) {
  const sources = [];
  const work = [];
  if (intake.websiteUrl) {
    sources.push({ title:intake.websiteUrl, type:"Website URL", confidence:"stored" });
    work.push("Stored website URL");
  }
  if (intake.notes) {
    sources.push({ title:"Pasted notes", type:"Text note", confidence:"parsed" });
    work.push("Read pasted notes");
  }
  for (const file of intake.files || []) {
    sources.push({ title:file.name, type:file.mime_type || "file", confidence:file.status });
    work.push(file.status === "parsed" ? `Parsed ${file.name}` : `Stored ${file.name}; analysis pending`);
  }
  if (Object.values(intake.manual || {}).some(v => Array.isArray(v) ? v.length : v)) {
    sources.push({ title:"Manual answers", type:"User answer", confidence:"provided by user" });
    work.push("Used manual answers");
  }
  for (const source of savedSources || []) {
    const intelligence = source.metadata_json?.source_intelligence;
    if (intelligence?.evidence_snippets?.length) {
      sources.push({
        title: source.url || source.filename || `${source.source_type || "Source"} evidence`,
        type: source.source_type || "source",
        confidence: intelligence.confidence || source.status || "stored",
        evidence: intelligence.evidence_snippets.slice(0, 3),
      });
    }
    if (intelligence?.summary) work.push(`Summarized ${source.url || source.filename || source.source_type || "source"} (${intelligence.confidence || "unknown"} confidence)`);
  }
  const evidenceCount = factEvidence
    ? Object.values(factEvidence).reduce((total, items) => total + (Array.isArray(items) ? items.length : 0), 0)
    : 0;
  if (evidenceCount) work.push(`Linked ${evidenceCount} evidence snippet${evidenceCount === 1 ? "" : "s"} to inferred facts`);
  if (savedSources?.length) work.push(`Saved ${savedSources.length} source record${savedSources.length === 1 ? "" : "s"}`);
  return { sources, work, confidence:sources.length ? "Source trace is based on available V1 intake records." : null };
}

function restoreOnboardingState(state, setters) {
  if (!state || typeof state !== "object") return;
  if (state.phase) setters.setPhase(state.phase);
  if (state.intake && typeof state.intake === "object") setters.setIntake({ ...blankOnboardingIntake(), ...state.intake });
  setters.setSources(Array.isArray(state.sources) ? state.sources : []);
  setters.setFacts(state.facts || null);
  setters.setConfidence(state.confidence || null);
  setters.setClarifications(Array.isArray(state.clarifications) ? state.clarifications : []);
  setters.setAnswers(state.answers && typeof state.answers === "object" ? state.answers : {});
  setters.setDraft(state.draft || null);
  setters.setLimitations(Array.isArray(state.limitations) ? state.limitations : []);
  setters.setSetupBrief(state.setupBrief && typeof state.setupBrief === "object" ? { ...EMPTY_SETUP_BRIEF, ...state.setupBrief } : EMPTY_SETUP_BRIEF);
  setters.setSuggestedReplies(Array.isArray(state.suggestedReplies) ? state.suggestedReplies : []);
}

async function streamOnboardingAgent({ token, onToken, onToolCalls, ...body }) {
  const res = await fetch("/api/onboarding/agent-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || `API ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream:true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const event = parseSseChunk(chunk);
      if (!event) continue;
      if (event.event === "token") onToken?.(event.data.text || "");
      if (event.event === "tool_calls") onToolCalls?.(event.data);
      if (event.event === "final") finalPayload = event.data;
      if (event.event === "error") throw new Error(event.data.error || "Onboarding stream failed");
    }
  }

  if (buffer.trim()) {
    const event = parseSseChunk(buffer);
    if (event?.event === "final") finalPayload = event.data;
  }

  if (!finalPayload) throw new Error("Onboarding stream ended without a final payload.");
  return finalPayload;
}

function parseSseChunk(chunk) {
  const lines = String(chunk || "").split("\n");
  const eventLine = lines.find(line => line.startsWith("event:"));
  const dataLine = lines.find(line => line.startsWith("data:"));
  if (!dataLine) return null;
  try {
    return {
      event: eventLine ? eventLine.replace(/^event:\s*/, "").trim() : "message",
      data: JSON.parse(dataLine.replace(/^data:\s*/, "")),
    };
  } catch {
    return null;
  }
}

function sanitizeStreamedAssistantText(text) {
  return String(text || "")
    .replace(/<brand_extract>[\s\S]*?<\/brand_extract>/g, "")
    .split("<brand_extract>")[0]
    .trimStart();
}

function buildInlineSources(intake) {
  const sources = [];
  if (intake.websiteUrl) sources.push({ title:intake.websiteUrl, type:"website", typeLabel:"Website", status:"stored" });
  if (intake.notes) sources.push({ title:"Pasted notes", type:"text_note", typeLabel:"Notes", status:"parsed" });
  for (const file of intake.files || []) {
    sources.push({ title:file.name, type:file.mime_type || "file", typeLabel:"File", status:file.status || "stored" });
  }
  if (Object.values(intake.manual || {}).some(v => Array.isArray(v) ? v.length : v)) {
    sources.push({ title:"Manual answers", type:"manual_answer", typeLabel:"Answers", status:"provided" });
  }
  return sources;
}

function buildSourcePayload(intake) {
  const sources = [];
  if (intake.websiteUrl) sources.push({ source_type:"website", url:intake.websiteUrl, summary:"User-provided website URL", metadata_json:{ status:"stored" } });
  if (intake.notes) sources.push({ source_type:"text_note", text:intake.notes, metadata_json:{ status:"parsed" } });
  if (Object.values(intake.manual || {}).some(v => Array.isArray(v) ? v.length : v)) sources.push({ source_type:"manual_answer", text:JSON.stringify(intake.manual, null, 2), metadata_json:{ status:"parsed" } });
  for (const file of intake.files || []) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const source_type = ext === "md" ? "markdown" : ext === "pdf" ? "pdf" : ["jpg", "jpeg", "png"].includes(ext) ? "image" : "text_note";
    sources.push({ source_type, filename:file.name, mime_type:file.mime_type, text:file.text, image_base64:file.image_base64 || "", metadata_json:{ size:file.size, status:file.status, note:file.note, extraction_method:file.extraction_method, ocr_status:file.ocr_status, confidence:file.confidence } });
  }
  return sources;
}

function hasUserProvidedSource(intake) {
  const manual = intake.manual || {};
  const manualSignals = [
    manual.priorityOffer,
    manual.audience,
    manual.goal,
    manual.toneAvoid,
    manual.sensitiveClaims,
    manual.assetRights,
    ...(manual.platforms || []),
    ...(manual.formats || []),
  ];
  return Boolean(intake.websiteUrl || intake.notes || intake.files.length || manualSignals.some(Boolean));
}

function summarizeInline(text, limit = 220) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1).trim()}...`;
}

function questionKey(question) {
  const q = String(question || "").toLowerCase();
  if (q.includes("product") || q.includes("service")) return "priority_offer";
  if (q.includes("audience")) return "audience";
  if (q.includes("goal")) return "content_goal";
  if (q.includes("platform")) return "platforms";
  if (q.includes("right")) return "asset_rights";
  return "tone_avoid";
}

function friendlyOnboardingError(message) {
  const text = String(message || "");
  if (/url|website|fetch|access/i.test(text)) return "I couldn't access this page. You can paste key text, upload a document, try another URL, or continue manually.";
  if (/pdf|image|parse/i.test(text)) return "This file was uploaded, but deep analysis is not available yet. You can paste relevant text or continue with other sources.";
  return text || "I couldn't complete this analysis. You can retry or continue manually.";
}

function formatRefinementChanges(changes = []) {
  if (!changes.length) return "I revised the draft and kept it unsaved so you can review it before approval.";
  return `I revised the draft. Changes:\n${changes.slice(0, 5).map(change => `- ${change}`).join("\n")}`;
}

const inputStyle = { width:"100%", minHeight:34, borderRadius:"var(--ce-radius-sm)", border:"1px solid var(--border)", background:"var(--fill2)", color:"var(--t1)", fontSize:13, padding:"0 10px", outline:"none", fontFamily:"inherit", boxSizing:"border-box" };
const factStyle = { padding:14, borderRadius:"var(--ce-radius)", border:"1px solid var(--border)", background:"var(--fill2)", minWidth:0 };
const smallIconButton = { width:26, height:26, borderRadius:"var(--ce-radius-sm)", border:"1px solid var(--border)", background:"transparent", color:"var(--t3)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" };
const smallText = { fontSize:12, color:"var(--t3)", lineHeight:1.45, margin:"6px 0 0" };
function chipStyle(active) {
  return { padding:"6px 10px", borderRadius:99, border:"1px solid var(--border)", background:active ? "var(--t1)" : "var(--fill2)", color:active ? "var(--bg)" : "var(--t2)", fontSize:12, cursor:"pointer", fontFamily:"inherit" };
}
