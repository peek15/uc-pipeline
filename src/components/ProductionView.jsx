"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Sparkles, Search, Volume2, Image as ImageIcon, FileText, Check, X, RefreshCw, AlertCircle, Layers, Play, Pause } from "lucide-react";
import { PRODUCTION_STATUS_LABELS, isInProductionQueue } from "@/lib/constants";
import { runAgent, recordAgentFeedback, voiceAgent, visualAgent } from "@/lib/ai/agent-runner";
import { updateProductionStatus, supabase } from "@/lib/db";
import { usePersistentState } from "@/lib/usePersistentState";
import { matches, shouldIgnoreFromInput, SHORTCUTS } from "@/lib/shortcuts";

const UNCLE_CARTER_PROFILE_ID = "00000000-0000-0000-0000-000000000001";
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
const btnSecondary = { padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 500, background: "var(--fill2)", color: "var(--t1)", border: "1px solid var(--border)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
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
      <span style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "var(--t2)", width: 28 }}>{value}%</span>
    </div>
  );
}

function ProgressDots({ story }) {
  const hasBrief    = !!story.visual_brief;
  const hasVisuals  = !!(story.visual_refs?.selected?.length);
  const hasAudio    = !!(story.audio_refs && Object.keys(story.audio_refs || {}).length);
  const dot = (on) => <span style={{ width: 5, height: 5, borderRadius: "50%", background: on ? "var(--t1)" : "var(--t4)", display: "inline-block" }} />;
  return <span style={{ display: "inline-flex", gap: 3 }}>{dot(hasBrief)}{dot(hasVisuals)}{dot(hasAudio)}</span>;
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
          <span style={{ fontSize: 10, fontWeight: 600, fontFamily: "'DM Mono',monospace", padding: "2px 8px", borderRadius: 4,
            background: statusColor === "success" ? "rgba(74,155,127,0.12)" : statusColor === "warning" ? "rgba(196,154,60,0.12)" : "var(--fill)",
            color: statusColor === "success" ? "#4A9B7F" : statusColor === "warning" ? "var(--gold)" : "var(--t3)",
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
    <div style={{ marginTop: 10, fontSize: 11, color: "#C0666A", padding: "8px 12px", borderRadius: 6, background: "rgba(192,102,106,0.08)", border: "0.5px solid rgba(192,102,106,0.3)", display: "flex", gap: 6, alignItems: "flex-start" }}>
      <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

// ─── Brief section (unchanged from v3.10.x) ─────────────

function BriefSection({ story, brand_profile_id, onSaved }) {
  const [draft, setDraft]       = useState(story.visual_brief || null);
  const [original, setOriginal] = useState(story.visual_brief || null);
  const [running, setRunning]   = useState(false);
  const [confidence, setConfidence] = useState(null);
  const [reasoning, setReasoning]   = useState(null);
  const [aiCallId, setAiCallId]     = useState(null);
  const [error, setError]           = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setDraft(story.visual_brief || null); setOriginal(story.visual_brief || null);
    setConfidence(null); setReasoning(null); setAiCallId(null); setError(null);
  }, [story.id]);

  // v3.11.4 — listen for ⌘B from global handler
  useEffect(() => {
    const h = () => { if (!running) generate(); };
    window.addEventListener("production:generate-brief", h);
    return () => window.removeEventListener("production:generate-brief", h);
  }, [running]);

  const generate = async () => {
    setRunning(true); setError(null);
    try {
      const result = await runAgent({ agent_name: "brief-author", params: { story, brand_profile_id } });
      setDraft(result.brief); setConfidence(result.confidence); setReasoning(result.reasoning); setAiCallId(result.ai_call_id);
    } catch (e) { setError(e?.message || String(e)); }
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
      setOriginal(draft); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800); onSaved?.();
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
      {!draft && (<button onClick={generate} disabled={running} style={btnPrimary}><Sparkles size={12} />{running ? "Writing brief…" : "Generate brief"}</button>)}
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={approve} style={btnPrimary}><Check size={12} />{wasEdited ? "Save edits" : "Approve as-is"}</button>
            <button onClick={generate} disabled={running} style={btnSecondary}><RefreshCw size={12} />{running ? "Re-writing…" : "Regenerate"}</button>
            <button onClick={reject} style={btnGhost}><X size={12} />Reject</button>
          </div>
        </div>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
    </Section>
  );
}

// ─── Voice section ──────────────────────────────────────

function VoiceSection({ story, brand_profile_id, onSaved }) {
  const [running, setRunning] = useState(null); // null | "en" | "all" | "cascade"
  const [enResult, setEnResult] = useState(null);
  const [error, setError] = useState(null);
  const [audioRefs, setAudioRefs] = useState(story.audio_refs || {});
  const [playing, setPlaying] = useState(null);
  const [audioEl] = useState(() => typeof Audio !== "undefined" ? new Audio() : null);

  useEffect(() => {
    setAudioRefs(story.audio_refs || {});
    setEnResult(null); setError(null);
  }, [story.id]);

  useEffect(() => {
    if (!audioEl) return;
    audioEl.onended = () => setPlaying(null);
    return () => { audioEl.pause(); audioEl.src = ""; };
  }, [audioEl]);

  // v3.11.4 — listen for ⌘⇧V from global handler
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

  const generateEN = async () => {
    setRunning("en"); setError(null); setEnResult(null);
    try {
      const result = await voiceAgent.runEnglishOnly({ story, brand_profile_id });
      const merged = await voiceAgent.persistAudioRefs(story.id, [result]);
      setAudioRefs(merged);
      setEnResult(result);
      onSaved?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally    { setRunning(null); }
  };

  const cascadeOthers = async () => {
    setRunning("cascade"); setError(null);
    try {
      const langs = ["fr", "es", "pt"].filter(l => story[`script_${l}`]);
      const { results, errors } = await voiceAgent.runAll({ story, brand_profile_id, languages: langs });
      if (results.length) {
        const merged = await voiceAgent.persistAudioRefs(story.id, results);
        setAudioRefs(merged);
        onSaved?.();
      }
      if (errors.length) setError(errors.map(e => `${e.language}: ${e.error}`).join(" · "));
    } catch (e) { setError(e?.message || String(e)); }
    finally    { setRunning(null); }
  };

  const generateAll = async () => {
    setRunning("all"); setError(null);
    try {
      const { results, errors } = await voiceAgent.runAll({ story, brand_profile_id });
      if (results.length) {
        const merged = await voiceAgent.persistAudioRefs(story.id, results);
        setAudioRefs(merged);
        onSaved?.();
      }
      if (errors.length) setError(errors.map(e => `${e.language}: ${e.error}`).join(" · "));
    } catch (e) { setError(e?.message || String(e)); }
    finally    { setRunning(null); }
  };

  const langs   = Object.keys(audioRefs);
  const hasEN   = !!audioRefs.en;
  const hasAll  = ["en", "fr", "es", "pt"].every(l => audioRefs[l]);
  const status  = hasAll ? "all 4 languages ✓" : hasEN ? "EN ready" : langs.length ? `${langs.length} language${langs.length>1?"s":""}` : "not started";
  const statusColor = hasAll ? "success" : hasEN ? "warning" : "default";

  return (
    <Section title="Voice generation" status={status} statusColor={statusColor}
      description="EN first for approval, then FR/ES/PT cascade in parallel. Or generate all at once.">
      {Object.keys(audioRefs).length === 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={generateEN}  disabled={!!running} style={btnPrimary}>
            {running === "en" ? <RefreshCw size={12} className="spin" /> : <Volume2 size={12} />}
            {running === "en" ? "Generating EN…" : "Generate EN first"}
          </button>
          <button onClick={generateAll} disabled={!!running} style={btnSecondary}>
            {running === "all" ? <RefreshCw size={12} className="spin" /> : null}
            {running === "all" ? "Generating all…" : "Generate all 4 languages"}
          </button>
        </div>
      )}

      {Object.keys(audioRefs).length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          {Object.entries(audioRefs).map(([lang, ref]) => (
            <div key={lang} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 6, background: "var(--fill)", border: "0.5px solid var(--border)" }}>
              <button onClick={() => playAudio(lang)} style={{ ...btnGhost, padding: "4px 8px" }}>
                {playing === lang ? <Pause size={12} /> : <Play size={12} />}
              </button>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t1)", width: 80 }}>{LANG_LABELS[lang] || lang}</span>
              <span style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "var(--t3)" }}>
                {ref.provider || "—"} · {ref.duration_estimate_ms ? Math.round(ref.duration_estimate_ms/1000) + "s" : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {hasEN && !hasAll && (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={cascadeOthers} disabled={!!running} style={btnPrimary}>
            {running === "cascade" ? <RefreshCw size={12} className="spin" /> : <Volume2 size={12} />}
            {running === "cascade" ? "Cascading…" : "Approve EN, cascade FR/ES/PT"}
          </button>
          <button onClick={generateEN} disabled={!!running} style={btnGhost}>
            <RefreshCw size={12} /> Re-generate EN
          </button>
        </div>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}
    </Section>
  );
}

// ─── Visual section ─────────────────────────────────────

function VisualSection({ story, brand_profile_id, onSaved }) {
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

  const generate = async () => {
    if (!canRun) return;
    setRunning(true); setError(null);
    try {
      const r = await visualAgent.run({
        story, brief: story.visual_brief, brand_profile_id,
      });
      setResult(r);
      setAllAssets(r.all_assets || []);
      // Pre-select top-ranked
      setSelectedIds(new Set((r.ranked_top || []).slice(0, 6).map(a => a.id)));
    } catch (e) { setError(e?.message || String(e)); }
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
      setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800);
      onSaved?.();
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
        <div style={{ fontSize: 12, color: "var(--t3)", padding: "10px 0", display: "flex", alignItems: "center", gap: 8 }}>
          <RefreshCw size={14} className="spin" /> Generating + ranking… 30-60 seconds.
        </div>
      )}

      {allAssets.length > 0 && (
        <div>
          {result?.ranking_reasoning && (
            <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic", padding: "8px 12px", borderRadius: 6, background: "var(--fill)", borderLeft: "2px solid var(--gold)", marginBottom: 12 }}>
              {result.ranking_reasoning}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 14 }}>
            {allAssets.map(a => {
              const picked = selectedIds.has(a.id);
              return (
                <button key={a.id} onClick={() => togglePick(a.id)}
                  style={{ position: "relative", aspectRatio: "9/16", overflow: "hidden", borderRadius: 7,
                    border: picked ? "2px solid var(--t1)" : "0.5px solid var(--border)",
                    background: "var(--fill)", padding: 0, cursor: "pointer" }}>
                  <img src={a.thumbnail_url || a.file_url} alt={a.prompt || ""}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <div style={{ position: "absolute", top: 4, left: 4, fontSize: 9, fontWeight: 600,
                    fontFamily: "'DM Mono',monospace", padding: "2px 5px", borderRadius: 3,
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
                      fontFamily: "'DM Mono',monospace", padding: "2px 5px", borderRadius: 3,
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
              <RefreshCw size={12} /> Regenerate
            </button>
          </div>
        </div>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}
    </Section>
  );
}

// ─── Stub for assembly (Delivery 3) ─────────────────────

function StubSection({ Icon, title, description, deliveryLabel }) {
  return (
    <Section title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--t3)" }}><Icon size={12} />{title}</span>}
      status={deliveryLabel} description={description} />
  );
}

// ─── Asset library matches (unchanged) ──────────────────

function AssetMatchesSection({ story, brand_profile_id }) {
  const [matches, setMatches] = useState(null);
  const [gaps, setGaps] = useState(null);
  const [confidence, setConf] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setMatches(null); setGaps(null); setConf(null); setError(null); }, [story.id]);
  const canRun = !!story.visual_brief;
  const run = async () => {
    if (!story.visual_brief) return;
    setRunning(true); setError(null);
    try {
      const result = await runAgent({ agent_name: "asset-curator", params: { story, brief: story.visual_brief, brand_profile_id } });
      setMatches(result.matches); setGaps(result.gaps); setConf(result.confidence);
    } catch (e) { setError(e?.message || String(e)); }
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
              <span style={{ fontFamily: "'DM Mono',monospace", color: "var(--t2)" }}>{g.position_key} × {g.count}</span>
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

export default function ProductionView({ stories, onUpdate }) {
  const queue = useMemo(() => (stories || []).filter(isInProductionQueue), [stories]);
  const [selectedId, setSelectedId] = usePersistentState("production_selected", queue[0]?.id || null);

  useEffect(() => {
    if (!selectedId && queue.length) setSelectedId(queue[0].id);
    if (selectedId && !queue.find(s => s.id === selectedId) && queue.length) setSelectedId(queue[0].id);
  }, [queue, selectedId, setSelectedId]);

  // v3.11.4 — Keyboard shortcuts driven by registry. Cross-platform (⌘ vs Ctrl).
  useEffect(() => {
    const handler = (e) => {
      if (shouldIgnoreFromInput()) return;
      if (queue.length === 0) return;

      // Queue navigation
      if (matches(e, SHORTCUTS.productionDown.combo) || matches(e, SHORTCUTS.productionUp.combo)) {
        e.preventDefault();
        const idx = queue.findIndex(s => s.id === selectedId);
        const safe = idx === -1 ? 0 : idx;
        const next = e.key === "ArrowDown"
          ? Math.min(safe + 1, queue.length - 1)
          : Math.max(safe - 1, 0);
        setSelectedId(queue[next].id);
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
  }, [queue, selectedId, setSelectedId]);

  const selected = queue.find(s => s.id === selectedId);

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
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", margin: 0, color: "var(--t1)" }}>Production</h1>
        <span style={{ fontSize: 12, color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>{queue.length} in flight</span>
      </header>
      <p style={{ fontSize: 13, color: "var(--t3)", margin: "0 0 20px", maxWidth: 720 }}>
        Pick a story on the left. Five agents handle brief, library matching, voice, visuals, and assembly. Your edits train the system.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14, alignItems: "start" }}>
        <div style={{ background: "var(--bg2)", borderRadius: 10, border: "0.5px solid var(--border)", padding: 8, position: "sticky", top: 16 }}>
          {queue.map(story => {
            const isSelected = story.id === selectedId;
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
                  <span style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "var(--t3)" }}>{PRODUCTION_STATUS_LABELS[story.production_status] || story.status || ""}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ background: "var(--bg2)", borderRadius: 10, border: "0.5px solid var(--border)", padding: "20px 24px" }}>
          {selected && (
            <>
              <div style={{ paddingBottom: 14, borderBottom: "0.5px solid var(--border)", marginBottom: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--t1)", lineHeight: 1.3 }}>{selected.title}</div>
                <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 11, color: "var(--t3)", fontFamily: "'DM Mono',monospace", flexWrap: "wrap" }}>
                  <span>{selected.format || "—"}</span><span>·</span><span>{selected.archetype || "—"}</span>
                  {selected.reach_score != null && <><span>·</span><span>reach {selected.reach_score}</span></>}
                  {selected.community_score_final != null && <><span>·</span><span>comm {selected.community_score_final}</span></>}
                </div>
              </div>

              <BriefSection story={selected} brand_profile_id={UNCLE_CARTER_PROFILE_ID} onSaved={() => onUpdate?.(selected.id, {})} />
              <AssetMatchesSection story={selected} brand_profile_id={UNCLE_CARTER_PROFILE_ID} />
              <VisualSection story={selected} brand_profile_id={UNCLE_CARTER_PROFILE_ID} onSaved={() => onUpdate?.(selected.id, {})} />
              <VoiceSection story={selected} brand_profile_id={UNCLE_CARTER_PROFILE_ID} onSaved={() => onUpdate?.(selected.id, {})} />

              <StubSection Icon={FileText} title="Assembly brief"
                description="JSON + markdown export for CapCut. Generated once visual + voice are approved."
                deliveryLabel="Delivery 3" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
