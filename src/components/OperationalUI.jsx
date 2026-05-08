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

export function Panel({ children, style }) {
  return (
    <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--bg2)", border: "0.5px solid var(--border)", ...style }}>
      {children}
    </div>
  );
}

export function Pill({ children, tone = "neutral", active = false, style }) {
  const tones = {
    neutral: { background: active ? "var(--t1)" : "var(--fill2)", color: active ? "var(--bg)" : "var(--t3)", border: active ? "0.5px solid var(--t1)" : "0.5px solid var(--border)" },
    success: { background: "var(--success-bg)", color: "var(--success)", border: "0.5px solid rgba(74,155,127,0.24)" },
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
    <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--fill2)", border: "0.5px solid var(--border)" }}>
      <div style={{ ...labelStyle, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: tone, letterSpacing: 0 }}>
        {value}{suffix && <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 400 }}>{suffix}</span>}
      </div>
    </div>
  );
}
