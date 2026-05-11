"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, HelpCircle, Loader2, Pencil, ShieldAlert, Upload, Globe2 } from "lucide-react";
import { supabase, getBrandProfiles, getWorkspaces, createBrandProfile } from "@/lib/db";
import { defaultTenant, normalizeTenant, tenantStorageKey } from "@/lib/brand";
import { blankOnboardingIntake, buildClarifications } from "@/lib/onboarding";

const STEPS = ["sources", "understood", "clarify", "draft", "approved"];
const PLATFORM_OPTIONS = ["Instagram", "LinkedIn", "YouTube", "TikTok", "Newsletter"];
const FORMAT_OPTIONS = ["Short video", "Carousel", "Text post", "Newsletter", "Case study"];

export default function OnboardingPage() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tenant, setTenant] = useState(null);
  const [brandProfile, setBrandProfile] = useState(null);
  const [step, setStep] = useState("sources");
  const [intake, setIntake] = useState(blankOnboardingIntake());
  const [session, setSession] = useState(null);
  const [facts, setFacts] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [clarifications, setClarifications] = useState([]);
  const [answers, setAnswers] = useState({});
  const [draft, setDraft] = useState(null);
  const [limitations, setLimitations] = useState([]);
  const [loading, setLoading] = useState(false);
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
          manual: {
            ...prev.manual,
            brandName: profile.settings?.brand?.name || profile.name || "",
          },
        }));
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [user]);

  const progress = useMemo(() => {
    const idx = STEPS.indexOf(step);
    return Math.max(1, idx + 1) / STEPS.length * 100;
  }, [step]);

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

  const startAnalysis = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
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
        await api("/api/onboarding/source", {
          workspace_id: tenant.workspace_id,
          session_id: nextSession.id,
          sources: sourcePayload,
        });
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
      setStep("understood");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tenant, mode, intake]);

  const regenerateWithAnswers = useCallback(async () => {
    if (!tenant || !session) return;
    setLoading(true);
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
      setFacts(analyzed.facts);
      setConfidence(analyzed.confidence);
      setClarifications(analyzed.clarifications || []);
      setDraft(analyzed.draft);
      setStep("draft");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tenant, session, answers, clarifications, intake]);

  const approve = useCallback(async () => {
    if (!tenant || !session || !draft) return;
    setLoading(true);
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
      setStep("approved");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
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
      rows.push({
        name: file.name,
        mime_type: file.type || "application/octet-stream",
        size: file.size,
        text: isText ? await file.text() : "",
        status: isText ? "Text parsed" : "Accepted, analysis pending",
      });
    }
    setIntake(prev => ({ ...prev, files: [...prev.files, ...rows] }));
  };

  if (authLoading) return <ScreenShell progress={progress}><Spinner label="Loading onboarding..." /></ScreenShell>;
  if (!user) return (
    <ScreenShell progress={progress}>
      <Centered>
        <h1 style={h1}>Sign in to run onboarding</h1>
        <p style={muted}>Creative Engine onboarding is workspace-scoped and requires an authenticated workspace member.</p>
      </Centered>
    </ScreenShell>
  );

  return (
    <ScreenShell progress={progress}>
      <header style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, padding:"20px 28px", borderBottom:"0.5px solid var(--border)" }}>
        <div>
          <div style={{ fontSize:12, color:"var(--t4)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>Smart Onboarding</div>
          <div style={{ fontSize:18, fontWeight:700, color:"var(--t1)" }}>{brandProfile?.name || "Creative Engine"}</div>
        </div>
        <button onClick={() => window.location.href = "/"} style={ghostButton}><ArrowLeft size={15} /> Back to app</button>
      </header>

      {error && (
        <div style={{ margin:"16px auto 0", maxWidth:1040, padding:"10px 14px", borderRadius:8, border:"0.5px solid rgba(192,102,106,0.35)", background:"rgba(192,102,106,0.08)", color:"#C0666A", fontSize:13 }}>
          {error}
        </div>
      )}

      <main style={{ maxWidth:1040, width:"100%", margin:"0 auto", padding:"28px", flex:1 }}>
        {step === "sources" && (
          <div style={twoCol}>
            <section>
              <h1 style={h1}>Give Creative Engine something to understand your business.</h1>
              <p style={muted}>Start with sources instead of a long questionnaire. Website URLs, notes, and text files are used for V1 extraction; PDFs and images are accepted as source records and clearly marked pending.</p>
              <div style={privacyBox}>
                Creative Engine may process the sources you provide with AI providers to draft your strategy. We use commercial AI APIs and will add enhanced privacy controls for sensitive workspaces. Only upload materials you are allowed to use.
              </div>
            </section>
            <section style={panel}>
              <Field label="Website URL" icon={<Globe2 size={14} />}>
                <input value={intake.websiteUrl} onChange={e => setIntake(prev => ({ ...prev, websiteUrl: e.target.value }))} placeholder="https://example.com" style={input} />
                <div style={hint}>V1 stores this URL. It does not run advanced open-web research.</div>
              </Field>
              <Field label="Upload files" icon={<Upload size={14} />}>
                <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.md,.txt,text/plain,text/markdown,application/pdf,image/png,image/jpeg" onChange={e => onFiles(e.target.files)} style={input} />
                <div style={{ display:"grid", gap:6, marginTop:8 }}>
                  {intake.files.map((file, i) => <div key={`${file.name}-${i}`} style={fileRow}><FileText size={13} /> <span>{file.name}</span><em>{file.status}</em></div>)}
                </div>
              </Field>
              <Field label="Paste notes" icon={<Pencil size={14} />}>
                <textarea value={intake.notes} onChange={e => setIntake(prev => ({ ...prev, notes: e.target.value }))} rows={5} placeholder="Paste positioning, sales notes, FAQs, product descriptions, claims to avoid..." style={{ ...input, height:110, resize:"vertical", paddingTop:10 }} />
              </Field>
              <Field label="Answer manually" icon={<HelpCircle size={14} />}>
                <input value={intake.manual.brandName} onChange={e => updateManual("brandName", e.target.value)} placeholder="Brand name" style={input} />
                <input value={intake.manual.priorityOffer} onChange={e => updateManual("priorityOffer", e.target.value)} placeholder="Priority product/service" style={input} />
                <input value={intake.manual.audience} onChange={e => updateManual("audience", e.target.value)} placeholder="Priority audience" style={input} />
                <input value={intake.manual.goal} onChange={e => updateManual("goal", e.target.value)} placeholder="Main content goal" style={input} />
                <ChipGroup values={PLATFORM_OPTIONS} selected={intake.manual.platforms} onToggle={value => toggleManualArray("platforms", value)} />
                <ChipGroup values={FORMAT_OPTIONS} selected={intake.manual.formats} onToggle={value => toggleManualArray("formats", value)} />
              </Field>
              <button onClick={startAnalysis} disabled={loading || !hasAnySource(intake)} style={primaryButton}>
                {loading ? <Loader2 size={16} className="anim-spin" /> : <ArrowRight size={16} />}
                Analyze sources
              </button>
              <div style={hint}>You can connect a full asset library later.</div>
            </section>
          </div>
        )}

        {step === "understood" && facts && (
          <div>
            <StepHeader title="What Creative Engine understood" text="Review the inferred facts. Uncertain areas are shown plainly, and you can edit before moving on." />
            <Confidence score={confidence?.score || 0} signals={confidence?.signals || []} />
            <div style={cardGrid}>
              <FactCard title="Company" value={facts.company} fallback="I could not identify the company name with enough confidence." onEdit={v => setFacts({ ...facts, company:v })} />
              <FactCard title="Products/services" value={facts.priority_offer || facts.products_services} fallback="I could not identify the priority product line from the uploaded sources." onEdit={v => setFacts({ ...facts, priority_offer:v })} />
              <FactCard title="Audience" value={facts.audience} fallback="I’m not confident enough to use the audience without confirmation." onEdit={v => setFacts({ ...facts, audience:v })} />
              <FactCard title="Tone/style" value={facts.tone_style} fallback="Tone was not clear from the sources." onEdit={v => setFacts({ ...facts, tone_style:v })} />
              <FactCard title="Content opportunities" value={(facts.platforms || []).join(", ")} fallback="Target platforms still need confirmation." onEdit={v => setFacts({ ...facts, platforms:v.split(",").map(s=>s.trim()).filter(Boolean) })} />
              <FactCard title="Risks/claims" value={facts.sensitive_claims} fallback="Claims and sensitive topics need confirmation before publishing." onEdit={v => setFacts({ ...facts, sensitive_claims:v })} />
              <FactCard title="Unclear / needs confirmation" value={limitations.join(" ")} fallback="No limitations recorded." readonly />
            </div>
            <FooterActions>
              <button onClick={() => setStep("sources")} style={ghostButton}>Edit sources</button>
              <button onClick={() => {
                const qs = buildClarifications(facts);
                setClarifications(qs);
                setStep(qs.length ? "clarify" : "draft");
              }} style={primaryButton}>Continue</button>
            </FooterActions>
          </div>
        )}

        {step === "clarify" && (
          <div>
            <StepHeader title="Clarify only what is missing" text="Answer the required questions. Use “I’m not sure — suggest for me” where you want Creative Engine to make a conservative starting recommendation." />
            <div style={{ display:"grid", gap:12 }}>
              {clarifications.map((q, i) => (
                <Question key={q.id || q.key || i} question={q} value={answers[q.id || q.key]} onChange={value => setAnswers(prev => ({ ...prev, [q.id || q.key]: value }))} />
              ))}
            </div>
            <FooterActions>
              <button onClick={() => setStep("understood")} style={ghostButton}>Back</button>
              <button onClick={regenerateWithAnswers} disabled={loading} style={primaryButton}>{loading ? "Updating..." : "Generate draft strategy"}</button>
            </FooterActions>
          </div>
        )}

        {step === "draft" && draft && (
          <div>
            <StepHeader title="Draft strategy" text="This is still a draft. Nothing is written to final brand settings until you approve and save." />
            <DraftView draft={draft} />
            <FooterActions>
              <button onClick={() => setStep("understood")} style={ghostButton}>Review facts</button>
              <button onClick={approve} disabled={loading} style={primaryButton}><Check size={16} /> {loading ? "Saving..." : "Approve and save to workspace"}</button>
            </FooterActions>
          </div>
        )}

        {step === "approved" && (
          <Centered>
            <div style={{ width:44, height:44, borderRadius:99, background:"rgba(74,155,127,0.12)", color:"var(--success)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}><Check size={22} /></div>
            <h1 style={h1}>Strategy approved and saved</h1>
            <p style={muted}>Brand Profile, Content Strategy, Programmes, risk checklist, and the first 10 content ideas are now stored in workspace settings.</p>
            <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap", marginTop:20 }}>
              <button onClick={() => window.location.href = "/?tab=research"} style={primaryButton}>Create first content</button>
              <button onClick={() => window.location.href = "/"} style={ghostButton}>Go to Pipeline</button>
              <button onClick={() => window.location.href = "/?settings=1"} style={ghostButton}>Review Settings</button>
            </div>
          </Centered>
        )}
      </main>
    </ScreenShell>
  );
}

function ScreenShell({ children, progress }) {
  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", color:"var(--t1)", display:"flex", flexDirection:"column" }}>
      <div style={{ height:4, background:"var(--bg3)" }}><div style={{ height:"100%", width:`${progress}%`, background:"var(--gold)", transition:"width 0.2s" }} /></div>
      {children}
    </div>
  );
}

function StepHeader({ title, text }) {
  return <div style={{ marginBottom:18 }}><h1 style={h1}>{title}</h1><p style={muted}>{text}</p></div>;
}

function Field({ label, icon, children }) {
  return <div style={{ display:"grid", gap:8, marginBottom:16 }}><label style={{ display:"flex", alignItems:"center", gap:7, fontSize:12, fontWeight:700, color:"var(--t2)" }}>{icon}{label}</label>{children}</div>;
}

function ChipGroup({ values, selected, onToggle }) {
  return <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>{values.map(value => <button key={value} onClick={() => onToggle(value)} style={{ ...chip, background:selected.includes(value) ? "var(--t1)" : "var(--fill2)", color:selected.includes(value) ? "var(--bg)" : "var(--t2)" }}>{value}</button>)}</div>;
}

function Confidence({ score, signals }) {
  return (
    <div style={confidenceBox}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom:10 }}>
        <strong>Brand understanding</strong>
        <span style={{ fontFamily:"ui-monospace,'SF Mono',Menlo,monospace", fontSize:22, fontWeight:700 }}>{score}%</span>
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {signals.map(signal => <span key={signal.label} style={{ ...chip, borderColor:signal.ok ? "rgba(74,155,127,0.35)" : "rgba(196,154,60,0.35)", color:signal.ok ? "var(--success)" : "var(--warning)" }}>{signal.label}</span>)}
      </div>
    </div>
  );
}

function FactCard({ title, value, fallback, onEdit, readonly }) {
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value || "");
  const uncertain = !value;
  return (
    <div style={factCard}>
      <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center", marginBottom:8 }}>
        <strong style={{ fontSize:13 }}>{title}</strong>
        {!readonly && <button onClick={() => setEditing(true)} style={iconButton}><Pencil size={13} /></button>}
      </div>
      {editing ? (
        <div style={{ display:"grid", gap:8 }}>
          <textarea value={draftValue} onChange={e => setDraftValue(e.target.value)} rows={3} style={{ ...input, height:80, resize:"vertical" }} />
          <button onClick={() => { onEdit?.(draftValue); setEditing(false); }} style={{ ...primaryButton, justifyContent:"center" }}>Save</button>
        </div>
      ) : (
        <p style={{ fontSize:13, lineHeight:1.55, color:uncertain ? "var(--warning)" : "var(--t2)", margin:0 }}>
          {uncertain && <ShieldAlert size={14} style={{ verticalAlign:"-2px", marginRight:5 }} />}
          {value || fallback}
        </p>
      )}
    </div>
  );
}

function Question({ question, value, onChange }) {
  const options = question.options || [];
  if (question.question_type === "free_text") {
    return <div style={panel}><div style={questionTitle(question)}>{question.question}</div><textarea value={value || ""} onChange={e => onChange(e.target.value)} rows={3} style={{ ...input, height:86, resize:"vertical" }} /></div>;
  }
  if (question.question_type === "multi_choice") {
    const selected = Array.isArray(value) ? value : [];
    return <div style={panel}><div style={questionTitle(question)}>{question.question}</div><ChipGroup values={options} selected={selected} onToggle={option => onChange(selected.includes(option) ? selected.filter(v => v !== option) : [...selected, option])} /></div>;
  }
  return (
    <div style={panel}>
      <div style={questionTitle(question)}>{question.question}</div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {options.map(option => <button key={option} onClick={() => onChange(option)} style={{ ...chip, background:value === option ? "var(--t1)" : "var(--fill2)", color:value === option ? "var(--bg)" : "var(--t2)" }}>{option}</button>)}
      </div>
      {question.question_type === "choice_plus_other" && <input value={typeof value === "string" && !options.includes(value) ? value : ""} onChange={e => onChange(e.target.value)} placeholder="Other..." style={{ ...input, marginTop:10 }} />}
    </div>
  );
}

function DraftView({ draft }) {
  return (
    <div style={{ display:"grid", gap:14 }}>
      <Section title="Brand Profile" data={draft.brand_profile} />
      <Section title="Content Strategy" data={draft.content_strategy} />
      <div style={panel}>
        <h2 style={h2}>Recommended Programmes</h2>
        <div style={cardGrid}>{(draft.programmes || []).map(programme => <ProgrammeCard key={programme.id} programme={programme} />)}</div>
      </div>
      <Section title="Risk / Claims Checklist" data={draft.risk_checklist} />
      <div style={panel}>
        <h2 style={h2}>First 10 Content Ideas</h2>
        <div style={{ display:"grid", gap:8 }}>{(draft.first_content_ideas || []).map(idea => <div key={idea.id} style={fileRow}><span>{idea.title}</span><em>{idea.platform} · {idea.format}</em></div>)}</div>
      </div>
    </div>
  );
}

function Section({ title, data }) {
  return <div style={panel}><h2 style={h2}>{title}</h2><pre style={pre}>{JSON.stringify(data, null, 2)}</pre></div>;
}

function ProgrammeCard({ programme }) {
  return (
    <div style={factCard}>
      <strong>{programme.name}</strong>
      <p style={smallText}>{programme.description}</p>
      <p style={smallText}><b>Goal:</b> {programme.goal}</p>
      <p style={smallText}><b>Audience:</b> {programme.audience}</p>
      <p style={smallText}><b>Platforms:</b> {(programme.platforms || []).join(", ")}</p>
      <p style={smallText}><b>Formats:</b> {(programme.formats || []).join(", ")}</p>
      <p style={smallText}><b>Cadence:</b> {programme.cadence}</p>
      <p style={smallText}><b>Why:</b> {programme.why_this_works}</p>
    </div>
  );
}

function FooterActions({ children }) {
  return <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:22, flexWrap:"wrap" }}>{children}</div>;
}

function Centered({ children }) {
  return <div style={{ maxWidth:560, margin:"12vh auto", textAlign:"center" }}>{children}</div>;
}

function Spinner({ label }) {
  return <Centered><Loader2 size={24} className="anim-spin" /><p style={muted}>{label}</p></Centered>;
}

function buildSourcePayload(intake) {
  const sources = [];
  if (intake.websiteUrl) sources.push({ source_type:"website", url:intake.websiteUrl, summary:"User-provided website URL" });
  if (intake.notes) sources.push({ source_type:"text_note", text:intake.notes });
  if (Object.values(intake.manual || {}).some(v => Array.isArray(v) ? v.length : v)) sources.push({ source_type:"manual_answer", text:JSON.stringify(intake.manual, null, 2) });
  for (const file of intake.files || []) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const source_type = ext === "md" ? "markdown" : ext === "pdf" ? "pdf" : ["jpg", "jpeg", "png"].includes(ext) ? "image" : "text_note";
    sources.push({ source_type, filename:file.name, mime_type:file.mime_type, text:file.text, metadata_json:{ size:file.size } });
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

const h1 = { fontSize:32, lineHeight:1.1, letterSpacing:0, margin:"0 0 12px", color:"var(--t1)" };
const h2 = { fontSize:15, margin:"0 0 10px", color:"var(--t1)" };
const muted = { fontSize:14, lineHeight:1.6, color:"var(--t3)", margin:0 };
const smallText = { fontSize:12, lineHeight:1.5, color:"var(--t3)", margin:"7px 0 0" };
const hint = { fontSize:11, lineHeight:1.45, color:"var(--t4)" };
const twoCol = { display:"grid", gridTemplateColumns:"minmax(0,0.8fr) minmax(360px,1.2fr)", gap:28, alignItems:"start" };
const panel = { padding:18, borderRadius:8, border:"0.5px solid var(--border)", background:"var(--bg2)" };
const factCard = { padding:15, borderRadius:8, border:"0.5px solid var(--border)", background:"var(--fill2)", minWidth:0 };
const cardGrid = { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))", gap:12 };
const confidenceBox = { ...panel, marginBottom:14 };
const privacyBox = { marginTop:18, padding:14, borderRadius:8, background:"rgba(196,154,60,0.10)", border:"0.5px solid rgba(196,154,60,0.25)", fontSize:12, lineHeight:1.55, color:"var(--t2)" };
const input = { width:"100%", minHeight:34, borderRadius:7, border:"0.5px solid var(--border)", background:"var(--fill2)", color:"var(--t1)", fontSize:13, padding:"0 10px", outline:"none", fontFamily:"inherit", boxSizing:"border-box", marginBottom:7 };
const chip = { padding:"6px 10px", borderRadius:99, border:"0.5px solid var(--border)", background:"transparent", color:"var(--t2)", fontSize:12, cursor:"pointer", fontFamily:"inherit" };
const primaryButton = { display:"inline-flex", alignItems:"center", gap:8, padding:"9px 16px", borderRadius:8, border:"none", background:"var(--t1)", color:"var(--bg)", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" };
const ghostButton = { display:"inline-flex", alignItems:"center", gap:8, padding:"9px 14px", borderRadius:8, border:"0.5px solid var(--border)", background:"var(--fill2)", color:"var(--t2)", fontSize:13, cursor:"pointer", fontFamily:"inherit" };
const iconButton = { width:28, height:28, borderRadius:7, border:"0.5px solid var(--border)", background:"transparent", color:"var(--t3)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" };
const fileRow = { display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"8px 10px", borderRadius:7, border:"0.5px solid var(--border)", background:"var(--bg)", fontSize:12, color:"var(--t2)" };
const pre = { margin:0, whiteSpace:"pre-wrap", wordBreak:"break-word", fontSize:12, lineHeight:1.5, color:"var(--t2)", fontFamily:"ui-monospace,'SF Mono',Menlo,monospace" };

function questionTitle(question) {
  return { fontSize:14, fontWeight:700, color:"var(--t1)", marginBottom:10, paddingLeft: question.required ? 10 : 0, borderLeft: question.required ? "3px solid var(--gold)" : "none" };
}
