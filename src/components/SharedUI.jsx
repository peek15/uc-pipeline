"use client";
import { useState, useEffect, useCallback } from "react";
import { X, Undo2 } from "lucide-react";

// ─── TOAST SYSTEM ───
let toastListeners = [];
export function showToast(message, type = "success", undoAction = null) {
  toastListeners.forEach(fn => fn({ message, type, undoAction, id: Date.now() }));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const listener = (toast) => {
      setToasts(prev => [...prev, toast]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toast.id)), 4000);
    };
    toastListeners.push(listener);
    return () => { toastListeners = toastListeners.filter(l => l !== listener); };
  }, []);

  if (!toasts.length) return null;

  return (
    <div style={{ position: "fixed", bottom: 80, left: 0, right: 0, zIndex: 60, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, pointerEvents: "none" }}>
      {toasts.map(t => (
        <div key={t.id} className="anim-fade" style={{
          pointerEvents: "auto", display: "flex", alignItems: "center", gap: 10,
          padding: "10px 16px", borderRadius: 14, maxWidth: 360,
          background: t.type === "error" ? "rgba(255,59,48,0.9)" : t.type === "warning" ? "rgba(255,159,10,0.9)" : "var(--bg3)",
          color: t.type === "error" || t.type === "warning" ? "#fff" : "var(--t1)",
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          border: "1px solid var(--border)", boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
          fontSize: 13, fontWeight: 500,
        }}>
          <span style={{ flex: 1 }}>{t.message}</span>
          {t.undoAction && (
            <button onClick={() => { t.undoAction(); setToasts(prev => prev.filter(x => x.id !== t.id)); }}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, background: "rgba(0,122,255,0.15)", color: "#007AFF", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              <Undo2 size={12} />Undo
            </button>
          )}
          <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            style={{ color: "var(--t3)", background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── SKELETON LOADER ───
export function SkeletonCard({ count = 3 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          padding: "14px", borderRadius: 12, background: "var(--card)",
          border: "1px solid var(--border2)", animation: "pulse 1.5s ease infinite",
          animationDelay: `${i * 100}ms`,
        }}>
          <div style={{ height: 14, width: "60%", borderRadius: 6, background: "var(--fill2)", marginBottom: 8 }} />
          <div style={{ height: 10, width: "40%", borderRadius: 4, background: "var(--fill)" }} />
        </div>
      ))}
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}

// ─── TAB BADGE ───
export function TabBadge({ count }) {
  if (!count || count <= 0) return null;
  return (
    <span style={{
      position: "absolute", top: -2, right: -6,
      minWidth: 16, height: 16, borderRadius: 8,
      background: "#FF3B30", color: "#fff",
      fontSize: 9, fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "0 4px", lineHeight: 1,
    }}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

// ─── EMPTY STATE ───
export function EmptyState({ icon: Icon, title, description, action, actionLabel }) {
  return (
    <div className="anim-fade" style={{ textAlign: "center", padding: "48px 24px" }}>
      {Icon && <Icon size={32} style={{ color: "var(--t4)", margin: "0 auto 12px", display: "block" }} />}
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--t2)", marginBottom: 4 }}>{title}</div>
      {description && <div style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.5, maxWidth: 280, margin: "0 auto" }}>{description}</div>}
      {action && actionLabel && (
        <button onClick={action} style={{
          marginTop: 16, padding: "10px 20px", borderRadius: 10,
          background: "var(--gold-subtle)", border: "1px solid var(--gold-border)",
          color: "var(--gold)", fontSize: 13, fontWeight: 600,
          fontFamily: "inherit", cursor: "pointer",
        }}>{actionLabel}</button>
      )}
    </div>
  );
}

// ─── ONBOARDING CHECKLIST ───
export function OnboardingChecklist({ stories }) {
  const steps = [
    { label: "Find your first stories", done: stories.length > 0, tab: "research" },
    { label: "Approve 3 stories", done: stories.filter(s => s.status !== "accepted" && s.status !== "rejected").length >= 3 },
    { label: "Generate a script", done: stories.some(s => s.script) },
    { label: "Translate to all languages", done: stories.some(s => s.script_fr && s.script_es && s.script_pt) },
    { label: "Schedule an episode", done: stories.some(s => s.scheduled_date) },
    { label: "Log your first metrics", done: stories.some(s => s.metrics_views) },
  ];

  const completed = steps.filter(s => s.done).length;
  if (completed >= steps.length) return null; // All done — hide

  return (
    <div className="anim-fade" style={{
      padding: "14px 16px", borderRadius: 14, marginBottom: 14,
      background: "var(--gold-subtle)", border: "1px solid var(--gold-border)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gold)" }} className="font-display">Getting Started</span>
        <span style={{ fontSize: 11, color: "var(--t3)" }}>{completed}/{steps.length}</span>
      </div>
      <div style={{ width: "100%", height: 3, borderRadius: 3, background: "var(--fill2)", marginBottom: 10 }}>
        <div style={{ width: `${(completed / steps.length) * 100}%`, height: "100%", borderRadius: 3, background: "var(--gold)", transition: "width 0.3s" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: s.done ? "var(--t3)" : "var(--t1)", textDecoration: s.done ? "line-through" : "none" }}>
            <div style={{ width: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0, background: s.done ? "rgba(52,199,89,0.12)" : "var(--fill)", color: s.done ? "#34C759" : "var(--t4)", border: `1px solid ${s.done ? "rgba(52,199,89,0.2)" : "var(--border2)"}` }}>
              {s.done ? "✓" : i + 1}
            </div>
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AI STORY SCORE BADGE ───
export function StoryScore({ score }) {
  if (!score && score !== 0) return null;
  const s = parseInt(score);
  const color = s >= 80 ? "#34C759" : s >= 60 ? "#FF9F0A" : s >= 40 ? "var(--t2)" : "#FF3B30";
  return (
    <span className="font-mono" style={{
      fontSize: 10, fontWeight: 700, color,
      background: `${color}12`, padding: "1px 5px", borderRadius: 4,
      minWidth: 24, textAlign: "center", display: "inline-block",
    }}>{s}</span>
  );
}

// ─── READINESS CHECKLIST (inline) ───
export function ReadinessIndicator({ story }) {
  const checks = [
    { key: "script", done: !!story.script },
    { key: "FR", done: !!story.script_fr },
    { key: "ES", done: !!story.script_es },
    { key: "PT", done: !!story.script_pt },
    { key: "date", done: !!story.scheduled_date },
  ];
  const done = checks.filter(c => c.done).length;
  const total = checks.length;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      {checks.map(c => (
        <div key={c.key} title={c.key} style={{
          width: 6, height: 6, borderRadius: 3,
          background: c.done ? "#34C759" : "var(--fill2)",
          transition: "background 0.2s",
        }} />
      ))}
      <span style={{ fontSize: 9, color: "var(--t4)", marginLeft: 2 }} className="font-mono">{done}/{total}</span>
    </div>
  );
}

// ─── FUZZY DUPLICATE CHECK ───
export function isDuplicate(newTitle, existingTitles) {
  if (!newTitle) return false;
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  const n = normalize(newTitle);
  const words = n.split(" ").filter(w => w.length > 3);

  for (const existing of existingTitles) {
    const e = normalize(existing);
    // Exact match
    if (n === e) return true;
    // High word overlap (>70% of words match)
    const eWords = e.split(" ").filter(w => w.length > 3);
    if (words.length > 0 && eWords.length > 0) {
      const matches = words.filter(w => eWords.includes(w)).length;
      const overlapRatio = matches / Math.min(words.length, eWords.length);
      if (overlapRatio > 0.7) return true;
    }
  }
  return false;
}
