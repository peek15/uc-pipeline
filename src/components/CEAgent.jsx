"use client";
import { useState } from "react";
import { IconLink, IconDoc, IconImage, IconChev, IconCheck, IconClock } from "@/components/CEIcons";

// ── SourceChip — clickable provenance pill ───────────────
export function SourceChip({ type = "url", label, host, onClick }) {
  const Icon = type === "url" ? IconLink : type === "file" ? IconDoc : type === "image" ? IconImage : IconDoc;
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 7px 3px 6px", borderRadius: 999,
        background: hov ? "var(--ce-fill-2)" : "var(--ce-fill)",
        border: "0.5px solid var(--ce-line-2)",
        color: "var(--ce-text-2)", fontSize: 10.5, fontFamily: "inherit",
        cursor: onClick ? "pointer" : "default",
        transition: "background var(--ce-dur-1) var(--ce-ease)"
      }}
    >
      <Icon size={10} style={{ color: "var(--ce-text-4)", flexShrink: 0 }} />
      <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {host && <span style={{ color: "var(--ce-text-4)", fontFamily: "var(--font-mono)", fontSize: 9.5 }}>{host}</span>}
    </button>
  );
}

// ── Cite — inline superscript [n] marker ─────────────────
export function Cite({ n }) {
  return (
    <sup style={{
      display: "inline-block", minWidth: 13, height: 13, padding: "0 3px",
      borderRadius: 3, background: "var(--ce-fill-2)", border: "0.5px solid var(--ce-line-2)",
      color: "var(--ce-text-2)", fontSize: 9, fontWeight: 600,
      fontFamily: "var(--font-mono)", textAlign: "center", lineHeight: "13px",
      marginLeft: 2, verticalAlign: 1, cursor: "pointer",
    }}>{n}</sup>
  );
}

// ── WorkTrace — dot-based agent step list ─────────────────
export function WorkTrace({ steps = [], compact = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 8 }}>
      {steps.map((s, i) => {
        const isDone    = s.status === "done";
        const isActive  = s.status === "active";
        const isPending = s.status === "pending";
        return (
          <div key={i} className="ce-fade-in" style={{
            display: "grid", gridTemplateColumns: "12px 1fr auto",
            alignItems: "baseline", gap: 9, animationDelay: `${i * 60}ms`
          }}>
            <div style={{
              width: 7, height: 7, marginTop: 4, borderRadius: 999, flexShrink: 0,
              background: isDone ? "var(--ce-text-2)" : isActive ? "var(--ce-live)" : "transparent",
              border: isPending ? "0.5px dashed var(--ce-line-3)" : "none",
              boxShadow: isActive ? "0 0 0 3px var(--ce-live-3)" : "none",
              transition: "all 200ms var(--ce-ease)"
            }} />
            <div style={{
              fontSize: compact ? 11.5 : 12,
              color: isDone ? "var(--ce-text-3)" : isActive ? "var(--ce-text)" : "var(--ce-text-4)",
              lineHeight: 1.45
            }}>
              {s.label}
              {s.detail && <span style={{ color: "var(--ce-text-4)", fontSize: 11, marginLeft: 6 }}>{s.detail}</span>}
            </div>
            {s.duration && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ce-text-5)" }}>{s.duration}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── ToolCard — collapsible tool call ─────────────────────
export function ToolCard({ tool, target, status = "done", sources = [], children, expanded: initExpanded = false }) {
  const [open, setOpen] = useState(initExpanded);
  return (
    <div style={{
      borderRadius: "var(--ce-r)", border: "0.5px solid var(--ce-line-2)",
      background: "var(--ce-fill)", overflow: "hidden"
    }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "9px 12px", background: "transparent", border: "none",
        cursor: "pointer", color: "var(--ce-text)", fontFamily: "inherit", textAlign: "left"
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: 999, flexShrink: 0,
          background: status === "active" ? "var(--ce-live)" : status === "done" ? "var(--ce-text-3)" : "var(--ce-text-5)",
          boxShadow: status === "active" ? "0 0 0 3px var(--ce-live-3)" : "none"
        }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ce-text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{tool}</span>
        <span style={{ fontSize: 11.5, color: "var(--ce-text-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{target}</span>
        <IconChev size={11} style={{ color: "var(--ce-text-4)", transform: open ? "rotate(90deg)" : "none", transition: "transform 200ms var(--ce-ease)", flexShrink: 0 }} />
      </button>
      {open && (
        <div className="ce-fade-in" style={{ padding: "0 12px 11px 28px", borderTop: "0.5px solid var(--ce-line)" }}>
          {children && (
            <div style={{ fontSize: 11.5, color: "var(--ce-text-2)", lineHeight: 1.55, paddingTop: 10 }}>{children}</div>
          )}
          {sources.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 9 }}>
              {sources.map((s, i) => <SourceChip key={i} {...s} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ApprovalCard — attention-pulse side strip ─────────────
export function ApprovalCard({ title, summary, changes = [], sources = [], onApprove, onReject }) {
  return (
    <div className="ce-slide-up" style={{
      borderRadius: "var(--ce-r)", border: "0.5px solid var(--ce-line-2)",
      background: "var(--ce-surface-2)", boxShadow: "var(--ce-shadow-2)",
      overflow: "hidden", position: "relative"
    }}>
      <div className="ce-attention" style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 2,
        background: "var(--ce-text-2)"
      }} />
      <div style={{ padding: "11px 14px 9px", borderBottom: "0.5px solid var(--ce-line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--ce-text-2)", flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ce-text-2)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Awaits your move</span>
          <span style={{ flex: 1 }} />
          <IconClock size={11} style={{ color: "var(--ce-text-4)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ce-text-4)", marginLeft: 4 }}>waiting on you</span>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ce-text)", marginTop: 6, letterSpacing: "-0.01em" }}>{title}</div>
        {summary && <div style={{ fontSize: 12, color: "var(--ce-text-3)", marginTop: 4, lineHeight: 1.5 }}>{summary}</div>}
      </div>
      {changes.length > 0 && (
        <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--ce-line)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {changes.map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 9.5, minWidth: 28,
                  color: c.type === "add" ? "var(--ce-success)" : c.type === "edit" ? "var(--ce-live)" : "var(--ce-warning)"
                }}>{c.type === "add" ? "ADD" : c.type === "edit" ? "EDIT" : "DEL"}</span>
                <span style={{ fontSize: 11.5, color: "var(--ce-text-2)", lineHeight: 1.45 }}>{c.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {sources.length > 0 && (
        <div style={{ padding: "9px 14px", borderBottom: "0.5px solid var(--ce-line)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ce-text-4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            From {sources.length} source{sources.length > 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {sources.map((s, i) => <SourceChip key={i} {...s} />)}
          </div>
        </div>
      )}
      <div style={{ padding: "10px 14px", display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={onApprove} style={{
          padding: "6px 11px", borderRadius: "var(--ce-r-sm)",
          background: "var(--ce-text)", color: "var(--ce-bg)",
          border: "none", cursor: "pointer", fontWeight: 600, fontSize: 11.5,
          fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5
        }}>
          <IconCheck size={11} /> Approve & save
        </button>
        <button onClick={onReject} style={{
          padding: "6px 11px", borderRadius: "var(--ce-r-sm)",
          background: "transparent", color: "var(--ce-text-2)",
          border: "0.5px solid var(--ce-line-2)", cursor: "pointer",
          fontFamily: "inherit", fontSize: 11.5
        }}>
          Revise
        </button>
      </div>
    </div>
  );
}
