"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, Globe2, HelpCircle, Pencil, RefreshCw, ShieldAlert, Upload } from "lucide-react";
import { supabase, getBrandProfiles, getWorkspaces, createBrandProfile } from "@/lib/db";
import { defaultTenant, normalizeTenant, tenantStorageKey } from "@/lib/brand";
import { applyClarificationAnswers, blankOnboardingIntake, buildClarifications } from "@/lib/onboarding";
import { EmptyState, GeneratingCard, Panel, Pill, SectionHeader, SkeletonCard, SourceReviewButton, WorkTrace, buttonStyle, labelStyle } from "@/components/OperationalUI";

const PLATFORM_OPTIONS = ["Instagram", "LinkedIn", "YouTube", "TikTok", "Newsletter"];
const FORMAT_OPTIONS = ["Short video", "Carousel", "Text post", "Newsletter", "Case study"];
const UNSURE = "I'm not sure — suggest for me";

const WORK_STEPS = {
  intake: ["Saving sources", "Reading text notes", "Preparing source records"],
  analyze: ["Extracting business facts", "Identifying products/services", "Identifying likely audiences", "Checking unclear claims", "Preparing clarification questions"],
  draft: ["Drafting Brand Profile", "Drafting Content Strategy", "Drafting Programmes", "Preparing first content ideas"],
  approve: ["Saving approved strategy", "Activating programmes", "Preparing next actions"],
};

export default function OnboardingPage() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tenant, setTenant] = useState(null);
  const [brandProfile, setBrandProfile] = useState(null);
  const [phase, setPhase] = useState("intake");
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
        setBrandProfile(profile);
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
  const currentWork = loadingTask ? WORK_STEPS[loadingTask] || [] : [];

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

  const runAnalysis = useCallback(async () => {
    if (!tenant) return;
    setLoadingTask("analyze");
    setError(null);
    try {
      const sessionJson = await api("/api/onboarding/session", {
        workspace_id: tenant.workspace_id,
        brand_profile_id: tenant.brand_profile_id,
        mode,
      });
      const nextSession = sessionJson.session;
      setSession(nextSession);

      const sourcePayload = buildSourcePayload(intake);
      if (sourcePayload.length) {
        const sourceJson = await api("/api/onboarding/source", {
          workspace_id: tenant.workspace_id,
          session_id: nextSession.id,
          sources: sourcePayload,
        });
        setSources(sourceJson.sources || sourcePayload);
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
    } catch (e) {
      setError(friendlyOnboardingError(e.message));
    } finally {
      setLoadingTask(null);
    }
  }, [tenant, mode, intake]);

  const generateDraftWithAnswers = useCallback(async () => {
    if (!tenant || !session) return;
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
      setFacts(applyClarificationAnswers(analyzed.facts || facts || {}, keyedAnswers));
      setConfidence(analyzed.confidence);
      setClarifications(analyzed.clarifications || []);
      setDraft(analyzed.draft);
      setPhase("draft");
    } catch (e) {
      setError(friendlyOnboardingError(e.message));
    } finally {
      setLoadingTask(null);
    }
  }, [tenant, session, answers, clarifications, intake, facts]);

  const approve = useCallback(async () => {
    if (!tenant || !session || !draft) return;
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
    } catch (e) {
      setError(friendlyOnboardingError(e.message));
    } finally {
      setLoadingTask(null);
    }
  }, [tenant, session, draft]);

  const updateManual = (key, value) => {
    setIntake(prev => ({ ...prev, manual: { ...prev.manual, [key]: value } }));
  };

  const toggleManualArray = (key, value) => {
    setIntake(prev => {
      const current = prev.manual[key] || [];
      const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, manual: { ...prev.manual, [key]: next } };
    });
  };

  const onFiles = async (files) => {
    const rows = [];
    for (const file of Array.from(files || [])) {
      const isText = file.type.startsWith("text/") || /\.(md|txt)$/i.test(file.name);
      const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
      const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png)$/i.test(file.name);
      rows.push({
        name: file.name,
        mime_type: file.type || "application/octet-stream",
        size: file.size,
        text: isText ? await file.text() : "",
        status: isText ? "parsed" : isPdf || isImage ? "pending analysis" : "unsupported",
        note: isText ? "Text parsed for V1 analysis." : isPdf || isImage ? "Stored as a source record. Deep analysis is not available yet." : "Stored, but this file type is not parsed in V1.",
      });
    }
    setIntake(prev => ({ ...prev, files: [...prev.files, ...rows] }));
  };

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
      <header style={{ height:58, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, padding:"0 24px", borderBottom:"1px solid var(--border)", background:"var(--nav)", backdropFilter:"blur(18px)" }}>
        <div>
          <div style={{ fontSize:12, color:"var(--t3)", fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase" }}>Creative Engine onboarding</div>
          <div style={{ fontSize:13, color:"var(--t2)", marginTop:2 }}>{brandProfile?.name || "New workspace"} · {mode.replace(/_/g, " ")}</div>
        </div>
        <button onClick={() => window.location.href = "/?tab=home"} style={buttonStyle("ghost")}><ArrowLeft size={14}/>Back to app</button>
      </header>

      <ConversationFrame>
        {error && <ErrorCard message={error} onRetry={phase === "intake" ? runAnalysis : generateDraftWithAnswers} />}

        <AssistantMessage title="Give Creative Engine something to understand your business.">
          Start with sources instead of a long questionnaire. I can use website URLs, pasted notes, manual answers, and text files. PDF and image files can be stored now, but deep analysis is not available yet.
        </AssistantMessage>

        <PrivacyNotice />

        {phase === "intake" && (
          <>
            <UserSourceCard intake={intake} setIntake={setIntake} updateManual={updateManual} toggleManualArray={toggleManualArray} onFiles={onFiles} sourceTrace={sourceTrace} />
            <AssistantActionRow>
              <button onClick={runAnalysis} disabled={Boolean(loadingTask) || !hasAnySource(intake)} style={buttonStyle("primary")}>
                <ArrowRight size={14}/>Understand this business
              </button>
              <span style={{ fontSize:12, color:"var(--t3)" }}>You can continue manually if sources are limited.</span>
            </AssistantActionRow>
          </>
        )}

        {loadingTask && (
          <GeneratingCard
            title={loadingTask === "approve" ? "Saving approved strategy" : loadingTask === "draft" ? "Preparing strategy draft" : "Understanding your business"}
            description="High-level work only. No hidden reasoning is displayed."
            steps={currentWork}
          />
        )}

        {facts && phase !== "intake" && (
          <UnderstandingCard
            facts={facts}
            setFacts={setFacts}
            confidence={confidence}
            limitations={limitations}
            sourceTrace={sourceTrace}
            onContinue={() => {
              const qs = buildClarifications(facts);
              setClarifications(qs);
              setPhase(qs.length ? "clarify" : "draft");
            }}
          />
        )}

        {phase === "clarify" && (
          <ClarificationCards clarifications={clarifications} answers={answers} setAnswers={setAnswers} onBack={() => setPhase("understood")} onSubmit={generateDraftWithAnswers} loading={Boolean(loadingTask)} />
        )}

        {draft && phase === "draft" && (
          <DraftCards draft={draft} sourceTrace={sourceTrace} onBack={() => setPhase("understood")} onApprove={approve} loading={Boolean(loadingTask)} />
        )}

        {phase === "approved" && <ApprovedState />}
      </ConversationFrame>
    </OnboardingShell>
  );
}

function OnboardingShell({ children }) {
  return <div style={{ minHeight:"100vh", background:"var(--bg)", color:"var(--t1)" }}>{children}</div>;
}

function ConversationFrame({ children }) {
  return <main style={{ maxWidth:900, margin:"0 auto", padding:"28px 20px 80px", display:"flex", flexDirection:"column", gap:16 }}>{children}</main>;
}

function AssistantMessage({ title, children }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"34px minmax(0,1fr)", gap:12, alignItems:"start" }} className="anim-fade">
      <div style={{ width:34, height:34, borderRadius:10, background:"var(--t1)", color:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800 }}>CE</div>
      <Panel style={{ background:"var(--sheet)" }}>
        <div style={{ fontSize:15, fontWeight:700, color:"var(--t1)", marginBottom:5 }}>{title}</div>
        <div style={{ fontSize:13, color:"var(--t2)", lineHeight:1.6 }}>{children}</div>
      </Panel>
    </div>
  );
}

function AssistantActionRow({ children }) {
  return <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", paddingLeft:46 }}>{children}</div>;
}

function PrivacyNotice() {
  return (
    <div style={{ marginLeft:46, padding:"10px 12px", borderRadius:"var(--ce-radius)", background:"var(--accent-bg)", border:"1px solid var(--accent-border)", fontSize:12, color:"var(--t2)", lineHeight:1.5 }}>
      Creative Engine may process the sources you provide to draft your strategy. Only upload materials you are allowed to use. Privacy and data controls can be reviewed in Settings.
    </div>
  );
}

function UserSourceCard({ intake, setIntake, updateManual, toggleManualArray, onFiles, sourceTrace }) {
  return (
    <Panel style={{ marginLeft:46 }}>
      <SectionHeader title="Source intake" description="Add what you have. The flow adapts to the useful signals available." action={<SourceReviewButton sources={sourceTrace.sources} work={sourceTrace.work} confidence={sourceTrace.confidence} />} />
      <div style={{ display:"grid", gap:14 }}>
        <Field label="Website URL" icon={<Globe2 size={14}/>}>
          <input value={intake.websiteUrl} onChange={e => setIntake(prev => ({ ...prev, websiteUrl:e.target.value }))} placeholder="https://example.com" style={inputStyle} />
          <Hint>V1 stores this URL. It does not run advanced open-web research; paste key text if the page cannot be read.</Hint>
        </Field>
        <Field label="Upload files" icon={<Upload size={14}/>}>
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.md,.txt,text/plain,text/markdown,application/pdf,image/png,image/jpeg" onChange={e => onFiles(e.target.files)} style={inputStyle} />
          <div style={{ display:"grid", gap:7 }}>
            {intake.files.map((file, index) => <SourceStatus key={`${file.name}-${index}`} file={file} />)}
          </div>
        </Field>
        <Field label="Paste notes" icon={<Pencil size={14}/>}>
          <textarea value={intake.notes} onChange={e => setIntake(prev => ({ ...prev, notes:e.target.value }))} rows={5} placeholder="Paste positioning, sales notes, FAQs, product descriptions, claims to avoid..." style={{ ...inputStyle, minHeight:110, paddingTop:10, resize:"vertical" }} />
        </Field>
        <Field label="Manual signals" icon={<HelpCircle size={14}/>}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:8 }}>
            <input value={intake.manual.brandName} onChange={e => updateManual("brandName", e.target.value)} placeholder="Brand name" style={inputStyle} />
            <input value={intake.manual.priorityOffer} onChange={e => updateManual("priorityOffer", e.target.value)} placeholder="Priority product/service" style={inputStyle} />
            <input value={intake.manual.audience} onChange={e => updateManual("audience", e.target.value)} placeholder="Priority audience" style={inputStyle} />
            <input value={intake.manual.goal} onChange={e => updateManual("goal", e.target.value)} placeholder="Main content goal" style={inputStyle} />
          </div>
          <ChipGroup values={PLATFORM_OPTIONS} selected={intake.manual.platforms} onToggle={value => toggleManualArray("platforms", value)} />
          <ChipGroup values={FORMAT_OPTIONS} selected={intake.manual.formats} onToggle={value => toggleManualArray("formats", value)} />
        </Field>
      </div>
    </Panel>
  );
}

function UnderstandingCard({ facts, setFacts, confidence, limitations, sourceTrace, onContinue }) {
  const sections = [
    ["Company", "company", "I could not identify the company name with enough confidence."],
    ["Products/services", "priority_offer", "I could not identify the priority product line from the uploaded sources."],
    ["Audience", "audience", "I'm not confident enough to use the audience without confirmation."],
    ["Tone/style", "tone_style", "Tone was not clear from the sources."],
    ["Content opportunities", "platforms", "Target platforms still need confirmation."],
    ["Risks/claims", "sensitive_claims", "Claims and sensitive topics need confirmation before publishing."],
  ];
  return (
    <Panel style={{ marginLeft:46 }} className="anim-fade">
      <SectionHeader title="What Creative Engine understood" description="Confirm or correct the inferred facts before drafting the strategy." action={<SourceReviewButton sources={sourceTrace.sources} work={[...sourceTrace.work, "Extracted brand facts", "Scored setup completeness"]} confidence={confidence?.score != null ? `Brand understanding ${confidence.score}%` : null} />} />
      <BrandUnderstanding score={confidence?.score || 0} signals={confidence?.signals || []} />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(230px, 1fr))", gap:10, marginTop:14 }}>
        {sections.map(([title, key, fallback]) => (
          <EditableFact key={key} title={title} value={Array.isArray(facts[key]) ? facts[key].join(", ") : facts[key]} fallback={fallback} onSave={value => setFacts(prev => ({ ...prev, [key]: key === "platforms" ? value.split(",").map(s => s.trim()).filter(Boolean) : value }))} />
        ))}
        <FactBlock title="Unclear / needs confirmation" value={limitations.length ? limitations.join(" ") : "No detailed limitation trace was recorded."} muted />
      </div>
      <AssistantActionRow>
        <button onClick={onContinue} style={buttonStyle("primary")}><ArrowRight size={14}/>Continue to clarifications</button>
      </AssistantActionRow>
    </Panel>
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
      <Panel style={{ marginLeft:46 }}>
        <EmptyState title="No clarifications needed" description="The available sources gave enough structure for a first draft." action={onSubmit} actionLabel="Generate draft strategy" />
      </Panel>
    );
  }
  return (
    <Panel style={{ marginLeft:46 }}>
      <SectionHeader title="A few focused clarifications" description="Only answer what is missing or uncertain. You can let Creative Engine suggest a conservative default." />
      <div style={{ display:"grid", gap:10 }}>
        {clarifications.map((q, index) => <QuestionCard key={q.id || q.key || index} question={q} value={answers[q.id || q.key]} onChange={value => setAnswers(prev => ({ ...prev, [q.id || q.key]: value }))} />)}
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:14 }}>
        <button onClick={onBack} style={buttonStyle("ghost")}>Back</button>
        <button onClick={onSubmit} disabled={loading} style={buttonStyle("primary")}><ArrowRight size={14}/>Generate draft strategy</button>
      </div>
    </Panel>
  );
}

function DraftCards({ draft, sourceTrace, onBack, onApprove, loading }) {
  return (
    <Panel style={{ marginLeft:46 }}>
      <SectionHeader title="Draft strategy" description="Review before saving. Nothing is written to final settings until approval." action={<SourceReviewButton sources={sourceTrace.sources} work={[...sourceTrace.work, "Drafted Brand Profile", "Drafted Content Strategy", "Drafted Programmes", "Prepared first content ideas"]} />} />
      <div style={{ display:"grid", gap:12 }}>
        <JsonCard title="Brand Profile draft" data={draft.brand_profile} />
        <JsonCard title="Content Strategy draft" data={draft.content_strategy} />
        <ProgrammeDraftCard programmes={draft.programmes || []} />
        <ListCard title="Risk / claims checklist" items={draft.risk_checklist || []} />
        <IdeasCard ideas={draft.first_content_ideas || []} />
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:14 }}>
        <button onClick={onBack} style={buttonStyle("ghost")}>Review understanding</button>
        <button onClick={onApprove} disabled={loading} style={buttonStyle("primary")}><Check size={14}/>Approve and save strategy</button>
      </div>
    </Panel>
  );
}

function ApprovedState() {
  return (
    <Panel style={{ marginLeft:46, textAlign:"center", padding:"28px" }}>
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
  );
}

function Field({ label, icon, children }) {
  return <div style={{ display:"grid", gap:7 }}><label style={{ ...labelStyle, display:"flex", alignItems:"center", gap:7 }}>{icon}{label}</label>{children}</div>;
}

function Hint({ children }) {
  return <div style={{ fontSize:11, color:"var(--t4)", lineHeight:1.45 }}>{children}</div>;
}

function SourceStatus({ file }) {
  const tone = file.status === "parsed" ? "success" : file.status === "pending analysis" ? "warning" : "neutral";
  return (
    <div style={{ display:"grid", gridTemplateColumns:"18px minmax(0,1fr) auto", gap:8, alignItems:"center", padding:"8px 10px", borderRadius:"var(--ce-radius-sm)", background:"var(--fill2)", border:"1px solid var(--border)" }}>
      <FileText size={14} color="var(--t3)" />
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:12, color:"var(--t1)", fontWeight:650, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{file.name}</div>
        <div style={{ fontSize:11, color:"var(--t3)" }}>{file.note}</div>
      </div>
      <Pill tone={tone}>{file.status}</Pill>
    </div>
  );
}

function ChipGroup({ values, selected = [], onToggle }) {
  return <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>{values.map(value => <button key={value} onClick={() => onToggle(value)} style={chipStyle(selected.includes(value))}>{value}</button>)}</div>;
}

function EditableFact({ title, value, fallback, onSave }) {
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
  return <div style={factStyle}><div style={{ fontSize:14, fontWeight:750, marginBottom:8 }}>{title}</div><pre style={preStyle}>{JSON.stringify(data, null, 2)}</pre></div>;
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

function ErrorCard({ message, onRetry }) {
  return (
    <Panel style={{ marginLeft:46, borderColor:"var(--error-border)", background:"var(--error-bg)" }}>
      <SectionHeader title="I couldn't complete that step" description={message} />
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {onRetry && <button onClick={onRetry} style={buttonStyle("secondary")}><RefreshCw size={13}/>Retry</button>}
        <button onClick={() => window.location.href = "/?tab=strategy"} style={buttonStyle("ghost")}>Continue manually</button>
      </div>
    </Panel>
  );
}

function buildSourceTrace(intake, savedSources) {
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
  if (savedSources?.length) work.push(`Saved ${savedSources.length} source record${savedSources.length === 1 ? "" : "s"}`);
  return { sources, work, confidence:sources.length ? "Source trace is based on available V1 intake records." : null };
}

function buildSourcePayload(intake) {
  const sources = [];
  if (intake.websiteUrl) sources.push({ source_type:"website", url:intake.websiteUrl, summary:"User-provided website URL", metadata_json:{ status:"stored" } });
  if (intake.notes) sources.push({ source_type:"text_note", text:intake.notes, metadata_json:{ status:"parsed" } });
  if (Object.values(intake.manual || {}).some(v => Array.isArray(v) ? v.length : v)) sources.push({ source_type:"manual_answer", text:JSON.stringify(intake.manual, null, 2), metadata_json:{ status:"parsed" } });
  for (const file of intake.files || []) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const source_type = ext === "md" ? "markdown" : ext === "pdf" ? "pdf" : ["jpg", "jpeg", "png"].includes(ext) ? "image" : "text_note";
    sources.push({ source_type, filename:file.name, mime_type:file.mime_type, text:file.text, metadata_json:{ size:file.size, status:file.status, note:file.note } });
  }
  return sources;
}

function hasAnySource(intake) {
  return Boolean(intake.websiteUrl || intake.notes || intake.files.length || Object.values(intake.manual || {}).some(v => Array.isArray(v) ? v.length : v));
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

const inputStyle = { width:"100%", minHeight:34, borderRadius:"var(--ce-radius-sm)", border:"1px solid var(--border)", background:"var(--fill2)", color:"var(--t1)", fontSize:13, padding:"0 10px", outline:"none", fontFamily:"inherit", boxSizing:"border-box" };
const factStyle = { padding:14, borderRadius:"var(--ce-radius)", border:"1px solid var(--border)", background:"var(--fill2)", minWidth:0 };
const smallIconButton = { width:26, height:26, borderRadius:"var(--ce-radius-sm)", border:"1px solid var(--border)", background:"transparent", color:"var(--t3)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" };
const smallText = { fontSize:12, color:"var(--t3)", lineHeight:1.45, margin:"6px 0 0" };
const preStyle = { margin:0, whiteSpace:"pre-wrap", wordBreak:"break-word", fontSize:12, lineHeight:1.5, color:"var(--t2)", fontFamily:"var(--font-mono)" };
function chipStyle(active) {
  return { padding:"6px 10px", borderRadius:99, border:"1px solid var(--border)", background:active ? "var(--t1)" : "var(--fill2)", color:active ? "var(--bg)" : "var(--t2)", fontSize:12, cursor:"pointer", fontFamily:"inherit" };
}

