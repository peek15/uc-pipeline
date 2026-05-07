"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Sparkles, Search, Volume2, Image as ImageIcon, FileText, Check, X, RefreshCw, AlertCircle, Layers, Play, Pause, Download, Copy, Library } from "lucide-react";
import { isInProductionQueue } from "@/lib/constants";
import { runAgent, recordAgentFeedback, voiceAgent, visualAgent, assemblyAgent } from "@/lib/ai/agent-runner";
import { runPromptStream } from "@/lib/ai/runner";
import { buildStreamPrompt as buildBriefPrompt, parseOutput as parseBriefOutput } from "@/lib/ai/agents/brief-author";
import { buildStreamPrompt as buildAssemblyPrompt, parseOutput as parseAssemblyOutput } from "@/lib/ai/agents/assembly-author";
import AssetLibraryModal from "./AssetLibraryModal";
import { updateProductionStatus, supabase } from "@/lib/db";
import { usePersistentState } from "@/lib/usePersistentState";
import { matches, shouldIgnoreFromInput, SHORTCUTS } from "@/lib/shortcuts";
import { DEFAULT_BRAND_PROFILE_ID } from "@/lib/brand";
import { PageHeader, Panel, Pill, buttonStyle } from "@/components/OperationalUI";

const UNCLE_CARTER_PROFILE_ID = DEFAULT_BRAND_PROFILE_ID;
const LANG_LABELS = { en: "English", fr: "French", es: "Spanish", pt: "Portuguese", de: "German", it: "Italian", ja: "Japanese", zh: "Chinese" };

// ─── Format border colors ───
function formatBorder(format) {
  if (format === "classics")            return "#4A9B7F";
  if (format === "performance_special") return "#C0666A";
  if (format === "special_edition")     return "#8B7EC8";
  return "#C49A3C";
}

// ─── Reusable styles ───
const btnPrimary   = { padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, background: "var(--t1)", color: "var(--bg)", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
const btnSecondary = { padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 500, background: "var(--fill2)", color: "var(--t1)", border: "0.5px solid var(--border)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
const btnGhost     = { padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 500, background: "transparent", color: "var(--t3)", border: "1px solid var(--border)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
const inputStyle   = { flex: 1, padding: "8px 12px", borderRadius: 7, fontSize: 13, background: "var(--fill2)", border: "1px solid var(--border-in)", color: "var(--t1)", outline: "none", fontFamily: "inherit" };
const textareaStyle = { ...inputStyle, width: "100%", minHeight: 64, resize: "vertical", lineHeight: 1.5 };
const labelStyle = { fontSize: 10, fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 };

function ConfidenceBar({ value }) {
  if (value == null) return null;
  const color = value >= 75 ? "#4A9B7F" : value >= 50 ? "var(--gold)" : "#C0666A";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 60, height: 3, background: "var(--bg3)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", color: "var(--t2)", width: 28 }}>{value}%</span>
    </div>
  );
}

function ProgressDots({ story }) {
  const hasBrief    = !!story.visual_brief;
  const hasVisuals  = !!(story.visual_refs?.selected?.length);
  const hasAudio    = !!(story.audio_refs && Object.keys(story.audio_refs || {}).length);
  const hasAssembly = !!story.assembly_brief;
  const dot = (on) => <span style={{ width: 5, height: 5, borderRadius: "50%", background: on ? "var(--t1)" : "var(--t4)", display: "inline-block" }} />;
  return <span style={{ display: "inline-flex", gap: 3 }}>{dot(hasBrief)}{dot(hasVisuals)}{dot(hasAudio)}{dot(hasAssembly)}</span>;
}

export function productionReadiness(story) {
  const checks = [
    { key: "brief", label: "Brief", done: !!story.visual_brief },
    { key: "assets", label: "Assets", done: !!story.visual_refs?.selected?.length },
    { key: "voice", label: "Voice", done: !!(story.audio_refs && Object.keys(story.audio_refs || {}).length) },
    { key: "visuals", label: "Visuals", done: !!story.visual_refs?.selected?.length },
    { key: "assembly", label: "Assembly", done: !!story.assembly_brief },
  ];
  const done = checks.filter(c => c.done).length;
  return { checks, done, total: checks.length, percent: Math.round((done / checks.length) * 100) };
}

export function matchesProductionFilter(story, filter) {
  if (filter === "all") return true;
  if (filter === "needs_brief") return !story.visual_brief;
  if (filter === "needs_assets") return !story.visual_refs?.selected?.length;
  if (filter === "needs_voice") return !(story.audio_refs && Object.keys(story.audio_refs || {}).length);
  if (filter === "needs_assembly") return !story.assembly_brief;
  if (filter === "ready_review") return productionReadiness(story).done >= 4;
  return true;
}

export function ReadinessStrip({ story }) {
  const readiness = productionReadiness(story);
  const color = readiness.done === readiness.total ? "var(--success)" : readiness.done >= 3 ? "var(--warning)" : "var(--t3)";
  return (
    <Panel style={{ marginBottom: 12, background: "var(--card)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(86px, 1fr))", gap: 8, alignItems: "stretch" }}>
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--fill2)", border: "0.5px solid var(--border)" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Readiness</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono)", color }}>{readiness.percent}</span>
            <span style={{ fontSize: 11, color: "var(--t3)" }}>%</span>
          </div>
          <div style={{ height: 4, borderRadius: 999, background: "var(--bg3)", overflow: "hidden", marginTop: 8 }}>
            <div style={{ height: "100%", width: `${readiness.percent}%`, background: color }} />
          </div>
        </div>
        {readiness.checks.map(check => (
          <div key={check.key} style={{ padding: "10px 9px", borderRadius: 8, background: check.done ? "var(--success-bg)" : "var(--fill2)", border: `0.5px solid ${check.done ? "rgba(74,155,127,0.24)" : "var(--border)"}` }}>
            <div style={{ fontSize: 10, color: check.done ? "var(--success)" : "var(--t4)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{check.label}</div>
            <div style={{ fontSize: 12, color: check.done ? "var(--success)" : "var(--t3)", fontWeight: 600 }}>{check.done ? "Ready" : "Open"}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Section({ title, status, statusColor, description, children }) {
  return (
    <div style={{ borderTop: "0.5px solid var(--border)", padding: "16px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)", marginBottom: 2 }}>{title}</div>
          {description && <div style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.45 }}>{description}</div>}
        </div>
        {status && (
          <span style={{ fontSize: 10, fontWeight: 600, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", padding: "2px 8px", borderRadius: 4,
            background: statusColor === "success" ? "var(--success-bg)" : statusColor === "warning" ? "var(--warning-bg)" : "var(--fill)",
            color: statusColor === "success" ? "var(--success)" : statusColor === "warning" ? "var(--warning)" : "var(--t3)",
            border: "0.5px solid var(--border)", whiteSpace: "nowrap", flexShrink: 0 }}>{status}</span>
        )}
      </div>
      {children && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}

function Field({ label, value, onChange, multiline = false }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {multiline
        ? <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={3} style={textareaStyle} />
        : <input value={value || ""} onChange={(e) => onChange(e.target.value)} style={inputStyle} />}
    </div>
  );
}

function ErrorBox({ children }) {
  return (
    <div style={{ marginTop: 10, fontSize: 11, color: "var(--error)", padding: "8px 12px", borderRadius: 6, background: "var(--error-bg)", border: "0.5px solid var(--error-border)", display: "flex", gap: 6, alignItems: "flex-start" }}>
      <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

// Dispatch a section-status event so PipelineProgress can react.
function sectionEvent(section, status) {
  window.dispatchEvent(new CustomEvent("production:section-status", { detail: { section, status } }));
}

// StreamPreview — live raw text while Claude writes.
function StreamPreview({ text }) {
  if (!text) return null;
  return (
    <pre style={{
      margin: 0, padding: "10px 12px", borderRadius: 7,
      background: "var(--fill)", border: "0.5px solid var(--border)",
      fontSize: 10, color: "var(--t3)", lineHeight: 1.6,
      fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", whiteSpace: "pre-wrap",
      wordBreak: "break-word", maxHeight: 120, overflowY: "auto",
    }}>
      {text}<span className="anim-pulse" style={{ display: "inline-block", width: 6, height: 10, background: "var(--t3)", marginLeft: 2, verticalAlign: "text-bottom", borderRadius: 1 }} />
    </pre>
  );
}

// PipelineProgress — horizontal stage tracker at top of detail panel.
export function PipelineProgress({ story }) {
  const [live, setLive] = useState({});

  useEffect(() => {
    setLive({});
  }, [story.id]);

  useEffect(() => {
    const h = (e) => setLive(p => ({ ...p, [e.detail.section]: e.detail.status }));
    window.addEventListener("production:section-status", h);
    return () => window.removeEventListener("production:section-status", h);
  }, []);

  const stages = [
    { key: "brief",    label: "Brief",    done: !!story.visual_brief },
    { key: "matches",  label: "Matches",  done: false },
    { key: "voice",    label: "Voice",    done: !!(story.audio_refs && Object.keys(story.audio_refs || {}).length > 0) },
    { key: "visual",   label: "Visual",   done: !!(story.visual_refs?.selected?.length) },
    { key: "assembly", label: "Assembly", done: !!story.assembly_brief },
  ];

  return (
    <div style={{ display: "flex", alignItems: "flex-start", padding: "12px 0 16px", gap: 0 }}>
      {stages.map((stage, i) => {
        const status = live[stage.key];
        const isRunning = status === "running";
        const isError   = status === "error";
        const isDone    = stage.done || status === "done";
        const dotColor  = isError ? "#C0666A" : isRunning ? "var(--gold)" : isDone ? "#4A9B7F" : "var(--t4)";

        return (
          <div key={stage.key} style={{ display: "flex", alignItems: "flex-start", flex: i < stages.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0,
                ...(isRunning ? { animation: "pulse 1s ease infinite" } : {}),
              }} />
              <span style={{ fontSize: 9, fontWeight: isDone || isRunning ? 600 : 400, color: isRunning ? "var(--t1)" : isDone ? "#4A9B7F" : "var(--t4)", whiteSpace: "nowrap" }}>
                {stage.label}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div style={{ flex: 1, height: "0.5px", background: "var(--border)", margin: "4px 4px 0" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Brief section ───────────────────────────────────────

export function BriefSection({ story, brand_profile_id, onSaved }) {
  const [draft, setDraft]       = useState(story.visual_brief || null);
  const [original, setOriginal] = useState(story.visual_brief || null);
  const [running, setRunning]   = useState(false);
  const [streamText, setStreamText] = useState("");
  const [confidence, setConfidence] = useState(null);
  const [reasoning, setReasoning]   = useState(null);
  const [aiCallId, setAiCallId]     = useState(null);
  const [error, setError]           = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setDraft(story.visual_brief || null); setOriginal(story.visual_brief || null);
    setConfidence(null); setReasoning(null); setAiCallId(null); setError(null); setStreamText("");
  }, [story.id]);

  useEffect(() => {
    const h = () => { if (!running) generate(); };
    window.addEventListener("production:generate-brief", h);
    return () => window.removeEventListener("production:generate-brief", h);
  }, [running]);

  const generate = async () => {
    setRunning(true); setError(null); setStreamText("");
    sectionEvent("brief", "running");
    try {
      const prompt = await buildBriefPrompt({ story, brand_profile_id });
      const { text, ai_call_id } = await runPromptStream({
        type: "agent-call", params: { prompt }, maxTokens: 800,
        context: { story_id: story.id, brand_profile_id },
        onChunk: (t) => setStreamText(t),
      });
      const { brief, confidence: conf, reasoning: rsn } = parseBriefOutput(text);
      setDraft(brief); setConfidence(conf); setReasoning(rsn); setAiCallId(ai_call_id);
      setStreamText("");
      sectionEvent("brief", "done");
    } catch (e) { setError(e?.message || String(e)); sectionEvent("brief", "error"); }
    finally    { setRunning(false); }
  };

  const updateField = (field, value) => setDraft(prev => ({ ...(prev || {}), [field]: value }));
  const updateRef   = (i, value) => { const refs = [...(draft?.references || [])]; refs[i] = value; setDraft(p => ({ ...(p || {}), references: refs })); };
  const addRef    = () => setDraft(p => ({ ...(p || {}), references: [...(p?.references || []), ""] }));
  const removeRef = (i) => setDraft(p => ({ ...(p || {}), references: (p?.references || []).filter((_, idx) => idx !== i) }));

  const isDirty   = JSON.stringify(draft) !== JSON.stringify(original);
  const wasEdited = !!original && isDirty;

  const approve = async () => {
    if (!draft) return;
    try {
      await updateProductionStatus(story.id, { visual_brief: draft });
      await recordAgentFeedback({
        agent_name: "brief-author", brand_profile_id, story_id: story.id, ai_call_id: aiCallId,
        agent_output: original, user_correction: wasEdited ? draft : null,
        correction_type: wasEdited ? "edit" : "approve", agent_confidence: confidence,
      });
      setOriginal(draft); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800); onSaved?.({ visual_brief: draft });
    } catch (e) { setError(e?.message || String(e)); }
  };

  const reject = async () => {
    try {
      await recordAgentFeedback({ agent_name: "brief-author", brand_profile_id, story_id: story.id, ai_call_id: aiCallId, agent_output: original, correction_type: "reject", agent_confidence: confidence });
      setDraft(null); setOriginal(null);
    } catch {}
  };

  const status = !draft ? "no brief yet" : savedFlash ? "saved ✓" : isDirty ? "unsaved edits" : "approved";
  const statusColor = savedFlash ? "success" : isDirty ? "warning" : draft ? "success" : "default";

  return (
    <Section title="Visual brief" status={status} statusColor={statusColor}
      description="AI writes a structured brief from the story, brand, and your past corrections. Edit any field and approve to save.">
      {!draft && !running && (<button onClick={generate} style={btnPrimary}><Sparkles size={12} />Generate brief</button>)}
      {running && !draft && <StreamPreview text={streamText} />}
      {draft && (
        <div style={{ display: "grid", gap: 12 }}>
          {confidence != null && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 7, background: "var(--fill)", border: "0.5px solid var(--border)" }}>
              <span style={{ fontSize: 11, color: "var(--t3)" }}>Agent confidence</span>
              <ConfidenceBar value={confidence} />
            </div>
          )}
          <Field label="Scene" value={draft.scene} onChange={(v) => updateField("scene", v)} multiline />
          <Field label="Mood"  value={draft.mood}  onChange={(v) => updateField("mood",  v)} multiline />
          <div>
            <div style={labelStyle}>References</div>
            {(draft.references || []).map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input value={r} onChange={(e) => updateRef(i, e.target.value)} style={inputStyle} />
                <button onClick={() => removeRef(i)} style={{ ...btnGhost, padding: "0 10px", fontSize: 14 }}>×</button>
              </div>
            ))}
            <button onClick={addRef} style={{ ...btnGhost, fontSize: 11, padding: "4px 10px" }}>+ add reference</button>
          </div>
          <Field label="Avoid" value={draft.avoid} onChange={(v) => updateField("avoid", v)} multiline />
          {reasoning && <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic", padding: "8px 12px", borderRadius: 6, background: "var(--fill)", borderLeft: "2px solid var(--gold)" }}>{reasoning}</div>}
          {running && <StreamPreview text={streamText} />}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={approve} style={btnPrimary}><Check size={12} />{wasEdited ? "Save edits" : "Approve as-is"}</button>
            <button onClick={generate} disabled={running} style={btnSecondary}>
              <RefreshCw size={12} className={running ? "spin" : ""} />{running ? "Rewriting…" : "Regenerate"}
            </button>
            <button onClick={reject} style={btnGhost}><X size={12} />Reject</button>
          </div>
        </div>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
    </Section>
  );
}

// ─── Voice section ──────────────────────────────────────

const ALL_VOICE_LANGS = ["en", "fr", "es", "pt"];

export function VoiceSection({ story, brand_profile_id, onSaved }) {
  const [running, setRunning]       = useState(null);
  const [audioRefs, setAudioRefs]   = useState(story.audio_refs || {});
  const [langStatus, setLangStatus] = useState({});
  const [langErrors, setLangErrors] = useState({});
  const [playing, setPlaying]       = useState(null);
  const [audioEl] = useState(() => typeof Audio !== "undefined" ? new Audio() : null);

  useEffect(() => {
    setAudioRefs(story.audio_refs || {});
    setLangStatus({}); setLangErrors({});
  }, [story.id]);

  useEffect(() => {
    if (!audioEl) return;
    audioEl.onended = () => setPlaying(null);
    return () => { audioEl.pause(); audioEl.src = ""; };
  }, [audioEl]);

  useEffect(() => {
    const h = () => { if (!running) generateEN(); };
    window.addEventListener("production:generate-voice", h);
    return () => window.removeEventListener("production:generate-voice", h);
  }, [running]);

  const playAudio = (lang) => {
    const ref = audioRefs[lang];
    if (!ref?.url || !audioEl) return;
    if (playing === lang) { audioEl.pause(); setPlaying(null); return; }
    audioEl.src = ref.url; audioEl.play().catch(() => {}); setPlaying(lang);
  };

  const runLang = async (lang) => {
    setLangStatus(p => ({ ...p, [lang]: "running" }));
    try {
      const result = await voiceAgent.runOne({ story, language: lang, brand_profile_id });
      const merged = await voiceAgent.persistAudioRefs(story.id, [result]);
      setAudioRefs(merged);
      setLangStatus(p => ({ ...p, [lang]: "done" }));
      return merged;
    } catch (e) {
      setLangStatus(p => ({ ...p, [lang]: "error" }));
      setLangErrors(p => ({ ...p, [lang]: e?.message || String(e) }));
      return null;
    }
  };

  const generateEN = async () => {
    setRunning("en"); sectionEvent("voice", "running");
    const merged = await runLang("en");
    setRunning(null); sectionEvent("voice", "done"); onSaved?.(merged ? { audio_refs: merged } : undefined);
  };

  const cascadeOthers = async () => {
    setRunning("cascade"); sectionEvent("voice", "running");
    let last;
    for (const lang of ["fr", "es", "pt"]) { last = (await runLang(lang)) || last; }
    setRunning(null); sectionEvent("voice", "done"); onSaved?.(last ? { audio_refs: last } : undefined);
  };

  const generateAll = async () => {
    setRunning("all"); sectionEvent("voice", "running");
    const langs = ALL_VOICE_LANGS.filter(l => story[`script_${l}`] || l === "en");
    let last;
    for (const lang of langs) { last = (await runLang(lang)) || last; }
    setRunning(null); sectionEvent("voice", "done"); onSaved?.(last ? { audio_refs: last } : undefined);
  };

  const hasEN      = !!audioRefs.en;
  const hasAll     = ALL_VOICE_LANGS.every(l => audioRefs[l]);
  const doneCount  = ALL_VOICE_LANGS.filter(l => audioRefs[l]).length;
  const showGrid   = running || doneCount > 0;
  const status     = hasAll ? "all 4 ✓" : doneCount > 0 ? `${doneCount} / 4` : "not started";
  const statusColor = hasAll ? "success" : doneCount > 0 ? "warning" : "default";

  return (
    <Section title="Voice generation" status={status} statusColor={statusColor}
      description="Generate EN first, then cascade FR / ES / PT one by one.">

      {!showGrid && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={generateEN} disabled={!!running} style={btnPrimary}>
            <Volume2 size={12} /> Generate EN first
          </button>
          <button onClick={generateAll} disabled={!!running} style={btnSecondary}>
            Generate all 4
          </button>
        </div>
      )}

      {showGrid && (
        <div style={{ display: "grid", gap: 6 }}>
          {ALL_VOICE_LANGS.map(lang => {
            const ref   = audioRefs[lang];
            const lstat = langStatus[lang];
            const lerr  = langErrors[lang];
            const hasRef = !!ref?.url;
            return (
              <div key={lang} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", borderRadius: 6,
                background: "var(--fill)", border: "0.5px solid var(--border)",
                opacity: !hasRef && !lstat ? 0.4 : 1, transition: "opacity 0.25s",
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: lerr ? "#C0666A" : (lstat === "done" || hasRef) ? "#4A9B7F" : lstat === "running" ? "var(--gold)" : "var(--t4)",
                  ...(lstat === "running" ? { animation: "pulse 1s ease infinite" } : {}),
                }} />
                {hasRef
                  ? <button onClick={() => playAudio(lang)} style={{ ...btnGhost, padding: "3px 7px" }}>
                      {playing === lang ? <Pause size={11} /> : <Play size={11} />}
                    </button>
                  : <div style={{ width: 28 }}>
                      {lstat === "running" && <RefreshCw size={11} className="spin" style={{ color: "var(--t3)" }} />}
                    </div>
                }
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t1)", width: 76 }}>{LANG_LABELS[lang] || lang}</span>
                <span style={{ fontSize: 10, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", color: lerr ? "#C0666A" : "var(--t3)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {lerr ? lerr.slice(0, 60) : hasRef ? `${ref.provider || "—"} · ${ref.duration_estimate_ms ? Math.round(ref.duration_estimate_ms / 1000) + "s" : "—"}` : lstat === "running" ? "generating…" : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {hasEN && !hasAll && !running && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={cascadeOthers} style={btnPrimary}><Volume2 size={12} /> Cascade FR / ES / PT</button>
          <button onClick={generateEN} style={btnGhost}><RefreshCw size={12} /> Re-gen EN</button>
        </div>
      )}
      {hasAll && !running && (
        <div style={{ marginTop: 10 }}>
          <button onClick={generateAll} style={btnGhost}><RefreshCw size={12} /> Regenerate all</button>
        </div>
      )}
    </Section>
  );
}

// ─── Visual section ─────────────────────────────────────

export function VisualSection({ story, brand_profile_id, onSaved }) {
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState(null);
  const [allAssets, setAllAssets] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => {
    const sel = story.visual_refs?.selected || [];
    return new Set(sel.map(s => s.id));
  });
  const [error, setError] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const canRun = !!story.visual_brief;

  useEffect(() => {
    setResult(null); setError(null);
    const sel = story.visual_refs?.selected || [];
    setSelectedIds(new Set(sel.map(s => s.id)));
    if (story.id) loadExistingAssets();
  }, [story.id]);

  // v3.11.4 — listen for ⌘⇧I from global handler
  useEffect(() => {
    const h = () => { if (!running && canRun) generate(); };
    window.addEventListener("production:generate-visual", h);
    return () => window.removeEventListener("production:generate-visual", h);
  }, [running, canRun]);

  const loadExistingAssets = async () => {
    const { data } = await supabase
      .from("visual_assets")
      .select("*")
      .eq("story_id", story.id)
      .order("rank_score", { ascending: false, nullsFirst: false });
    setAllAssets(data || []);
  };

  const [revealCount, setRevealCount] = useState(0);

  const generate = async () => {
    if (!canRun) return;
    setRunning(true); setError(null); setRevealCount(0);
    sectionEvent("visual", "running");
    try {
      const r = await visualAgent.run({ story, brief: story.visual_brief, brand_profile_id });
      setResult(r);
      const assets = r.all_assets || [];
      setAllAssets(assets);
      setSelectedIds(new Set((r.ranked_top || []).slice(0, 6).map(a => a.id)));
      assets.forEach((_, i) => setTimeout(() => setRevealCount(i + 1), i * 55));
      sectionEvent("visual", "done");
    } catch (e) { setError(e?.message || String(e)); sectionEvent("visual", "error"); }
    finally    { setRunning(false); }
  };

  const togglePick = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const approve = async () => {
    try {
      await visualAgent.persistUserSelections({ story_id: story.id, selected_ids: Array.from(selectedIds) });
      const { data: fresh } = await supabase.from("stories").select("visual_refs").eq("id", story.id).single();
      setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800);
      onSaved?.(fresh?.visual_refs ? { visual_refs: fresh.visual_refs } : undefined);
    } catch (e) { setError(e?.message || String(e)); }
  };

  const status = allAssets.length === 0 ? "not started"
               : selectedIds.size > 0 ? `${selectedIds.size}/${allAssets.length} selected`
               : `${allAssets.length} candidates`;
  const statusColor = savedFlash ? "success" : selectedIds.size > 0 ? "warning" : "default";

  return (
    <Section title="Visual generation" status={status} statusColor={statusColor}
      description="Generates 12 candidates (atmospheric + licensed), ranks them, and lets you pick your top 6.">
      {!canRun && <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>Approve a brief first.</div>}

      {canRun && allAssets.length === 0 && !running && (
        <button onClick={generate} style={btnPrimary}>
          <ImageIcon size={12} /> Generate 12 visuals
        </button>
      )}

      {running && (
        <>
          <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <RefreshCw size={12} className="spin" /> Generating 12 visuals + ranking… 30–60 seconds
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8, marginBottom: 12 }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} style={{ aspectRatio: "9/16", borderRadius: 7, background: "var(--fill2)", border: "0.5px solid var(--border)", animation: `pulse 1.6s ease ${(i % 4) * 0.18}s infinite` }} />
            ))}
          </div>
        </>
      )}

      {allAssets.length > 0 && (
        <div>
          {result?.ranking_reasoning && (
            <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic", padding: "8px 12px", borderRadius: 6, background: "var(--fill)", borderLeft: "2px solid var(--gold)", marginBottom: 12 }}>
              {result.ranking_reasoning}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8, marginBottom: 14 }}>
            {allAssets.map((a, i) => {
              const picked   = selectedIds.has(a.id);
              const visible  = i < revealCount || revealCount === 0;
              return (
                <button key={a.id} onClick={() => togglePick(a.id)}
                  className={visible ? "anim-fade" : ""}
                  style={{ position: "relative", aspectRatio: "9/16", overflow: "hidden", borderRadius: 7,
                    border: picked ? "2px solid var(--t1)" : "0.5px solid var(--border)",
                    background: "var(--fill)", padding: 0, cursor: "pointer",
                    opacity: visible ? 1 : 0, transition: "border 0.15s" }}>
                  <img src={a.thumbnail_url || a.file_url} alt={a.prompt || ""}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <div style={{ position: "absolute", top: 4, left: 4, fontSize: 9, fontWeight: 600,
                    fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", padding: "2px 5px", borderRadius: 3,
                    background: a.asset_type === "atmospheric" ? "rgba(74,155,127,0.85)" : "rgba(91,143,185,0.85)",
                    color: "#fff" }}>
                    {a.asset_type === "atmospheric" ? "ATM" : "LIC"}
                  </div>
                  {picked && (
                    <div style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: "50%",
                      background: "var(--t1)", color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Check size={11} />
                    </div>
                  )}
                  {a.rank_score != null && (
                    <div style={{ position: "absolute", bottom: 4, right: 4, fontSize: 9, fontWeight: 600,
                      fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", padding: "2px 5px", borderRadius: 3,
                      background: "rgba(0,0,0,0.7)", color: "#fff" }}>
                      {Math.round(a.rank_score)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={approve} disabled={selectedIds.size === 0} style={btnPrimary}>
              <Check size={12} /> {savedFlash ? "Saved ✓" : `Save ${selectedIds.size} picks`}
            </button>
            <button onClick={generate} disabled={running} style={btnSecondary}>
              <RefreshCw size={12} className={running ? "spin" : ""} /> Regenerate
            </button>
          </div>
        </div>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}
    </Section>
  );
}

// ─── Assembly section ────────────────────────────────────

export function AssemblySection({ story, brand_profile_id, onSaved }) {
  const [data, setData]           = useState(story.assembly_brief || null);
  const [running, setRunning]     = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError]         = useState(null);
  const [copied, setCopied]       = useState(false);

  useEffect(() => {
    setData(story.assembly_brief || null);
    setError(null); setStreamText("");
  }, [story.id]);

  const canRun = !!story.script;

  const generate = async () => {
    if (!canRun) return;
    setRunning(true); setError(null); setStreamText("");
    sectionEvent("assembly", "running");
    try {
      const prompt = await buildAssemblyPrompt({ story, brand_profile_id });
      const { text } = await runPromptStream({
        type: "agent-call", params: { prompt }, maxTokens: 2000,
        context: { story_id: story.id, brand_profile_id },
        onChunk: (t) => setStreamText(t),
      });
      const { assembly, markdown_brief } = parseAssemblyOutput(text, story);
      const saved = await updateProductionStatus(story.id, {
        assembly_brief: { assembly, markdown_brief },
      });
      setData(saved.assembly_brief);
      setStreamText("");
      sectionEvent("assembly", "done");
      onSaved?.({ assembly_brief: saved.assembly_brief });
    } catch (e) { setError(e?.message || String(e)); sectionEvent("assembly", "error"); }
    finally    { setRunning(false); }
  };

  const copyMarkdown = async () => {
    const md = data?.markdown_brief;
    if (!md) return;
    await navigator.clipboard.writeText(md).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const downloadJson = () => {
    const json = JSON.stringify(data?.assembly || data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), {
      href: url,
      download: `${story.title?.replace(/[^a-z0-9]/gi, "_") || "assembly"}.json`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  const assembly = data?.assembly;
  const sceneCount = assembly?.scenes?.length || 0;
  const langCount  = Object.keys(assembly?.voice_tracks || {}).length;
  const durSec     = assembly?.total_duration_ms ? Math.round(assembly.total_duration_ms / 1000) : null;

  const status = !data ? "not generated"
    : `${sceneCount} scene${sceneCount !== 1 ? "s" : ""} · ${langCount} lang${langCount !== 1 ? "s" : ""}${durSec ? ` · ~${durSec}s` : ""}`;
  const statusColor = data ? "success" : "default";

  return (
    <Section title="Assembly brief" status={status} statusColor={statusColor}
      description="JSON + markdown handoff for CapCut. Generated from script, voice, and visuals.">
      {!canRun && (
        <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>Generate a script first.</div>
      )}

      {canRun && !data && !running && (
        <button onClick={generate} style={btnPrimary}>
          <FileText size={12} /> Generate assembly brief
        </button>
      )}
      {running && <StreamPreview text={streamText} />}

      {data && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={copyMarkdown} disabled={running} style={btnPrimary}>
              <Copy size={12} /> {copied ? "Copied!" : "Copy markdown"}
            </button>
            <button onClick={downloadJson} disabled={running} style={btnSecondary}>
              <Download size={12} /> Download JSON
            </button>
            <button onClick={generate} disabled={running} style={btnGhost}>
              <RefreshCw size={12} className={running ? "spin" : ""} /> Regenerate
            </button>
          </div>
          {running && <StreamPreview text={streamText} />}

          {assembly?.scenes?.length > 0 && (
            <div style={{ display: "grid", gap: 4 }}>
              {assembly.scenes.map((scene, i) => (
                <div key={i} style={{
                  padding: "8px 12px", borderRadius: 6,
                  background: "var(--fill)", border: "0.5px solid var(--border)",
                  fontSize: 12,
                }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: scene.script_segments?.en ? 4 : 0 }}>
                    <span style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 10, color: "var(--t3)", width: 20 }}>#{scene.index}</span>
                    <span style={{ fontWeight: 600, color: "var(--t1)", textTransform: "capitalize" }}>{scene.position}</span>
                    {scene.asset_type && <span style={{ fontSize: 10, color: "var(--t3)" }}>{scene.asset_type}</span>}
                    {scene.duration_ms && <span style={{ fontSize: 10, color: "var(--t3)", marginLeft: "auto", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }}>{Math.round(scene.duration_ms/1000)}s</span>}
                  </div>
                  {scene.script_segments?.en && (
                    <div style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.4, marginLeft: 30 }}>
                      {scene.script_segments.en.slice(0, 140)}{scene.script_segments.en.length > 140 ? "…" : ""}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {data.markdown_brief && (
            <pre style={{
              margin: 0, padding: "12px 14px", borderRadius: 8,
              background: "var(--bg3)", border: "0.5px solid var(--border)",
              fontSize: 10, color: "var(--t2)", lineHeight: 1.6,
              fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
              overflowX: "auto", maxHeight: 280, overflowY: "auto",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {data.markdown_brief}
            </pre>
          )}
        </div>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}
    </Section>
  );
}

// ─── Asset library matches (unchanged) ──────────────────

export function AssetMatchesSection({ story, brand_profile_id }) {
  const [matches, setMatches] = useState(null);
  const [gaps, setGaps] = useState(null);
  const [confidence, setConf] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setMatches(null); setGaps(null); setConf(null); setError(null); }, [story.id]);
  const canRun = !!story.visual_brief;
  const run = async () => {
    if (!story.visual_brief) return;
    setRunning(true); setError(null); sectionEvent("matches", "running");
    try {
      const result = await runAgent({ agent_name: "asset-curator", params: { story, brief: story.visual_brief, brand_profile_id } });
      setMatches(result.matches); setGaps(result.gaps); setConf(result.confidence);
      sectionEvent("matches", "done");
    } catch (e) { setError(e?.message || String(e)); sectionEvent("matches", "error"); }
    finally    { setRunning(false); }
  };
  const status = matches == null ? "not run yet" : matches.length === 0 ? `${gaps?.length || 0} gaps` : `${matches.length} matches · ${gaps?.length || 0} gaps`;
  return (
    <Section title="Asset library matches" status={status} statusColor={matches?.length ? "success" : "default"}
      description="Reusable assets matching this brief. Only gaps will need new generation.">
      {!canRun && <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>Approve a brief first.</div>}
      {canRun && matches == null && <button onClick={run} disabled={running} style={btnPrimary}><Search size={12} />{running ? "Searching…" : "Run library match"}</button>}
      {matches != null && (
        <div style={{ display: "grid", gap: 12 }}>
          {matches.length === 0 && <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>Library empty — all gaps need generation.</div>}
          {(gaps || []).map((g, i) => (
            <div key={i} style={{ fontSize: 11, padding: "6px 10px", borderRadius: 6, background: "var(--fill)" }}>
              <span style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", color: "var(--t2)" }}>{g.position_key} × {g.count}</span>
              <span style={{ color: "var(--t3)", marginLeft: 8 }}>{g.reasoning}</span>
            </div>
          ))}
        </div>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
    </Section>
  );
}

// ─── Main ───────────────────────────────────────────────

export default function ProductionView({ stories, onUpdate, embedded = false }) {
  const queue = useMemo(() => (stories || []).filter(isInProductionQueue), [stories]);
  const [selectedId, setSelectedId] = usePersistentState("production_selected", queue[0]?.id || null);
  const [queueFilter, setQueueFilter] = usePersistentState("production_queue_filter", "all");
  const [activeSection, setActiveSection] = usePersistentState("production_active_section", "brief");
  const [showLibrary, setShowLibrary] = useState(false);
  const filteredQueue = useMemo(() => queue.filter(story => matchesProductionFilter(story, queueFilter)), [queue, queueFilter]);

  useEffect(() => {
    if (!selectedId && queue.length) setSelectedId(queue[0].id);
    if (selectedId && !queue.find(s => s.id === selectedId) && queue.length) setSelectedId(queue[0].id);
  }, [queue, selectedId, setSelectedId]);

  // v3.11.4 — Keyboard shortcuts driven by registry. Cross-platform (⌘ vs Ctrl).
  useEffect(() => {
    const handler = (e) => {
      if (shouldIgnoreFromInput()) return;
      if (filteredQueue.length === 0) return;

      // Queue navigation
      if (matches(e, SHORTCUTS.productionDown.combo) || matches(e, SHORTCUTS.productionUp.combo)) {
        e.preventDefault();
        const idx = filteredQueue.findIndex(s => s.id === selectedId);
        const safe = idx === -1 ? 0 : idx;
        const next = e.key === "ArrowDown"
          ? Math.min(safe + 1, filteredQueue.length - 1)
          : Math.max(safe - 1, 0);
        setSelectedId(filteredQueue[next].id);
        return;
      }

      // Section action shortcuts — emit window events so individual sections
      // can react without prop-drilling. Each section owns its own action.
      if (matches(e, SHORTCUTS.productionBrief.combo))   { e.preventDefault(); window.dispatchEvent(new CustomEvent("production:generate-brief"));  return; }
      if (matches(e, SHORTCUTS.productionVoice.combo))   { e.preventDefault(); window.dispatchEvent(new CustomEvent("production:generate-voice"));  return; }
      if (matches(e, SHORTCUTS.productionVisual.combo))  { e.preventDefault(); window.dispatchEvent(new CustomEvent("production:generate-visual")); return; }
      if (matches(e, SHORTCUTS.productionApprove.combo)) { e.preventDefault(); window.dispatchEvent(new CustomEvent("production:approve"));         return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filteredQueue, selectedId, setSelectedId]);

  const selected = queue.find(s => s.id === selectedId);
  const stepOptions = [
    { key: "brief", label: "Brief" },
    { key: "assets", label: "Assets" },
    { key: "visuals", label: "Visuals" },
    { key: "voice", label: "Voice" },
    { key: "assembly", label: "Assembly" },
    { key: "review", label: "Review" },
  ];
  const filterOptions = [
    { key: "all", label: "All", count: queue.length },
    { key: "needs_brief", label: "Needs brief", count: queue.filter(s => matchesProductionFilter(s, "needs_brief")).length },
    { key: "needs_assets", label: "Needs assets", count: queue.filter(s => matchesProductionFilter(s, "needs_assets")).length },
    { key: "needs_voice", label: "Needs voice", count: queue.filter(s => matchesProductionFilter(s, "needs_voice")).length },
    { key: "needs_assembly", label: "Needs assembly", count: queue.filter(s => matchesProductionFilter(s, "needs_assembly")).length },
    { key: "ready_review", label: "Ready review", count: queue.filter(s => matchesProductionFilter(s, "ready_review")).length },
  ];

  if (queue.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", borderRadius: 12, background: "var(--bg2)", border: "0.5px solid var(--border)" }}>
        <Layers size={32} style={{ color: "var(--t4)", margin: "0 auto 12px" }} />
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)", marginBottom: 4 }}>No stories in production yet</div>
        <div style={{ fontSize: 12, color: "var(--t3)" }}>Approve a script in the Script tab to send it here.</div>
      </div>
    );
  }

  return (
    <div>
      <AssetLibraryModal isOpen={showLibrary} onClose={() => setShowLibrary(false)} />

      {!embedded && (
        <PageHeader
          title="Produce"
          description="Pick a story, check its production readiness, then run the agents for brief, assets, voice, visuals, and assembly."
          meta={`${queue.length} in flight`}
          action={
            <button onClick={() => setShowLibrary(true)} style={buttonStyle("secondary", { padding: "5px 12px" })}>
              <Library size={12} /> Asset library
            </button>
          }
        />
      )}
      {embedded && (
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
          <button onClick={() => setShowLibrary(true)} style={buttonStyle("secondary", { padding: "5px 12px" })}>
            <Library size={12} /> Asset library
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14, alignItems: "start" }}>
        <div style={{ background: "var(--bg2)", borderRadius: 10, border: "0.5px solid var(--border)", padding: 8, position: "sticky", top: 16 }}>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {filterOptions.map(option => (
              <button key={option.key} onClick={() => setQueueFilter(option.key)} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
                <Pill active={queueFilter === option.key}>{option.label} · {option.count}</Pill>
              </button>
            ))}
          </div>
          {filteredQueue.length ? filteredQueue.map(story => {
            const isSelected = story.id === selectedId;
            const readiness = productionReadiness(story);
            return (
              <button key={story.id} onClick={() => setSelectedId(story.id)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 4, borderRadius: 7,
                  borderLeft: `3px solid ${formatBorder(story.format)}`,
                  background: isSelected ? "var(--bg)" : "transparent",
                  border: "1px solid transparent", borderLeftColor: formatBorder(story.format),
                  cursor: "pointer", boxShadow: isSelected ? "var(--shadow-sm)" : "none", transition: "background 0.12s" }}>
                <div style={{ fontSize: 13, fontWeight: isSelected ? 600 : 500, color: "var(--t1)", lineHeight: 1.3, marginBottom: 4 }}>{story.title || "(untitled)"}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <ProgressDots story={story} />
                  <span style={{ fontSize: 10, fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", color: readiness.done >= 4 ? "var(--success)" : "var(--t3)" }}>{readiness.done}/{readiness.total}</span>
                </div>
              </button>
            );
          }) : (
            <div style={{ padding: "28px 8px", textAlign: "center", color: "var(--t4)", fontSize: 12 }}>No stories match this production filter.</div>
          )}
        </div>

        <div style={{ background: "var(--bg2)", borderRadius: 10, border: "0.5px solid var(--border)", padding: "20px 24px" }}>
          {selected && (
            <>
              <div style={{ paddingBottom: 14, borderBottom: "0.5px solid var(--border)", marginBottom: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--t1)", lineHeight: 1.3 }}>{selected.title}</div>
                <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 11, color: "var(--t3)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", flexWrap: "wrap" }}>
                  <span>{selected.format || "—"}</span><span>·</span><span>{selected.archetype || "—"}</span>
                  {selected.reach_score != null && <><span>·</span><span>reach {selected.reach_score}</span></>}
                  {selected.community_score_final != null && <><span>·</span><span>comm {selected.community_score_final}</span></>}
                </div>
              </div>

              <ReadinessStrip story={selected} />
              <PipelineProgress story={selected} />
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", margin:"0 0 12px" }}>
                {stepOptions.map(step => (
                  <button key={step.key} onClick={() => setActiveSection(step.key)} style={buttonStyle(activeSection === step.key ? "primary" : "ghost", {
                    padding:"6px 14px",
                    border: activeSection === step.key ? "0.5px solid var(--t1)" : "0.5px solid transparent",
                  })}>
                    {step.label}
                  </button>
                ))}
              </div>

              {activeSection === "brief" && <BriefSection story={selected} brand_profile_id={UNCLE_CARTER_PROFILE_ID} onSaved={(upd) => onUpdate?.(selected.id, upd || {})} />}
              {activeSection === "assets" && <AssetMatchesSection story={selected} brand_profile_id={UNCLE_CARTER_PROFILE_ID} />}
              {activeSection === "visuals" && <VisualSection story={selected} brand_profile_id={UNCLE_CARTER_PROFILE_ID} onSaved={(upd) => onUpdate?.(selected.id, upd || {})} />}
              {activeSection === "voice" && <VoiceSection story={selected} brand_profile_id={UNCLE_CARTER_PROFILE_ID} onSaved={(upd) => onUpdate?.(selected.id, upd || {})} />}
              {activeSection === "assembly" && <AssemblySection story={selected} brand_profile_id={UNCLE_CARTER_PROFILE_ID} onSaved={(upd) => onUpdate?.(selected.id, upd || {})} />}
              {activeSection === "review" && (
                <div style={{ display:"grid", gap:12 }}>
                  <ReadinessStrip story={selected} />
                  <div style={{ padding:"14px 16px", borderRadius:10, background:"var(--card)", border:"0.5px solid var(--border)" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"var(--t1)", marginBottom:6 }}>Production review</div>
                    <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.5 }}>
                      Use this pass to confirm the story has its approved brief, selected visuals, voice references, and assembly notes before export.
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
