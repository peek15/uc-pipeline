"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Sparkles, Search, Volume2, Image as ImageIcon, FileText, Check, X, RefreshCw, AlertCircle, Layers } from "lucide-react";
import {
  PRODUCTION_STATUS_LABELS,
  isInProductionQueue,
} from "@/lib/constants";
import { runAgent, recordAgentFeedback } from "@/lib/ai/agent-runner";
import { updateProductionStatus } from "@/lib/db";

const UNCLE_CARTER_PROFILE_ID = "00000000-0000-0000-0000-000000000001";

// ═══════════════════════════════════════════════════════════
// v3.8.3 DIAGNOSTIC BUILD — verbose console logging
// Remove logs after fix is identified.
// ═══════════════════════════════════════════════════════════

console.log("[ProductionView] module loaded. runAgent type:", typeof runAgent);

// ─── Format border colors ───
function formatBorder(format) {
  if (format === "classics")            return "#4A9B7F";
  if (format === "performance_special") return "#C0666A";
  if (format === "special_edition")     return "#8B7EC8";
  return "#C49A3C";
}

const btnPrimary = {
  padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600,
  background: "var(--t1)", color: "var(--bg)", border: "none",
  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
};
const btnSecondary = {
  padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 500,
  background: "var(--fill2)", color: "var(--t1)",
  border: "1px solid var(--border)", cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6,
};
const btnGhost = {
  padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 500,
  background: "transparent", color: "var(--t3)",
  border: "1px solid var(--border)", cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6,
};

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
  const dot = (on) => (
    <span style={{ width: 5, height: 5, borderRadius: "50%", background: on ? "var(--t1)" : "var(--t4)", display: "inline-block" }} />
  );
  return <span style={{ display: "inline-flex", gap: 3 }}>{dot(hasBrief)}{dot(hasVisuals)}{dot(hasAudio)}</span>;
}

function Section({ title, status, statusColor, description, action, children }) {
  return (
    <div style={{ borderTop: "0.5px solid var(--border)", padding: "16px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)", marginBottom: 2 }}>{title}</div>
          {description && (<div style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.45 }}>{description}</div>)}
        </div>
        {status && (
          <span style={{
            fontSize: 10, fontWeight: 600, fontFamily: "'DM Mono',monospace",
            padding: "2px 8px", borderRadius: 4,
            background: statusColor === "success" ? "rgba(74,155,127,0.12)" : statusColor === "warning" ? "rgba(196,154,60,0.12)" : "var(--fill)",
            color: statusColor === "success" ? "#4A9B7F" : statusColor === "warning" ? "var(--gold)" : "var(--t3)",
            border: "0.5px solid var(--border)", whiteSpace: "nowrap", flexShrink: 0,
          }}>{status}</span>
        )}
      </div>
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
      {children && <div style={{ marginTop: action ? 12 : 10 }}>{children}</div>}
    </div>
  );
}

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
    setDraft(story.visual_brief || null);
    setOriginal(story.visual_brief || null);
    setConfidence(null); setReasoning(null); setAiCallId(null); setError(null);
  }, [story.id]);

  const generate = async () => {
    console.log("[BriefSection] generate() called");
    console.log("[BriefSection] story:", story);
    console.log("[BriefSection] brand_profile_id:", brand_profile_id);
    console.log("[BriefSection] runAgent typeof:", typeof runAgent);

    setRunning(true); setError(null);

    try {
      console.log("[BriefSection] about to call runAgent...");
      const result = await runAgent({
        agent_name: "brief-author",
        params: { story, brand_profile_id },
      });
      console.log("[BriefSection] runAgent returned:", result);

      setDraft(result.brief);
      setConfidence(result.confidence);
      setReasoning(result.reasoning);
      setAiCallId(result.ai_call_id);
    } catch (e) {
      console.error("[BriefSection] runAgent threw:", e);
      console.error("[BriefSection] error message:", e?.message);
      console.error("[BriefSection] error stack:", e?.stack);
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  const updateField = (field, value) => setDraft(prev => ({ ...(prev || {}), [field]: value }));
  const updateRef   = (i, value) => {
    const refs = [...(draft?.references || [])]; refs[i] = value;
    setDraft(prev => ({ ...(prev || {}), references: refs }));
  };
  const addRef    = () => setDraft(prev => ({ ...(prev || {}), references: [...(prev?.references || []), ""] }));
  const removeRef = (i) => setDraft(prev => ({ ...(prev || {}), references: (prev?.references || []).filter((_, idx) => idx !== i) }));

  const isDirty   = JSON.stringify(draft) !== JSON.stringify(original);
  const wasEdited = !!original && isDirty;

  const approve = async () => {
    if (!draft) return;
    try {
      await updateProductionStatus(story.id, { visual_brief: draft });
      await recordAgentFeedback({
        agent_name: "brief-author", brand_profile_id, story_id: story.id, ai_call_id: aiCallId,
        agent_output: original,
        user_correction: wasEdited ? draft : null,
        correction_type: wasEdited ? "edit" : "approve",
        agent_confidence: confidence, was_auto_approved: false,
      });
      setOriginal(draft);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
      onSaved?.();
    } catch (e) { setError(e?.message || String(e)); }
  };

  const reject = async () => {
    try {
      await recordAgentFeedback({
        agent_name: "brief-author", brand_profile_id, story_id: story.id, ai_call_id: aiCallId,
        agent_output: original, correction_type: "reject", agent_confidence: confidence,
      });
      setDraft(null); setOriginal(null);
    } catch {}
  };

  const status = !draft ? "no brief yet" : savedFlash ? "saved ✓" : isDirty ? "unsaved edits" : "approved";
  const statusColor = savedFlash ? "success" : isDirty ? "warning" : draft ? "success" : "default";

  return (
    <Section title="Visual brief" status={status} statusColor={statusColor}
      description="AI writes a structured brief from the story, brand, and your past corrections. Edit any field and approve to save.">
      {!draft && (
        <button onClick={() => { console.log("[BriefSection] BUTTON CLICKED"); generate(); }} disabled={running} style={btnPrimary}>
          <Sparkles size={12} />
          {running ? "Writing brief…" : "Generate brief"}
        </button>
      )}

      {draft && (
        <div style={{ display: "grid", gap: 12 }}>
          {confidence != null && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 7, background: "var(--fill)", border: "0.5px solid var(--border)" }}>
              <span style={{ fontSize: 11, color: "var(--t3)" }}>Agent confidence</span>
              <ConfidenceBar value={confidence} />
            </div>
          )}
          <Field label="Scene" value={draft.scene} onChange={(v) => updateField("scene", v)} multiline />
          <Field label="Mood"  value={draft.mood}  onChange={(v) => updateField("mood",  v)} />
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>References</div>
            {(draft.references || []).map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input value={r} onChange={(e) => updateRef(i, e.target.value)} style={inputStyle} />
                <button onClick={() => removeRef(i)} style={{ ...btnGhost, padding: "0 10px", fontSize: 14 }}>×</button>
              </div>
            ))}
            <button onClick={addRef} style={{ ...btnGhost, fontSize: 11, padding: "4px 10px" }}>+ add reference</button>
          </div>
          <Field label="Avoid" value={draft.avoid} onChange={(v) => updateField("avoid", v)} multiline />
          {reasoning && (
            <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic", padding: "8px 12px", borderRadius: 6, background: "var(--fill)", borderLeft: "2px solid var(--gold)" }}>{reasoning}</div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={approve} style={btnPrimary}><Check size={12} />{wasEdited ? "Save edits" : "Approve as-is"}</button>
            <button onClick={generate} disabled={running} style={btnSecondary}><RefreshCw size={12} />{running ? "Re-writing…" : "Regenerate"}</button>
            <button onClick={reject} style={btnGhost}><X size={12} />Reject</button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, fontSize: 11, color: "#C0666A", padding: "8px 12px", borderRadius: 6, background: "rgba(192,102,106,0.08)", border: "0.5px solid rgba(192,102,106,0.3)", display: "flex", gap: 6, alignItems: "flex-start" }}>
          <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}
    </Section>
  );
}

const inputStyle = {
  flex: 1, padding: "8px 12px", borderRadius: 7, fontSize: 13,
  background: "var(--fill2)", border: "1px solid var(--border-in)",
  color: "var(--t1)", outline: "none", fontFamily: "inherit",
};
const textareaStyle = { ...inputStyle, width: "100%", minHeight: 64, resize: "vertical", lineHeight: 1.5 };

function Field({ label, value, onChange, multiline = false }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      {multiline ? (
        <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={3} style={textareaStyle} />
      ) : (
        <input value={value || ""} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      )}
    </div>
  );
}

function AssetMatchesSection({ story, brand_profile_id }) {
  const [matches, setMatches] = useState(null);
  const [gaps, setGaps]       = useState(null);
  const [confidence, setConf] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => { setMatches(null); setGaps(null); setConf(null); setError(null); }, [story.id]);

  const canRun = !!story.visual_brief;

  const run = async () => {
    if (!story.visual_brief) return;
    setRunning(true); setError(null);
    try {
      const result = await runAgent({ agent_name: "asset-curator", params: { story, brief: story.visual_brief, brand_profile_id } });
      setMatches(result.matches); setGaps(result.gaps); setConf(result.confidence);
    } catch (e) { setError(e?.message || String(e)); }
    finally { setRunning(false); }
  };

  const status = matches == null ? "not run yet" : matches.length === 0 ? `${gaps?.length || 0} gaps` : `${matches.length} matches · ${gaps?.length || 0} gaps`;

  return (
    <Section title="Asset library matches" status={status} statusColor={matches?.length ? "success" : "default"}
      description="AI checks the asset library for reusable assets matching this brief. Only gaps will need new generation.">
      {!canRun && (<div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>Approve a brief first.</div>)}
      {canRun && matches == null && (<button onClick={run} disabled={running} style={btnPrimary}><Search size={12} />{running ? "Searching library…" : "Run library match"}</button>)}
      {matches != null && (
        <div style={{ display: "grid", gap: 12 }}>
          {confidence != null && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 7, background: "var(--fill)", border: "0.5px solid var(--border)" }}>
              <span style={{ fontSize: 11, color: "var(--t3)" }}>Agent confidence</span>
              <ConfidenceBar value={confidence} />
            </div>
          )}
          {matches.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Reusable matches ({matches.length})</div>
              <div style={{ display: "grid", gap: 6 }}>
                {matches.map((m, i) => (
                  <div key={i} style={{ fontSize: 12, padding: "8px 12px", borderRadius: 6, background: "rgba(74,155,127,0.08)", border: "0.5px solid rgba(74,155,127,0.3)" }}>
                    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 600, color: "#4A9B7F", marginRight: 8 }}>{m.position_key}</span>
                    <span style={{ color: "var(--t2)" }}>{m.reasoning}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {gaps && gaps.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Gaps to generate ({gaps.length})</div>
              <div style={{ display: "grid", gap: 6 }}>
                {gaps.map((g, i) => (
                  <div key={i} style={{ fontSize: 12, padding: "8px 12px", borderRadius: 6, background: "var(--fill)", border: "0.5px solid var(--border)" }}>
                    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 600, color: "var(--t2)", marginRight: 8 }}>{g.position_key} × {g.count}</span>
                    <span style={{ color: "var(--t3)" }}>{g.reasoning}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div><button onClick={run} disabled={running} style={btnSecondary}><RefreshCw size={12} />{running ? "Re-running…" : "Re-run match"}</button></div>
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10, fontSize: 11, color: "#C0666A", padding: "8px 12px", borderRadius: 6, background: "rgba(192,102,106,0.08)", border: "0.5px solid rgba(192,102,106,0.3)", display: "flex", gap: 6, alignItems: "flex-start" }}>
          <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}
    </Section>
  );
}

function StubSection({ Icon, title, description, deliveryLabel }) {
  return (
    <Section
      title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--t3)" }}><Icon size={12} />{title}</span>}
      status={deliveryLabel} description={description}
    />
  );
}

export default function ProductionView({ stories, onUpdate }) {
  const queue = useMemo(() => (stories || []).filter(isInProductionQueue), [stories]);
  const [selectedId, setSelectedId] = useState(queue[0]?.id || null);

  useEffect(() => {
    if (!selectedId && queue.length) setSelectedId(queue[0].id);
    if (selectedId && !queue.find(s => s.id === selectedId) && queue.length) setSelectedId(queue[0].id);
  }, [queue, selectedId]);

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
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "10px 12px", marginBottom: 4, borderRadius: 7,
                  borderLeft: `3px solid ${formatBorder(story.format)}`,
                  background: isSelected ? "var(--bg)" : "transparent",
                  border: "1px solid transparent", borderLeftColor: formatBorder(story.format),
                  cursor: "pointer", boxShadow: isSelected ? "var(--shadow-sm)" : "none",
                  transition: "background 0.12s",
                }}>
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
                  <span>{selected.format || "—"}</span>
                  <span>·</span>
                  <span>{selected.archetype || "—"}</span>
                  {selected.reach_score != null && <><span>·</span><span>reach {selected.reach_score}</span></>}
                  {selected.community_score_final != null && <><span>·</span><span>comm {selected.community_score_final}</span></>}
                </div>
              </div>

              <BriefSection story={selected} brand_profile_id={UNCLE_CARTER_PROFILE_ID} onSaved={() => onUpdate?.(selected.id, {})} />
              <AssetMatchesSection story={selected} brand_profile_id={UNCLE_CARTER_PROFILE_ID} />

              <StubSection Icon={ImageIcon} title="Visual generation" description="MidJourney + Shutterstock generate the gap positions. Visual-ranker agent ranks results. You pick from top 6." deliveryLabel="Delivery 2" />
              <StubSection Icon={Volume2} title="Voice generation" description="ElevenLabs generates EN, then cascades FR/ES/PT in parallel once confidence threshold is met." deliveryLabel="Delivery 2" />
              <StubSection Icon={FileText} title="Assembly brief" description="JSON + markdown export for CapCut. Generated once visual + voice are approved." deliveryLabel="Delivery 3" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
