"use client";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ArrowLeft, Play, Pause, Maximize2, Minimize2, Plus, Check, Trash2, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/db";
import { buttonStyle } from "@/components/OperationalUI";
import {
  SOURCE_LABELS,
  SOURCE_MODIFIABILITY,
  getMockBlocks,
  MOCK_VERSIONS,
  REVISION_STATUSES,
  deriveSubject,
} from "@/components/studio/studioMockData";

// ── DB → local shape converters ───────────────────────────────────────────────

function dbBlockToLocal(b) {
  return {
    id: b.id,
    label: b.label,
    start: b.start_tc,
    end: b.end_tc,
    sourceType: b.source_type,
    editable: b.editable !== false,
    lockedReason: b.locked_reason || null,
    status: b.status || "ok",
  };
}

function dbVersionToLocal(v, isCurrentId) {
  return {
    id: v.id,
    label: v.label || `V${v.version_number}`,
    version: v.version_number,
    status: v.status,
    note: v.note || "",
    current: v.id === isCurrentId,
  };
}

function dbRevisionToLocal(r) {
  return {
    id: r.id,
    timecodeStart: r.timecode_start,
    timecodeEnd: r.timecode_end,
    subject: r.subject || deriveSubject(r.user_comment),
    comment: r.user_comment,
    instruction: r.draft_instruction || `Review requested: ${r.user_comment}`,
    status: r.status,
    blockId: r.block_id || null,
    blockLabel: r.block_label || null,
    createdAt: r.created_at,
    persisted: true,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timecodeToSeconds(tc) {
  const [m, s] = (tc || "00:00").split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}

function secondsToTimecode(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function totalDuration(blocks) {
  if (!blocks.length) return 30;
  return timecodeToSeconds(blocks[blocks.length - 1].end);
}

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ sourceType }) {
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 600,
      color: "var(--t4)",
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      background: "var(--fill)",
      border: "0.5px solid var(--border)",
      borderRadius: 4,
      padding: "1px 5px",
    }}>
      {SOURCE_LABELS[sourceType] || sourceType}
    </span>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ status }) {
  const def = REVISION_STATUSES[status] || REVISION_STATUSES.pending;
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      color: def.color,
      background: "var(--fill)",
      border: `0.5px solid ${def.color}`,
      borderRadius: 4,
      padding: "1px 5px",
    }}>
      {def.label}
    </span>
  );
}

// ── Revision card ─────────────────────────────────────────────────────────────

function RevisionCard({ revision, onRemove, onMarkReady }) {
  return (
    <div style={{
      padding: "12px 13px",
      borderRadius: 8,
      background: "var(--bg)",
      border: "0.5px solid var(--border)",
      marginBottom: 8,
      transition: "border-color 140ms ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--t3)", fontFamily: "var(--font-mono)" }}>
            {revision.timecodeStart}–{revision.timecodeEnd}
          </span>
          {revision.blockLabel && (
            <span style={{ fontSize: 11, color: "var(--t3)" }}>· {revision.blockLabel}</span>
          )}
        </div>
        <StatusPill status={revision.status} />
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t1)", marginBottom: 4 }}>{revision.subject}</div>
      <div style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.5, marginBottom: 6 }}>{revision.comment}</div>

      <div style={{ padding: "7px 9px", borderRadius: 6, background: "var(--fill2)", marginBottom: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Draft instruction</div>
        <div style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.4 }}>{revision.instruction}</div>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {revision.status === "pending" && (
          <button onClick={() => onMarkReady(revision.id)} style={buttonStyle("ghost", { fontSize: 10, padding: "3px 8px" })}>
            <Check size={10} /> Mark ready
          </button>
        )}
        <button onClick={() => onRemove(revision.id)} style={buttonStyle("ghost", { fontSize: 10, padding: "3px 8px", color: "var(--t4)" })}>
          <Trash2 size={10} /> Remove
        </button>
      </div>
    </div>
  );
}

// ── Timeline block ────────────────────────────────────────────────────────────

function TimelineBlock({ block, selected, hasRevision, onClick }) {
  return (
    <button
      onClick={() => onClick(block.id)}
      title={`${block.start}–${block.end} · ${SOURCE_LABELS[block.sourceType]}`}
      style={{
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 5,
        padding: "9px 12px",
        minWidth: 110,
        borderRadius: 8,
        border: selected ? "1px solid var(--t2)" : "0.5px solid var(--border)",
        background: selected ? "var(--card)" : "var(--bg)",
        cursor: "pointer",
        textAlign: "left",
        transition: "border-color 140ms ease, background 140ms ease",
        position: "relative",
      }}
    >
      {hasRevision && (
        <span style={{
          position: "absolute",
          top: 6,
          right: 6,
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--warning)",
        }} />
      )}
      <div style={{ fontSize: 11, fontWeight: 650, color: "var(--t1)" }}>{block.label}</div>
      <div style={{ fontSize: 10, color: "var(--t3)", fontFamily: "var(--font-mono)" }}>
        {block.start}–{block.end}
      </div>
      <SourceBadge sourceType={block.sourceType} />
    </button>
  );
}

// ── Player ────────────────────────────────────────────────────────────────────

function StudioPlayer({ story, aspect, isPlaying, currentTime, duration, onTogglePlay, onSeek }) {
  const scrubberRef = useRef(null);

  const handleScrubberClick = useCallback((e) => {
    const rect = scrubberRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(pct * duration);
  }, [duration, onSeek]);

  const playerBoxStyle = aspect === "vertical"
    ? { aspectRatio: "9 / 16", height: "100%", maxHeight: "560px", width: "auto", background: "#111110", borderRadius: 10, position: "relative", overflow: "hidden" }
    : { aspectRatio: "16 / 9", width: "100%", maxWidth: "100%", height: "auto", background: "#111110", borderRadius: 10, position: "relative", overflow: "hidden" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflow: "hidden" }}>
        <div style={playerBoxStyle}>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "var(--t4)" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", border: "1.5px solid var(--t4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Play size={18} style={{ marginLeft: 3 }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--t3)", textAlign: "center", padding: "0 24px", lineHeight: 1.4 }}>
              {story?.title || "Preview unavailable"}
            </div>
            <div style={{ fontSize: 10, color: "var(--t4)" }}>Preview not rendered in Sprint 11A</div>
          </div>
          <div style={{ position: "absolute", top: 12, left: 12, fontSize: 11, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.5)", background: "rgba(0,0,0,0.4)", padding: "2px 7px", borderRadius: 4 }}>
            {secondsToTimecode(currentTime)}
          </div>
        </div>
      </div>

      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "8px 16px 12px", borderTop: "0.5px solid var(--border2)" }}>
        <button onClick={onTogglePlay} style={buttonStyle("ghost", { padding: "6px 8px", borderRadius: 8 })}>
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--t3)", flexShrink: 0, minWidth: 80 }}>
          {secondsToTimecode(currentTime)} / {secondsToTimecode(duration)}
        </span>
        <div ref={scrubberRef} onClick={handleScrubberClick} style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--bg3)", cursor: "pointer", position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${(currentTime / Math.max(duration, 1)) * 100}%`, background: "var(--t2)", borderRadius: 2, transition: "width 0.1s linear" }} />
        </div>
      </div>
    </div>
  );
}

// ── Regen plan modal ──────────────────────────────────────────────────────────

function RegenPlanModal({ revisions, blocks, onClose, onConfirm, creating }) {
  const actionable = revisions.filter(r => ["pending", "ready"].includes(r.status));
  const affectedBlockIds = [...new Set(actionable.map(r => r.blockId).filter(Boolean))];
  const affectedBlocks = blocks.filter(b => affectedBlockIds.includes(b.id));
  const hasAI = affectedBlocks.some(b => b.sourceType === "ai_generated");
  const hasVoice = affectedBlocks.some(b => b.sourceType === "voice");
  const hasCaption = affectedBlocks.some(b => b.sourceType === "caption");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}>
      <div style={{ width: 480, maxWidth: "90vw", background: "var(--bg2)", border: "0.5px solid var(--border)", borderRadius: 12, padding: 24, boxShadow: "var(--shadow-lg)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--t1)", marginBottom: 14 }}>Regeneration plan</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {[
            `${actionable.length} revision${actionable.length === 1 ? "" : "s"} will be applied.`,
            affectedBlocks.length ? `Blocks affected: ${affectedBlocks.map(b => b.label).join(", ")}.` : "No specific blocks targeted.",
            hasAI ? "Visuals may be regenerated for AI-generated blocks." : null,
            hasVoice ? "Voice audio may need re-sync." : null,
            hasCaption ? "Captions may need review." : null,
            "Compliance should be re-run after the new version is created.",
          ].filter(Boolean).map((line, i) => (
            <div key={i} style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.5, padding: "8px 10px", borderRadius: 7, background: "var(--fill2)", border: "0.5px solid var(--border)" }}>
              {line}
            </div>
          ))}
        </div>

        <div style={{ padding: "10px 12px", borderRadius: 7, background: "var(--fill)", border: "0.5px solid var(--border)", fontSize: 12, color: "var(--t4)", marginBottom: 16, textAlign: "center" }}>
          Provider regeneration is not yet implemented. Creating a new version record only.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} disabled={creating} style={buttonStyle("secondary")}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={creating}
            style={buttonStyle("primary", { opacity: creating ? 0.6 : 1 })}
          >
            {creating ? "Creating…" : "Create new version"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Studio Workspace ─────────────────────────────────────────────────────

export default function StudioWorkspace({ story, storyId, loading = false }) {
  // ── All state / refs above any early return ────────────────────────────────
  const [aspect, setAspect] = useState("vertical");
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [composerText, setComposerText] = useState("");
  const [activeTab, setActiveTab] = useState("revisions");
  const [showRegenPlan, setShowRegenPlan] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [intervalStart, setIntervalStart] = useState("00:00");
  const [intervalEnd, setIntervalEnd] = useState("00:04");
  const [showVersions, setShowVersions] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  const authTokenRef = useRef(null);
  const playIntervalRef = useRef(null);
  const composerRef = useRef(null);

  // ── Derived data (safe before early return) ────────────────────────────────
  const blocks = useMemo(() => {
    if (sessionData?.blocks?.length) return sessionData.blocks.map(dbBlockToLocal);
    return getMockBlocks();
  }, [sessionData]);

  const versions = useMemo(() => {
    if (sessionData?.all_versions?.length) {
      const currentId = sessionData.version?.id;
      return sessionData.all_versions.map(v => dbVersionToLocal(v, currentId));
    }
    return MOCK_VERSIONS;
  }, [sessionData]);

  const versionLabel = versions.find(v => v.current)?.label || "V1";
  const versionId = sessionData?.version?.id || null;
  const selectedBlock = blocks.find(b => b.id === selectedBlockId) || null;
  const modInfo = selectedBlock ? SOURCE_MODIFIABILITY[selectedBlock.sourceType] : null;
  const duration = totalDuration(blocks);
  const pendingCount = revisions.filter(r => ["pending", "ready"].includes(r.status)).length;

  // ── Auth token ─────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      authTokenRef.current = session?.access_token || null;
    });
  }, []);

  // ── Load studio session from DB ────────────────────────────────────────────
  useEffect(() => {
    if (!story?.workspace_id || !story?.id) {
      setSessionLoaded(true);
      return;
    }
    const load = async () => {
      const token = authTokenRef.current;
      if (!token) { setSessionLoaded(true); return; }
      const qs = new URLSearchParams({ workspace_id: story.workspace_id, story_id: story.id });
      const data = await fetch(`/api/studio/session?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (data) setSessionData(data);
      setSessionLoaded(true);
    };
    // Small delay to let auth token populate from the getSession effect
    const t = setTimeout(load, 80);
    return () => clearTimeout(t);
  }, [story?.workspace_id, story?.id]);

  // ── Load revisions from DB once session is ready ───────────────────────────
  useEffect(() => {
    if (!sessionLoaded || !story?.workspace_id || !story?.id) return;
    const token = authTokenRef.current;
    if (!token) return;
    const qs = new URLSearchParams({ workspace_id: story.workspace_id, story_id: story.id });
    fetch(`/api/studio/revisions?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.revisions?.length) {
          setRevisions(data.revisions.map(dbRevisionToLocal));
        }
      })
      .catch(() => {});
  }, [sessionLoaded, story?.workspace_id, story?.id]);

  // ── Select first block when blocks change ─────────────────────────────────
  useEffect(() => {
    if (blocks.length && !selectedBlockId) {
      const first = blocks[0];
      setSelectedBlockId(first.id);
      setIntervalStart(first.start);
      setIntervalEnd(first.end);
    }
  }, [blocks, selectedBlockId]);

  // ── Play timer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setCurrentTime(t => {
          if (t >= duration) { setIsPlaying(false); return 0; }
          return t + 0.1;
        });
      }, 100);
    } else {
      clearInterval(playIntervalRef.current);
    }
    return () => clearInterval(playIntervalRef.current);
  }, [isPlaying, duration]);

  // ── Event handlers ─────────────────────────────────────────────────────────
  const handleBlockSelect = useCallback((blockId) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    setSelectedBlockId(blockId);
    setIntervalStart(block.start);
    setIntervalEnd(block.end);
    setCurrentTime(timecodeToSeconds(block.start));
  }, [blocks]);

  const handleAddRevision = useCallback(async () => {
    const text = composerText.trim();
    if (!text) return;
    const localId = `rev_local_${Date.now()}`;
    const rev = {
      id: localId,
      timecodeStart: intervalStart,
      timecodeEnd: intervalEnd,
      subject: deriveSubject(text),
      comment: text,
      instruction: `Review requested: ${text}`,
      status: "pending",
      blockId: selectedBlockId,
      blockLabel: selectedBlock?.label || null,
      createdAt: new Date().toISOString(),
      persisted: false,
    };
    setRevisions(r => [rev, ...r]);
    setComposerText("");
    setActiveTab("revisions");

    if (story?.workspace_id && story?.id) {
      const token = authTokenRef.current;
      if (!token) return;
      const dbBlock = sessionData?.blocks?.find(b => {
        const local = dbBlockToLocal(b);
        return local.id === selectedBlockId;
      });
      const data = await fetch("/api/studio/revisions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspace_id: story.workspace_id,
          story_id: story.id,
          version_id: versionId,
          block_id: dbBlock?.id || null,
          brand_profile_id: story.brand_profile_id || null,
          timecode_start: intervalStart,
          timecode_end: intervalEnd,
          subject: deriveSubject(text),
          user_comment: text,
          draft_instruction: `Review requested: ${text}`,
          block_label: selectedBlock?.label || null,
        }),
      }).then(r => r.ok ? r.json() : null).catch(() => null);

      if (data?.revision) {
        setRevisions(r => r.map(rev => rev.id === localId ? dbRevisionToLocal(data.revision) : rev));
      }
    }
  }, [composerText, intervalStart, intervalEnd, selectedBlockId, selectedBlock, story, versionId, sessionData]);

  const handleMarkReady = useCallback(async (id) => {
    setRevisions(r => r.map(rev => rev.id === id ? { ...rev, status: "ready" } : rev));
    if (!story?.workspace_id) return;
    const token = authTokenRef.current;
    if (!token) return;
    await fetch("/api/studio/revisions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, workspace_id: story.workspace_id, status: "ready" }),
    }).catch(() => {});
  }, [story?.workspace_id]);

  const handleRemoveRevision = useCallback(async (id) => {
    setRevisions(r => r.filter(rev => rev.id !== id));
    if (!story?.workspace_id) return;
    const token = authTokenRef.current;
    if (!token) return;
    const qs = new URLSearchParams({ id, workspace_id: story.workspace_id });
    await fetch(`/api/studio/revisions?${qs}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }, [story?.workspace_id]);

  const handleCreateVersion = useCallback(async () => {
    if (!story?.workspace_id || !story?.id) {
      setShowRegenPlan(false);
      return;
    }
    setCreatingVersion(true);
    const token = authTokenRef.current;
    if (token) {
      const data = await fetch("/api/studio/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspace_id: story.workspace_id,
          story_id: story.id,
          note: `Version from ${pendingCount} revision${pendingCount === 1 ? "" : "s"}`,
        }),
      }).then(r => r.ok ? r.json() : null).catch(() => null);

      if (data?.version) {
        // Reload session to get new version + blocks
        const qs = new URLSearchParams({ workspace_id: story.workspace_id, story_id: story.id });
        const refreshed = await fetch(`/api/studio/session?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.ok ? r.json() : null).catch(() => null);
        if (refreshed) {
          setSessionData(refreshed);
          setSelectedBlockId(null);
        }
        // Mark actionable revisions as queued
        setRevisions(r => r.map(rev =>
          ["pending", "ready"].includes(rev.status) ? { ...rev, status: "queued" } : rev
        ));
      }
    }
    setCreatingVersion(false);
    setShowRegenPlan(false);
  }, [story?.workspace_id, story?.id, pendingCount]);

  // ── Early return: page-level loading ──────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 13, color: "var(--t4)" }}>Loading Studio…</div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ height: 64, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", borderBottom: "0.5px solid var(--border)", background: "var(--bg2)", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <a href="/?tab=create" style={buttonStyle("ghost", { padding: "6px 10px", textDecoration: "none", flexShrink: 0 })}>
            <ArrowLeft size={13} /> Back to Create
          </a>
          <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1 }}>Studio</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--t1)", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "40vw" }}>
              {story?.title || `Content item ${storyId?.slice(0, 8) || "—"}`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowVersions(v => !v)} style={buttonStyle("ghost", { fontSize: 11, padding: "4px 8px" })}>
                {versionLabel} <ChevronDown size={10} style={{ marginLeft: 2 }} />
              </button>
              {showVersions && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 20, background: "var(--bg2)", border: "0.5px solid var(--border)", borderRadius: 8, padding: 6, minWidth: 220, boxShadow: "var(--shadow)" }}>
                  {versions.map(v => (
                    <div key={v.id} style={{ padding: "8px 10px", borderRadius: 6, fontSize: 12, color: "var(--t1)", background: v.current ? "var(--fill2)" : "transparent", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{v.label}{v.current && <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 400 }}> · Current</span>}</div>
                        {v.note && <div style={{ fontSize: 11, color: "var(--t3)" }}>{v.note}</div>}
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", color: "var(--t4)", border: "0.5px solid var(--border)", borderRadius: 4, padding: "1px 5px" }}>{v.status}</span>
                    </div>
                  ))}
                  {!sessionLoaded && (
                    <div style={{ padding: "8px 10px", fontSize: 11, color: "var(--t4)" }}>Loading…</div>
                  )}
                </div>
              )}
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--t4)", border: "0.5px solid var(--border)", borderRadius: 4, padding: "2px 7px" }}>
              {sessionLoaded ? "Draft review" : "Loading…"}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", border: "0.5px solid var(--border)", borderRadius: 7, overflow: "hidden" }}>
            {["vertical", "horizontal"].map(a => (
              <button key={a} onClick={() => setAspect(a)} style={{ padding: "5px 10px", fontSize: 11, fontWeight: aspect === a ? 600 : 400, color: aspect === a ? "var(--t1)" : "var(--t3)", background: aspect === a ? "var(--fill2)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", transition: "background 140ms ease, color 140ms ease", display: "flex", alignItems: "center", gap: 5 }}>
                {a === "vertical" ? <Maximize2 size={11} /> : <Minimize2 size={11} />}
                {a.charAt(0).toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowRegenPlan(true)}
            disabled={pendingCount === 0}
            title={pendingCount === 0 ? "Add revisions before generating a new version." : `Generate from ${pendingCount} revision${pendingCount === 1 ? "" : "s"}`}
            style={buttonStyle("secondary", { fontSize: 12, opacity: pendingCount === 0 ? 0.45 : 1, cursor: pendingCount === 0 ? "not-allowed" : "pointer" })}
          >
            Generate new version
          </button>
          <button disabled title="Approve the final version once generation is complete." style={buttonStyle("primary", { opacity: 0.4, cursor: "not-allowed" })}>
            Approve version
          </button>
        </div>
      </div>

      {/* Main grid */}
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 400px", gap: 20, padding: "20px 24px 24px", overflow: "hidden" }}>

        {/* Left: player + timeline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0, overflow: "hidden" }}>
          <div style={{ flex: 1, minHeight: 0, borderRadius: 12, background: "var(--bg2)", border: "0.5px solid var(--border)", overflow: "hidden" }}>
            <StudioPlayer story={story} aspect={aspect} isPlaying={isPlaying} currentTime={currentTime} duration={duration} onTogglePlay={() => setIsPlaying(p => !p)} onSeek={setCurrentTime} />
          </div>

          <div style={{ flexShrink: 0, borderRadius: 10, background: "var(--bg2)", border: "0.5px solid var(--border)", padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Timeline — select a block to target a revision
            </div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "thin" }}>
              {blocks.map(block => (
                <TimelineBlock key={block.id} block={block} selected={selectedBlockId === block.id} hasRevision={revisions.some(r => r.blockId === block.id)} onClick={handleBlockSelect} />
              ))}
            </div>
            <div style={{ fontSize: 10, color: "var(--t4)", marginTop: 8 }}>
              Select a block or time range, then describe the change in the revision panel.
            </div>
          </div>
        </div>

        {/* Right: revision workspace */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, borderRadius: 12, background: "var(--bg2)", border: "0.5px solid var(--border)", overflow: "hidden" }}>

          {/* Context card */}
          <div style={{ flexShrink: 0, padding: "12px 14px", borderBottom: "0.5px solid var(--border2)" }}>
            {selectedBlock ? (
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Selected</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 650, color: "var(--t1)" }}>{selectedBlock.label}</div>
                    <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2, fontFamily: "var(--font-mono)" }}>{selectedBlock.start}–{selectedBlock.end}</div>
                    <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
                      <SourceBadge sourceType={selectedBlock.sourceType} />
                      <span style={{ fontSize: 9, fontWeight: 600, color: modInfo?.editable ? "var(--success)" : "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "1px 5px", borderRadius: 4, background: "var(--fill)", border: "0.5px solid var(--border)" }}>
                        {modInfo?.editable ? "Editable" : "Restricted"}
                      </span>
                    </div>
                    {modInfo?.hint && <div style={{ fontSize: 10, color: "var(--t4)", marginTop: 5, lineHeight: 1.4 }}>{modInfo.hint}</div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                    <div style={{ fontSize: 9, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Interval</div>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      {[{ val: intervalStart, set: setIntervalStart }, { val: intervalEnd, set: setIntervalEnd }].map(({ val, set }, i) => (
                        <input key={i} value={val} onChange={e => set(e.target.value)} style={{ width: 52, padding: "3px 7px", borderRadius: 5, background: "var(--fill2)", border: "0.5px solid var(--border)", color: "var(--t2)", fontSize: 11, fontFamily: "var(--font-mono)", outline: "none", textAlign: "center" }} placeholder="00:00" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--t2)", marginBottom: 3 }}>No block selected</div>
                <div style={{ fontSize: 11, color: "var(--t4)", lineHeight: 1.4 }}>Select a block or time range before adding a revision.</div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{ flexShrink: 0, display: "flex", gap: 0, borderBottom: "0.5px solid var(--border2)", padding: "0 8px" }}>
            {[
              { key: "revisions", label: `Revisions${revisions.length ? ` · ${revisions.length}` : ""}` },
              { key: "versions",  label: `Versions${versions.length > 1 ? ` · ${versions.length}` : ""}` },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: "8px 10px", fontSize: 12, fontWeight: activeTab === tab.key ? 650 : 400, color: activeTab === tab.key ? "var(--t1)" : "var(--t3)", background: "transparent", border: "none", borderBottom: activeTab === tab.key ? "1.5px solid var(--t1)" : "1.5px solid transparent", cursor: "pointer", fontFamily: "inherit", transition: "color 140ms ease", marginBottom: -0.5 }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 14px" }}>
            {activeTab === "revisions" && (
              <div>
                {revisions.length === 0 ? (
                  <div style={{ padding: "32px 0", textAlign: "center", color: "var(--t4)", fontSize: 12, lineHeight: 1.6 }}>
                    No revisions yet.<br />Select a block or time range, then describe what should change.
                  </div>
                ) : (
                  revisions.map(rev => (
                    <RevisionCard key={rev.id} revision={rev} onRemove={handleRemoveRevision} onMarkReady={handleMarkReady} />
                  ))
                )}
              </div>
            )}

            {activeTab === "versions" && (
              <div>
                {versions.map(v => (
                  <div key={v.id} style={{ padding: "12px 13px", borderRadius: 8, background: v.current ? "var(--bg)" : "var(--fill)", border: v.current ? "0.5px solid var(--border)" : "0.5px solid var(--border2)", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>
                        {v.label}{v.current && <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 400, marginLeft: 6 }}>· Current</span>}
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--t4)", border: "0.5px solid var(--border)", borderRadius: 4, padding: "1px 5px" }}>{v.status}</span>
                    </div>
                    {v.note && <div style={{ fontSize: 11, color: "var(--t3)" }}>{v.note}</div>}
                  </div>
                ))}
                {!sessionLoaded && (
                  <div style={{ fontSize: 12, color: "var(--t4)", padding: "16px 0" }}>Loading version history…</div>
                )}
                <div style={{ padding: "12px 0", fontSize: 11, color: "var(--t4)", lineHeight: 1.5 }}>
                  Version comparison and approval will be available in a future sprint.
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <div style={{ flexShrink: 0, padding: "12px 14px", borderTop: "0.5px solid var(--border2)" }}>
            <textarea
              ref={composerRef}
              value={composerText}
              onChange={e => setComposerText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAddRevision(); } }}
              placeholder="Describe the change for the selected block or time range…"
              rows={3}
              style={{ width: "100%", padding: "9px 11px", borderRadius: 8, background: "var(--bg)", border: "0.5px solid var(--border)", color: "var(--t1)", fontSize: 12, lineHeight: 1.55, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button disabled title="Suggest fix — future sprint" style={buttonStyle("ghost", { fontSize: 11, opacity: 0.4, cursor: "not-allowed" })}>
                Suggest fix
              </button>
              <button onClick={handleAddRevision} disabled={!composerText.trim()} style={buttonStyle("primary", { fontSize: 12, opacity: !composerText.trim() ? 0.4 : 1, cursor: !composerText.trim() ? "not-allowed" : "pointer" })}>
                <Plus size={12} /> Add revision
              </button>
            </div>
          </div>
        </div>
      </div>

      {showRegenPlan && (
        <RegenPlanModal
          revisions={revisions}
          blocks={blocks}
          onClose={() => setShowRegenPlan(false)}
          onConfirm={handleCreateVersion}
          creating={creatingVersion}
        />
      )}
    </div>
  );
}
