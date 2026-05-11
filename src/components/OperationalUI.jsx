"use client";
import { useState, useEffect } from "react";

export const labelStyle = {
  fontSize: 10,
  fontWeight: 600,
  color: "var(--t3)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

export const btnBase = {
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  fontFamily: "inherit",
};

export function buttonStyle(variant = "secondary", extra = {}) {
  const variants = {
    primary: { background: "var(--t1)", color: "var(--bg)", border: "none", fontWeight: 600 },
    secondary: { background: "var(--fill2)", color: "var(--t2)", border: "0.5px solid var(--border)" },
    ghost: { background: "transparent", color: "var(--t3)", border: "0.5px solid var(--border)" },
  };
  return { ...btnBase, padding: "6px 12px", ...(variants[variant] || variants.secondary), ...extra };
}

export function PageHeader({ title, description, meta, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
      <div style={{ minWidth: 220, flex: "1 1 360px" }}>
        <h1 style={{ fontSize: 18, fontWeight: 650, letterSpacing: 0, margin: "0 0 4px", color: "var(--t1)" }}>{title}</h1>
        {description && <p style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.5, margin: 0, maxWidth: 720 }}>{description}</p>}
      </div>
      {(meta || action) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {meta && <span style={{ fontSize: 12, color: "var(--t3)", fontFamily: "var(--font-mono)" }}>{meta}</span>}
          {action}
        </div>
      )}
    </div>
  );
}

export function SectionHeader({ title, description, meta, action }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:10 }}>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:650, color:"var(--t1)", letterSpacing:0 }}>{title}</div>
        {description && <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.45, marginTop:2 }}>{description}</div>}
      </div>
      {(meta || action) && (
        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          {meta && <span style={{ fontSize:11, color:"var(--t3)", fontFamily:"var(--font-mono)" }}>{meta}</span>}
          {action}
        </div>
      )}
    </div>
  );
}

export function Panel({ children, style }) {
  return (
    <div style={{ padding: "var(--ce-card-padding)", borderRadius: "var(--ce-radius)", background: "var(--bg2)", border: "0.5px solid var(--border2)", ...style }}>
      {children}
    </div>
  );
}

export function EmptyState({ title, description, action, actionLabel, meta, style = {} }) {
  return (
    <Panel style={{ textAlign:"left", padding:"16px", ...style }}>
      {meta && <div style={{ ...labelStyle, marginBottom:6 }}>{meta}</div>}
      <div style={{ fontSize:14, fontWeight:650, color:"var(--t1)", marginBottom:4 }}>{title}</div>
      {description && <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.5, maxWidth:520 }}>{description}</div>}
      {action && actionLabel && (
        <button onClick={action} style={buttonStyle("primary", { marginTop:12 })}>
          {actionLabel}
        </button>
      )}
    </Panel>
  );
}

export function Pill({ children, tone = "neutral", active = false, style }) {
  const tones = {
    neutral: { background: active ? "var(--t1)" : "var(--fill2)", color: active ? "var(--bg)" : "var(--t3)", border: active ? "0.5px solid var(--t1)" : "0.5px solid var(--border)" },
    success: { background: "var(--fill2)", color: "var(--t2)", border: "0.5px solid var(--border)" },
    warning: { background: "var(--warning-bg)", color: "var(--warning)", border: "0.5px solid rgba(196,154,60,0.30)" },
    error: { background: "var(--error-bg)", color: "var(--error)", border: "0.5px solid var(--error-border)" },
  };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, whiteSpace: "nowrap", ...(tones[tone] || tones.neutral), ...style }}>
      {children}
    </span>
  );
}

export function InlineTextInput({ value, placeholder, onSave, multiline = true, style = {} }) {
  const [local, setLocal] = useState(value || "");
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(value || ""); }, [value, focused]);
  const commit = () => { if (local.trim() !== (value || "").trim()) onSave(local.trim()); };
  const shared = {
    value: local,
    placeholder,
    onChange: e => setLocal(e.target.value),
    onFocus: () => setFocused(true),
    onBlur: () => { setFocused(false); commit(); },
    onKeyDown: e => {
      if (e.key === "Enter" && !e.shiftKey && !multiline) { e.preventDefault(); e.currentTarget.blur(); }
      if (e.key === "Escape") { setLocal(value || ""); setFocused(false); e.currentTarget.blur(); }
    },
    style: {
      width: "100%", fontSize: 12, color: "var(--t2)", lineHeight: 1.6,
      background: focused ? "var(--fill2)" : "transparent",
      border: focused ? "0.5px solid var(--border)" : "0.5px solid transparent",
      borderRadius: 5, padding: focused ? "5px 7px" : 0,
      outline: "none", fontFamily: "inherit", boxSizing: "border-box",
      transition: "border-color 0.1s, background 0.1s", ...style,
    },
  };
  return multiline
    ? <textarea {...shared} rows={2} style={{ ...shared.style, resize: "none" }} />
    : <input {...shared} />;
}

export function StatCard({ label, value, tone = "var(--t1)", suffix }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 8, background: "transparent", border: "0.5px solid var(--border2)" }}>
      <div style={{ ...labelStyle, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: tone, letterSpacing: 0 }}>
        {value}{suffix && <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 400 }}>{suffix}</span>}
      </div>
    </div>
  );
}

export function LoadingButton({ loading = false, children, disabled, style, ...props }) {
  return (
    <button
      disabled={disabled || loading}
      style={buttonStyle("secondary", { minHeight:30, ...style })}
      {...props}
    >
      {loading && <span className="ce-skeleton" style={{ width:12, height:12, borderRadius:99, display:"inline-block" }} />}
      {children}
    </button>
  );
}

export function SkeletonBlock({ width = "100%", height = 12, radius = 6, style = {} }) {
  return <div className="ce-skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

export function SkeletonCard({ lines = 3, style = {} }) {
  return (
    <Panel style={{ display:"flex", flexDirection:"column", gap:9, ...style }}>
      <SkeletonBlock width="62%" height={14} />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock key={i} width={i === lines - 1 ? "46%" : "100%"} height={10} />
      ))}
    </Panel>
  );
}

export function SkeletonList({ count = 4 }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} lines={2} />)}
    </div>
  );
}

export function WorkTrace({ steps = [], currentStep = null, compact = false }) {
  const safeSteps = steps.length ? steps : ["Preparing work"];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:compact ? 5 : 7 }}>
      {safeSteps.map((step, index) => {
        const status = typeof step === "object" ? step.status : null;
        const label = typeof step === "object" ? step.label : step;
        const active = currentStep ? label === currentStep : index === safeSteps.length - 1 && status !== "done";
        const done = status === "done" || (!currentStep && index < safeSteps.length - 1);
        return (
          <div key={`${label}-${index}`} style={{ display:"flex", alignItems:"center", gap:8, color:done?"var(--t2)":active?"var(--t1)":"var(--t3)", fontSize:compact?11:12 }}>
            <span style={{ width:7, height:7, borderRadius:99, background:done?"var(--success)":active?"var(--accent)":"var(--fill2)", border:done||active?"none":"1px solid var(--border)", flexShrink:0 }} />
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function GeneratingCard({ title = "Generating", description = "Preparing structured output.", steps = [] }) {
  return (
    <Panel style={{ borderColor:"var(--accent-border)", background:"var(--accent-bg)" }}>
      <SectionHeader title={title} description={description} />
      <WorkTrace steps={steps.length ? steps : ["Reading context", "Drafting output", "Preparing review"]} compact />
    </Panel>
  );
}

export function SourceReviewButton({ sources = [], work = [], confidence = null, label, title = "Review work" }) {
  const [open, setOpen] = useState(false);
  const sourceCount = Array.isArray(sources) ? sources.length : 0;
  const buttonLabel = label || (sourceCount ? `Used ${sourceCount} source${sourceCount === 1 ? "" : "s"}` : "Review work");
  return (
    <>
      <button onClick={() => setOpen(true)} style={buttonStyle("ghost", { padding:"5px 9px", fontSize:11 })}>
        {buttonLabel}
      </button>
      {open && (
        <SourceReviewDrawer
          title={title}
          sources={sources}
          work={work}
          confidence={confidence}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function SourceReviewDrawer({ title = "Review work", sources = [], work = [], confidence = null, onClose }) {
  const hasSources = Array.isArray(sources) && sources.length > 0;
  const hasWork = Array.isArray(work) && work.length > 0;
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:80, background:"rgba(0,0,0,0.22)", display:"flex", justifyContent:"flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width:"min(420px, 100vw)", height:"100%", background:"var(--sheet)", borderLeft:"1px solid var(--border)", boxShadow:"var(--shadow-lg)", padding:18, overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:650, color:"var(--t1)" }}>{title}</div>
            <div style={{ fontSize:12, color:"var(--t3)", marginTop:2 }}>Sources and high-level work trace are shown only when available.</div>
          </div>
          <button onClick={onClose} style={buttonStyle("ghost", { width:30, height:30, padding:0 })}>×</button>
        </div>
        {!hasSources && !hasWork && (
          <div style={{ fontSize:12, color:"var(--t3)", padding:"14px 0", lineHeight:1.5 }}>
            No detailed source trace is available for this action.
          </div>
        )}
        {hasSources && (
          <div style={{ marginBottom:18 }}>
            <SectionHeader title="Sources used" meta={`${sources.length}`} />
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {sources.map((source, index) => (
                <div key={source.id || index} style={{ padding:"9px 10px", borderRadius:"var(--ce-radius-sm)", background:"var(--fill2)", border:"1px solid var(--border)" }}>
                  <div style={{ fontSize:12, color:"var(--t1)", fontWeight:600 }}>{source.title || source.filename || source.url || `Source ${index + 1}`}</div>
                  <div style={{ fontSize:11, color:"var(--t3)", marginTop:2 }}>{source.type || source.source_type || "source"}{source.confidence ? ` · ${source.confidence}` : ""}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {hasWork && (
          <div style={{ marginBottom:18 }}>
            <SectionHeader title="Work performed" />
            <WorkTrace steps={work} />
          </div>
        )}
        {confidence && (
          <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.5, padding:"10px 12px", borderRadius:"var(--ce-radius)", background:"var(--fill2)", border:"1px solid var(--border)" }}>
            Confidence: {confidence}
          </div>
        )}
      </div>
    </div>
  );
}
