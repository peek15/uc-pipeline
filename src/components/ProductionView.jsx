"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  PRODUCTION_STATUS_LABELS,
  PRODUCTION_POSITIONS,
  isInProductionQueue,
} from "@/lib/constants-additions";
import { runAgent, recordAgentFeedback } from "@/lib/ai/agent-runner";
import { updateProductionStatus, listAssetLibrary } from "@/lib/db";

const UNCLE_CARTER_PROFILE_ID = "00000000-0000-0000-0000-000000000001";

// ─── Helpers ─────────────────────────────────────

function formatBorder(format) {
  if (format === "classics")            return "#1D9E75";
  if (format === "performance_special") return "#A32D2D";
  if (format === "special_edition")     return "#7A4FA8";
  return "#BA7517"; // standard
}

function ProgressDots({ story }) {
  const hasBrief    = !!story.visual_brief;
  const hasVisuals  = !!story.visual_refs?.selected?.length;
  const hasAudio    = !!story.audio_refs && Object.keys(story.audio_refs || {}).length > 0;
  const dot = (on, color) => (
    <span style={{
      width: 6, height: 6, borderRadius: "50%",
      background: on ? color : "var(--color-border-tertiary)",
    }} />
  );
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {dot(hasBrief,   "#1D9E75")}
      {dot(hasVisuals, "#1D9E75")}
      {dot(hasAudio,   "#1D9E75")}
    </div>
  );
}

// ─── Section: Brief ──────────────────────────────

function BriefSection({ story, brand_profile_id, onSaved }) {
  const [draft, setDraft]       = useState(story.visual_brief || null);
  const [original, setOriginal] = useState(story.visual_brief || null);
  const [running, setRunning]   = useState(false);
  const [confidence, setConfidence] = useState(null);
  const [reasoning, setReasoning]   = useState(null);
  const [aiCallId, setAiCallId]     = useState(null);
  const [error, setError]           = useState(null);

  useEffect(() => {
    setDraft(story.visual_brief || null);
    setOriginal(story.visual_brief || null);
    setConfidence(null);
    setReasoning(null);
    setAiCallId(null);
    setError(null);
  }, [story.id]);

  const generate = async () => {
    setRunning(true); setError(null);
    try {
      const result = await runAgent({
        agent_name: "brief-author",
        params: { story, brand_profile_id },
      });
      setDraft(result.brief);
      setConfidence(result.confidence);
      setReasoning(result.reasoning);
      setAiCallId(result.ai_call_id);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  const updateField = (field, value) => {
    setDraft(prev => ({ ...(prev || {}), [field]: value }));
  };

  const updateRef = (i, value) => {
    const refs = [...(draft?.references || [])];
    refs[i] = value;
    setDraft(prev => ({ ...(prev || {}), references: refs }));
  };

  const addRef = () => {
    setDraft(prev => ({ ...(prev || {}), references: [...(prev?.references || []), ""] }));
  };

  const removeRef = (i) => {
    setDraft(prev => ({ ...(prev || {}), references: (prev?.references || []).filter((_, idx) => idx !== i) }));
  };

  const isDirty   = JSON.stringify(draft) !== JSON.stringify(original);
  const wasEdited = !!original && isDirty;

  const approve = async () => {
    if (!draft) return;
    try {
      await updateProductionStatus(story.id, { visual_brief: draft });
      // Log feedback: edit if changed, approve if not
      await recordAgentFeedback({
        agent_name:       "brief-author",
        brand_profile_id,
        story_id:         story.id,
        ai_call_id:       aiCallId,
        agent_output:     original,
        user_correction:  wasEdited ? draft : null,
        correction_type:  wasEdited ? "edit" : "approve",
        agent_confidence: confidence,
        was_auto_approved: false,
      });
      setOriginal(draft);
      onSaved?.();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const reject = async () => {
    try {
      await recordAgentFeedback({
        agent_name:       "brief-author",
        brand_profile_id,
        story_id:         story.id,
        ai_call_id:       aiCallId,
        agent_output:     original,
        correction_type:  "reject",
        agent_confidence: confidence,
        was_auto_approved: false,
      });
      setDraft(null);
      setOriginal(null);
    } catch {}
  };

  return (
    <section style={{ borderTop: "0.5px solid var(--color-border-tertiary)", padding: "14px 0" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Visual brief</span>
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
          {!draft ? "no brief yet" : confidence != null ? `${confidence}% confidence` : "saved"}
        </span>
      </header>
      <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>
        AI writes a structured brief from the story, brand, and your past corrections. Edit any field and approve to save.
      </p>

      {!draft && (
        <button
          disabled={running}
          onClick={generate}
          style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6 }}
        >
          {running ? "Writing brief…" : "Generate brief"}
        </button>
      )}

      {draft && (
        <div style={{ display: "grid", gap: 10 }}>
          <Field label="Scene"      value={draft.scene}  onChange={(v) => updateField("scene", v)}  multiline />
          <Field label="Mood"       value={draft.mood}   onChange={(v) => updateField("mood",  v)}             />

          <div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>References</div>
            {(draft.references || []).map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                <input
                  value={r}
                  onChange={(e) => updateRef(i, e.target.value)}
                  style={{ flex: 1, fontSize: 12, padding: "4px 8px", borderRadius: 4, border: "0.5px solid var(--color-border-tertiary)" }}
                />
                <button onClick={() => removeRef(i)} style={{ fontSize: 11, padding: "2px 6px" }}>×</button>
              </div>
            ))}
            <button onClick={addRef} style={{ fontSize: 11, padding: "3px 10px", marginTop: 4 }}>+ add reference</button>
          </div>

          <Field label="Avoid" value={draft.avoid} onChange={(v) => updateField("avoid", v)} multiline />

          {reasoning && (
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
              Agent reasoning: {reasoning}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={approve} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6 }}>
              {wasEdited ? "Save edits" : "Approve as-is"}
            </button>
            <button onClick={generate} disabled={running} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6 }}>
              {running ? "Re-writing…" : "Regenerate"}
            </button>
            <button onClick={reject} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6 }}>
              Reject
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: "var(--color-text-error)", marginTop: 6 }}>
          {error}
        </div>
      )}
    </section>
  );
}

function Field({ label, value, onChange, multiline = false }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>{label}</div>
      {multiline ? (
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={{
            width: "100%", fontSize: 12, padding: "6px 8px", borderRadius: 4,
            border: "0.5px solid var(--color-border-tertiary)",
            fontFamily: "var(--font-sans)", resize: "vertical",
          }}
        />
      ) : (
        <input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%", fontSize: 12, padding: "6px 8px", borderRadius: 4,
            border: "0.5px solid var(--color-border-tertiary)",
          }}
        />
      )}
    </div>
  );
}

// ─── Section: Asset matches (asset-curator) ──────

function AssetMatchesSection({ story, brand_profile_id }) {
  const [matches, setMatches] = useState(null);
  const [gaps, setGaps]       = useState(null);
  const [confidence, setConf] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState(null);
  const [aiCallId, setAiCallId] = useState(null);

  const canRun = !!story.visual_brief;

  const run = async () => {
    if (!story.visual_brief) return;
    setRunning(true); setError(null);
    try {
      const result = await runAgent({
        agent_name: "asset-curator",
        params: { story, brief: story.visual_brief, brand_profile_id },
      });
      setMatches(result.matches);
      setGaps(result.gaps);
      setConf(result.confidence);
      setAiCallId(result.ai_call_id);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section style={{ borderTop: "0.5px solid var(--color-border-tertiary)", padding: "14px 0" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Asset library matches</span>
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
          {matches == null ? "not run yet" : confidence != null ? `${confidence}% confidence` : ""}
        </span>
      </header>
      <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>
        AI checks the asset library for reusable assets matching this brief. Only gaps will need new generation.
      </p>

      {!canRun && (
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
          Approve a brief first.
        </div>
      )}

      {canRun && matches == null && (
        <button onClick={run} disabled={running} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6 }}>
          {running ? "Searching library…" : "Run library match"}
        </button>
      )}

      {matches != null && (
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>
              Matches: {matches.length}
            </div>
            {matches.length === 0 && (
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
                Library has no reusable matches for this story.
              </div>
            )}
            {matches.map((m, i) => (
              <div key={i} style={{ fontSize: 11, padding: "4px 0" }}>
                <code style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-tertiary)" }}>{m.position_key}</code>
                {" "}— {m.reasoning}
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>
              Gaps to generate: {gaps?.length || 0}
            </div>
            {(gaps || []).map((g, i) => (
              <div key={i} style={{ fontSize: 11, padding: "4px 0" }}>
                <code style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-tertiary)" }}>{g.position_key}</code>
                {" × "}{g.count} — {g.reasoning}
              </div>
            ))}
          </div>

          <button onClick={run} disabled={running} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6 }}>
            {running ? "Re-running…" : "Re-run match"}
          </button>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: "var(--color-text-error)", marginTop: 6 }}>
          {error}
        </div>
      )}
    </section>
  );
}

// ─── Stub sections for D2/D3 ─────────────────────

function StubSection({ title, description, status }) {
  return (
    <section style={{ borderTop: "0.5px solid var(--color-border-tertiary)", padding: "14px 0" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{status}</span>
      </header>
      <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>{description}</p>
    </section>
  );
}

// ─── Main view ───────────────────────────────────

export default function ProductionView({ stories, onUpdate }) {
  const queue = useMemo(
    () => (stories || []).filter(isInProductionQueue),
    [stories],
  );

  const [selectedId, setSelectedId] = useState(queue[0]?.id || null);

  useEffect(() => {
    if (!selectedId && queue.length) setSelectedId(queue[0].id);
    if (selectedId && !queue.find(s => s.id === selectedId) && queue.length) {
      setSelectedId(queue[0].id);
    }
  }, [queue, selectedId]);

  const selected = queue.find(s => s.id === selectedId);

  if (queue.length === 0) {
    return (
      <div style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: 24 }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
          Production
        </div>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
          No stories in production yet. Approve a script in the Script tab to send it here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500 }}>Production</span>
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
          {queue.length} in flight
          {selected ? ` · ${selected.title}` : ""}
        </span>
      </header>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 14px", fontFamily: "var(--font-sans)" }}>
        Pick a story on the left. Five agents handle brief, library matching, voice, visuals, and assembly. Your edits train the system.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 10, fontFamily: "var(--font-sans)" }}>
        {/* Queue */}
        <div style={{ background: "var(--color-background-primary)", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", padding: 6 }}>
          {queue.map(story => {
            const isSelected = story.id === selectedId;
            return (
              <div
                key={story.id}
                onClick={() => setSelectedId(story.id)}
                style={{
                  cursor: "pointer",
                  padding: "8px 10px",
                  marginBottom: 4,
                  borderRadius: 6,
                  borderLeft: `3px solid ${formatBorder(story.format)}`,
                  background: isSelected ? "var(--color-background-tertiary)" : "transparent",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: isSelected ? 500 : 400, lineHeight: 1.3 }}>
                  {story.title || "(untitled)"}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5 }}>
                  <ProgressDots story={story} />
                  <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
                    {PRODUCTION_STATUS_LABELS[story.production_status] || story.status || ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail pane */}
        <div style={{ background: "var(--color-background-primary)", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", padding: 14 }}>
          {selected && (
            <>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{selected.title}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 8 }}>
                {selected.format || "—"} · {selected.archetype || "—"}
                {selected.reach_score != null ? ` · reach ${selected.reach_score}` : ""}
                {selected.community_score_final != null ? ` · comm ${selected.community_score_final}` : ""}
              </div>

              <BriefSection
                story={selected}
                brand_profile_id={UNCLE_CARTER_PROFILE_ID}
                onSaved={() => onUpdate?.(selected.id, {})}
              />

              <AssetMatchesSection
                story={selected}
                brand_profile_id={UNCLE_CARTER_PROFILE_ID}
              />

              <StubSection
                title="Visual generation"
                description="MidJourney + Shutterstock generate the gap positions. Visual-ranker agent ranks results. You pick from top 6."
                status="Delivery 2"
              />
              <StubSection
                title="Voice generation"
                description="ElevenLabs generates EN, then cascades FR/ES/PT in parallel once confidence threshold is met."
                status="Delivery 2"
              />
              <StubSection
                title="Assembly brief"
                description="JSON + markdown export for CapCut. Generated once visual + voice are approved."
                status="Delivery 3"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
